// The schemas an endpoint declares.
import type { ZodType } from 'zod';
import type { ObjectSchemaLike } from './object-parameters';

export type Schema = ZodType<any>;

export type SchemaOption = Schema | undefined;

/** A `params` or `query` schema: an object, bare or behind a transform or preprocess. */
export type ObjectSchemaUnion = ObjectSchemaLike | undefined;

export type OutputSchemaUnion = Schema | Record<number, Schema> | undefined;

/**
 * The output schemas by status, a single schema being the 200 one, each with the description
 * its `.meta()` gives it; none without `output`.
 */
export function outputsOf(
  output: OutputSchemaUnion,
  fail: (message: string) => Error,
): { status: number; schema: Schema; description: string | undefined }[] | undefined {
  if (!output) {
    return undefined;
  }
  // A zod schema is an instance of its class; a map by status is a plain object.
  const byStatus = (output.constructor === Object ? output : { 200: output }) as Record<
    string,
    Schema
  >;
  const notStatus = Object.keys(byStatus).find((key) => !Number.isInteger(Number(key)));
  if (notStatus !== undefined) {
    throw fail(
      `\`output\` must be a Zod schema, or an object of them by status code: \`${notStatus}\` is not one.`,
    );
  }
  return Object.entries(byStatus).map(([status, schema]) => ({
    status: Number(status),
    schema,
    description: schema.description,
  }));
}
