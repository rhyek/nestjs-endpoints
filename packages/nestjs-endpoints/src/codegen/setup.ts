import type { INestApplicationContext } from '@nestjs/common';
import { ApplicationConfig, ModulesContainer } from '@nestjs/core';
import { rootOf } from '../app-root';
import { ClientOptions, generateClients, resolveClients } from './clients';

/**
 * Writes clients for `app`, generated from its endpoints: those in `clients`, or else those the
 * app declares in `NestjsEndpoints.forRoot()`.
 */
export async function setupCodegen(
  app: INestApplicationContext,
  params: {
    clients?: ClientOptions[];
    /**
     * If true, every client is regenerated, even when its output exists and
     * nothing it is generated from has changed.
     */
    forceGenerate?: boolean | undefined;
  } = {},
): Promise<void> {
  const modules = app.get(ModulesContainer);
  const [declared, of] = params.clients
    ? [params.clients, 'setupCodegen()']
    : [rootOf(modules)?.clients, 'NestjsEndpoints.forRoot()'];
  if (!declared) {
    throw new Error(
      'setupCodegen: pass `clients`, or declare them in NestjsEndpoints.forRoot({ clients }).',
    );
  }
  await generateClients(
    { modules, config: app.get(ApplicationConfig) },
    await resolveClients(declared, of),
    { force: params.forceGenerate ?? false, by: 'setupCodegen' },
  );
}
