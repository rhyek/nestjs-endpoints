// Two of the NestJS modules a router has beside its own: the one that holds the providers its
// children share, and the one that places the routers under it after it in NestJS's order.

import {
  type DynamicModule,
  Module,
  type ModuleMetadata,
  type Provider,
  type Type,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE, ModulesContainer } from '@nestjs/core';
import { shown } from './routing-files';

type Imports = NonNullable<ModuleMetadata['imports']>;

/** A module that gives what imports it nothing but a place after `imports` in NestJS's order. */
export function orderModule(imports: DynamicModule[]): DynamicModule {
  class RouterOrderModule {}
  Module({})(RouterOrderModule);
  return { module: RouterOrderModule, imports };
}

/** Adds `module` to the imports of `to`, once. */
export function importInto(to: DynamicModule, module: DynamicModule | undefined): void {
  const imports = (to.imports ??= []);
  if (module && !imports.includes(module)) {
    imports.push(module);
  }
}

/**
 * A router's `providers` and `imports`, as the routers made with its `child()` have them.
 */
export type SharedProviders = {
  /** The providers of the router, wherever it has them. */
  own: Provider[];
  /**
   * Set by the first `child()`, or for guards or interceptors of its own: the router then has
   * its providers in `module()`.
   */
  wanted: boolean;
  /**
   * The router's own module, once it has registered with its providers in it, as a router
   * no `child()` was called on does.
   */
  keptBy?: Type;
  /** A module that has the router's providers and exports them. Built when first read. */
  module: () => DynamicModule;
  /**
   * What a module imports to have what this router and the routers above it provide and
   * import, the nearest first.
   */
  inherited: () => Imports;
  /**
   * Puts it under the providers of the router that lists it in `routers`, as one made with
   * that router's `child()` is under its parent's. Before either registers.
   */
  under: (above: SharedProviders) => void;
  /** The providers of the router above it: its parent's, or those of the router that lists it. */
  above: () => SharedProviders | undefined;
};

/** NestJS registers a provider of one of these for the whole app, under a token of its own. */
const APP_WIDE = new Set<unknown>([APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE]);

/**
 * What a router gives the routers made with its `child()`, so that they have what it
 * provides and imports as the same instances: in an app that loads a child without its
 * parent too.
 *
 * - **Its providers**, in a module of their own that exports them, which each router under
 *   it imports. A module makes its own instance of a provider it lists, so the router that
 *   has children imports that module too, in place of listing them itself.
 * - **Its imports**, which each router under it lists as well: NestJS has one of a module.
 *
 * NestJS looks in a module's own providers, then in its imports in order. So what a router
 * lists itself comes before what its parent does, and a provider before an import.
 */
export function sharedProviders(
  file: string,
  options: Pick<ModuleMetadata, 'imports' | 'providers'> | undefined,
  parent: SharedProviders | undefined,
): SharedProviders {
  const providers = options?.providers ?? [];
  const imports = options?.imports ?? [];
  let above = parent;
  let module: DynamicModule | undefined;
  const shared: SharedProviders = {
    own: providers,
    wanted: false,
    module: () => {
      if (!module) {
        class RouterProvidersModule {}
        Module({})(RouterProvidersModule);
        const { keptBy } = shared;
        module = {
          module: RouterProvidersModule,
          // What its providers are made from, as the router's own module has it.
          imports: [...imports, ...(above?.inherited() ?? [])],
          providers: [
            ...providers,
            ...(keptBy && providers.length ? [notBeside(keptBy, file)] : []),
          ],
          exports: providers.filter(
            (provider) => !APP_WIDE.has((provider as { provide?: unknown } | undefined)?.provide),
          ),
        };
      }
      return module;
    },
    inherited: () => [shared.module(), ...imports, ...(above?.inherited() ?? [])],
    under: (listing) => {
      above = listing;
    },
    above: () => above,
  };
  return shared;
}

/**
 * For the providers of a router that registered before `child()` was first called on it:
 * its own module has them too, so an app with that module and this one would make each
 * provider twice. A provider that fails such an app as it starts.
 */
function notBeside(routerModule: Type, file: string): Provider {
  return {
    provide: Symbol('nestjs-endpoints:late-child'),
    inject: [ModulesContainer],
    useFactory: (modules: ModulesContainer) => {
      if (hasModule(modules, routerModule)) {
        throw new Error(
          `nestjs-endpoints: child() was called on the router of ${shown(file)} after an app ` +
            'had loaded it, and this app has both: each would make its own instance of ' +
            "that router's providers. Create the child before an app loads its parent, as a " +
            "router.ts in a folder under the parent's is.",
        );
      }
    },
  };
}

/** Whether an app has the module of the class `metatype`. */
export function hasModule(modules: ModulesContainer, metatype: Type | undefined): boolean {
  return modules.values().some((module) => module.metatype === metatype);
}
