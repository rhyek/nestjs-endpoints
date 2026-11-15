/**
 * Each operation's request schemas as self-contained JSON Schema, for the
 * react-query client's `schemas.ts`: `api.<operation>.schemas.input` is what
 * the endpoint declares as `input`, the one the client's body type is built
 * from, and `schemas.query` what it declares as `query`, with the shared
 * schemas they refer to inlined. Path parameters are neither, and a `query`
 * without properties has no search parameters to describe.
 */
import { resolverTs } from '@kubb/plugin-ts';
import type { EndpointDescriptor } from '../../descriptors';
import { refPrefix, type SharedSchemas } from '../../shared-schemas';
import { operationSourceName } from './buckets';

export type InputSchemaEntry = {
  operationId: string;
  /** JSON Schema with every `$ref` resolved, by the request group it types. */
  schemas: {
    input?: Record<string, unknown>;
    query?: Record<string, unknown>;
  };
};

/**
 * The request schemas of every operation that has an input or search
 * parameters, keyed by the operation's name on the generated flat module
 * (`authLogin`). Pass the descriptors each client is generated from (already
 * filtered to its namespaces), so the map holds only that client's operations.
 */
export function collectInputSchemas(
  descriptors: readonly EndpointDescriptor[],
  shared: SharedSchemas,
): Map<string, InputSchemaEntry> {
  const entries = new Map<string, InputSchemaEntry>();
  const resolve = (json: unknown, operationId: string) =>
    resolveRefs(shared.schemas, json, operationId, []) as Record<string, unknown>;
  for (const { operationId, input, query } of descriptors) {
    const schemas: InputSchemaEntry['schemas'] = {};
    if (input) {
      schemas.input = resolve(input.json, operationId);
    }
    // Without search parameters there is no query type to describe.
    if (query?.parameters.length) {
      schemas.query = resolve(query.json, operationId);
    }
    if (schemas.input || schemas.query) {
      entries.set(operationSourceName(operationId), { operationId, schemas });
    }
  }
  return entries;
}

/**
 * A copy of `value` with every `$ref` replaced by the shared schema it names.
 * Keywords beside a `$ref` (OpenAPI 3.1 allows them) win over the referenced
 * schema's. `chain` holds the refs being resolved on the way here, so a schema
 * that refers back to itself is reported instead of followed forever; the
 * same schema reached twice side by side is fine.
 */
function resolveRefs(
  named: Record<string, unknown>,
  value: unknown,
  operationId: string,
  chain: readonly string[],
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveRefs(named, item, operationId, chain));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const { $ref: ref, ...rest } = value as Record<string, unknown>;
  const siblings = Object.fromEntries(
    Object.entries(rest).map(([key, item]) => [
      key,
      resolveKeyword(named, key, item, operationId, chain),
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
  const name = ref.startsWith(refPrefix)
    ? ref.slice(refPrefix.length).replace(/~1/g, '/').replace(/~0/g, '~')
    : undefined;
  if (name === undefined || !Object.hasOwn(named, name)) {
    throw new Error(
      `The input schema of operation "${operationId}" refers to ${ref}, which is not among the shared schemas.`,
    );
  }
  return {
    ...(resolveRefs(named, named[name], operationId, [...chain, ref]) as object),
    ...siblings,
  };
}

/** Keywords whose value is data, not a schema. */
const DATA_KEYWORDS = new Set(['const', 'default', 'enum', 'example', 'examples']);

/**
 * One keyword of a schema, with its `$ref`s resolved where it holds schemas.
 * Data is copied as it is, `$ref`-shaped values included. A `discriminator`'s
 * `mapping` names shared schemas by `$ref`, so it goes; the inlined members
 * still say which value of `propertyName` selects them.
 */
function resolveKeyword(
  named: Record<string, unknown>,
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
  // Property names are not keywords: a property may be called `$ref`.
  if (key === 'properties' && item && typeof item === 'object') {
    return Object.fromEntries(
      Object.entries(item).map(([name, schema]) => [
        name,
        resolveRefs(named, schema, operationId, chain),
      ]),
    );
  }
  return resolveRefs(named, item, operationId, chain);
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
  /** Import specifier for the generated `types` barrel (no extension). */
  typesImport: string;
}): string {
  const { typesImport } = params;
  const entries = [...params.entries];
  const header =
    `/**\n` +
    ` * Generated by nestjs-endpoints — do not edit manually.\n` +
    ` *\n` +
    ` * Each operation's input and query as JSON Schema, with every $ref\n` +
    ` * resolved.\n` +
    ` */\n`;
  const inputSchemaType =
    `\n/**\n` +
    ` * An operation's input or query as JSON Schema (\`schemas.input\`,\n` +
    ` * \`schemas.query\`). \`'~type'\` is never there at runtime: it carries the\n` +
    ` * type of the value the schema describes, so code that is handed only the\n` +
    ` * schema, a form library say, can infer it.\n` +
    ` */\n` +
    `export type InputSchema<T> = {\n` +
    `  readonly [key: string]: unknown;\n` +
    `  readonly '~type'?: T;\n` +
    `};\n`;
  if (!entries.length) {
    return header + inputSchemaType;
  }
  // The request types plugin-ts generates: `<operation>Options`.
  const optionsType = (operationId: string) => `${resolverTs.name(operationId)}Options`;
  const typeNames = [...new Set(entries.map((e) => optionsType(e.operationId)))].sort();
  return (
    header +
    `import type { ${typeNames.join(', ')} } from '${typesImport}';\n` +
    inputSchemaType +
    entries
      .map(({ operationId, schemas }) => {
        const type = (['input', 'query'] as const)
          .filter((group) => schemas[group])
          .map(
            (group) =>
              `${group}: InputSchema<NonNullable<${optionsType(operationId)}['${clientGroups[group]}']>>`,
          )
          .join('; ');
        return `\nexport const ${operationSourceName(operationId)}: { ${type} } = ${JSON.stringify(schemas, null, 2)};\n`;
      })
      .join('')
  );
}
