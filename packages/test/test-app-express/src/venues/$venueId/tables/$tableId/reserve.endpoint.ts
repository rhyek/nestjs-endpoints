import { z } from 'nestjs-endpoints';
import router from '../router';
import { SeatingNotifier } from '../seating';

// An endpoint of a grandchild router with properties, methods and a lifecycle hook. It reads
// `venueId` and `tableId` from two routers, `this.venues` from the router two levels up, and
// injects a provider of a module its own router imports.
export default router.endpoint.mutation({
  inject: { seating: SeatingNotifier },
  input: z.object({ guest: z.string() }),
  output: z.object({
    venue: z.string(),
    tableId: z.number(),
    guests: z.array(z.string()),
    ready: z.boolean(),
  }),
  properties: () => ({
    guests: new Map<number, string[]>(),
    ready: false,
  }),
  methods: {
    seat(tableId: number, guest: string) {
      const guests = [...(this.guests.get(tableId) ?? []), guest];
      this.guests.set(tableId, guests);
      return guests;
    },
  },
  lifecycle: {
    onModuleInit() {
      this.ready = true;
    },
  },
  handler({ params, input }) {
    const guests = this.seat(params.tableId, input.guest);
    this.seating.notify(params.tableId, input.guest);
    return {
      venue: this.venues.nameOf(params.venueId),
      tableId: params.tableId,
      guests,
      ready: this.ready,
    };
  },
});
