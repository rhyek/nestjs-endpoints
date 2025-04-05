import fs from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder } from '@nestjs/swagger';
import { setupOpenAPI } from '../setup';
import { axiosBuilder } from './builder/axios';

export async function setupCodegen(
  app: INestApplication,
  params: {
    openapi?: {
      outputFile?: string | Writable;
      configure?: (documentBuilder: DocumentBuilder) => void;
    };
    clients: Record<
      'axios',
      {
        outputFile: string;
      }
    >;
  },
) {
  const openapiOutputFile =
    params.openapi?.outputFile ??
    path.resolve(__dirname, '__generated-openapi.json');
  const { document, changed } = await setupOpenAPI(app, {
    ...params.openapi,
    outputFile: openapiOutputFile,
  });
  const outputFileExists = Object.fromEntries(
    await Promise.all(
      Object.entries(params.clients).map(async ([k, v]) => {
        return [
          k,
          await fs
            .stat(v.outputFile)
            .then(() => true)
            .catch(() => false),
        ] as const;
      }),
    ),
  );
  if (
    changed ||
    Object.values(outputFileExists).some((exists) => !exists)
  ) {
    await import('orval').then(async ({ generate }) => {
      await Promise.all(
        Object.entries(params.clients)
          .filter(([k]) => changed || !outputFileExists[k])
          .map(async ([k, v]) => {
            if (k === 'axios') {
              await generate({
                input: {
                  target: document as any,
                },
                output: {
                  target: v.outputFile,
                  client: axiosBuilder,
                  mode: 'single',
                  indexFiles: false,
                },
              });
            }
          }),
      );
    });
  }
}
