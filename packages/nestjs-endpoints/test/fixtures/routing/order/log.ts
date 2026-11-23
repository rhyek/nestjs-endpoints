import type { CallHandler, CanActivate, NestInterceptor, Type } from '@nestjs/common';

/** What the routers of this tree, and their endpoints, did, in the order they did it. */
export const log: string[] = [];

/** The two lifecycle hooks that tell a start from a stop, noted under `name`. */
export const hooks = (name: string) => ({
  onModuleInit() {
    log.push(`${name} init`);
  },
  onModuleDestroy() {
    log.push(`${name} destroy`);
  },
});

const guard = (name: string): Type<CanActivate> => {
  class Guard implements CanActivate {
    canActivate() {
      return true;
    }
  }
  Object.defineProperty(Guard, 'name', { value: `${name}Guard` });
  return Guard;
};

const interceptor = (name: string): Type<NestInterceptor> => {
  class Interceptor implements NestInterceptor {
    intercept(_context: unknown, next: CallHandler) {
      return next.handle();
    }
  }
  Object.defineProperty(Interceptor, 'name', { value: `${name}Interceptor` });
  return Interceptor;
};

export const RootGuard = guard('Root');
export const OuterGuard = guard('Outer');
export const InnerGuard = guard('Inner');
export const KidGuard = guard('Kid');
export const MethodGuard = guard('Method');
export const OuterInterceptor = interceptor('Outer');
export const KidInterceptor = interceptor('Kid');
