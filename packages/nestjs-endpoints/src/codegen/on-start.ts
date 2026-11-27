import type { Provider } from '@nestjs/common';
import { ApplicationConfig, ModulesContainer } from '@nestjs/core';
import { logger } from '../logger';
import { shown } from '../routing-files';
import { ClientsOption, generateClients, resolveClients } from './clients';

/**
 * A provider of the app's root that writes its `clients` as the app starts: once every module
 * has initialized, so with what the app was given after it was created, such as a global prefix,
 * and before it listens.
 */
export function clientsOnStart(clients: ClientsOption): Provider {
  return {
    provide: Symbol('nestjs-endpoints:clients-on-start'),
    inject: [ModulesContainer, ApplicationConfig],
    useFactory: (modules: ModulesContainer, config: ApplicationConfig) => ({
      async onApplicationBootstrap() {
        const written = await generateClients(
          { modules, config },
          await resolveClients(clients, 'NestjsEndpoints.forRoot()'),
          { by: 'NestjsEndpoints.forRoot' },
        );
        for (const { type, outputFile } of written) {
          logger.log(`Generated the ${type} client ${shown(outputFile)}`);
        }
      },
    }),
  };
}
