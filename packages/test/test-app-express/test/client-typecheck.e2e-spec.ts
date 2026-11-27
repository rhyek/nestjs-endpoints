import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Headers, Module, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { decorated, endpoint, EndpointRouter, setupCodegen, z } from 'nestjs-endpoints';
import { AppModule } from '../src/app.module';
import { run } from './installed-project';

const appDirectory = path.resolve(import.meta.dirname, '..');

// The compiler options a front end made with Vite has, as TanStack's scaffold writes them: a
// generated client is compiled by the project it is written into, with that project's rules.
const strict = {
  target: 'ES2022',
  jsx: 'react-jsx',
  module: 'ESNext',
  lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  types: [],
  moduleResolution: 'bundler',
  allowImportingTsExtensions: true,
  verbatimModuleSyntax: true,
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noFallthroughCasesInSwitch: true,
  noUncheckedSideEffectImports: true,
};

describe(
  'a generated client, compiled by a front end with strict settings',
  { timeout: 120_000 },
  () => {
    let dir: string;

    beforeEach(async () => {
      // Inside the test app, whose `generated/` is ignored: the clients import axios, React and
      // TanStack Query from where they are written.
      await mkdir(path.join(appDirectory, 'generated'), { recursive: true });
      dir = await mkdtemp(path.join(appDirectory, 'generated/strict-'));
    });

    afterEach(() => rm(dir, { recursive: true, force: true }));

    /** Writes both kinds of client for `module` into `dir`, and compiles them. */
    async function compiled(module: Type) {
      const app = await NestFactory.create(module, { logger: false });
      try {
        await setupCodegen(app, {
          clients: [
            { type: 'axios', outputFile: path.join(dir, 'axios-client.ts') },
            { type: 'react-query', outputFile: path.join(dir, 'react-query-client.tsx') },
          ],
        });
      } finally {
        await app.close();
      }
      await writeFile(
        path.join(dir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: strict, include: ['**/*.ts', '**/*.tsx'] }),
      );
      const tsc = path.join(appDirectory, 'node_modules/typescript/bin/tsc');
      return run(process.execPath, [tsc, '-p', dir]).then(
        () => '',
        (error: unknown) => {
          const { stdout, stderr } = error as { stdout: string; stderr: string };
          return stdout + stderr;
        },
      );
    }

    test('of an app with no endpoints', async () => {
      @Module({})
      class EmptyModule {}

      expect(await compiled(EmptyModule)).toBe('');
    });

    test('of an app with one query and one mutation', async () => {
      @Module({
        controllers: [
          endpoint.query({
            path: '/fruits/:fruitId/view',
            params: z.object({ fruitId: z.coerce.number() }),
            query: z.object({ ripe: z.stringbool().optional() }),
            output: z.object({ name: z.string(), color: z.string() }),
            handler: () => ({ name: 'apple', color: 'red' }),
          }),
          endpoint.mutation({
            path: '/fruits/add',
            input: z.object({ name: z.string(), color: z.string() }),
            output: z.object({ id: z.number() }),
            handler: () => ({ id: 1 }),
          }),
        ],
      })
      class FruitsModule {}

      expect(await compiled(FruitsModule)).toBe('');
    });

    test('of an app with an endpoint at its root, which the client calls `root`', async () => {
      @Module({
        controllers: [
          endpoint.query({
            path: '/',
            method: 'get',
            output: z.object({ ok: z.boolean() }),
            handler: () => ({ ok: true }),
          }),
        ],
      })
      class RootModule {}

      expect(await compiled(RootModule)).toBe('');
      expect(await readFile(path.join(dir, 'axios-client.ts'), 'utf-8')).toContain(
        'root: bindClient(_ops.root, _client)',
      );
    });

    test("of an app whose router lists another's, with params, a query and a body under both", async () => {
      const shared = EndpointRouter.create({
        endpoints: (): Type[] => [view, rename],
        basePath: 'shared',
        namespace: 'shared',
        description: 'What the apps share',
        expects: { tenant: EndpointRouter.given<string>() },
      });
      const view = shared.endpoint.query({
        path: 'items/:itemId/view',
        method: 'get',
        params: z.object({ itemId: z.coerce.number() }),
        query: z.object({ verbose: z.stringbool().optional() }),
        output: z.object({ id: z.number(), tenant: z.string(), clinic: z.number() }),
        handler: ({ params, tenant }) => ({
          id: params.itemId,
          tenant,
          clinic: (params as unknown as { clinicId: number }).clinicId,
        }),
      });
      const rename = shared.endpoint.mutation({
        path: 'items/:itemId/rename',
        params: z.object({ itemId: z.coerce.number() }),
        input: z.object({ name: z.string().min(1) }),
        output: { 200: z.object({ name: z.string() }), 409: z.object({ taken: z.literal(true) }) },
        handler: ({ input, response }) =>
          input.name === 'taken'
            ? response(409, { taken: true })
            : response(200, { name: input.name }),
      });
      @Module({
        imports: [
          EndpointRouter.create({
            endpoints: [],
            basePath: 'clinics/:clinicId',
            namespace: 'clinics',
            context: {
              params: z.object({ clinicId: z.coerce.number() }),
              injectOnRequest: { tenant: decorated<string>(Headers('x-tenant')) },
            },
            routers: [shared.register({ basePath: 'common' })],
          }),
        ],
      })
      class ListingModule {}

      expect(await compiled(ListingModule)).toBe('');
      const client = await readFile(path.join(dir, 'axios-client.ts'), 'utf-8');
      // Under the namespaces of both routers, with the library's description on its own.
      expect(client).toMatch(/clinics: \{\s+\/\*\* What the apps share \*\/\s+shared: \{/);
      const written = await Promise.all(
        (await readdir(dir, { recursive: true, withFileTypes: true }))
          .filter((entry) => entry.isFile())
          .map((entry) => readFile(path.join(entry.parentPath, entry.name), 'utf-8')),
      );
      // The route is under both base paths, with the path parameter of each router.
      expect(written.join('\n')).toMatch(
        /\/clinics\/[^'"`\n]*clinicId[^'"`\n]*\/common\/items\/[^'"`\n]*itemId[^'"`\n]*\/view/,
      );
    });

    test('of this test app, with every kind of endpoint it has', async () => {
      expect(await compiled(AppModule)).toBe('');
    });
  },
);
