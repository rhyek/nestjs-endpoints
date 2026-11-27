import { DynamicModule, Module } from '@nestjs/common';
import type { z } from 'zod';
import { topLevelProviders } from './app-root';
import type { ClientsOption } from './codegen/clients';
import { createLazily, EndpointRouter, EndpointRouterOptions, asRouter } from './endpoint-router';
import { getCallsiteFile } from './helpers';
import { hooksAreCalled } from './hook-scopes';
import type { InjectOnRequestMap, InjectProvidersMap } from './injections';
import type { MethodsMap } from './instance-members';

export interface NestjsEndpointsOptions<
  RouterInject extends InjectProvidersMap = undefined,
  RouterInjectOnRequest extends InjectOnRequestMap = undefined,
  RouterParams extends z.ZodObject | undefined = undefined,
  Inject extends InjectProvidersMap = undefined,
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
    Inject,
    Properties,
    Methods
  >;
  /**
   * Watches the app's endpoint folders, so that `node --watch` restarts the
   * app when an endpoint file is added or removed. `nest start --watch` does
   * that by itself. Off by default.
   */
  watch?: boolean;
  /**
   * The clients generated from the app's endpoints: a list, or a function
   * that returns one. `nestjs-endpoints generate` writes them, and so does
   * the app as it starts, unless `generateClientsOnStart` is off.
   */
  clients?: ClientsOption;
  /**
   * Whether the app writes its `clients` as it starts, each when what it is
   * generated from changed. Defaults to on when `NODE_ENV` is `development`
   * or unset. `clients` given as a function is not called when it is off.
   */
  generateClientsOnStart?: boolean;
}

/**
 * Sets nestjs-endpoints up for an app, once, in its root module.
 */
export class NestjsEndpoints {
  static forRoot<
    RouterInject extends InjectProvidersMap = undefined,
    RouterInjectOnRequest extends InjectOnRequestMap = undefined,
    RouterParams extends z.ZodObject | undefined = undefined,
    Inject extends InjectProvidersMap = undefined,
    Properties extends object = object,
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Methods extends MethodsMap = {},
  >(
    options: NestjsEndpointsOptions<
      RouterInject,
      RouterInjectOnRequest,
      RouterParams,
      Inject,
      Properties,
      Methods
    > = {},
  ): EndpointRouter<RouterInject, RouterInjectOnRequest, RouterParams> {
    const callsiteFile = getCallsiteFile();
    const root = {
      watch: options.watch ?? false,
      clients: options.clients,
      // `nest start` sets no NODE_ENV; Jest and Vitest set `test`, and a deployment most often
      // `production`: neither rewrites a client that is checked in.
      generateClientsOnStart:
        options.generateClientsOnStart ?? (process.env.NODE_ENV ?? 'development') === 'development',
    };
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
    return asRouter(Promise.resolve(module), { file: callsiteFile, context: {} });
  }
}
