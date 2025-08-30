import type { ZodType } from 'zod';
import { createSchema } from 'zod-openapi';
import { openApiVersion, settings } from './consts';

export function zodToOpenApi(params: {
  schema: ZodType;
  schemaType: 'input' | 'output';
  ref?: string;
}): any {
  const s = params.ref
    ? params.schema.meta({ id: params.ref })
    : params.schema;
  const result = createSchema(s, {
    io: params.schemaType,
    openapiVersion: openApiVersion,
    opts: {
      override: ({ jsonSchema }) => {
        if (jsonSchema.anyOf && !jsonSchema.oneOf) {
          jsonSchema.oneOf = jsonSchema.anyOf;
          delete jsonSchema.anyOf;
        }
      },
    },
  });
  const { schema: openApiSchema, components: schemaComponents } = result;
  if (params.ref) {
    settings.openapi.components.schemas = {
      ...settings.openapi.components.schemas,
      ...schemaComponents,
    };
  }
  return { openApiSchema, schemaComponents };
}
