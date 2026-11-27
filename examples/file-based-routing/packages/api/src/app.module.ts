import path from 'node:path';
import { Module } from '@nestjs/common';
import { NestjsEndpoints } from 'nestjs-endpoints';

@Module({
  imports: [
    NestjsEndpoints.forRoot({
      router: { rootDirectory: './endpoints' },
      // The React Query client the front end calls the API with, written into its sources as
      // the dev server starts, and by `pnpm codegen`.
      clients: () => [
        {
          type: 'react-query',
          outputFile: path.resolve(
            import.meta.dirname,
            '../../client/src/generated/react-query-client.tsx',
          ),
        },
      ],
    }),
  ],
})
export class AppModule {}
