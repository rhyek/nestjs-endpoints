import type { Provider } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { watchRoutingFiles } from './watch';

/** What `NestjsEndpoints.forRoot()` sets for an app. */
export interface RootOptions {
  watch: boolean;
}

/** In the module `NestjsEndpoints.forRoot()` returns: the app's root options. */
const ROOT = Symbol('nestjs-endpoints:root');
/** In the module of a router no other router discovered. */
const TOP_LEVEL_ROUTER = Symbol('nestjs-endpoints:top-level-router');

/**
 * The providers of the app's root (`root` given), or of a top-level router: a router no other
 * router discovered. As the app instantiates them, they check that it has one root, and they
 * watch the router's folders, `watched`, when the root asks for it.
 */
export function topLevelProviders(
  root: RootOptions | undefined,
  watched?: { directories: string[]; near: string },
): Provider[] {
  return [
    root ? { provide: ROOT, useValue: root } : { provide: TOP_LEVEL_ROUTER, useValue: true },
    {
      provide: Symbol('nestjs-endpoints:top-level'),
      inject: [ModulesContainer],
      useFactory: async (modules: ModulesContainer) => {
        if (rootOf(modules)?.watch && watched) {
          await watchRoutingFiles(watched);
        }
      },
    },
  ];
}

/**
 * The options of an app's root, read from that app's own modules. An app has one root:
 * `NestjsEndpoints.forRoot()`, or else its only top-level router, which has no options. One
 * with two `forRoot()` calls, or with none and two top-level routers, fails here.
 */
function rootOf(modules: ModulesContainer): RootOptions | undefined {
  const valuesOf = (token: symbol) =>
    [...modules.values()].flatMap((module) =>
      module.providers.has(token) ? [module.providers.get(token)?.instance] : [],
    );
  const roots = valuesOf(ROOT) as RootOptions[];
  if (roots.length > 1) {
    throw new Error(
      'nestjs-endpoints: NestjsEndpoints.forRoot() is called more than once. An app calls it once, in its root module.',
    );
  }
  const routers = valuesOf(TOP_LEVEL_ROUTER).length;
  if (roots.length === 0 && routers > 1) {
    throw new Error(
      `nestjs-endpoints: this app has ${routers} routers and no root. Add NestjsEndpoints.forRoot({ router: { … } }) to its root module; further routers stay as EndpointRouterModule.create().`,
    );
  }
  return roots[0];
}
