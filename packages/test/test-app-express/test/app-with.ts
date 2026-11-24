import type { INestApplication, ModuleMetadata, NestApplicationOptions } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createApp } from './create-app';

/**
 * Express answers a URL with the first route registered that matches it: with these options,
 * NestJS registers a name there before a parameter. The other adapters always answer with the
 * name.
 */
export const namesFirst: NestApplicationOptions = { routeResolutionStrategy: 'specificity' };

/** What an app is given before it starts, and the options it is made with: see `createApp`. */
type Setup = { configure?: (app: INestApplication) => void; options?: NestApplicationOptions };

/**
 * The app of a testing module that imports `imports`, listening, as `createApp` makes it. It
 * logs nothing, unless `options` gives it a logger.
 */
export async function appWith(
  imports: ModuleMetadata['imports'],
  { configure, options }: Setup = {},
) {
  const fixture = await Test.createTestingModule({ imports }).compile();
  return createApp(fixture, configure, { logger: false, ...options });
}
