import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { VenuesService } from '../venues.service';

/** A middleware of the `$venueId` router, made with a provider of the router above it. */
@Injectable()
export class VenueScopeMiddleware implements NestMiddleware {
  constructor(private readonly venues: VenuesService) {}

  use(_req: IncomingMessage, res: ServerResponse, next: () => void) {
    res.setHeader('x-venue-scope', this.venues.scope);
    next();
  }
}
