import { DynamicModule, Module } from '@nestjs/common';
import type { z } from 'zod';
import { topLevelProviders } from './app-root';
import {
  createLazily,
  EndpointRouter,
  EndpointRouterOptions,
  routerMembers,
} from './endpoint-router';
import { getCallsiteFile } from './helpers';
import { hooksAreCalled } from './hook-scopes';
import type { InjectOnRequestMap, InjectProvidersMap } from './injections';
import type { MethodsMap } from './instance-members';

export interface NestjsEndpointsOptions<
  RouterInject extends InjectProvidersMap = undefined,
  RouterInjectOnRequest extends InjectOnRequestMap = undefined,
  RouterParams extends z.ZodObject | undefined = undefined,
  Properties = object,
  // As `forRoot()` has them when the router declares none.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  Methods = {},
> {
  /**
   * The app's root router: what `EndpointRouter.create()` takes. Its
   * `rootDirectory` is relative to the file that calls `forRoot()`.
   */
  router?: EndpointRouterOptions<
    RouterInject,
    RouterInjectOnRequest,
    RouterParams,
    undefined,
    Properties,
    Methods
  >;
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
    RouterParams extends z.ZodObject | undefined = undefined,
    Properties extends object = object,
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Methods extends MethodsMap = {},
  >(
    options: NestjsEndpointsOptions<
      RouterInject,
      RouterInjectOnRequest,
      RouterParams,
      Properties,
      Methods
    > = {},
  ): EndpointRouter<RouterInject, RouterInjectOnRequest, RouterParams> {
    const callsiteFile = getCallsiteFile();
    const root = { watch: options.watch ?? false };
    if (options.router) {
      return createLazily(callsiteFile, options.router, root);
    }
    // An app that describes no root router: a module that only carries the root options.
    class RootModule {}
    Module({})(RootModule);
    const module: DynamicModule = {
      module: RootModule,
      providers: [...topLevelProviders(root), hooksAreCalled],
    };
    return Object.assign(
      Promise.resolve(module),
      routerMembers({ file: callsiteFile, context: {} }),
    );
  }
}
