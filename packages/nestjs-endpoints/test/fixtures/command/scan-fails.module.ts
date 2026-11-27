import { Module } from '@nestjs/common';
import { NestjsEndpoints } from '../../../src/nestjs-endpoints';

// Its one endpoint file throws as it loads: the app fails as NestJS builds its modules.
@Module({
  imports: [
    NestjsEndpoints.forRoot({
      router: { rootDirectory: '../routing/throws' },
      clients: [],
      generateClientsOnStart: false,
    }),
  ],
})
export class AppModule {}
