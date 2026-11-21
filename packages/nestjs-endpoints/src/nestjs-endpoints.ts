import { DynamicModule, Module } from '@nestjs/common';
import { topLevelProviders } from './app-root';
import { createRouterEndpoint, InjectOnRequestMap, InjectProvidersMap } from './endpoint-fn';
import { createLazily, EndpointRouter, EndpointRouterModuleParams } from './endpoint-router.module';
import { getCallsiteFile } from './helpers';

export interface NestjsEndpointsOptions<
  RouterInject extends InjectProvidersMap = undefined,
  RouterInjectOnRequest extends InjectOnRequestMap = undefined,
> {
  /**
   * The app's root router: what `EndpointRouterModule.create()` takes. Its
   * `rootDirectory` is relative to the file that calls `forRoot()`.
   */
  router?: EndpointRouterModuleParams<RouterInject, RouterInjectOnRequest>;
  /**
   * Watches the app's endpoint folders, so that `node --watch` restarts the
   * app when an endpoint file is added or removed. `nest start --watch` does
   * that by itself. Off by default.
   */
  watch?: boolean;
}

/**
 * Sets nestjs-endpoints up for an app, once, in its root module.
 */
export class NestjsEndpoints {
  static forRoot<
    RouterInject extends InjectProvidersMap = undefined,
    RouterInjectOnRequest extends InjectOnRequestMap = undefined,
  >(
    options: NestjsEndpointsOptions<RouterInject, RouterInjectOnRequest> = {},
  ): EndpointRouter<RouterInject, RouterInjectOnRequest> {
    const callsiteFile = getCallsiteFile();
    const root = { watch: options.watch ?? false };
    if (options.router) {
      return createLazily(callsiteFile, options.router, root);
    }
    // An app that describes no root router: a module that only carries the root options.
    class RootModule {}
    Module({})(RootModule);
    const module: DynamicModule = { module: RootModule, providers: topLevelProviders(root) };
    return Object.assign(Promise.resolve(module), {
      endpoint: createRouterEndpoint(callsiteFile, undefined, undefined),
    });
  }
}
