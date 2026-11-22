import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * The OpenAPI document as an app builds it for itself, with `@nestjs/swagger` alone: all the
 * package contributes is the metadata its endpoints carry.
 */
export function openApiDocument(
  app: INestApplication,
  configure: (builder: DocumentBuilder) => DocumentBuilder = (builder) => builder,
): OpenAPIObject {
  return SwaggerModule.createDocument(app, configure(new DocumentBuilder()).build());
}

/** The names of the component schemas `value` refers to, anywhere inside it. */
export function schemaRefs(value: unknown, found = new Set<string>()): Set<string> {
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref' && typeof child === 'string') {
        found.add(child.replace('#/components/schemas/', ''));
      } else {
        schemaRefs(child, found);
      }
    }
  }
  return found;
}
