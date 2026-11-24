import { Access } from '../access';
import { Clock } from '../clock';

/** A provider of a child router that needs what its parent provides and imports. */
export class Visits {
  constructor(
    readonly access: Access,
    readonly clock: Clock,
  ) {}
}

export const visitsProvider = {
  provide: Visits,
  useFactory: (access: Access, clock: Clock) => new Visits(access, clock),
  inject: [Access, Clock],
};
