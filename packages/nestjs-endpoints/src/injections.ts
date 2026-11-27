// The `inject` and `injectOnRequest` maps of an endpoint or a router.
import { Inject, Type } from '@nestjs/common';

class WithDecorator<_T> {
  constructor(public decorator: PropertyDecorator | ParameterDecorator) {}
}

export function decorated<T = any>(decorator: PropertyDecorator | ParameterDecorator) {
  return new WithDecorator<T>(decorator);
}

/**
 * A name a router's endpoints are given by the router that lists it in `routers`, typed as
 * `T`: it stands in an `expects` map where a token or a decorator stands in an injection map.
 */
export function given<T>(): WithDecorator<T> {
  return GIVEN as WithDecorator<T>;
}

// Never applied: what the name is, the router that lists this one says.
const GIVEN = new WithDecorator<unknown>(() => {});

export type InjectProvidersMap = Record<string, Type | WithDecorator<any>> | undefined;
export type InjectOnRequestMap = Record<string, WithDecorator<any>> | undefined;

/** What each key of an injection map gives. */
export type Injected<M> = M extends undefined
  ? object
  : {
      [K in keyof M]: M[K] extends WithDecorator<infer T>
        ? T
        : M[K] extends Type<infer T>
          ? T
          : never;
    };

/** Has NestJS set each key of `inject` on the instances of a class, given its prototype. */
export function injectInto(prototype: object, inject: InjectProvidersMap): void {
  for (const [key, token] of Object.entries(inject ?? {})) {
    if (token instanceof WithDecorator) {
      (token.decorator as PropertyDecorator)(prototype, key);
    } else {
      Inject(token)(prototype, key);
    }
  }
}
