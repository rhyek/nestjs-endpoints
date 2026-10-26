import {
  factory,
  findCircularSchemas,
  inferDiscriminatorPropertyName,
  narrowSchema,
  optionality,
  refName,
} from '@kubb/ast';
import type {
  HttpMethod,
  InputNode,
  OperationNode,
  ParameterNode,
  ResponseNode,
  SchemaNode,
  StatusCode,
} from '@kubb/ast';
import type { Adapter } from 'kubb/kit';
import type { EndpointDescriptor } from '../../descriptors.js';
import { reachableSchemas, rewriteOutputRefs, type SharedSchemas } from '../../shared-schemas.js';
import type { JsonSchema } from '../../zod-to-openapi.js';

/**
 * Turns the endpoints' descriptors into Kubb's AST, so Kubb's plugins print
 * the client from the same JSON Schemas the endpoints were set up with. The
 * nodes are shaped the way Kubb's own OpenAPI adapter shapes them, so the
 * plugins print the same types for the same schema.
 */

const refPrefix = '#/components/schemas/';
const jsonContentType = 'application/json';

/**
 * What zod emits through `toJsonSchema`, and the annotations `.meta()` can
 * add (as well as any `x-*` key). Any other keyword throws: a keyword that
 * shapes the value would otherwise vanish from the client unnoticed. An
 * annotation the AST has a field for is carried; the others are ignored.
 */
const acceptedKeywords = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'propertyNames',
  'items',
  'prefixItems',
  'anyOf',
  'oneOf',
  'allOf',
  'enum',
  'const',
  'not',
  'format',
  'pattern',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'default',
  'description',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
  'title',
  'example',
  '$comment',
  'contentEncoding',
  'contentMediaType',
  'discriminator',
  '$ref',
]);

const jsonTypes = new Set(['string', 'number', 'integer', 'boolean', 'null', 'object', 'array']);

/** Formats with a dedicated node type, besides the date family and int64. */
const formatTypes: Record<string, SchemaNode['type']> = {
  uuid: 'uuid',
  email: 'email',
  'idn-email': 'email',
  uri: 'url',
  'uri-reference': 'url',
  url: 'url',
  ipv4: 'ipv4',
  ipv6: 'ipv6',
  hostname: 'url',
  'idn-hostname': 'url',
  binary: 'blob',
  byte: 'blob',
  int32: 'integer',
  float: 'number',
  double: 'number',
};

/** Keywords that constrain a value only alongside a `type`. */
const typelessKeywords = [
  'format',
  'multipleOf',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
  'required',
  'propertyNames',
  'additionalProperties',
];

const numericFormats = new Set(['int32', 'int64', 'uint64', 'float', 'double']);

/** Kubb's PascalCase, so derived names match the ones it derives. */
function pascalCase(text: string): string {
  return text
    .trim()
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .split(/[\s\-_./\\:]+/)
    .filter(Boolean)
    .map((word) =>
      word.length > 1 && word === word.toUpperCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '');
}

function childName(parent: string | undefined, prop: string) {
  return parent ? pascalCase(`${parent} ${prop}`) : undefined;
}

function enumName(parent: string | undefined, prop: string) {
  return pascalCase([parent, prop, 'enum'].filter(Boolean).join(' '));
}

function escapePointer(token: string) {
  return token.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** Drops `undefined` fields, so nodes hold only what the schema says. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

type Context = {
  operationId: string;
  pointer: string;
  name: string | undefined;
  /** A named schema's node, or `null` while it is being resolved. */
  resolve?: (ref: string) => SchemaNode | null;
};

function at(ctx: Context, ...tokens: (string | number)[]): Context {
  return {
    ...ctx,
    pointer: [ctx.pointer, ...tokens.map((t) => escapePointer(String(t)))].join('/'),
  };
}

function fail(ctx: Context, message: string): never {
  throw new Error(`${message} in operation "${ctx.operationId}" at ${ctx.pointer}`);
}

function check(schema: JsonSchema, ctx: Context) {
  for (const key of Object.keys(schema)) {
    if (!acceptedKeywords.has(key) && !key.startsWith('x-')) {
      fail(ctx, `Unsupported JSON Schema keyword "${key}"`);
    }
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  for (const type of types) {
    if (type !== undefined && !jsonTypes.has(type as string)) {
      fail(ctx, `Unsupported JSON Schema type ${JSON.stringify(type)}`);
    }
  }
  if (schema.not !== undefined && !(isObject(schema.not) && Object.keys(schema.not).length === 0)) {
    fail(ctx, 'Unsupported JSON Schema keyword "not" (only `not: {}`)');
  }
  if (
    schema.$ref !== undefined &&
    !(typeof schema.$ref === 'string' && schema.$ref.startsWith(refPrefix))
  ) {
    fail(ctx, `Unsupported $ref ${JSON.stringify(schema.$ref)} (only ${refPrefix}…)`);
  }
}

function omit(schema: JsonSchema, keys: string[]): JsonSchema {
  return Object.fromEntries(Object.entries(schema).filter(([key]) => !keys.includes(key)));
}

function isObject(value: unknown): value is JsonSchema {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNullable(schema: JsonSchema) {
  const { type } = schema;
  return type === 'null' || (Array.isArray(type) && type.includes('null'));
}

function primitiveOf(value: unknown): 'string' | 'number' | 'boolean' {
  return typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
}

const structuralKeywords = new Set([
  'properties',
  'items',
  'additionalProperties',
  'oneOf',
  'anyOf',
  'allOf',
  'not',
]);

/** Folds an `allOf` of keyword-only fragments into its parent. */
function flattenAllOf(schema: JsonSchema): JsonSchema {
  const allOf = schema.allOf as JsonSchema[] | undefined;
  if (!allOf?.length) {
    return schema;
  }
  if (allOf.some((s) => '$ref' in s || Object.keys(s).some((k) => structuralKeywords.has(k)))) {
    return schema;
  }
  const merged = omit(schema, ['allOf']);
  for (const fragment of allOf) {
    for (const [key, value] of Object.entries(fragment)) {
      merged[key] ??= value;
    }
  }
  return merged;
}

const scalarTypes = new Set(['string', 'number', 'integer', 'bigint', 'boolean']);

/** Drops multi-value enum members a plain scalar member already covers. */
function simplifyUnion(members: SchemaNode[]): SchemaNode[] {
  const scalars = new Set(members.filter((m) => scalarTypes.has(m.type)).map((m) => m.type));
  if (!scalars.size) {
    return members;
  }
  return members.filter((member) => {
    const node = narrowSchema(member, 'enum');
    if (!node?.primitive) {
      return true;
    }
    if ((node.namedEnumValues?.length ?? node.enumValues?.length ?? 0) <= 1) {
      return true;
    }
    if (scalars.has(node.primitive)) {
      return false;
    }
    return !(
      (node.primitive === 'integer' || node.primitive === 'number') &&
      (scalars.has('integer') || scalars.has('number'))
    );
  });
}

// Node types that print as their primitive alone when unconstrained.
const plainTypes: Record<string, string> = {
  string: 'string',
  datetime: 'string',
  date: 'string',
  time: 'string',
  number: 'number',
  integer: 'integer',
  boolean: 'boolean',
};
const constraintKeys = [
  'min',
  'max',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'pattern',
] as const;

/**
 * The primitive a union member prints as when it carries nothing beyond it:
 * no bounds, pattern, enum or null (an input date's date-time and date
 * strings are both `string`).
 */
function plainPrimitive(member: SchemaNode): string | undefined {
  const node = member as Record<string, unknown>;
  const primitive = plainTypes[member.type];
  if (!primitive || node.nullable) {
    return undefined;
  }
  if (constraintKeys.some((key) => node[key] !== undefined)) {
    return undefined;
  }
  return node.representation === undefined || node.representation === 'string'
    ? primitive
    : undefined;
}

/** Union members of one unconstrained primitive, as one plain member. */
function collapsePrimitives(members: SchemaNode[]): SchemaNode[] {
  const firstOf = new Map<string, number>();
  const collapsed: SchemaNode[] = [];
  for (const member of members) {
    const primitive = plainPrimitive(member);
    const first = primitive === undefined ? undefined : firstOf.get(primitive);
    if (primitive === undefined) {
      collapsed.push(member);
    } else if (first === undefined) {
      firstOf.set(primitive, collapsed.length);
      collapsed.push(member);
    } else {
      collapsed[first] = factory.createSchema({
        type: primitive,
        primitive,
      } as never);
    }
  }
  return collapsed;
}

function numericBounds(schema: JsonSchema) {
  return {
    min: schema.minimum as number | undefined,
    max: schema.maximum as number | undefined,
    exclusiveMinimum:
      typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum : undefined,
    exclusiveMaximum:
      typeof schema.exclusiveMaximum === 'number' ? schema.exclusiveMaximum : undefined,
    multipleOf: schema.multipleOf as number | undefined,
  };
}

function parse(schema: JsonSchema, ctx: Context): SchemaNode {
  if (!isObject(schema)) {
    fail(ctx, `Expected a JSON Schema object, got ${JSON.stringify(schema)}`);
  }
  check(schema, ctx);
  const flattened = flattenAllOf(schema);
  if (flattened !== schema) {
    return parse(flattened, ctx);
  }

  const nullable = isNullable(schema) || undefined;
  const base = {
    name: ctx.name,
    nullable,
    title: schema.title as string | undefined,
    description: schema.description as string | undefined,
    deprecated: schema.deprecated as boolean | undefined,
    readOnly: schema.readOnly as boolean | undefined,
    writeOnly: schema.writeOnly as boolean | undefined,
    default: schema.default === null && nullable ? undefined : schema.default,
    examples: Array.isArray(schema.examples)
      ? schema.examples
      : schema.example !== undefined
        ? [schema.example]
        : undefined,
    format: schema.format as string | undefined,
  };
  const node = (extras: Record<string, unknown>) =>
    factory.createSchema(compact({ ...base, ...extras }) as never);
  const type = Array.isArray(schema.type)
    ? (schema.type.find((t) => t !== 'null') ?? schema.type[0])
    : schema.type;
  const types = Array.isArray(schema.type) ? schema.type : [];

  if (schema.not !== undefined) {
    return node({ type: 'never' });
  }

  if (typeof schema.$ref === 'string') {
    const resolved = ctx.resolve?.(schema.$ref);
    return node({
      type: 'ref',
      name: refName(schema.$ref),
      ref: schema.$ref,
      ...(resolved !== undefined ? { schema: resolved } : {}),
    });
  }

  const allOf = schema.allOf as JsonSchema[] | undefined;
  if (allOf?.length) {
    if (
      allOf.length === 1 &&
      !schema.properties &&
      !(Array.isArray(schema.required) && schema.required.length) &&
      schema.additionalProperties === undefined
    ) {
      const member = parse(allOf[0], at(ctx, 'allOf', 0));
      const mergedNullable = nullable || member.nullable || undefined;
      return factory.createSchema(
        compact({
          ...member,
          kind: undefined,
          name: ctx.name,
          nullable: mergedNullable,
          title: base.title ?? member.title,
          description: base.description ?? member.description,
          deprecated: base.deprecated ?? member.deprecated,
          readOnly: base.readOnly ?? member.readOnly,
          writeOnly: base.writeOnly ?? member.writeOnly,
          default:
            schema.default === null && mergedNullable
              ? undefined
              : (schema.default ?? member.default),
          examples: base.examples ?? member.examples,
          format: base.format ?? member.format,
        }) as never,
      );
    }
    const members = allOf.map((s, i) => parse(s, at(ctx, 'allOf', i)));
    if (schema.properties) {
      members.push(parse(omit(schema, ['allOf']), { ...ctx, name: undefined }));
    }
    return node({ type: 'intersection', members });
  }

  // A schema with both keeps the members of both, as one union.
  const unionOf = (['oneOf', 'anyOf'] as const).flatMap((keyword) =>
    ((schema[keyword] ?? []) as JsonSchema[]).map((s, i) => [s, at(ctx, keyword, i)] as const),
  );
  if (unionOf.length) {
    const members = unionOf.map(([s, memberCtx]) => parse(s, memberCtx));
    const simpler = simplifyUnion(members);
    const simplified = collapsePrimitives(simpler);
    // Members that all collapsed into one primitive are that primitive: an
    // input date prints as `string`.
    const union =
      simplified.length === 1 && simpler.length > 1
        ? node({ type: simplified[0].type, primitive: simplified[0].type })
        : node({
            type: 'union',
            strategy: schema.oneOf ? 'one' : 'any',
            members: simplified,
            discriminatorPropertyName: inferDiscriminatorPropertyName(members),
          });
    if (!schema.properties) {
      return union;
    }
    const rest = omit(schema, ['oneOf', 'anyOf', 'discriminator']);
    return node({
      type: 'intersection',
      members: [union, parse(rest, ctx)],
    });
  }

  if ('const' in schema && schema.const !== undefined) {
    if (schema.const === null) {
      return node({ type: 'null' });
    }
    return node({
      type: 'enum',
      primitive: primitiveOf(schema.const),
      enumValues: [schema.const],
    });
  }

  if (types.filter((t) => t !== 'null').length > 1) {
    return node({
      type: 'union',
      members: types.filter((t) => t !== 'null').map((t) => parse({ ...schema, type: t }, ctx)),
    });
  }

  const format = schema.format as string | undefined;
  if (format && !(type === 'string' && numericFormats.has(format))) {
    if (format === 'int64' || format === 'uint64') {
      // JSON carries a 64-bit integer as a number.
      return node({
        type: 'integer',
        primitive: 'integer',
        ...numericBounds(schema),
      });
    }
    if (format === 'date-time') {
      return node({
        type: 'datetime',
        primitive: 'string',
        offset: false,
        local: false,
      });
    }
    if (format === 'date' || format === 'time') {
      return node({
        type: format,
        primitive: 'string',
        representation: 'string',
      });
    }
    const special = formatTypes[format];
    if (special) {
      const numeric = special === 'number' || special === 'integer';
      return node({
        type: special,
        primitive: numeric ? special : 'string',
        ...(special === 'url' || special === 'uuid' || special === 'email'
          ? { min: schema.minLength, max: schema.maxLength }
          : {}),
        ...(numeric ? numericBounds(schema) : {}),
      });
    }
  }

  const string = () =>
    node({
      type: 'string',
      primitive: 'string',
      min: schema.minLength,
      max: schema.maxLength,
      pattern: schema.pattern,
    });
  const numeric = (t: 'number' | 'integer') =>
    node({ type: t, primitive: t, ...numericBounds(schema) });

  if (
    !type &&
    (schema.minLength !== undefined ||
      schema.maxLength !== undefined ||
      schema.pattern !== undefined)
  ) {
    return string();
  }
  if (!type && (schema.minimum !== undefined || schema.maximum !== undefined)) {
    return numeric('number');
  }

  const enumValues = schema.enum as unknown[] | undefined;
  if (enumValues?.length) {
    const values = [
      ...new Set(enumValues.filter((v) => v !== null) as (string | number | boolean)[]),
    ];
    if (values.length === 0) {
      return node({ type: 'null' });
    }
    const enumNullable = nullable || enumValues.includes(null) || undefined;
    const primitive =
      type === 'boolean'
        ? 'boolean'
        : type === 'number' || type === 'integer'
          ? 'number'
          : 'string';
    const fields = {
      nullable: enumNullable,
      default: schema.default === null && enumNullable ? undefined : schema.default,
      type: 'enum',
      primitive,
    };
    if (primitive === 'string') {
      return node({ ...fields, enumValues: values });
    }
    return node({
      ...fields,
      namedEnumValues: values.map((value) => ({
        name: String(value),
        value,
        primitive,
      })),
    });
  }

  if (type === 'object' || schema.properties || schema.additionalProperties) {
    return parseObject(schema, ctx, node);
  }

  if ('prefixItems' in schema) {
    const prefixItems = schema.prefixItems as JsonSchema[];
    const items = schema.items;
    return node({
      type: 'tuple',
      primitive: 'array',
      items: prefixItems.map((s, i) => parse(s, { ...at(ctx, 'prefixItems', i), name: undefined })),
      rest:
        items === false
          ? undefined
          : !items || items === true
            ? factory.createSchema({ type: 'unknown' })
            : parse(items as JsonSchema, {
                ...at(ctx, 'items'),
                name: undefined,
              }),
      min: schema.minItems,
      max: schema.maxItems,
    });
  }

  if (type === 'array' || 'items' in schema) {
    const items = schema.items as JsonSchema | undefined;
    const itemName =
      (items?.enum as unknown[] | undefined)?.length && ctx.name
        ? enumName(undefined, ctx.name)
        : ctx.name;
    return node({
      type: 'array',
      primitive: 'array',
      items: items ? [parse(items, { ...at(ctx, 'items'), name: itemName })] : [],
      min: schema.minItems,
      max: schema.maxItems,
    });
  }

  if (type === 'string') {
    return string();
  }
  if (type === 'number' || type === 'integer') {
    return numeric(type);
  }
  if (type === 'boolean') {
    return node({ type: 'boolean', primitive: 'boolean' });
  }
  if (type === 'null') {
    return node({ type: 'null' });
  }
  // Only a schema with nothing to say about the value is unknown.
  const lost = typelessKeywords.find((k) => k in schema);
  if (lost) {
    fail(ctx, `JSON Schema keyword "${lost}" needs a "type"`);
  }
  return node({ type: 'unknown' });
}

function parseObject(
  schema: JsonSchema,
  ctx: Context,
  node: (extras: Record<string, unknown>) => SchemaNode,
): SchemaNode {
  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = Object.entries((schema.properties ?? {}) as Record<string, JsonSchema>).map(
    ([prop, propSchema]) => {
      const parsed = parse(propSchema, {
        ...at(ctx, 'properties', prop),
        name: childName(ctx.name, prop),
      });
      // An inline enum on a property gets a name of its own, which plugin-ts
      // prints as a const and a `…Key` type; a boolean enum stays inline.
      const named = narrowSchema(parsed, 'enum')
        ? {
            ...parsed,
            name: parsed.primitive === 'boolean' ? null : enumName(ctx.name, prop),
          }
        : parsed;
      return factory.createProperty({
        name: prop,
        schema: compact({
          ...named,
          nullable: named.type === 'null' ? undefined : isNullable(propSchema) || undefined,
        }),
        required: required.includes(prop),
      });
    },
  );
  const additional = schema.additionalProperties;
  return node({
    type: 'object',
    primitive: 'object',
    properties,
    additionalProperties:
      additional === true || additional === false || additional === undefined
        ? additional
        : isObject(additional) && Object.keys(additional).length === 0
          ? factory.createSchema({ type: 'unknown' })
          : parse(additional as JsonSchema, {
              ...at(ctx, 'additionalProperties'),
              name: undefined,
            }),
    minProperties: schema.minProperties,
    maxProperties: schema.maxProperties,
  });
}

/**
 * One JSON Schema as an AST node. `at` names the operation and the JSON
 * pointer an error reports, and `name` the schema being converted, from which
 * nested enums are named.
 */
export function schemaToNode(
  schema: JsonSchema,
  at: { operationId: string; pointer: string; name?: string },
): SchemaNode {
  return parse(schema, { ...at, name: at.name });
}

/**
 * An operation's own schemas (input, parameters, responses), whose `$ref`s
 * lead to the shared schemas it uses; output refs point at renamed twins.
 */
export function rootsOf(d: EndpointDescriptor, renamed: SharedSchemas['renamed']) {
  return [
    d.input?.json,
    d.params?.json,
    ...d.pathParams.map((p) => p.schema),
    d.query?.json,
    ...(d.query?.parameters ?? []).map((q) => q.schema),
    ...d.outputs.map((o) => rewriteOutputRefs(o.schema.json, renamed)),
  ].filter((r) => r !== undefined);
}

/** Named schemas before the ones that refer to them. */
function sortByRefs(schemas: Record<string, JsonSchema>) {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visit = (name: string, stack: Set<string>) => {
    if (visited.has(name) || stack.has(name)) {
      return;
    }
    stack.add(name);
    for (const dep of Object.keys(
      reachableSchemas([schemas[name]], { schemas, renamed: new Map() }),
    )) {
      if (dep in schemas) {
        visit(dep, stack);
      }
    }
    stack.delete(name);
    visited.add(name);
    sorted.push(name);
  };
  for (const name of Object.keys(schemas)) {
    visit(name, new Set());
  }
  return sorted;
}

/** `schema` with its `$ref`s followed, its own keywords kept over the target's. */
function unalias(schema: JsonSchema, named: Record<string, JsonSchema>): JsonSchema {
  const seen = new Set<string>();
  let current = schema;
  while (typeof current.$ref === 'string') {
    const target = current.$ref.slice(refPrefix.length);
    if (!current.$ref.startsWith(refPrefix) || seen.has(target) || !named[target]) {
      return current;
    }
    seen.add(target);
    current = { ...named[target], ...omit(current, ['$ref']) };
  }
  return current;
}

/**
 * The keys of a body's properties carrying `flag`, which its type omits: a
 * request omits `readOnly` ones, a response `writeOnly` ones.
 */
function flaggedKeys(
  schema: JsonSchema,
  named: Record<string, JsonSchema>,
  flag: 'readOnly' | 'writeOnly',
): string[] | null {
  const target =
    typeof schema.$ref === 'string'
      ? { ...named[schema.$ref.slice(refPrefix.length)], ...schema }
      : schema;
  const keys = Object.entries((target.properties ?? {}) as Record<string, JsonSchema>)
    .filter(([, p]) => p && !('$ref' in p) && p[flag])
    .map(([k]) => k);
  return keys.length ? keys : null;
}

/**
 * The AST for one client: an operation per descriptor, and the named
 * schemas its operations reach.
 */
export function buildInputNode(params: {
  descriptors: EndpointDescriptor[];
  shared: SharedSchemas;
}): InputNode {
  const { descriptors, shared } = params;

  // Each named schema reports errors against the first operation using it.
  const owners = new Map<string, string>();
  const named: Record<string, JsonSchema> = {};
  for (const d of descriptors) {
    const reached = reachableSchemas(rootsOf(d, shared.renamed), shared);
    for (const [name, schema] of Object.entries(reached)) {
      if (owners.has(name)) {
        continue;
      }
      owners.set(name, d.operationId);
      named[name] = schema;
    }
  }

  // zod names a whole body that has its own id with a `$ref` to that id.
  // It is converted from the target's JSON under the body's own name, so its
  // inline enums are named after the body and its flagged keys are seen.
  for (const [name, schema] of Object.entries(named)) {
    named[name] = unalias(schema, named);
  }

  const resolved = new Map<string, SchemaNode | null>();
  const resolving = new Set<string>();
  const resolverFor = (operationId: string) => (ref: string) => {
    const name = ref.slice(refPrefix.length);
    if (resolving.has(name)) {
      return null;
    }
    if (!resolved.has(name)) {
      const schema = named[name];
      if (!schema) {
        throw new Error(`Operation "${operationId}" refers to ${ref}, which no endpoint defines`);
      }
      resolving.add(name);
      try {
        resolved.set(
          name,
          parse(schema, {
            operationId: owners.get(name) ?? operationId,
            pointer: ref,
            name: undefined,
            resolve: resolverFor(owners.get(name) ?? operationId),
          }),
        );
      } finally {
        resolving.delete(name);
      }
    }
    return resolved.get(name) ?? null;
  };

  const parsedByName = new Map<string, SchemaNode>();
  for (const name of sortByRefs(named)) {
    const operationId = owners.get(name)!;
    parsedByName.set(
      name,
      parse(named[name], {
        operationId,
        pointer: refPrefix + escapePointer(name),
        name,
        resolve: resolverFor(operationId),
      }),
    );
  }
  const schemas = [...parsedByName.values()];

  const operations: OperationNode[] = descriptors.map((d) => {
    const operationName = pascalCase(d.operationId);
    const ctx = (pointer: string, name?: string): Context => ({
      operationId: d.operationId,
      pointer,
      name,
      resolve: resolverFor(d.operationId),
    });
    const parameter = (
      location: 'path' | 'query',
      name: string,
      schema: JsonSchema,
      required: boolean,
    ): ParameterNode =>
      factory.createParameter({
        name,
        in: location,
        schema: parse(
          schema,
          ctx(
            `#/${location === 'path' ? 'params' : 'query'}/properties/${escapePointer(name)}`,
            pascalCase(`${operationName} ${name}`),
          ),
        ),
        required,
      });
    const parameters = [
      ...d.pathParams.map((p) => parameter('path', p.name, p.schema, true)),
      ...(d.query?.parameters ?? []).map((q) => parameter('query', q.name, q.schema, q.required)),
    ];

    const requestBody = d.input
      ? {
          required: true,
          content: [
            factory.createContent({
              contentType: jsonContentType,
              schema: optionality(
                parse(d.input.json, ctx('#/input', `${operationName}Request`)),
                true,
              ),
              keysToOmit: flaggedKeys(d.input.json, named, 'readOnly'),
            }),
          ],
        }
      : undefined;

    const responses: ResponseNode[] =
      d.outputs.length > 0
        ? d.outputs.map((o) => {
            const json = rewriteOutputRefs(o.schema.json, shared.renamed);
            return factory.createResponse({
              statusCode: String(o.status) as StatusCode,
              description: o.description ?? '',
              content: [
                factory.createContent({
                  contentType: jsonContentType,
                  schema: parse(
                    json,
                    ctx(`#/outputs/${o.status}`, `${operationName}Status${o.status}`),
                  ),
                  keysToOmit: flaggedKeys(json, named, 'writeOnly'),
                }),
              ],
            });
          })
        : [
            // The handler answers 200 unless it returns another status.
            factory.createResponse({
              statusCode: '200',
              description: '',
              content: [
                factory.createContent({
                  contentType: jsonContentType,
                  schema: factory.createSchema({ type: 'unknown' }),
                  keysToOmit: null,
                }),
              ],
            }),
          ];

    return factory.createOperation(
      compact({
        operationId: d.operationId,
        method: d.method.toUpperCase() as HttpMethod,
        path: d.path,
        tags: d.tags,
        summary: d.summary || undefined,
        parameters,
        requestBody,
        responses,
        extensions: d.namespaceChain.length > 0 ? { 'x-namespace': d.namespaceChain } : undefined,
      }),
    );
  });

  return factory.createInput({
    schemas,
    operations,
    meta: {
      circularNames: [...findCircularSchemas(schemas)],
      enumNames: schemas
        .filter((s) => narrowSchema(s, 'enum') && s.name)
        .map((s) => s.name as string),
    },
  });
}

/** A Kubb adapter whose source is the `InputNode` built above. */
export function adapterEndpoints(kit: typeof import('kubb/kit'), input: InputNode): Adapter {
  return kit.defineExtension({
    kind: 'adapter',
    meta: { name: 'nestjs-endpoints' },
    build: () => ({
      document: null,
      parse: () => input,
      validate: async () => {},
    }),
  })({});
}
