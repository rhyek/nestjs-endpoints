import { applyDecorators } from '@nestjs/common';
import { z, ZodPipe, ZodTransform } from 'zod';
import { documented, type DocumentedSchema } from './document-schemas';
import { unalias } from './shared-schemas';
import { ApiParam, ApiQuery } from './swagger';
import { ConvertedSchema, JsonSchema, toJsonSchema } from './zod-to-openapi';

/** An object schema, bare or behind a transform or preprocess step. */
export type ObjectSchemaLike =
  | z.ZodObject
  | z.ZodPipe<z.ZodObject>
  | z.ZodPipe<any, z.ZodObject>
  // zod >= 4.6 types `z.preprocess()` as its own pipe, which the generic
  // pipe above does not accept. Derived from `z.preprocess` rather than
  // naming `z.ZodPreprocess`, which older zod 4 releases do not export.
  | ReturnType<typeof z.preprocess<any, z.ZodObject, any>>;

function unwrapObject(zodObject: ObjectSchemaLike): z.ZodObject {
  if (zodObject instanceof ZodPipe) {
    return (
      zodObject.def.in instanceof ZodTransform ? zodObject.def.out : zodObject.def.in
    ) as z.ZodObject;
  }
  return zodObject;
}

export type ObjectParameter = {
  name: string;
  required: boolean;
  schema: JsonSchema;
  /** What the parameter's value is; see {@link valueShape}. */
  shape: ValueShape;
};

/** What a parameter's value is: an array, an object, or a single value. */
export type ValueShape = 'array' | 'object' | 'value';

/**
 * What `schema` describes: an array, an object, or a single value. A nullable
 * array or object (`oneOf` with `null`) counts as one; any other union is a
 * single value.
 */
export function valueShape(schema: JsonSchema, components: Record<string, JsonSchema>): ValueShape {
  const typesOf = (member: JsonSchema): unknown[] => {
    const { type } = unalias(member, components);
    return Array.isArray(type) ? type : [type];
  };
  const resolved = unalias(schema, components);
  const members = (resolved.oneOf ?? resolved.anyOf ?? [resolved]) as JsonSchema[];
  const types = members.flatMap(typesOf).filter((type) => type !== 'null');
  for (const shape of ['array', 'object'] as const) {
    if (types.length && types.every((type) => type === shape)) {
      return shape;
    }
  }
  return 'value';
}

/** An object schema's conversion, and its properties as parameters. */
export type ObjectConversion = ConvertedSchema & { parameters: ObjectParameter[] };

/**
 * One `toJsonSchema(…, 'input')` of an object schema, unwrapped from any
 * transform or preprocess step: the object, its properties as parameters,
 * and the components it names. An object with a `.meta({ id })` converts to
 * a `$ref`; its properties are read from the component it names, which stays
 * in `components`. `at` names the schema in the error thrown when the
 * conversion is not an object, e.g. `The query of endpoint "Search" (POST
 * /search)`.
 */
export function convertObject(zodObject: ObjectSchemaLike, at = 'The schema'): ObjectConversion {
  const { json, components } = toJsonSchema(unwrapObject(zodObject), 'input');
  const object = unalias(json, components);
  const properties = object.properties as Record<string, JsonSchema> | undefined;
  if (object.type !== 'object' || !properties) {
    throw new Error(
      `${at} must be an object schema, so that its properties can be ` +
        `parameters; it converts to ${JSON.stringify(json)}`,
    );
  }
  const required = new Set((object.required ?? []) as string[]);
  return {
    json,
    parameters: Object.entries(properties).map(([name, property]) => ({
      name,
      required: required.has(name),
      schema: property,
      shape: valueShape(property, components),
    })),
    components,
  };
}

/**
 * The `@ApiQuery()` or `@ApiParam()` decorators of an object's parameters, each with its
 * schema as `document` gives it. Path parameters are always required in OpenAPI. An object
 * search parameter is a `deepObject` (`?add[a]=1&add[b]=2`).
 */
export function apiParameters(
  where: 'query' | 'path',
  parameters: ObjectParameter[],
  document: (schema: JsonSchema) => DocumentedSchema,
) {
  return parameters.map(({ name, required, schema, shape }) =>
    where === 'query'
      ? ApiQuery({
          name,
          required,
          standardSchema: document(schema),
          ...(shape === 'object' && { style: 'deepObject', explode: true }),
        })
      : ApiParam({ name, required: true, standardSchema: document(schema) }),
  );
}

/**
 * How an endpoint reads its search parameters before validating them, decided
 * once from its `query` schema's parameters: a lone value of an array
 * parameter (`?tags=a`, which a query string parser reads as a string) as a
 * one-item array. `null` when the query has no array parameter, so the search
 * parameters are validated as they come, with no work per request.
 */
export function loneValuesAsArrays(
  parameters: readonly ObjectParameter[],
): ((query: unknown) => unknown) | null {
  const arrays = parameters.filter((p) => p.shape === 'array').map((p) => p.name);
  if (!arrays.length) {
    return null;
  }
  return (rawQuery) => {
    if (!rawQuery || typeof rawQuery !== 'object') {
      return rawQuery;
    }
    let query: Record<string, unknown> | undefined;
    for (const name of arrays) {
      const value = (rawQuery as Record<string, unknown>)[name];
      if (value !== undefined && !Array.isArray(value)) {
        query ??= { ...(rawQuery as Record<string, unknown>) };
        query[name] = [value];
      }
    }
    return query ?? rawQuery;
  };
}

/**
 * `ApiQueries()` and `ApiParams()`: an object schema's properties as the
 * operation's parameters, each with the components the object names.
 */
export function objectParameters(where: 'query' | 'path', zodObject: ObjectSchemaLike, at: string) {
  const { parameters, components } = convertObject(zodObject, at);
  return applyDecorators(
    ...apiParameters(where, parameters, (json) => documented(() => ({ json, components }))),
  );
}
