import * as z from 'zod';
import type { ZodType } from 'zod';
import { createSchema } from 'zod-openapi';

const openApiVersion = '3.1.1';

export type SchemaIo = 'input' | 'output';
export type JsonSchema = Record<string, unknown>;

/** A converted schema and the components it names. */
export type ConvertedSchema = {
  json: JsonSchema;
  components: Record<string, JsonSchema>;
};

const inputDate: JsonSchema = {
  oneOf: [
    { type: 'string', format: 'date-time' },
    { type: 'string', format: 'date' },
  ],
};
const outputDate: JsonSchema = { type: 'string', format: 'date-time' };
const dateTypeKeys = ['type', 'format', 'pattern', 'oneOf', 'anyOf'];

// zod-openapi wraps the schema it converts in `properties >
// zodOpenApiCreateSchema`; those two segments are not part of the user's path.
const wrapperSegments = 2;

export function toJsonSchema(schema: ZodType, io: SchemaIo, ref?: string): ConvertedSchema {
  const s = ref ? schema.meta({ id: ref }) : schema;
  // zod visits a schema carrying `.meta()` twice at the same path, first
  // without the meta, so a path is only a failure if no visit had a type.
  const untypedBigints = new Set<string>();
  // A wrapper (`.optional()`, `.default()`, …) is visited at its inner
  // schema's path; one with a meta type there marks a misplaced bigint meta.
  const typedWrappers = new Set<string>();
  const result = createSchema(s, {
    io,
    openapiVersion: openApiVersion,
    opts: {
      override: (ctx) => {
        const { jsonSchema } = ctx;
        if (jsonSchema.anyOf && !jsonSchema.oneOf) {
          jsonSchema.oneOf = jsonSchema.anyOf;
          delete jsonSchema.anyOf;
        }
        const type = ctx.zodSchema._zod.def.type;
        if (type !== 'bigint' && z.globalRegistry.get(ctx.zodSchema)?.type !== undefined) {
          typedWrappers.add(ctx.path.slice(wrapperSegments).join('.'));
        }
        if (type === 'date') {
          // Only the keys that shape the type are replaced; a description,
          // examples or deprecation set on the date itself stays.
          for (const key of dateTypeKeys) {
            delete jsonSchema[key];
          }
          Object.assign(jsonSchema, structuredClone(ctx.io === 'input' ? inputDate : outputDate));
        } else if (type === 'bigint') {
          const path = ctx.path.slice(wrapperSegments).join('.');
          const metaType = z.globalRegistry.get(ctx.zodSchema)?.type;
          if (metaType === undefined) {
            untypedBigints.add(path);
          } else {
            untypedBigints.delete(path);
            jsonSchema.type = metaType as typeof jsonSchema.type;
            delete jsonSchema.format;
          }
        }
      },
    },
  });
  if (untypedBigints.size > 0) {
    const list = (paths: string[]) => paths.map((p) => p || '(root)').join(', ');
    const bare = [...untypedBigints].filter((p) => !typedWrappers.has(p));
    const wrapped = [...untypedBigints].filter((p) => typedWrappers.has(p));
    const messages: string[] = [];
    if (bare.length) {
      messages.push(`bigint cannot travel as JSON at ${list(bare)}; give it .meta({ type })`);
    }
    if (wrapped.length) {
      messages.push(
        `bigint cannot travel as JSON at ${list(wrapped)}; its .meta({ type }) must be on the z.bigint() itself, not on a wrapper`,
      );
    }
    throw new Error(messages.join('\n'));
  }
  return {
    json: result.schema as JsonSchema,
    components: (result.components ?? {}) as Record<string, JsonSchema>,
  };
}
