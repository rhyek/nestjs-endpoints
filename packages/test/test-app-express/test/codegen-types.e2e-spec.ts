import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { setupCodegen, type z } from 'nestjs-endpoints';
import { toJsonSchema } from '../../../nestjs-endpoints/dist/zod-to-openapi.js';
import { createApiClient } from '../generated/react-query-client';
import type * as Types from '../generated/react-query-client/types';
import { AppModule } from '../src/app.module';
import { greetInput } from '../src/endpoints/greet.endpoint';
import { profile } from '../src/endpoints/profile/update.endpoint';
import {
  recipeInput,
  recipeParams,
} from '../src/endpoints/recipes/edit/$recipeId.endpoint';
import {
  searchInput,
  searchQuery,
} from '../src/endpoints/search.endpoint';
import {
  appointmentCreated,
  appointmentError,
  appointmentInput,
} from '../src/endpoints/user/appointment/_endpoints/create/endpoint';

type JsonSchema = Record<string, unknown>;

/** The endpoint's conversion with every `$ref` replaced by its target. */
function resolved(schema: z.ZodType): unknown {
  const { schema: root, components } = toJsonSchema(schema, 'input');
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;
    const object = node as JsonSchema;
    if (typeof object.$ref === 'string') {
      return walk(components[object.$ref.split('/').pop()!]);
    }
    return Object.fromEntries(
      Object.entries(object).map(([k, v]) => [k, walk(v)]),
    );
  };
  return walk(root);
}

describe('generated types and schemas match the zod schemas', () => {
  test('generated request types equal the zod input types', () => {
    expectTypeOf<
      NonNullable<Types.ProfileUpdateOptions['body']>
    >().toEqualTypeOf<z.input<typeof profile>>();
    expectTypeOf<NonNullable<Types.GreetOptions['body']>>().toEqualTypeOf<
      z.input<typeof greetInput>
    >();
    // `query` is the search params and `body` the input, side by side.
    expectTypeOf<NonNullable<Types.SearchOptions['body']>>().toEqualTypeOf<
      z.input<typeof searchInput>
    >();
    expectTypeOf<
      NonNullable<Types.SearchOptions['query']>
    >().toEqualTypeOf<{ page?: number }>();
    expectTypeOf<NonNullable<Types.SearchOptions['query']>>().toExtend<
      z.input<typeof searchQuery>
    >();
    // `z.coerce.number()` takes `unknown` in zod; the client says what the
    // wire carries, which still satisfies the zod input type.
    expectTypeOf<
      NonNullable<Types.RecipesEditOptions['path']>
    >().toEqualTypeOf<{ recipeId: number }>();
    expectTypeOf<NonNullable<Types.RecipesEditOptions['path']>>().toExtend<
      z.input<typeof recipeParams>
    >();
    expectTypeOf<
      NonNullable<Types.RecipesEditOptions['body']>
    >().toEqualTypeOf<z.input<typeof recipeInput>>();
    // Likewise `z.coerce.date()`: the client's `date` is a string.
    expectTypeOf<
      Omit<NonNullable<Types.UserAppointmentCreateOptions['body']>, 'date'>
    >().toEqualTypeOf<Omit<z.input<typeof appointmentInput>, 'date'>>();
    expectTypeOf<
      NonNullable<Types.UserAppointmentCreateOptions['body']>['date']
    >().toEqualTypeOf<string>();
    expectTypeOf<
      NonNullable<Types.UserAppointmentCreateOptions['body']>
    >().toExtend<z.input<typeof appointmentInput>>();
  });

  test('generated response types equal the zod output types', () => {
    expectTypeOf<
      Types.UserAppointmentCreateResponses['201']
    >().toEqualTypeOf<z.output<typeof appointmentCreated>>();
    expectTypeOf<
      Types.UserAppointmentCreateResponses['400']
    >().toEqualTypeOf<z.output<typeof appointmentError>>();
  });

  test('schemas.input is the endpoint conversion', () => {
    const api = createApiClient({ baseURL: 'http://localhost' });
    expect(api.profileUpdate.schemas.input).toEqual(resolved(profile));
    expect(api.greet.schemas.input).toEqual(resolved(greetInput));
  });

  // ProfileAddress differs between directions only by the
  // `additionalProperties: false` zod adds to outputs, so it has no twin.
  test('ProfileAddress is one type for requests and responses', async () => {
    const dir = path.resolve(
      import.meta.dirname,
      '../generated/react-query-client/types',
    );
    await expect(
      stat(path.join(dir, 'ProfileAddress.ts')),
    ).resolves.toBeTruthy();
    await expect(
      stat(path.join(dir, 'ProfileAddressOutput.ts')),
    ).rejects.toThrow();
    for (const file of [
      'ProfileUpdateInput.ts',
      'ProfileUpdateOutput.ts',
    ]) {
      const source = await readFile(path.join(dir, file), 'utf8');
      expect(source).toMatch(/\bProfileAddress\b/);
      expect(source).not.toContain('ProfileAddressOutput');
    }
  });
});

describe('setupCodegen', () => {
  const outputDirOf = (file: string) => file.replace(/\.tsx?$/, '');
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'codegen-types-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  async function run(outputFile: string) {
    const app = await NestFactory.create(AppModule, { logger: false });
    try {
      return await setupCodegen(app, {
        clients: [{ type: 'axios', outputFile }],
      });
    } finally {
      await app.close();
    }
  }

  test('without openapi writes no document', async () => {
    const outputFile = path.join(dir, 'client.ts');
    const result = await run(outputFile);
    expect(result).toEqual({ document: undefined });
    const built = path.resolve(
      import.meta.dirname,
      '../../../nestjs-endpoints/dist/codegen',
    );
    await expect(stat(built)).resolves.toBeTruthy();
    await expect(
      stat(path.join(built, '__generated-openapi.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('a second run with nothing changed leaves the client alone', async () => {
    const outputFile = path.join(dir, 'client.ts');
    await run(outputFile);
    const runtime = path.join(
      outputDirOf(outputFile),
      'client-runtime.ts',
    );
    const before = [await stat(outputFile), await stat(runtime)];
    await new Promise((r) => setTimeout(r, 20));
    await run(outputFile);
    const after = [await stat(outputFile), await stat(runtime)];
    expect(after.map((s) => s.mtimeMs)).toEqual(
      before.map((s) => s.mtimeMs),
    );
  });
});
