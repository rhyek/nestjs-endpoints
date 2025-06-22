import './z';
import { ZodSchema } from 'zod';
import { createSchema } from 'zod-openapi';
import { openApiVersion, settings } from './consts';

export function zodToOpenApi(params: {
  schema: ZodSchema;
  schemaType: 'input' | 'output';
  ref?: string;
}): any {
  const s = params.ref
    ? params.schema.openapi({ ref: params.ref })
    : params.schema;
  const { schema: openApiSchema, components: schemaComponents } =
    createSchema(s, {
      schemaType: params.schemaType,
      openapi: openApiVersion,
      unionOneOf: true,
    });
  if (params.ref) {
    settings.openapi.components.schemas = {
      ...settings.openapi.components.schemas,
      ...schemaComponents,
    };
  }
  return { openApiSchema, schemaComponents };
}
