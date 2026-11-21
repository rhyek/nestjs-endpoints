import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInstalledProject, platformPackage, run } from './installed-project';
import type { Report } from './without-swagger/app';

const fixture = path.join(import.meta.dirname, 'without-swagger/app.ts');

type Project = { directory: string; output: string };

async function createProject(swagger: 'absent' | 'installed' | 'broken'): Promise<Project> {
  const directory = await createInstalledProject('without-swagger-', swagger);
  await cp(fixture, path.join(directory, 'app.ts'));
  return { directory, output: path.join(directory, 'generated') };
}

/** Runs the app in `project`, and resolves to the report it prints. */
async function runApp({ directory, output }: Project): Promise<Report> {
  const { stdout } = await run(process.execPath, ['app.ts', output, await platformPackage()], {
    cwd: directory,
    timeout: 60_000,
  });
  return JSON.parse(stdout.trim().split('\n').at(-1)!);
}

/** Every file under `directory`, by its path under it. */
async function files(directory: string): Promise<Record<string, string>> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const read = entries
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const file = path.join(entry.parentPath, entry.name);
      return [path.relative(directory, file), await readFile(file, 'utf-8')] as const;
    });
  return Object.fromEntries(await Promise.all(read));
}

describe('an app that does not install @nestjs/swagger', () => {
  let without: Project;
  let withSwagger: Project;
  let report: Report;
  let reportWithSwagger: Report;

  beforeAll(async () => {
    [without, withSwagger] = await Promise.all([
      createProject('absent'),
      createProject('installed'),
    ]);
    [report, reportWithSwagger] = await Promise.all([runApp(without), runApp(withSwagger)]);
  }, 120_000);

  afterAll(async () => {
    // Either is missing when setting up failed.
    for (const project of [without, withSwagger]) {
      await rm(project?.directory ?? '', { recursive: true, force: true });
    }
  });

  test('the package cannot resolve @nestjs/swagger from that project', async () => {
    const resolve = (project: Project) =>
      run(
        process.execPath,
        ['--input-type=module', '-e', "import.meta.resolve('@nestjs/swagger')"],
        {
          cwd: path.join(project.directory, 'node_modules/nestjs-endpoints/dist'),
        },
      );

    await expect(resolve(without)).rejects.toThrow('ERR_MODULE_NOT_FOUND');
    await expect(resolve(withSwagger)).resolves.toBeDefined();
  });

  test('its endpoints validate requests and responses as they do with it installed', () => {
    const { openapi: _, ...served } = report;
    const { openapi: __, ...servedWithSwagger } = reportWithSwagger;

    expect(served).toEqual(servedWithSwagger);
    expect(served.create).toEqual({ status: 200, body: { id: 1, productId: 'sku_42' } });
    expect(served.invalid).toMatchObject({
      status: 400,
      body: { message: 'Validation failed', errors: [{ path: ['quantity'] }] },
    });
    expect(served.view).toEqual({ status: 200, body: { id: 12, tags: ['new'] } });
    expect(served.booked).toEqual({ status: 201, body: { id: 7 } });
    expect(served.taken).toEqual({ status: 409, body: { message: 'Taken' } });
  });

  test('ApiQueries() and ApiParams() leave a plain controller serving', () => {
    expect(report.legacy).toEqual({ status: 200, body: { legacy: true } });
  });

  test('setupCodegen() writes the client it writes with it installed', async () => {
    const client = await files(without.output);

    expect(Object.keys(client)).toContain('client.ts');
    expect(client).toEqual(await files(withSwagger.output));
  });

  test('with it installed, the document it builds has every endpoint and schema', () => {
    expect(report.openapi).toBeUndefined();
    expect(reportWithSwagger.openapi).toEqual({
      paths: ['/appointments/book', '/legacy/{id}', '/orders/create', '/orders/{orderId}/view'],
      legacyParameters: ['id', 'q'],
      missingSchemas: [],
    });
  });

  test('the package type-checks in that project, its own declarations included', async () => {
    await writeFile(
      path.join(without.directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'nodenext',
          target: 'es2023',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          types: ['node'],
        },
        files: ['app.ts'],
      }),
    );

    // A failed check rejects with the compiler's errors, which it prints to stdout.
    const errors = await run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', '.'], {
      cwd: without.directory,
    }).then(
      () => '',
      (error: unknown) => (error as { stdout: string }).stdout,
    );

    expect(errors).toBe('');
  }, 60_000);

  test('an install of @nestjs/swagger that fails to load is an error, not a missing package', async () => {
    const broken = await createProject('broken');
    try {
      await expect(runApp(broken)).rejects.toThrow('a broken install');
    } finally {
      await rm(broken.directory, { recursive: true, force: true });
    }
  }, 60_000);
});
