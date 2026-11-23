import {
  CallHandler,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Module,
  NestInterceptor,
  NestMiddleware,
} from '@nestjs/common';
import { tap } from 'rxjs';

/** What the routers of the company tree, and their endpoints, do, in the order they do it. */
@Injectable()
export class OrderLog {
  readonly entries: string[] = [];
}

/** Imported by the company router, and by the router of its tree that inherits nothing. */
@Module({ providers: [OrderLog], exports: [OrderLog] })
export class OrderModule {}

/**
 * A guard, an interceptor, a middleware and the five lifecycle hooks, for the router `name`:
 * each notes in the log what it did.
 */
export function recording(name: string) {
  const note = (log: OrderLog, what: string) => log.entries.push(`${name} ${what}`);

  @Injectable()
  class Guard implements CanActivate {
    constructor(@Inject(OrderLog) private readonly log: OrderLog) {}

    canActivate() {
      note(this.log, 'guard');
      return true;
    }
  }

  @Injectable()
  class Interceptor implements NestInterceptor {
    constructor(@Inject(OrderLog) private readonly log: OrderLog) {}

    intercept(_context: ExecutionContext, next: CallHandler) {
      note(this.log, 'interceptor before');
      return next.handle().pipe(tap(() => note(this.log, 'interceptor after')));
    }
  }

  @Injectable()
  class Middleware implements NestMiddleware {
    constructor(@Inject(OrderLog) private readonly log: OrderLog) {}

    // A property, not a method of the class: NestJS takes either.
    use = (_req: unknown, _res: unknown, next: () => void) => {
      note(this.log, 'middleware');
      next();
    };
  }

  type This = { log: OrderLog };
  return {
    guards: [Guard],
    interceptors: [Interceptor],
    middleware: [Middleware],
    lifecycle: {
      onModuleInit(this: This) {
        note(this.log, 'init');
      },
      onApplicationBootstrap(this: This) {
        note(this.log, 'bootstrap');
      },
      onModuleDestroy(this: This) {
        note(this.log, 'destroy');
      },
      beforeApplicationShutdown(this: This) {
        note(this.log, 'before shutdown');
      },
      onApplicationShutdown(this: This) {
        note(this.log, 'shutdown');
      },
    },
  };
}
