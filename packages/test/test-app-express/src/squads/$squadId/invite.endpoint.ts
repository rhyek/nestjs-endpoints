import { recording } from '../../company/order';
import router from './router';

// Notes its own guard, its handler and each of its five lifecycle hooks.
export default router.endpoint.mutation({
  guards: recording('invite').guards,
  lifecycle: {
    onModuleInit() {
      this.log.entries.push('invite init');
    },
    onApplicationBootstrap() {
      this.log.entries.push('invite bootstrap');
    },
    onModuleDestroy() {
      this.log.entries.push('invite destroy');
    },
    beforeApplicationShutdown() {
      this.log.entries.push('invite before shutdown');
    },
    onApplicationShutdown() {
      this.log.entries.push('invite shutdown');
    },
  },
  handler() {
    this.log.entries.push('invite handler');
    return null;
  },
});
