import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Writable } from 'node:stream';
import { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerCustomOptions,
  SwaggerModule,
} from '@nestjs/swagger';
import { settings } from './consts';
import { getCallsiteFile } from './helpers';

export type SetupOpenAPIOptions = {
  configure?: (documentBuilder: DocumentBuilder) => void;
  outputFile?: string | Writable;
  /**
   * When set, mounts an OpenAPI viewer at `path` using the same
   * document this function builds.
   *
   * If the optional `@scalar/api-reference` peer dependency is
   * installed it is used (nicer UI, tag grouping via `x-tagGroups`).
   * Otherwise Swagger UI (via `@nestjs/swagger`) is used as the
   * fallback.
   *
   * `options` is passed through to the underlying viewer —
   * `SwaggerCustomOptions` for Swagger UI, or Scalar's
   * [api-reference configuration](https://scalar.com/docs/products/api-references/configuration)
   * when the Scalar path is taken.
   */
  ui?: {
    path: string;
    options?: SwaggerCustomOptions | Record<string, unknown>;
  };
};

async function readPkgJson() {
  const start = path.dirname(getCallsiteFile());
  for (
    let dir = start;
    dir !== path.parse(dir).root && dir !== process.cwd();
    dir = path.dirname(dir)
  ) {
    const pkgJson = path.join(dir, 'package.json');
    if (await fs.stat(pkgJson).catch(() => false)) {
      const parsed = JSON.parse(await fs.readFile(pkgJson, 'utf-8'));
      if (parsed.name === 'nestjs-endpoints') {
        return parsed;
      }
    }
  }
  return null;
}

export async function setupOpenAPI(
  app: INestApplication,
  options?: SetupOpenAPIOptions,
) {
  const builder = new DocumentBuilder();
  if (options?.configure) {
    options.configure(builder);
  }
  const config = builder.build();
  const document = SwaggerModule.createDocument(app, config);
  document.components = {
    ...document.components,
    schemas: {
      ...document.components?.schemas,
      ...settings.openapi.components.schemas,
    },
  };
  if (settings.openapi.tags.length > 0) {
    const byName = new Map<string, { name: string; description?: string }>(
      (document.tags ?? []).map((t) => [t.name, t]),
    );
    for (const tag of settings.openapi.tags) {
      byName.set(tag.name, { ...byName.get(tag.name), ...tag });
    }
    document.tags = Array.from(byName.values());
  }
  // Auto-generate x-tagGroups keyed by top-level namespace segment.
  // Scalar / ReDoc render each group as a sidebar header with its tags
  // nested beneath. Only worth emitting when there are ≥ 2 distinct
  // top-level groups — with a single one the header just duplicates
  // the tag name below it. Tools that don't know the extension ignore
  // it either way.
  if ((document.tags ?? []).length > 0) {
    const groups = new Map<string, string[]>();
    for (const tag of document.tags!) {
      const top = tag.name.split('/')[0];
      if (!groups.has(top)) groups.set(top, []);
      groups.get(top)!.push(tag.name);
    }
    if (groups.size > 1) {
      (document as unknown as Record<string, unknown>)['x-tagGroups'] =
        Array.from(groups.entries()).map(([name, tags]) => ({
          name,
          tags,
        }));
    }
  }
  Object.assign(document, {
    info: {
      ...document.info,
      'nestjs-endpoints': {
        version: (await readPkgJson())?.version ?? '1',
      },
    },
  });
  if (options?.ui) {
    const mountedScalar = await mountScalarUi(
      app,
      options.ui,
      document as unknown as Record<string, unknown>,
    );
    if (!mountedScalar) {
      SwaggerModule.setup(
        options.ui.path,
        app,
        document,
        options.ui.options as SwaggerCustomOptions | undefined,
      );
    }
  }

  let changed = false;

  if (options?.outputFile) {
    const outputFile = options.outputFile;
    const newDocument = JSON.stringify(document, null, 2);

    if (outputFile instanceof Writable) {
      await new Promise<void>((resolve, reject) => {
        outputFile.write(newDocument, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      changed = true;
    } else {
      const documentFile = path.isAbsolute(outputFile)
        ? outputFile
        : path.resolve(path.dirname(getCallsiteFile()), outputFile);
      const currentDocument = await fs
        .readFile(documentFile, 'utf-8')
        .catch(() => '');
      if (currentDocument !== newDocument) {
        await fs.writeFile(documentFile, newDocument, 'utf-8');
        changed = true;
      }
    }
  }
  return { document, changed };
}

/**
 * Resolve the installed `@scalar/api-reference` standalone bundle via
 * Node's module resolution, starting from this library's own location.
 * Scalar's `exports` map doesn't expose `./package.json`, so we resolve
 * its main entry and walk up to find the package root, then append the
 * browser bundle path.
 */
function findScalarBundle(): string | null {
  try {
    const req = createRequire(path.join(__dirname, 'package.json'));
    const entry = req.resolve('@scalar/api-reference');
    let dir = path.dirname(entry);
    while (true) {
      const candidate = path.join(dir, 'package.json');
      if (fsSync.existsSync(candidate)) {
        const pkg = JSON.parse(fsSync.readFileSync(candidate, 'utf-8'));
        if (pkg.name === '@scalar/api-reference') {
          return path.join(dir, 'dist', 'browser', 'standalone.js');
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Attempt to mount Scalar's API reference at `ui.path`. Returns `true`
 * when the optional `@scalar/api-reference` peer dependency is installed
 * and the UI was wired; `false` otherwise, signalling the caller to
 * fall back to Swagger UI.
 */
async function mountScalarUi(
  app: INestApplication,
  ui: NonNullable<SetupOpenAPIOptions['ui']>,
  document: Record<string, unknown>,
): Promise<boolean> {
  const bundlePath = findScalarBundle();
  if (!bundlePath) return false;
  let bundle: string;
  try {
    bundle = await fs.readFile(bundlePath, 'utf-8');
  } catch {
    return false;
  }

  const normalizedPath = ui.path.startsWith('/') ? ui.path : '/' + ui.path;
  const title =
    (document as { info?: { title?: string } }).info?.title ?? 'API docs';
  // Inline the spec as JSON. Escape `<` to survive being embedded in a
  // <script> tag even if the doc contains literal `</script>` anywhere.
  const escapeForScript = (v: unknown) =>
    JSON.stringify(v ?? {}).replace(/</g, '\\u003c');
  const scalarConfig = escapeForScript({
    ...(ui.options ?? {}),
    content: document,
  });
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>${escapeHtml(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <style>body{margin:0;padding:0;}</style>
  </head>
  <body>
    <div id="app"></div>
    <script src="${normalizedPath}/scalar.standalone.js"></script>
    <script>
      Scalar.createApiReference('#app', ${scalarConfig});
    </script>
  </body>
</html>`;

  const adapter = app.getHttpAdapter();
  adapter.get(normalizedPath, (_req: unknown, res: unknown) => {
    adapter.setHeader(res, 'Content-Type', 'text/html; charset=utf-8');
    adapter.reply(res, html, 200);
  });
  adapter.get(
    normalizedPath + '/scalar.standalone.js',
    (_req: unknown, res: unknown) => {
      adapter.setHeader(
        res,
        'Content-Type',
        'application/javascript; charset=utf-8',
      );
      adapter.reply(res, bundle, 200);
    },
  );
  return true;
}
