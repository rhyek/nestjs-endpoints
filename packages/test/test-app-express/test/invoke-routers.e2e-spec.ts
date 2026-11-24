import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderLog, OrderModule } from '../src/company/order';
import list from '../src/company/resources/clients/list.endpoint';
import clientsRouter from '../src/company/resources/clients/router';

// The clients router is the grandchild of the company router, by two `child()`s. Only the
// company router imports `OrderModule`, and injects its `OrderLog` into every endpoint under it.
describe('invoke() on an endpoint of a grandchild router', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(metadata: Parameters<typeof Test.createTestingModule>[0]) {
    const moduleRef = await Test.createTestingModule(metadata).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  test('with only the router imported, gets what the routers above it provide, and runs none of their guards, interceptors or middleware', async () => {
    const app = await start({ imports: [clientsRouter] });
    const log = app.get(OrderLog).entries;
    log.length = 0;
    await expect(app.get(list).invoke()).resolves.toEqual(['acme']);
    expect(log).toEqual(['clients handler']);
  });

  test('alone, as a controller, gets what the routers above it provide once the test provides it', async () => {
    const app = await start({ controllers: [list], imports: [OrderModule] });
    await expect(app.get(list).invoke()).resolves.toEqual(['acme']);
  });

  test('alone, as a controller, does not start without what the routers above it provide', async () => {
    await expect(start({ controllers: [list] })).rejects.toThrow(/OrderLog/);
  });
});
