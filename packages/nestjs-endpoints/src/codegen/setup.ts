import fs from 'node:fs/promises';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { setupOpenAPI, SetupOpenAPIOptions } from '../setup-openapi.js';
import { filterOpenApiDocByNamespaces } from './filter-doc.js';
import {
  generateAxiosClient,
  generateReactQueryClient,
  outputDirFor,
  type ReactQueryPluginOptions,
} from './kubb/generate.js';

export async function setupCodegen(
  app: INestApplication,
  params: {
    openapi?: SetupOpenAPIOptions;
    clients: ({
      outputFile: string;
      /**
       * Restrict this client's generated surface to operations whose
       * top-level `x-namespace` segment is one of the listed names.
       * When omitted, the client includes every operation from the
       * OpenAPI document (full-access). An empty array is rejected as
       * ambiguous — either omit `namespaces` or list one or more
       * segments.
       */
      namespaces?: string[];
    } & (
      | {
          type: 'axios';
        }
      | {
          type: 'react-query';
          /**
           * Forwarded to the underlying `@kubb/plugin-react-query` generator —
           * customise query/mutation/suspense/infinite generation, query keys,
           * etc. The `client` option (HTTP-client wiring) is managed by
           * nestjs-endpoints and is omitted from this type.
           */
          options?: ReactQueryPluginOptions;
        }
    ))[];
    /**
     * If true, the codegen will be forced to run even if the output file already exists
     * or the OpenAPI document has not changed.
     */
    forceGenerate?: boolean | undefined;
  },
) {
  for (const client of params.clients) {
    if (
      client.namespaces !== undefined &&
      client.namespaces.length === 0
    ) {
      throw new Error(
        `setupCodegen: client for "${client.outputFile}" has an empty ` +
          `namespaces filter. Either omit the field (include all ` +
          `operations) or list one or more top-level namespace segments.`,
      );
    }
    if (!path.extname(client.outputFile)) {
      throw new Error(
        `setupCodegen: client "outputFile" must include a file extension ` +
          `(e.g. ".ts" or ".tsx"); got "${client.outputFile}". The generated ` +
          `tree is written to a sibling directory named after it, so an ` +
          `extensionless path would collide the wrapper file with its dir.`,
      );
    }
  }

  const openapiOutputFile =
    params.openapi?.outputFile ??
    path.resolve(import.meta.dirname, '__generated-openapi.json');
  if (params.forceGenerate) {
    // Wipe every artifact this call owns so the generators start from an empty
    // slate — the openapi file (only when it's a real path, not a Writable),
    // each client's wrapper `outputFile`, and its sibling Kubb output directory.
    const removals: Promise<unknown>[] = [];
    const ignore = () => {
      /* ignore if it doesn't exist */
    };
    if (typeof openapiOutputFile === 'string') {
      removals.push(fs.unlink(openapiOutputFile).catch(ignore));
    }
    for (const client of params.clients) {
      removals.push(fs.unlink(client.outputFile).catch(ignore));
      removals.push(
        fs
          .rm(outputDirFor(client.outputFile), {
            recursive: true,
            force: true,
          })
          .catch(ignore),
      );
    }
    await Promise.all(removals);
  }
  const { document, changed } = await setupOpenAPI(app, {
    ...params.openapi,
    outputFile: openapiOutputFile,
  });
  // A client needs (re)generating when its wrapper file OR its sibling output
  // directory is missing — checking both makes regeneration self-healing if the
  // generated tree is partially deleted while the openapi doc is unchanged.
  const pathExists = (p: string) =>
    fs
      .stat(p)
      .then(() => true)
      .catch(() => false);
  const outputExists = await Promise.all(
    params.clients.map(async (client) =>
      (
        await Promise.all([
          pathExists(client.outputFile),
          pathExists(outputDirFor(client.outputFile)),
        ])
      ).every(Boolean),
    ),
  );
  const shouldRegenerate = (index: number) =>
    params.forceGenerate || changed || !outputExists[index];

  if (params.clients.some((_, index) => shouldRegenerate(index))) {
    await Promise.all(
      params.clients
        .filter((_, index) => shouldRegenerate(index))
        .map(async (client) => {
          const filteredDoc = filterOpenApiDocByNamespaces(
            document,
            client.namespaces,
          );
          try {
            if (client.type === 'axios') {
              await generateAxiosClient({
                document: filteredDoc,
                outputFile: client.outputFile,
              });
            } else {
              await generateReactQueryClient({
                document: filteredDoc,
                outputFile: client.outputFile,
                options: client.options,
              });
            }
          } catch (err) {
            throw new Error(
              `setupCodegen: failed to generate the ${client.type} client ` +
                `"${client.outputFile}": ${(err as Error).message}`,
              { cause: err },
            );
          }
        }),
    );
  }

  return { document };
}
