import type { NestMiddleware, Type } from '@nestjs/common';
import { isMiddlewareClass } from '@nestjs/core/middleware/utils';
import { type RouterMiddlewareEntry, skipping } from './router-middleware';

type Use = (request: unknown, response: unknown, next: () => void) => void;

/** Runs a middleware for `request` as NestJS would: a class it makes, a function it calls. */
function run(handler: RouterMiddlewareEntry, request: unknown) {
  const next = vi.fn();
  if (isMiddlewareClass(handler)) {
    new (handler as Type<NestMiddleware>)().use(request, 'response', next);
  } else {
    (handler as Use)(request, 'response', next);
  }
  return next;
}

describe("a router's middleware, where it skips the URLs of the names beside its parameters", () => {
  const ran = vi.fn();
  class WithMethod {
    use(...args: Parameters<Use>) {
      ran(...args);
    }
  }
  class WithField {
    readonly use: Use = (...args) => ran(...args);
  }
  // Not capitalised: NestJS calls it, whatever its prototype has.
  function plain(...args: Parameters<Use>) {
    ran(...args);
  }
  plain.prototype.use = () => {};

  beforeEach(() => ran.mockClear());

  test.each([
    ['a class with a `use` method', WithMethod],
    ['a class whose `use` is a field', WithField],
    ['a function', plain],
  ])(
    '%s stays one, as NestJS tells it, passes a URL of a name on, and runs for any other',
    (_, handler) => {
      const wrapped = skipping(handler, (request) => request === 'named');
      expect(isMiddlewareClass(wrapped)).toBe(isMiddlewareClass(handler));

      const next = run(wrapped, 'named');
      expect(next).toHaveBeenCalledOnce();
      expect(ran).not.toHaveBeenCalled();

      run(wrapped, 'other');
      expect(ran).toHaveBeenCalledExactlyOnceWith('other', 'response', expect.any(Function));
    },
  );

  test("keeps a class's `use` to the class NestJS makes of it to leave routes out of it", () => {
    // As NestJS's own, which runs the middleware only for a route it does not leave out.
    const Wrapped = skipping(WithMethod, () => false) as Type<NestMiddleware>;
    class LeavesOut extends Wrapped {
      override use(...[request, response, next]: Parameters<Use>) {
        return request === 'left out' ? next() : super.use(request, response, next);
      }
    }
    expect(run(LeavesOut, 'left out')).toHaveBeenCalledOnce();
    expect(ran).not.toHaveBeenCalled();
  });
});
