/**
 * Each operation's request schemas as self-contained JSON Schema, for the
 * react-query client's `schemas.ts`: `api.<operation>.schemas.input` is what
 * the endpoint declares as `input`, the one the client's body type is built
 * from, and `schemas.query` what it declares as `query`, with the shared
 * schemas they refer to inlined. Path parameters are neither, and a `query`
 * without properties has no search parameters to describe.
 */
import type { EndpointDescriptor } from '../../descriptors.js';
import type { SharedSchemas } from '../../shared-schemas.js';
import { operationSourceName } from './buckets.js';

export type InputSchemaEntry = {
  /** The operation's name on the generated flat module (`authLogin`). */
  sourceName: string;
  /** JSON Schema with every `$ref` resolved, by the request group it types. */
  schemas: {
    input?: Record<string, unknown>;
    query?: Record<string, unknown>;
  };
};

/** What a `$ref` resolves against: the shared schemas, as components. */
type RefTarget = { components: { schemas: Record<string, unknown> } };

/**
 * The request schemas of every operation that has an input or search
 * parameters, keyed by source name. Pass the descriptors each client is
 * generated from (already filtered to its namespaces), so the map holds only
 * that client's operations.
 */
export function collectInputSchemas(
  descriptors: readonly EndpointDescriptor[],
  shared: SharedSchemas,
): Map<string, InputSchemaEntry> {
  const document: RefTarget = { components: { schemas: shared.schemas } };
  const entries = new Map<string, InputSchemaEntry>();
  const resolve = (json: unknown, operationId: string) =>
    resolveRefs(document, json, operationId, []) as Record<string, unknown>;
  for (const { operationId, input, query } of descriptors) {
    const schemas: InputSchemaEntry['schemas'] = {};
    if (input) {
      schemas.input = resolve(input.json, operationId);
    }
    // Without search parameters there is no query type to describe.
    if (query?.parameters.length) {
      schemas.query = resolve(query.json, operationId);
    }
    if (!schemas.input && !schemas.query) {
      continue;
    }
    const sourceName = operationSourceName(operationId);
    entries.set(sourceName, { sourceName, schemas });
  }
  return entries;
}

function isLocalRef(ref: unknown): ref is `#/${string}` {
  return typeof ref === 'string' && ref.startsWith('#/');
}

/**
 * The value a local JSON pointer (`#/components/schemas/Name`) points at,
 * with `~1` and `~0` unescaped; `undefined` when nothing is there.
 */
function resolveLocalRef(document: RefTarget, ref: `#/${string}`): unknown {
  let target: unknown = document;
  for (const segment of ref.slice(2).split('/')) {
    target = (target as Record<string, unknown> | undefined)?.[
      segment.replace(/~1/g, '/').replace(/~0/g, '~')
    ];
  }
  return target;
}

/**
 * A copy of `value` with every `$ref` replaced by what it points at. Keywords
 * beside a `$ref` (OpenAPI 3.1 allows them) win over the referenced schema's.
 * `chain` holds the refs being resolved on the way here, so a schema that
 * refers back to itself is reported instead of followed forever; the same
 * schema reached twice side by side is fine.
 */
function resolveRefs(
  document: RefTarget,
  value: unknown,
  operationId: string,
  chain: readonly string[],
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveRefs(document, item, operationId, chain));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const { $ref: ref, ...rest } = value as Record<string, unknown>;
  const siblings = Object.fromEntries(
    Object.entries(rest).map(([key, item]) => [
      key,
      resolveKeyword(document, key, item, operationId, chain),
    ]),
  );
  if (typeof ref !== 'string') {
    return siblings;
  }
  if (chain.includes(ref)) {
    throw new Error(
      `The input schema of operation "${operationId}" refers back to itself (${[...chain, ref].join(' → ')}), so it cannot be written out as self-contained JSON Schema.`,
    );
  }
  const target = isLocalRef(ref) ? resolveLocalRef(document, ref) : undefined;
  if (target === undefined) {
    throw new Error(
      `The input schema of operation "${operationId}" refers to ${ref}, which is not among the shared schemas.`,
    );
  }
  return {
    ...(resolveRefs(document, target, operationId, [...chain, ref]) as object),
    ...siblings,
  };
}

/** Keywords whose value is data, not a schema. */
const DATA_KEYWORDS = new Set(['const', 'default', 'enum', 'example', 'examples']);

/** Keywords whose value maps names to schemas: the names are not keywords. */
const SCHEMA_MAPS = new Set([
  '$defs',
  'definitions',
  'dependentSchemas',
  'patternProperties',
  'properties',
]);

/**
 * One keyword of a schema, with its `$ref`s resolved where it holds schemas.
 * Data is copied as it is, `$ref`-shaped values included. A `discriminator`'s
 * `mapping` names shared schemas by `$ref`, so it goes; the inlined members
 * still say which value of `propertyName` selects them.
 */
function resolveKeyword(
  document: RefTarget,
  key: string,
  item: unknown,
  operationId: string,
  chain: readonly string[],
): unknown {
  if (DATA_KEYWORDS.has(key)) {
    return structuredClone(item);
  }
  if (key === 'discriminator' && item && typeof item === 'object') {
    const kept = { ...(item as Record<string, unknown>) };
    delete kept.mapping;
    return kept;
  }
  if (SCHEMA_MAPS.has(key) && item && typeof item === 'object') {
    return Object.fromEntries(
      Object.entries(item).map(([name, schema]) => [
        name,
        resolveRefs(document, schema, operationId, chain),
      ]),
    );
  }
  return resolveRefs(document, item, operationId, chain);
}

/** The client's request group each schema types: `input` is the body. */
const clientGroups = { input: 'body', query: 'query' } as const;

/**
 * The source of `schemas.ts`: per entry, an object holding an
 * `InputSchema<T>` per request group, `T` being the operation's request body
 * (`input`) or search parameters (`query`) type, so code holding the schema
 * alone can tell the shape of the value it describes.
 */
export function buildSchemasModuleSource(params: {
  entries: Iterable<InputSchemaEntry>;
  /** Import specifier for the emitted runtime module (no extension). */
  runtimeImport: string;
  /** Import specifier for the generated `types` barrel (no extension). */
  typesImport: string;
}): string {
  const { runtimeImport, typesImport } = params;
  const entries = [...params.entries];
  const header =
    `/**\n` +
    ` * Generated by nestjs-endpoints — do not edit manually.\n` +
    ` *\n` +
    ` * Each operation's input and query as JSON Schema, with every $ref\n` +
    ` * resolved.\n` +
    ` */\n`;
  if (!entries.length) {
    return `${header}export {};\n`;
  }
  const optionsType = (sourceName: string) =>
    `${sourceName.charAt(0).toUpperCase()}${sourceName.slice(1)}Options`;
  const typeNames = [...new Set(entries.map((e) => optionsType(e.sourceName)))].sort();
  return (
    header +
    `import type { InputSchema } from '${runtimeImport}';\n` +
    `import type { ${typeNames.join(', ')} } from '${typesImport}';\n` +
    entries
      .map(({ sourceName, schemas }) => {
        const type = (['input', 'query'] as const)
          .filter((group) => schemas[group])
          .map(
            (group) =>
              `${group}: InputSchema<NonNullable<${optionsType(sourceName)}['${clientGroups[group]}']>>`,
          )
          .join('; ');
        return `\nexport const ${sourceName}: { ${type} } = ${JSON.stringify(schemas, null, 2)};\n`;
      })
      .join('')
  );
}
