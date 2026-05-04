import fs from 'node:fs/promises';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import type { QueryOptions } from 'orval';
import { setupOpenAPI, SetupOpenAPIOptions } from '../setup-openapi';
import { axios } from './builder/axios';
import { reactQuery } from './builder/react-query';
import { filterOpenApiDocByNamespaces } from './filter-doc';
import { writeNamespacedWrapper } from './wrapper';

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
          options?: QueryOptions;
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
  }

  const openapiOutputFile =
    params.openapi?.outputFile ??
    path.resolve(__dirname, '__generated-openapi.json');
  if (params.forceGenerate) {
    // Wipe every artifact this call owns — the openapi file (only when
    // it's a real file path, not a Writable stream), each client's
    // wrapper `outputFile`, and its orval-emitted `.flat` sibling — so
    // the downstream generators start from an empty slate.
    const filesToRemove: string[] = [];
    if (typeof openapiOutputFile === 'string') {
      filesToRemove.push(openapiOutputFile);
    }
    for (const client of params.clients) {
      filesToRemove.push(
        client.outputFile,
        flatPathFor(client.outputFile),
      );
    }
    await Promise.all(
      filesToRemove.map((f) =>
        fs.unlink(f).catch(() => {
          /* ignore if file doesn't exist */
        }),
      ),
    );
  }
  const { document, changed } = await setupOpenAPI(app, {
    ...params.openapi,
    outputFile: openapiOutputFile,
  });
  const outputFileExists = await Promise.all(
    params.clients.map((client) =>
      fs
        .stat(client.outputFile)
        .then(() => true)
        .catch(() => false),
    ),
  );
  if (
    params.forceGenerate ||
    changed ||
    outputFileExists.some((exists) => !exists)
  ) {
    await import('orval').then(async ({ generate }) => {
      await Promise.all(
        params.clients
          .filter(
            (_, index) =>
              params.forceGenerate || changed || !outputFileExists[index],
          )
          .map(async (client) => {
            const filteredDoc = filterOpenApiDocByNamespaces(
              document,
              client.namespaces,
            );
            const flatOutputFile = flatPathFor(client.outputFile);
            if (client.type === 'axios') {
              await generate({
                input: {
                  target: filteredDoc as any,
                },
                output: {
                  target: flatOutputFile,
                  client: axios(),
                  mode: 'single',
                  indexFiles: false,
                },
              });
            } else if (client.type === 'react-query') {
              const queryOptions: QueryOptions = {
                version: 5,
                ...client.options,
              };
              await generate({
                input: {
                  target: filteredDoc as any,
                },
                output: {
                  target: flatOutputFile,
                  client: reactQuery(),
                  mode: 'single',
                  indexFiles: false,
                  override: {
                    query: queryOptions,
                  },
                },
              });
            }
            await writeNamespacedWrapper({
              document: filteredDoc,
              wrapperOutputFile: client.outputFile,
              flatOutputFile,
              clientType: client.type,
            });
          }),
      );
    });
  }

  return { document };
}

/**
 * Pick the sibling path orval writes the raw/flat client to. The
 * consumer-facing wrapper file lives at the user's `outputFile`; the
 * flat artifact sits beside it with a `.flat` segment inserted before
 * the extension (e.g., `axios-client.ts` → `axios-client.flat.ts`).
 */
function flatPathFor(outputFile: string): string {
  const ext = path.extname(outputFile);
  if (!ext) {
    return `${outputFile}.flat`;
  }
  return `${outputFile.slice(0, -ext.length)}.flat${ext}`;
}
