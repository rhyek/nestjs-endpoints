import { Injectable } from '@nestjs/common';

@Injectable()
export class VenuesService {
  readonly scope = 'venue';

  /** The routers whose lifecycle hooks have run, in the order they did. */
  readonly opened: string[] = [];

  names() {
    return ['arena', 'hall'];
  }

  nameOf(venueId: string) {
    return `venue ${venueId.slice(0, 8)}`;
  }

  admits(party: string | undefined) {
    return party !== 'banned';
  }
}
