import fs from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder } from '@nestjs/swagger';
import type { QueryOptions } from 'orval';
import { setupOpenAPI } from '../setup';
import { axios } from './builder/axios';
import { reactQuery } from './builder/react-query';

export async function setupCodegen(
  app: INestApplication,
  params: {
    openapi?: {
      outputFile?: string | Writable;
      configure?: (documentBuilder: DocumentBuilder) => void;
    };
    clients: ({
      outputFile: string;
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
    forceGenerate?: boolean;
  },
) {
  const openapiOutputFile =
    params.openapi?.outputFile ??
    path.resolve(__dirname, '__generated-openapi.json');
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
            if (client.type === 'axios') {
              await generate({
                input: {
                  target: document as any,
                },
                output: {
                  target: client.outputFile,
                  client: axios(),
                  mode: 'single',
                  indexFiles: false,
                },
              });
            } else if (client.type === 'react-query') {
              await generate({
                input: {
                  target: document as any,
                },
                output: {
                  target: client.outputFile,
                  client: reactQuery(),
                  mode: 'single',
                  indexFiles: false,
                  ...(client.options && {
                    override: {
                      query: client.options,
                    },
                  }),
                },
              });
            }
          }),
      );
    });
  }
}
