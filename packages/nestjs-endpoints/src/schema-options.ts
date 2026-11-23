// The schemas an endpoint declares, each bare or given through `schema()`.
import type { ZodType } from 'zod';
import type { ObjectSchemaLike } from './object-parameters';

export type Schema = ZodType<any>;

export class SchemaDef<S extends Schema = Schema> {
  constructor(
    public schema: S,
    public description: string | undefined,
  ) {}
}

export function schema<S extends Schema>(schema: S, spec?: { description?: string }) {
  return new SchemaDef<S>(schema, spec?.description);
}

/** The zod schema of an option, bare or given through `schema()`. */
export function unwrapSchema<S extends Schema>(s: S | SchemaDef<S>): S {
  return s instanceof SchemaDef ? s.schema : s;
}

export type SchemaOption = Schema | SchemaDef | undefined;

/** The zod schema of an option given bare or through `schema()`. */
export type SchemaOf<S> = S extends SchemaDef<infer Inner> ? Inner : NonNullable<S>;

/**
 * A `params` or `query` schema: an object, bare or behind a transform or
 * preprocess.
 */
export type ObjectSchemaUnion = ObjectSchemaLike | SchemaDef<ObjectSchemaLike> | undefined;

export type OutputSchemaUnion = Schema | SchemaDef | Record<number, Schema | SchemaDef> | undefined;

/**
 * The output schemas by status, a single schema being the 200 one; none
 * without `output`.
 */
export function outputsOf(
  output: OutputSchemaUnion,
): { status: number; schema: Schema; description: string | undefined }[] | undefined {
  if (!output) {
    return undefined;
  }
  const isStatusMap =
    output.constructor === Object &&
    Object.keys(output).length > 0 &&
    Object.keys(output).every((k) => Number.isInteger(Number(k)));
  const byStatus = (isStatusMap ? output : { 200: output }) as Record<number, Schema | SchemaDef>;
  return Object.entries(byStatus).map(([status, s]) => ({
    status: Number(status),
    schema: unwrapSchema(s),
    description: s instanceof SchemaDef ? s.description : undefined,
  }));
}
