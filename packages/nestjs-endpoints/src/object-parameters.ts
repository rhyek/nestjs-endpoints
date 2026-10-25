import { z, ZodPipe, ZodTransform } from 'zod';
import { JsonSchema, toJsonSchema } from './zod-to-openapi.js';

const refPrefix = '#/components/schemas/';

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
      zodObject.def.in instanceof ZodTransform
        ? zodObject.def.out
        : zodObject.def.in
    ) as z.ZodObject;
  }
  return zodObject;
}

export type ObjectParameter = {
  name: string;
  required: boolean;
  schema: JsonSchema;
};

/**
 * One `toJsonSchema(…, 'input')` of an object schema, unwrapped from any
 * transform or preprocess step: the object, its properties as parameters,
 * and the components it names. An object with a `.meta({ id })` converts to
 * a `$ref`; its properties are read from the component it names, which stays
 * in `components`. `at` names the schema in the error thrown when the
 * conversion is not an object, e.g. `The query of endpoint "Search" (POST
 * /search)`.
 */
export function convertObject(
  zodObject: ObjectSchemaLike,
  at = 'The schema',
): {
  schema: JsonSchema;
  parameters: ObjectParameter[];
  components: Record<string, JsonSchema>;
} {
  const { schema, components } = toJsonSchema(
    unwrapObject(zodObject),
    'input',
  );
  let object = schema;
  const seen = new Set<string>();
  while (typeof object.$ref === 'string' && !seen.has(object.$ref)) {
    seen.add(object.$ref);
    const name = object.$ref.slice(refPrefix.length);
    if (!object.$ref.startsWith(refPrefix) || !components[name]) break;
    object = components[name];
  }
  const properties = object.properties as
    Record<string, JsonSchema> | undefined;
  if (object.type !== 'object' || !properties) {
    throw new Error(
      `${at} must be an object schema, so that its properties can be ` +
        `parameters; it converts to ${JSON.stringify(schema)}`,
    );
  }
  const required = new Set((object.required ?? []) as string[]);
  return {
    schema,
    parameters: Object.entries(properties).map(([name, property]) => ({
      name,
      required: required.has(name),
      schema: property,
    })),
    components,
  };
}

/** One entry per property of an object schema, from a single conversion. */
export function objectParameters(
  zodObject: ObjectSchemaLike,
): ObjectParameter[] {
  return convertObject(zodObject).parameters;
}
