import type { Provider, Type } from '@nestjs/common';
import { DiscoveryService, ModulesContainer } from '@nestjs/core';
import { sharedState } from './shared-state';

/** The lifecycle hooks a class declares, and what names it in an error. */
export type DeclaredHooks = { hooks: readonly string[]; by: string };

const { DeclaresHooks } = sharedState;

/**
 * Notes on the class of an endpoint or of a router's module the lifecycle hooks it
 * declares. `by` names it in an error: "the endpoint of <file>".
 */
export function declaresHooks(cls: Type, hooks: readonly string[], by: string): void {
  if (hooks.length > 0) {
    DeclaresHooks({ hooks, by })(cls);
  }
}

/**
 * NestJS calls lifecycle hooks only on what it makes once. An endpoint or a router's module
 * it makes for each request, because it or an enhancer of it depends on a request-scoped
 * provider, would never have a hook it declares run, with nothing to say so. This fails in
 * its place, for every such class of the app, or for `only`.
 */
export function assertHooksAreCalled(modules: ModulesContainer, only?: Type): void {
  const discovery = new DiscoveryService(modules);
  const marked = { metadataKey: DeclaresHooks.KEY };
  // A router's module is a provider of itself, and an endpoint is a controller.
  for (const wrapper of [...discovery.getProviders(marked), ...discovery.getControllers(marked)]) {
    if (only && wrapper.metatype !== only) {
      continue;
    }
    const declared = discovery.getMetadataByDecorator(DeclaresHooks, wrapper);
    // What NestJS itself asks before it calls a hook.
    if (declared && !wrapper.isDependencyTreeStatic()) {
      const hooks = new Intl.ListFormat('en').format(declared.hooks);
      throw new Error(
        `nestjs-endpoints: ${declared.by} declares ${hooks}, but NestJS makes it for each ` +
          'request, and calls lifecycle hooks only on what it makes once. It is made for ' +
          'each request because it, or a guard, interceptor, pipe or filter that applies ' +
          'to it, depends on a request-scoped provider. Do what the hooks do in a ' +
          'provider that is not request-scoped.',
      );
    }
  }
}

/**
 * A provider of every router and of the app's root, which checks the whole app as it
 * initializes: by then NestJS knows what each instance depends on. An app with neither is
 * checked by each endpoint, when it is made.
 */
export const hooksAreCalled: Provider = {
  provide: Symbol('nestjs-endpoints:hooks-are-called'),
  inject: [ModulesContainer],
  useFactory: (modules: ModulesContainer) => ({
    onModuleInit: () => assertHooksAreCalled(modules),
  }),
};
