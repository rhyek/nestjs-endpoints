import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * A middleware, as a function, that adds `name` to the `x-ran` header of the response: the
 * middleware that ran for a request, in the order they did.
 */
export const ran =
  (name: string) => (_req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const before = res.getHeader('x-ran');
    res.setHeader('x-ran', before ? `${String(before)},${name}` : name);
    next();
  };
