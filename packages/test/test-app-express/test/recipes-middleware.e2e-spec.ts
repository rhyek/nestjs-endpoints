import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from './create-app';

describe('recipes middleware + interceptor', () => {
  let logs: string[] = [];
  let consoleLogSpy: ReturnType<typeof vitest.spyOn>;

  beforeEach(() => {
    logs = [];
    consoleLogSpy = vitest
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        logs.push(args.map((a) => String(a)).join(' '));
      });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  async function bootstrap() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const { app } = await createApp(moduleFixture);
    app.useLogger(false);
    return { app, req: request(app.getHttpServer()) };
  }

  function relevantRecipesLogs() {
    return logs.filter((l) => l.includes('Recipes'));
  }

  test('logs fire in expected order for /recipes/create', async () => {
    const { app, req } = await bootstrap();
    try {
      await req
        .get('/recipes/create')
        .query({ name: 'Pizza' })
        .expect(200);
      // let res.on('finish') callbacks flush
      await new Promise((resolve) => setTimeout(resolve, 25));
      const entries = relevantRecipesLogs();
      expect(entries).toEqual([
        expect.stringMatching(/^RecipesMiddleware before, uuid = /),
        'Recipes functional middleware',
        expect.stringMatching(/^RecipesInterceptor before, uuid = /),
        expect.stringMatching(/^RecipesInterceptor after, uuid = /),
        expect.stringMatching(/^RecipesMiddleware after, uuid = /),
      ]);
      // middleware's `res.on('finish')` callback shares the same ALS
      // scope set up on the way in.
      const uuidOf = (s: string) => s.match(/uuid = (.+)$/)?.[1];
      expect(uuidOf(entries[0])).toBe(uuidOf(entries[4]));
      // interceptor's before and after log against the same uuid.
      expect(uuidOf(entries[2])).toBe(uuidOf(entries[3]));
      // interceptor's ALS scope is distinct from the middleware's scope.
      expect(uuidOf(entries[0])).not.toBe(uuidOf(entries[2]));
    } finally {
      await app.close();
    }
  });

  test('middleware excluded for /recipes/list; interceptor still runs', async () => {
    const { app, req } = await bootstrap();
    try {
      await req.get('/recipes/list').expect(200);
      await new Promise((resolve) => setTimeout(resolve, 25));
      const entries = relevantRecipesLogs();
      expect(entries).toEqual([
        expect.stringMatching(/^RecipesInterceptor before, uuid = /),
        expect.stringMatching(/^RecipesInterceptor after, uuid = /),
      ]);
    } finally {
      await app.close();
    }
  });
});
