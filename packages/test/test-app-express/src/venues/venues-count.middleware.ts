import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, NestMiddleware } from '@nestjs/common';

/** A middleware of the venues router: it tells in a header how many times it ran. */
@Injectable()
export class VenuesCountMiddleware implements NestMiddleware {
  use(_req: IncomingMessage, res: ServerResponse, next: () => void) {
    res.setHeader('x-venues-runs', String(Number(res.getHeader('x-venues-runs') ?? 0) + 1));
    next();
  }
}
