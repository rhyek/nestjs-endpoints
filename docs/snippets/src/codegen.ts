import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NodeAdapter } from '@nestjs/platform-node';
import { setupCodegen } from 'nestjs-endpoints';
import { AppModule } from './app.module';

// Writes the clients the site's code samples import (`./generated/axios-client`,
// `./generated/react-query-client`), from the endpoints in this folder. They are rewritten only
// when an endpoint's schemas change.
const generated = path.resolve(import.meta.dirname, '../generated');

const app = await NestFactory.create(AppModule, new NodeAdapter(), { logger: false });
await setupCodegen(app, {
  clients: [
    { type: 'axios', outputFile: path.join(generated, 'axios-client.ts') },
    { type: 'react-query', outputFile: path.join(generated, 'react-query-client.tsx') },
  ],
});
await app.close();
