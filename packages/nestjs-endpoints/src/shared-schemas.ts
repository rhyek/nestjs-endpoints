import type { EndpointDescriptor } from './descriptors.js';
import type { JsonSchema } from './zod-to-openapi.js';

export type SharedSchemas = {
  /** Every component name → schema, with output `$ref`s rewritten. */
  schemas: Record<string, JsonSchema>;
  /** Ids that have an output twin: id → `<id>Output`. */
  renamed: ReadonlyMap<string, string>;
};

const refPrefix = '#/components/schemas/';

function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

/**
 * A deep copy of `value` without `additionalProperties: false`. zod closes
 * every object it converts for output, and never one for input unless it is
 * `.strict()`, so the two directions of one id are compared without it.
 */
function withoutClosedObjects(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutClosedObjects);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k, v]) => !(k === 'additionalProperties' && v === false))
        .map(([k, v]) => [k, withoutClosedObjects(v)]),
    );
  }
  return value;
}

type Found = { schema: JsonSchema; canon: string; operationId: string };

function gather(
  into: Map<string, Found>,
  components: Record<string, JsonSchema>,
  operationId: string,
  direction: 'input' | 'output',
) {
  for (const [name, schema] of Object.entries(components)) {
    const canon = canonical(schema);
    const seen = into.get(name);
    if (!seen) {
      into.set(name, { schema, canon, operationId });
    } else if (seen.canon !== canon) {
      throw new Error(
        `Schema id "${name}" names two different ${direction} schemas: ` +
          `used by "${seen.operationId}" and by "${operationId}". ` +
          `Give one of them a different .meta({ id }).`,
      );
    }
  }
}

/** A deep copy of `value` with `$ref`s to renamed ids pointing at their twin. */
export function rewriteOutputRefs<T>(value: T, renamed: ReadonlyMap<string, string>): T {
  if (Array.isArray(value)) {
    return value.map((v) => rewriteOutputRefs(v, renamed)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (
        k === '$ref' &&
        typeof v === 'string' &&
        v.startsWith(refPrefix) &&
        renamed.has(v.slice(refPrefix.length))
      ) {
        out[k] = refPrefix + renamed.get(v.slice(refPrefix.length))!;
      } else {
        out[k] = rewriteOutputRefs(v, renamed);
      }
    }
    return out as T;
  }
  return value;
}

/**
 * Merges the components of every descriptor into one set. An id whose input
 * and output conversions differ is two schemas: `<id>` and `<id>Output`. A
 * difference in `additionalProperties: false` alone is not one: the id is one
 * schema, its input conversion.
 */
export function mergeSharedSchemas(descriptors: EndpointDescriptor[]): SharedSchemas {
  const inputs = new Map<string, Found>();
  const outputs = new Map<string, Found>();
  for (const d of descriptors) {
    if (d.params) {
      gather(inputs, d.params.components, d.operationId, 'input');
    }
    if (d.query) {
      gather(inputs, d.query.components, d.operationId, 'input');
    }
    if (d.input) {
      gather(inputs, d.input.components, d.operationId, 'input');
    }
    for (const o of d.outputs) {
      gather(outputs, o.schema.components, d.operationId, 'output');
    }
  }

  // A schema that refers to a renamed id differs from its input twin once
  // the refs are rewritten, so renaming repeats until nothing changes.
  const renamed = new Map<string, string>();
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, out] of outputs) {
      const inp = inputs.get(name);
      if (!inp || renamed.has(name)) {
        continue;
      }
      if (
        canonical(withoutClosedObjects(rewriteOutputRefs(out.schema, renamed))) !==
        canonical(withoutClosedObjects(inp.schema))
      ) {
        renamed.set(name, name + 'Output');
        changed = true;
      }
    }
  }

  for (const [name, twin] of renamed) {
    if (inputs.has(twin) || outputs.has(twin)) {
      throw new Error(
        `Schema id "${name}" differs between input and output, so its ` +
          `output schema is named "${twin}", which is already the id of ` +
          `another schema. Give one of "${name}" and "${twin}" a different ` +
          `.meta({ id }).`,
      );
    }
  }

  // Inputs first, then outputs and twins; an id equal in both directions is
  // written once, as its input.
  const schemas: Record<string, JsonSchema> = {};
  for (const [name, inp] of inputs) {
    schemas[name] = inp.schema;
  }
  for (const [name, out] of outputs) {
    const key = renamed.get(name) ?? name;
    if (Object.hasOwn(schemas, key)) {
      continue;
    }
    schemas[key] = rewriteOutputRefs(out.schema, renamed);
  }
  return { schemas, renamed };
}

function collectRefs(value: unknown, into: Set<string>) {
  if (Array.isArray(value)) {
    for (const v of value) {
      collectRefs(v, into);
    }
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === '$ref' && typeof v === 'string' && v.startsWith(refPrefix)) {
        into.add(v.slice(refPrefix.length));
      } else {
        collectRefs(v, into);
      }
    }
  }
}

/** The shared schemas `roots` refer to, directly or through other schemas. */
export function reachableSchemas(
  roots: unknown[],
  shared: SharedSchemas,
): Record<string, JsonSchema> {
  const found: Record<string, JsonSchema> = {};
  const queue = new Set<string>();
  collectRefs(roots, queue);
  for (const name of queue) {
    const schema = shared.schemas[name];
    if (!schema || name in found) {
      continue;
    }
    found[name] = schema;
    collectRefs(schema, queue);
  }
  return found;
}
