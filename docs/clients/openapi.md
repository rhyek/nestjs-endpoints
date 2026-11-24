---
description: Building an OpenAPI document for an app that uses nestjs-endpoints, with @nestjs/swagger and the metadata endpoints carry.
---

# OpenAPI

nestjs-endpoints needs no OpenAPI document: the [generated clients](./codegen.md) come from the
schemas directly. If your app builds one with
[`@nestjs/swagger`](https://docs.nestjs.com/openapi/introduction), its
<Endpoint>endpoints</Endpoint> are in it beside your `@Controller()` classes, with a component
schema for every schema they name.

```ts
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Shop API')
    .setOpenAPIVersion('3.1.1')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(3000);
}
void bootstrap();
```

- **Install `@nestjs/swagger` yourself.** It is an optional peer. Without it, endpoints carry
  no OpenAPI metadata.
- **Set the version to 3.1**, as the endpoints' schemas are.
- **A `standardSchemaConverter` of your own** passed to `createDocument` must return `undefined`
  for the endpoints' schemas, whose vendor is `nestjs-endpoints`.

## What an endpoint contributes

| In the document | From |
| --- | --- |
| The operation's id | Its URL in PascalCase, without `:param` segments: `UserCreate` |
| Its path and query parameters | One per property of `params` and `query`, each described by its `.meta({ description })` |
| Its request body | `input`, as the component `UserCreateInput`, described by its `.meta({ description })` |
| Its responses | `output`, as `UserCreateOutput`, or `UserCreate400Output` for another status, each described by its schema's `.meta({ description })` |
| Its summary and tags | `summary`, and `tags` added to one tag from its router |

The router's tag is its [namespace](./namespaces.md), joined with `/`, such as `shop/recipes`.
Without a namespace it is the URL up to the last segment, without `:param` segments:
`/recipes/1/view` is tagged `recipes`.

A schema with a `.meta({ id })` is a component under that id. See
[Transforms in output schemas](../guide/responses.md#transforms-in-output-schemas) for an
`output` that uses `.transform()`.

## Your own generator

Most endpoints are `POST`s, so the HTTP method doesn't say which are reads. For a generator run
against the document, such as Kubb or orval, each operation carries two extensions:

| Extension | Value |
| --- | --- |
| `x-endpoint-kind` | `query` for an `endpoint.query()`, `mutation` for an `endpoint.mutation()` |
| `x-namespace` | The operation's namespace, when it has one |
