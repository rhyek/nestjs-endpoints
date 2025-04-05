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
    clients: {
      type: 'axios' | 'react-query';
      outputFile: string;
    }[];
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
  if (changed || outputFileExists.some((exists) => !exists)) {
    await import('orval').then(async ({ generate }) => {
      await Promise.all(
        params.clients
          .filter((_, index) => changed || !outputFileExists[index])
          .map(async (client) => {
            if (client.type === 'axios') {
              await generate({
                input: {
                  target: document as any,
                },
                output: {
                  target: client.outputFile,
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
