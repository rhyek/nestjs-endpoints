import {
  INestApplication,
  INestApplicationContext,
  Module,
  Type,
  Version,
  VersioningType,
} from '@nestjs/common';
import { AbstractHttpAdapter, NestFactory, RouterModule } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { z } from 'zod';
import { collectDescriptors, EndpointDescriptor, filterDescriptors } from './descriptors.js';
import { endpoint, schema } from './endpoint-fn.js';

const apps: INestApplicationContext[] = [];

async function describeApp(controllers: Type[]): Promise<EndpointDescriptor[]> {
  @Module({ controllers })
  class AppModule {}
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  apps.push(app);
  return collectDescriptors(app);
}

/** A real Nest application over an HTTP adapter that serves nothing. */
async function createHttpApp(
  controllers: Type[],
  imports: NonNullable<Parameters<typeof Module>[0]['imports']> = [],
): Promise<INestApplication> {
  @Module({ controllers, imports })
  class AppModule {}
  const adapter = {
    // `NestFactory.create` takes an object with `patch` for an HTTP adapter.
    patch() {},
    initHttpServer() {},
    getHttpServer() {
      return {};
    },
    getType() {
      return 'stub';
    },
    close() {},
  };
  const app = await NestFactory.create(AppModule, adapter as unknown as AbstractHttpAdapter, {
    logger: false,
  });
  apps.push(app);
  return app;
}

afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
});

test('path params from the route, typed by params', async () => {
  const typed = endpoint.query({
    path: '/r/:id/view',
    params: z.object({ id: z.coerce.number() }),
    handler: () => null,
  });
  const untyped = endpoint.query({
    path: '/u/:slug/view',
    handler: () => null,
  });
  const [r, u] = await describeApp([typed, untyped]);
  expect(r.path).toBe('/r/{id}/view');
  expect(r.pathParams).toEqual([{ name: 'id', schema: { type: 'number' } }]);
  expect(r.params?.json).toMatchObject({
    properties: { id: { type: 'number' } },
  });
  expect(u.params).toBeUndefined();
  expect(u.path).toBe('/u/{slug}/view');
  expect(u.pathParams).toEqual([{ name: 'slug', schema: { type: 'string' } }]);
});

test("an endpoint is a POST of its builder's kind by default", async () => {
  const find = endpoint.query({ path: '/find', handler: () => null });
  const make = endpoint.mutation({
    path: '/make-it',
    handler: () => null,
  });
  const fetch = endpoint.query({
    path: '/fetch',
    method: 'get',
    handler: () => null,
  });
  const described = await describeApp([find, make, fetch]);
  expect(described.map((d) => [d.operationId, d.kind, d.method])).toEqual([
    ['Fetch', 'query', 'get'],
    ['Find', 'query', 'post'],
    ['MakeIt', 'mutation', 'post'],
  ]);
});

test('query is split into search parameters', async () => {
  const search = endpoint.query({
    path: '/search',
    query: z.object({ q: z.string(), n: z.coerce.number().optional() }),
    handler: () => null,
  });
  const [d] = await describeApp([search]);
  expect(d.method).toBe('post');
  expect(d.input).toBeUndefined();
  expect(d.query!.parameters.map((p) => p.name)).toEqual(['q', 'n']);
  expect(d.query!.parameters.map((p) => p.required)).toEqual([true, false]);
  expect(d.query!.json).toMatchObject({
    type: 'object',
    properties: { q: { type: 'string' }, n: { type: 'number' } },
    required: ['q'],
  });
  expect(d.query!.json.$ref).toBeUndefined();
});

test('a query with a meta id is split into search parameters', async () => {
  const search = endpoint.query({
    path: '/named-search',
    method: 'get',
    query: z
      .object({ q: z.string(), n: z.coerce.number().optional() })
      .meta({ id: 'NamedSearchQuery' }),
    handler: () => null,
  });
  const [d] = await describeApp([search]);
  expect(d.query!.parameters).toEqual([
    { name: 'q', required: true, schema: { type: 'string' } },
    { name: 'n', required: false, schema: { type: 'number' } },
  ]);
  expect(d.query!.json).toEqual({
    $ref: '#/components/schemas/NamedSearchQuery',
  });
  expect(d.query!.components.NamedSearchQuery).toMatchObject({
    type: 'object',
    properties: { q: { type: 'string' }, n: { type: 'number' } },
  });
});

test('a query given through schema() is split into search parameters', async () => {
  const search = endpoint.query({
    path: '/described-search',
    query: schema(z.object({ q: z.string() })),
    handler: ({ query: { q } }) => q,
  });
  const [d] = await describeApp([search]);
  expect(d.query!.parameters).toEqual([{ name: 'q', required: true, schema: { type: 'string' } }]);
});

test('input and query together are a body and search parameters', async () => {
  const save = endpoint.mutation({
    path: '/save',
    query: z.object({ draft: z.coerce.boolean() }),
    input: z.object({ name: z.string() }),
    handler: () => null,
  });
  const [d] = await describeApp([save]);
  expect(d.query!.parameters.map((p) => p.name)).toEqual(['draft']);
  expect(d.input!.json).toEqual({
    $ref: '#/components/schemas/SaveInput',
  });
});

test('params with a meta id type the path parameters', async () => {
  const view = endpoint.query({
    path: '/named/:id/view',
    params: z.object({ id: z.coerce.number() }).meta({ id: 'NamedViewParams' }),
    handler: () => null,
  });
  const [d] = await describeApp([view]);
  expect(d.pathParams).toEqual([{ name: 'id', schema: { type: 'number' } }]);
});

test('a GET endpoint with input throws, naming the file', () => {
  expect(() =>
    endpoint.query({
      method: 'get',
      path: '/body',
      // @ts-expect-error A GET request has no body.
      input: z.object({ a: z.string() }),
      handler: () => null,
    }),
  ).toThrow(
    /^endpoint\.query\(\) in .*descriptors\.spec\.ts: a GET endpoint cannot declare `input`/,
  );
});

test('a method that may be a GET takes no input either', () => {
  const method = 'get' as 'get' | 'post';
  expect(() =>
    endpoint.query({
      method,
      path: '/maybe-body',
      // @ts-expect-error A GET request has no body.
      input: z.object({ a: z.string() }),
      handler: () => null,
    }),
  ).toThrow(/a GET endpoint cannot declare `input`/);
});

test('a method that is not one of the five throws, naming the file', () => {
  expect(() =>
    endpoint.query({
      // @ts-expect-error Methods are lowercase.
      method: 'GET',
      path: '/upper',
      handler: () => null,
    }),
  ).toThrow(
    /^endpoint\.query\(\) in .*descriptors\.spec\.ts: `method` must be one of 'get', 'post', 'put', 'delete', 'patch'; got "GET"\.$/,
  );
  expect(() =>
    endpoint.mutation({
      method: 'head' as any,
      path: '/head',
      handler: () => null,
    }),
  ).toThrow(/^endpoint\.mutation\(\) in .*: `method` must be one of/);
});

test('a query that is not an object throws, naming the endpoint', () => {
  expect(() =>
    endpoint.query({
      path: '/either',
      // @ts-expect-error `query` is an object schema.
      query: z.union([z.object({ a: z.string() }), z.object({ b: z.string() })]),
      handler: () => null,
    }),
  ).toThrow('The query of endpoint "Either" (POST /either) must be an object schema');
});

test('params that are not an object throw, naming the endpoint', () => {
  expect(() =>
    endpoint.query({
      path: '/either/:id',
      // @ts-expect-error `params` is an object schema.
      params: z.union([z.object({ id: z.string() }), z.object({ id: z.number() })]),
      handler: () => null,
    }),
  ).toThrow('The params of endpoint "Either" (POST /either/:id) must be an object schema');
});

test('input is a named body', async () => {
  const create = endpoint.mutation({
    path: '/things/create',
    input: z.object({ name: z.string() }),
    handler: () => null,
  });
  const [d] = await describeApp([create]);
  expect(d.operationId).toBe('ThingsCreate');
  expect(d.method).toBe('post');
  expect(d.input!.json).toEqual({
    $ref: '#/components/schemas/ThingsCreateInput',
  });
  expect(d.input!.components.ThingsCreateInput).toMatchObject({
    type: 'object',
    properties: { name: { type: 'string' } },
  });
  expect(d.query).toBeUndefined();
});

test('outputs by status', async () => {
  const make = endpoint.mutation({
    path: '/make',
    output: {
      201: schema(z.object({}), { description: 'Made' }),
      400: z.string(),
    },
    handler: ({ response }) => response(201, {}),
  });
  const [d] = await describeApp([make]);
  expect(d.outputs.map((o) => o.status)).toEqual([201, 400]);
  expect(d.outputs.map((o) => o.schema.json)).toEqual([
    { $ref: '#/components/schemas/Make201Output' },
    { $ref: '#/components/schemas/Make400Output' },
  ]);
  expect(d.outputs.map((o) => o.description)).toEqual(['Made', undefined]);
});

test('two apps each collect their own endpoints', async () => {
  const one = endpoint.query({ path: '/one', handler: () => 1 });
  const two = endpoint.query({ path: '/two', handler: () => 2 });
  const three = endpoint.query({ path: '/three', handler: () => 3 });
  const first = await describeApp([two, one]);
  const second = await describeApp([three]);
  expect(first.map((d) => d.operationId)).toEqual(['One', 'Two']);
  expect(second.map((d) => d.operationId)).toEqual(['Three']);
});

test('paths carry the global prefix, except the routes it excludes', async () => {
  const view = endpoint.query({
    path: '/p/:id/view',
    handler: () => null,
  });
  const health = endpoint.query({ path: '/health', handler: () => null });
  const app = await createHttpApp([view, health]);
  app.setGlobalPrefix('api/', { exclude: ['health'] });
  expect(collectDescriptors(app).map((d) => d.path)).toEqual(['/api/p/{id}/view', '/health']);
});

test('paths carry the URI version, by default or by the method', async () => {
  const plain = endpoint.query({ path: '/plain', handler: () => null });
  const pinned = endpoint.query({
    path: '/pinned',
    decorators: [Version('2')],
    handler: () => null,
  });
  const app = await createHttpApp([plain, pinned]);
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  expect(collectDescriptors(app).map((d) => d.path)).toEqual(['/api/v1/plain', '/api/v2/pinned']);
});

test('an endpoint served under several versions takes the first path', async () => {
  const both = endpoint.query({
    path: '/both',
    decorators: [Version(['1', '2'])],
    handler: () => null,
  });
  const app = await createHttpApp([both]);
  app.enableVersioning({ type: VersioningType.URI });
  expect(collectDescriptors(app).map((d) => d.path)).toEqual(['/v1/both']);
});

test('paths carry the module path a RouterModule mounts them under', async () => {
  const list = endpoint.query({
    path: '/users/list',
    handler: () => null,
  });
  const top = endpoint.query({ path: '/top', handler: () => null });
  @Module({ controllers: [list] })
  class AdminModule {}
  const app = await createHttpApp(
    [top],
    [AdminModule, RouterModule.register([{ path: 'admin', module: AdminModule }])],
  );
  app.setGlobalPrefix('api');
  expect(collectDescriptors(app).map((d) => d.path)).toEqual(['/api/admin/users/list', '/api/top']);
});

test('every descriptor path is a path of the OpenAPI document', async () => {
  const plain = endpoint.query({ path: '/plain', handler: () => null });
  const both = endpoint.query({
    path: '/both',
    decorators: [Version(['2', '1'])],
    handler: () => null,
  });
  const list = endpoint.query({
    path: '/users/list',
    handler: () => null,
  });
  @Module({ controllers: [list] })
  class AdminModule {}
  const app = await createHttpApp(
    [plain, both],
    [AdminModule, RouterModule.register([{ path: 'admin', module: AdminModule }])],
  );
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  const paths = collectDescriptors(app).map((d) => d.path);
  expect(paths).toEqual(['/api/v1/admin/users/list', '/api/v1/plain', '/api/v2/both']);
  for (const path of paths) {
    expect(document.paths[path]).toBeDefined();
  }
});

test('each operation of the OpenAPI document carries its kind', async () => {
  const find = endpoint.query({ path: '/kind/find', handler: () => null });
  const make = endpoint.mutation({
    path: '/kind/make',
    handler: () => null,
  });
  const fetch = endpoint.query({
    path: '/kind/fetch',
    method: 'get',
    handler: () => null,
  });
  const app = await createHttpApp([find, make, fetch]);
  const { paths } = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  expect(paths).toMatchObject({
    '/kind/find': { post: { 'x-endpoint-kind': 'query' } },
    '/kind/make': { post: { 'x-endpoint-kind': 'mutation' } },
    '/kind/fetch': { get: { 'x-endpoint-kind': 'query' } },
  });
});

test('the OpenAPI document gives an endpoint without output a 200', async () => {
  const purge = endpoint.mutation({ path: '/purge', handler: () => null });
  const app = await createHttpApp([purge]);
  const { paths } = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  expect(Object.keys(paths['/purge'].post!.responses)).toEqual(['200']);
});

test('filterDescriptors keeps listed top-level namespaces', () => {
  const withChain = (namespaceChain: string[]) =>
    ({ operationId: namespaceChain.join('.'), namespaceChain }) as Pick<
      EndpointDescriptor,
      'operationId' | 'namespaceChain'
    > as EndpointDescriptor;
  const descriptors = [withChain(['admin', 'users']), withChain(['public']), withChain([])];
  expect(filterDescriptors(descriptors, undefined)).toEqual(descriptors);
  expect(filterDescriptors(descriptors, ['admin']).map((d) => d.operationId)).toEqual([
    'admin.users',
  ]);
  expect(filterDescriptors(descriptors, ['users'])).toEqual([]);
});
