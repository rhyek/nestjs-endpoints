import {
  CallHandler,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

/** A request, with what the guards and interceptors it passed noted on it, in order. */
export type Checked = { checks?: string[] };

const note = (context: ExecutionContext, what: string) =>
  (context.switchToHttp().getRequest<Checked>().checks ??= []).push(what);

/** What a router of the tree provides, which says which router it is. */
export class Badge {
  constructor(readonly router: string) {}
}

/** A `Badge` of the router `router`, for its `providers`. */
export const badge = (router: string) => ({ provide: Badge, useValue: new Badge(router) });

/** Every instance of the classes below has a number of its own. */
let made = 0;

/** A provider with a number for each instance. */
@Injectable()
export class Ledger {
  readonly id = ++made;
}

/** Notes its instance, and the badge of the router it was made with. */
@Injectable()
export class CheckGuard implements CanActivate {
  readonly id = ++made;

  constructor(@Inject(Badge) private readonly badge: Badge) {}

  canActivate(context: ExecutionContext) {
    note(context, `guard ${this.id} of ${this.badge.router}`);
    return true;
  }
}

/** Notes its instance, and the badge of the router it was made with. */
@Injectable()
export class CheckInterceptor implements NestInterceptor {
  readonly id = ++made;

  constructor(@Inject(Badge) private readonly badge: Badge) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    note(context, `interceptor ${this.id} of ${this.badge.router}`);
    return next.handle();
  }
}

/** Made for each request, as what it injects is: notes that it ran for this one. */
@Injectable()
export class RequestGuard implements CanActivate {
  readonly id = ++made;

  constructor(@Inject(REQUEST) private readonly request: Checked) {}

  canActivate(context: ExecutionContext) {
    const mine = context.switchToHttp().getRequest<Checked>() === this.request;
    note(context, `request guard ${mine ? 'of this request' : 'of another request'}`);
    return true;
  }
}
