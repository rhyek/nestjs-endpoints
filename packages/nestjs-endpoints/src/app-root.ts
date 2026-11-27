import type { Provider, Type } from '@nestjs/common';
import { DiscoveryService, ModulesContainer } from '@nestjs/core';
import type { ClientsOption } from './codegen/clients';
import { clientsOnStart } from './codegen/on-start';
import { sharedState } from './shared-state';
import { watchRoutingFiles } from './watch';

/** What `NestjsEndpoints.forRoot()` sets for an app. */
export interface RootOptions {
  watch: boolean;
  clients?: ClientsOption;
  generateClientsOnStart: boolean;
}

const { AppRoot, TopLevelRouter } = sharedState;

/** A provider with `mark`, which NestJS's discovery finds in an app as soon as it has scanned it. */
function marked(mark: ClassDecorator): Type {
  class Marked {}
  mark(Marked);
  return Marked;
}

/**
 * The providers of the app's root (`root` given), or of a top-level router: a router no other
 * router discovered. As the app instantiates them, they check that it has one root, and they
 * watch the router's folders, `watched`, when the root asks for it. Those of the root also
 * write its clients as the app starts, when it declares some and asks for that.
 */
export function topLevelProviders(
  root: RootOptions | undefined,
  watched?: { directories: string[]; near: string },
): Provider[] {
  return [
    marked(root ? AppRoot(root) : TopLevelRouter()),
    {
      // Whether it has folders to watch or none: an app with two roots fails here.
      provide: Symbol('nestjs-endpoints:one-root'),
      inject: [ModulesContainer],
      useFactory: (modules: ModulesContainer) => {
        rootOf(modules);
      },
    },
    ...(watched ? [watching(watched)] : []),
    ...(root?.clients && root.generateClientsOnStart ? [clientsOnStart(root.clients)] : []),
  ];
}

/**
 * A provider of a router whose folders no other router's are over: a top-level router, or one
 * another lists in `routers`, as a library's. As the app instantiates it, it watches those
 * folders, when the app's root asks for it.
 */
export function watching(watched: { directories: string[]; near: string }): Provider {
  return {
    provide: Symbol('nestjs-endpoints:watching'),
    inject: [ModulesContainer],
    useFactory: async (modules: ModulesContainer) => {
      if (rootOf(modules)?.watch) {
        await watchRoutingFiles(watched);
      }
    },
  };
}

/**
 * The options of an app's root, read from that app's own modules. An app has one root:
 * `NestjsEndpoints.forRoot()`, or else its only top-level router, which has no options. One
 * with two `forRoot()` calls, or with none and two top-level routers, fails here.
 */
export function rootOf(modules: ModulesContainer): RootOptions | undefined {
  const discovery = new DiscoveryService(modules);
  const roots = discovery
    .getProviders({ metadataKey: AppRoot.KEY })
    .map((wrapper) => discovery.getMetadataByDecorator(AppRoot, wrapper));
  if (roots.length > 1) {
    throw new Error(
      'nestjs-endpoints: NestjsEndpoints.forRoot() is called more than once. An app calls it once, in its root module.',
    );
  }
  const routers = discovery.getProviders({ metadataKey: TopLevelRouter.KEY }).length;
  if (roots.length === 0 && routers > 1) {
    throw new Error(
      `nestjs-endpoints: this app has ${routers} routers and no root. Add NestjsEndpoints.forRoot({ router: { … } }) to its root module; further routers stay as EndpointRouter.create().`,
    );
  }
  return roots[0];
}
