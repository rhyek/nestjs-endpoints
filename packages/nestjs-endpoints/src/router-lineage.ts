// A router's guards and interceptors, and those of the routers above it by `child()`: what it
// applies to its endpoints, the outermost router's first.

import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  type Provider,
  Scope,
  type Type,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  SCOPE_OPTIONS_METADATA,
} from '@nestjs/common/constants';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { REQUEST_CONTEXT_ID } from '@nestjs/core/router/request/request-constants';
import { NamesBesideGuard } from './names-beside.guard';

export type Guard = Type<CanActivate> | CanActivate;

export type Interceptor = Type<NestInterceptor> | NestInterceptor;

/**
 * The guards and interceptors of a router and of those above it, the outermost first: what a
 * router applies to its endpoints, and the routers made with its `child()` apply to theirs.
 */
export type Lineage = { guards: Guard[]; interceptors: Interceptor[] };

export const NO_LINEAGE: Lineage = { guards: [], interceptors: [] };

/**
 * The lineage of a router: its parent's, then its own guards and interceptors. And the
 * providers that make its own, which go where its providers are: each is one instance, for
 * every endpoint under it.
 */
export function lineageOf(
  parent: Lineage,
  own: Partial<Lineage> | undefined,
): { lineage: Lineage; providers: Provider[] } {
  const providers: Provider[] = [];
  const shared = <T extends Guard | Interceptor>(listed: T[] | undefined, method: Method) =>
    (listed ?? []).map((item) => {
      // An instance is one already; NestJS makes a transient class for each that uses it.
      if (typeof item !== 'function' || isTransient(item)) {
        return item;
      }
      const token = Symbol(item.name);
      providers.push({ provide: token, useClass: item });
      return forwarding(item, token, method) as T;
    });
  return {
    lineage: {
      guards: [...parent.guards, ...shared(own?.guards, 'canActivate')],
      interceptors: [...parent.interceptors, ...shared(own?.interceptors, 'intercept')],
    },
    providers,
  };
}

type Method = 'canActivate' | 'intercept';

type Target = Record<Method, (...args: unknown[]) => unknown>;

function isTransient(cls: Type): boolean {
  const options = Reflect.getMetadata(SCOPE_OPTIONS_METADATA, cls) as { scope?: Scope } | undefined;
  return options?.scope === Scope.TRANSIENT;
}

/**
 * A guard or interceptor that calls the instance of `cls` that `token` provides: NestJS makes
 * one in each module with endpoints of a router, and they call that router's one instance. An
 * app makes that one for each request where what it injects is, and makes it with the
 * request's.
 */
function forwarding(cls: Type, token: symbol, method: Method): Type {
  @Injectable()
  class Forwarding {
    /** The instance, once read; none where there is one for each request. */
    private target?: Target;
    private perRequest = false;

    constructor(@Inject(ModuleRef) private readonly moduleRef: ModuleRef) {}

    forward(context: ExecutionContext, ...rest: unknown[]): unknown {
      if (!this.target && !this.perRequest) {
        if (this.moduleRef.introspect(token).scope === Scope.DEFAULT) {
          this.target = this.moduleRef.get(token, { strict: false });
        } else {
          this.perRequest = true;
        }
      }
      if (this.target) {
        return this.target[method](context, ...rest);
      }
      return this.moduleRef
        .resolve<Target>(token, contextIdOf(this.moduleRef, context), { strict: false })
        .then((target) => target[method](context, ...rest));
    }
  }
  Object.defineProperty(Forwarding.prototype, method, {
    value(this: Forwarding, context: ExecutionContext, ...rest: unknown[]) {
      return this.forward(context, ...rest);
    },
  });
  Object.defineProperty(Forwarding, 'name', { value: cls.name });
  return Forwarding;
}

/** The context NestJS makes a request's instances in: the request's own, as NestJS gives it one. */
function contextIdOf(moduleRef: ModuleRef, context: ExecutionContext) {
  const request = context.getArgByIndex<Record<symbol, unknown>>(0);
  const contextId = ContextIdFactory.getByRequest(request);
  if (typeof request === 'object' && request !== null && !request[REQUEST_CONTEXT_ID]) {
    Object.defineProperty(request, REQUEST_CONTEXT_ID, { value: contextId });
    moduleRef.registerRequestByContextId(request, contextId);
  }
  return contextId;
}

/** Puts a lineage's guards and interceptors before those `endpoint` has. */
export function applyLineage(endpoint: Type, lineage: Lineage): void {
  prependClassMetadata(endpoint, GUARDS_METADATA, lineage.guards, UseGuards);
  prependClassMetadata(endpoint, INTERCEPTORS_METADATA, lineage.interceptors, UseInterceptors);
}

/**
 * Puts `items` before what `cls` has under the class metadata `key`, through the NestJS
 * decorator that sets it: a router's guards and interceptors run before those of the
 * routers under it.
 */
function prependClassMetadata<T>(
  cls: Type,
  key: string,
  items: T[],
  decorator: (...items: T[]) => ClassDecorator,
): void {
  if (items.length === 0) {
    return;
  }
  const existing = (Reflect.getMetadata(key, cls) as unknown[] | undefined) ?? [];
  // The guard that refuses a name beside a path parameter stays first: a URL it refuses is
  // one no route answers.
  const first = existing.filter((item) => item === NamesBesideGuard);
  const rest = existing.filter((item) => item !== NamesBesideGuard);
  Reflect.deleteMetadata(key, cls);
  decorator(...items)(cls);
  Reflect.defineMetadata(
    key,
    [...first, ...(Reflect.getMetadata(key, cls) as unknown[]), ...rest],
    cls,
  );
}
