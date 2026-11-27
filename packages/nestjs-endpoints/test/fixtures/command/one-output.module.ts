import { Module } from '@nestjs/common';
import { NestjsEndpoints } from '../../../src/nestjs-endpoints';

const outputFile = 'generated/client.ts';

@Module({
  imports: [
    NestjsEndpoints.forRoot({
      clients: [
        { type: 'axios', outputFile },
        { type: 'react-query', outputFile },
      ],
      generateClientsOnStart: false,
    }),
  ],
})
export class AppModule {}
