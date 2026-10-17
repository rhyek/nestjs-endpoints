/**
 * Each operation's input as self-contained JSON Schema, for the react-query
 * client's `schemas.ts` (`api.<operation>.schemas.input`). "Input" is what an
 * endpoint declares as `input`: its JSON request body, or, when it has no
 * body, its query parameters gathered into an object. Path parameters,
 * headers and a body that is not JSON are not input.
 */
import type { OpenAPIObject } from '@nestjs/swagger';
import {
  deref,
  documentOperations,
  isLocalRef,
  operationParameters,
  operationSourceName,
  resolveLocalRef,
  type Operation,
  type Parameter,
  type PathItem,
} from './document.js';

export type InputSchemaEntry = {
  /** The operation's name on the generated flat module (`authLogin`). */
  sourceName: string;
  kind: 'body' | 'query';
  /** JSON Schema with every `$ref` resolved. */
  schema: Record<string, unknown>;
};

/**
 * The input schema of every operation that has input, keyed by source name.
 * Pass the document each client is generated from (already filtered to its
 * namespaces), so the map holds only that client's operations.
 */
export function collectInputSchemas(
  document: OpenAPIObject,
): Map<string, InputSchemaEntry> {
  const entries = new Map<string, InputSchemaEntry>();
  for (const { pathItem, op } of documentOperations(document)) {
    const input = operationInput(document, pathItem, op);
    if (!input) continue;
    const sourceName = operationSourceName(op.operationId);
    entries.set(sourceName, {
      sourceName,
      kind: input.kind,
      schema: resolveRefs(
        document,
        input.schema,
        op.operationId,
        [],
      ) as Record<string, unknown>,
    });
  }
  return entries;
}

function operationInput(
  document: OpenAPIObject,
  pathItem: PathItem,
  op: Operation,
): { kind: InputSchemaEntry['kind']; schema: unknown } | undefined {
  const content = deref(document, op.requestBody)?.content;
  if (content) {
    // A body in another format (a file upload, say) is the input, and JSON
    // Schema cannot describe it, so the operation gets none.
    const body = content['application/json']?.schema;
    return body ? { kind: 'body', schema: body } : undefined;
  }
  const query = operationParameters(document, pathItem, op).filter(
    (parameter): parameter is Parameter & { name: string } =>
      parameter.in === 'query' && Boolean(parameter.name),
  );
  if (!query.length) {
    return undefined;
  }
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const {
    name,
    schema = {},
    description,
    required: isRequired,
  } of query) {
    // The parameter's description belongs to the field it becomes. Beside a
    // `$ref` it is a sibling keyword, which wins over the referenced one.
    properties[name] =
      description === undefined
        ? schema
        : { ...(schema as object), description };
    if (isRequired) {
      required.push(name);
    }
  }
  return {
    kind: 'query',
    schema: {
      type: 'object',
      properties,
      ...(required.length ? { required } : {}),
    },
  };
}

/**
 * A copy of `value` with every `$ref` replaced by what it points at. Keywords
 * beside a `$ref` (OpenAPI 3.1 allows them) win over the referenced schema's.
 * `chain` holds the refs being resolved on the way here, so a schema that
 * refers back to itself is reported instead of followed forever; the same
 * schema reached twice side by side is fine. A `discriminator`'s `mapping`
 * points into the document by name, so it goes; the inlined members still say
 * which value of `propertyName` selects them.
 */
function resolveRefs(
  document: OpenAPIObject,
  value: unknown,
  operationId: string,
  chain: readonly string[],
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      resolveRefs(document, item, operationId, chain),
    );
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const { $ref: ref, ...rest } = value as Record<string, unknown>;
  const siblings = Object.fromEntries(
    Object.entries(rest).map(([key, item]) => [
      key,
      key === 'discriminator'
        ? withoutMapping(item)
        : resolveRefs(document, item, operationId, chain),
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
  const target = isLocalRef(ref)
    ? resolveLocalRef(document, ref)
    : undefined;
  if (target === undefined) {
    throw new Error(
      `The input schema of operation "${operationId}" refers to ${ref}, which is not in the document.`,
    );
  }
  return {
    ...(resolveRefs(document, target, operationId, [
      ...chain,
      ref,
    ]) as object),
    ...siblings,
  };
}

function withoutMapping(discriminator: unknown): unknown {
  if (!discriminator || typeof discriminator !== 'object') {
    return discriminator;
  }
  const kept = { ...(discriminator as Record<string, unknown>) };
  delete kept.mapping;
  return kept;
}

/**
 * The source of `schemas.ts`: one `InputSchema<T>` per entry, `T` being the
 * operation's request body or query type, so code holding the schema alone
 * can tell the shape of the value it describes.
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
    ` * Each operation's input as JSON Schema, with every $ref resolved.\n` +
    ` */\n`;
  if (!entries.length) {
    return `${header}export {};\n`;
  }
  const optionsType = (sourceName: string) =>
    `${sourceName.charAt(0).toUpperCase()}${sourceName.slice(1)}Options`;
  const typeNames = [
    ...new Set(entries.map((e) => optionsType(e.sourceName))),
  ].sort();
  return (
    header +
    `import type { InputSchema } from '${runtimeImport}';\n` +
    `import type { ${typeNames.join(', ')} } from '${typesImport}';\n` +
    entries
      .map(
        ({ sourceName, kind, schema }) =>
          `\nexport const ${sourceName}: InputSchema<NonNullable<${optionsType(sourceName)}['${kind}']>> = ${JSON.stringify(schema, null, 2)};\n`,
      )
      .join('')
  );
}
