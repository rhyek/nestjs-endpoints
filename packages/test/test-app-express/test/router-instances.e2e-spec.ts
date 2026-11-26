import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import checkpoints from '../src/checkpoints/router';
import { appWith } from './app-with';

// The checkpoints tree: `checkpoints` has providers, a guard, a guard made for each request
// and an interceptor; `gate`, made with its child(), provides a badge of its own; `inner`,
// made with that one's child(), lists the provider, the guard and the interceptor again;
// `leaf`, made with the child() of `checkpoints`, lists the guard and the interceptor again
// and has no router under it; `annex` is made with create().
describe('the providers, guards and interceptors of a router', () => {
  let app: INestApplication;
  beforeAll(async () => {
    ({ app } = await appWith([checkpoints]));
  });
  afterAll(async () => {
    await app?.close();
  });

  type Seen = { ledger?: number; checks: string[] };
  const seen = async (path: string) =>
    (await request(app.getHttpServer()).post(path).expect(200)).body as Seen;
  const top = () => seen('/checkpoints/seen');
  const gate = () => seen('/checkpoints/gate/seen');
  const inner = () => seen('/checkpoints/gate/inner/seen');
  const annex = () => seen('/checkpoints/annex/seen');
  const own = () => seen('/checkpoints/gate/own');
  const leaf = () => seen('/checkpoints/leaf/own');
  const guards = ({ checks }: Seen) => checks.filter((check) => check.startsWith('guard '));
  const interceptors = ({ checks }: Seen) =>
    checks.filter((check) => check.startsWith('interceptor '));

  describe('are one instance for every endpoint under it', () => {
    test('a provider', async () => {
      const { ledger } = await top();
      expect(ledger).toEqual(expect.any(Number));
      expect((await gate()).ledger).toBe(ledger);
    });

    test('a guard, made with what its router provides', async () => {
      const own = guards(await top());
      expect(own).toEqual([expect.stringMatching(/^guard \d+ of checkpoints$/)]);
      expect(guards(await gate())).toEqual(own);
      expect(guards(await annex())).toEqual(own);
    });

    test('an interceptor, made with what its router provides', async () => {
      const own = interceptors(await top());
      expect(own).toEqual([expect.stringMatching(/^interceptor \d+ of checkpoints$/)]);
      expect(interceptors(await gate())).toEqual(own);
      expect(interceptors(await annex())).toEqual(own);
    });

    test('a guard made for each request, for that request', async () => {
      for (const path of [top, gate, inner, annex]) {
        expect((await path()).checks).toContain('request guard of this request');
      }
    });
  });

  describe('listed again by a router or an endpoint under it, are an instance of their own', () => {
    test('a provider, by a child router', async () => {
      const { ledger } = await top();
      const own = (await inner()).ledger;
      expect(own).toEqual(expect.any(Number));
      expect(own).not.toBe(ledger);
    });

    test('a guard, by a child router, made with what it provides, which runs after the one above', async () => {
      const [above] = guards(await top());
      expect(guards(await inner())).toEqual([above, expect.stringMatching(/^guard \d+ of gate$/)]);
    });

    test('an interceptor, by a child router, made with what it provides, inside the one above', async () => {
      const [above] = interceptors(await top());
      expect(interceptors(await inner())).toEqual([
        above,
        expect.stringMatching(/^interceptor \d+ of gate$/),
      ]);
    });

    test('a guard and an interceptor, by an endpoint, made with what its router provides', async () => {
      const seenTop = await top();
      const seenOwn = await own();
      expect(guards(seenOwn)).toEqual([
        ...guards(seenTop),
        expect.stringMatching(/^guard \d+ of gate$/),
      ]);
      expect(interceptors(seenOwn)).toEqual([
        ...interceptors(seenTop),
        expect.stringMatching(/^interceptor \d+ of gate$/),
      ]);
    });

    test('a guard and an interceptor, by an endpoint of a router with no router under it that lists them too', async () => {
      const [above] = guards(await top());
      const seenLeaf = await leaf();
      const [, router, endpoint] = guards(seenLeaf);
      expect(guards(seenLeaf)).toEqual([
        above,
        expect.stringMatching(/^guard \d+ of leaf$/),
        expect.stringMatching(/^guard \d+ of leaf$/),
      ]);
      expect(endpoint).not.toBe(router);
      const [, routerInterceptor, endpointInterceptor] = interceptors(seenLeaf);
      expect(routerInterceptor).toMatch(/^interceptor \d+ of leaf$/);
      expect(endpointInterceptor).toMatch(/^interceptor \d+ of leaf$/);
      expect(endpointInterceptor).not.toBe(routerInterceptor);
    });
  });
});
