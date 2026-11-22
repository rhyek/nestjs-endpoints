// The app `without-swagger.e2e-spec.ts` runs in a project of its own, with plain `node`: it
// serves a few endpoints, calls them, generates a client and, if the project has
// `@nestjs/swagger`, builds an OpenAPI document with it. It prints what it saw as one line of
// JSON. Whether that project has `@nestjs/swagger` is the spec's doing.
//
// Node strips the types and nothing else, so the decorators are called as functions.
import path from 'node:path';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiParams,
  ApiQueries,
  endpoint,
  EndpointRouterModule,
  schema,
  setupCodegen,
  z,
} from 'nestjs-endpoints';

export type Report = {
  create: Reply;
  invalid: Reply;
  view: Reply;
  booked: Reply;
  taken: Reply;
  legacy: Reply;
  /**
   * The document `@nestjs/swagger` builds for the app, where the project has it: its paths,
   * the plain controller's parameters, and the schemas it refers to but doesn't have.
   */
  openapi?: { paths: string[]; legacyParameters: string[]; missingSchemas: string[] };
};
type Reply = { status: number; body: unknown };

const [outputDirectory, platformPackage] = process.argv.slice(2);

const createOrder = endpoint.mutation({
  path: 'create',
  input: z.object({ productId: z.string(), quantity: z.number().int().min(1) }),
  output: z.object({ id: z.number(), productId: z.string() }),
  handler: ({ input }) => ({ id: 1, productId: input.productId }),
});

const viewOrder = endpoint.query({
  path: ':orderId/view',
  method: 'get',
  params: z.object({ orderId: z.coerce.number() }),
  query: z.object({ tags: z.array(z.string()).default([]) }),
  output: z.object({ id: z.number(), tags: z.array(z.string()) }),
  handler: ({ params, query }) => ({ id: params.orderId, tags: query.tags }),
});

const book = endpoint.mutation({
  path: '/appointments/book',
  summary: 'Book an appointment',
  tags: ['calendar'],
  input: z.object({ taken: z.boolean() }),
  output: {
    201: schema(z.object({ id: z.number() }), { description: 'Booked' }),
    409: z.object({ message: z.string() }),
  },
  handler: ({ input, response }) =>
    input.taken ? response(409, { message: 'Taken' }) : response(201, { id: 7 }),
});

// A plain controller that documents its parameters with the package's helpers.
class LegacyController {
  find() {
    return { legacy: true };
  }
}
for (const decorate of [
  Get(':id'),
  ApiParams(z.object({ id: z.string() })),
  ApiQueries(z.object({ q: z.string().optional() })),
]) {
  decorate(
    LegacyController.prototype,
    'find',
    Object.getOwnPropertyDescriptor(LegacyController.prototype, 'find')!,
  );
}
Controller('legacy')(LegacyController);

class AppModule {}
Module({
  imports: [
    EndpointRouterModule.create({
      basePath: 'orders',
      namespace: 'orders',
      description: 'Orders',
      endpoints: [createOrder, viewOrder],
    }),
  ],
  controllers: [book, LegacyController],
})(AppModule);

const platform: Record<string, unknown> = await import(platformPackage);
const Adapter = Object.entries(platform).find(([name]) =>
  name.endsWith('Adapter'),
)![1] as new () => never;
const app = await NestFactory.create(AppModule, new Adapter(), { logger: false });
await app.listen(0, '127.0.0.1');
const url = await app.getUrl();

async function call(method: string, route: string, body?: unknown): Promise<Reply> {
  const response = await fetch(url + route, {
    method,
    ...(body !== undefined && {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  return { status: response.status, body: await response.json() };
}

const report: Report = {
  create: await call('POST', '/orders/create', { productId: 'sku_42', quantity: 2 }),
  invalid: await call('POST', '/orders/create', { productId: 'sku_42', quantity: 'two' }),
  view: await call('GET', '/orders/12/view?tags=new'),
  booked: await call('POST', '/appointments/book', { taken: false }),
  taken: await call('POST', '/appointments/book', { taken: true }),
  legacy: await call('GET', '/legacy/1?q=x'),
};

await setupCodegen(app, {
  clients: [{ type: 'axios', outputFile: path.join(outputDirectory, 'client.ts') }],
});

// A variable, so that a project without the package still type-checks this file.
const swaggerPackage = '@nestjs/swagger';
const swagger = await import(swaggerPackage).catch(() => undefined);
if (swagger) {
  const document = swagger.SwaggerModule.createDocument(app, new swagger.DocumentBuilder().build());
  const schemas = document.components?.schemas ?? {};
  const legacy: { name: string }[] = document.paths['/legacy/{id}'].get.parameters;
  report.openapi = {
    paths: Object.keys(document.paths).sort(),
    legacyParameters: legacy.map((parameter) => parameter.name).sort(),
    missingSchemas: [...JSON.stringify(document).matchAll(/#\/components\/schemas\/(\w+)/g)]
      .map(([, name]) => name)
      .filter((name) => !(name in schemas)),
  };
}

await app.close();
console.log(JSON.stringify(report));
