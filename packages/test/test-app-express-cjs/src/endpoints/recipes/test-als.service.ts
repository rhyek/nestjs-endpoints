import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TestAlsService {
  testAls = new AsyncLocalStorage<string>();

  run(cb: () => any) {
    return this.testAls.run(crypto.randomUUID(), cb);
  }

  getStore() {
    return this.testAls.getStore();
  }
}
