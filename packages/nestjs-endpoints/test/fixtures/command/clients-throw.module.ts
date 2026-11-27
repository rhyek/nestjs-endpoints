import { Module } from '@nestjs/common';
import { NestjsEndpoints } from '../../../src/nestjs-endpoints';

@Module({
  imports: [
    NestjsEndpoints.forRoot({
      clients: () => {
        throw new Error('no such folder');
      },
    }),
  ],
})
export class AppModule {}
