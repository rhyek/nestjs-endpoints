import { z } from 'nestjs-endpoints';
import router from './router';

// An endpoint with properties, methods and a lifecycle hook, as a controller
// has. Its handler is written as a method, so `this` has them, and what its
// router injects.
export default router.endpoint.mutation({
  input: z.object({ name: z.string() }),
  output: z.object({
    name: z.string(),
    visits: z.number(),
    known: z.boolean(),
    ready: z.boolean(),
    opened: z.array(z.string()),
  }),
  properties: () => ({
    visits: new Map<string, number>(),
    ready: false,
    // A getter stays one: read from the instance, with its methods.
    get busiest() {
      return [...this.visits.keys()].sort((a, b) => this.countOf(b) - this.countOf(a))[0];
    },
  }),
  methods: {
    count(name: string) {
      const visits = (this.visits.get(name) ?? 0) + 1;
      this.visits.set(name, visits);
      return visits;
    },
    countOf(name: string) {
      return this.visits.get(name) ?? 0;
    },
    knows(name: string) {
      return this.venues.names().includes(name);
    },
  },
  onModuleInit() {
    this.ready = true;
  },
  handler({ input: { name } }) {
    return {
      name,
      visits: this.count(name),
      known: this.knows(name),
      ready: this.ready,
      opened: this.venues.opened,
    };
  },
});
