import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { VenuesService } from '../../venues.service';

/** A guard of the tables router, made with a provider of the router two levels up. */
@Injectable()
export class TablesGuard implements CanActivate {
  constructor(private readonly venues: VenuesService) {}

  canActivate(context: ExecutionContext): boolean {
    const { headers } = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
    }>();
    return this.venues.admits(headers['x-party']);
  }
}
