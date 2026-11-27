import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import { NestjsEndpoints } from '../../../src/nestjs-endpoints';

/** What the spec reads to tell whether the app was started: see `command.spec.ts`. */
export const ran: string[] = ((globalThis as { commandFixtureRan?: string[] }).commandFixtureRan ??=
  []);

@Injectable()
export class Probe implements OnModuleInit {
  constructor() {
    ran.push('constructed');
  }

  onModuleInit() {
    ran.push('initialized');
  }
}

@Module({
  imports: [
    NestjsEndpoints.forRoot({
      router: { rootDirectory: './endpoints' },
      // Read when it is called: each test has its own folder.
      clients: () => [
        { type: 'axios', outputFile: `${process.env.COMMAND_FIXTURE_OUT}/client.ts` },
        { type: 'react-query', outputFile: `${process.env.COMMAND_FIXTURE_OUT}/hooks.tsx` },
      ],
      generateClientsOnStart: false,
    }),
  ],
  providers: [Probe],
})
export class AppModule {}
