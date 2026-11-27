import { Module } from '@nestjs/common';
import { NestjsEndpoints } from '../../../src/nestjs-endpoints';

// A root router whose folder is not there, which the app warns of.
@Module({
  imports: [
    NestjsEndpoints.forRoot({
      router: { rootDirectory: './missing' },
      clients: () => [
        { type: 'axios', outputFile: `${process.env.COMMAND_FIXTURE_OUT}/client.ts` },
      ],
      generateClientsOnStart: false,
    }),
  ],
})
export class AppModule {}
