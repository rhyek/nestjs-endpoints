import { Module } from '@nestjs/common';
import { endpoint, z } from 'nestjs-endpoints';
import request from 'supertest';
import { appWith } from './app-with';

// What each kind of value a handler returns is sent as, on every adapter.
const results: Record<string, { handler: () => unknown; type: RegExp; text: string }> = {
  object: { handler: () => ({ a: 1 }), type: /^application\/json\b/, text: '{"a":1}' },
  array: { handler: () => [1, 2], type: /^application\/json\b/, text: '[1,2]' },
  null: { handler: () => null, type: /^application\/json\b/, text: 'null' },
  number: { handler: () => 42, type: /^application\/json\b/, text: '42' },
  boolean: { handler: () => true, type: /^application\/json\b/, text: 'true' },
  date: {
    handler: () => new Date(0),
    type: /^application\/json\b/,
    text: '"1970-01-01T00:00:00.000Z"',
  },
  string: { handler: () => 'hi', type: /^text\//, text: 'hi' },
  promise: { handler: async () => ({ a: 2 }), type: /^application\/json\b/, text: '{"a":2}' },
  // Not a native promise: unwrapped all the same.
  thenable: {
    // eslint-disable-next-line unicorn/no-thenable -- the case under test
    handler: () => ({ then: (resolve: (value: unknown) => void) => resolve({ a: 3 }) }),
    type: /^application\/json\b/,
    text: '{"a":3}',
  },
};

@Module({
  controllers: [
    ...Object.entries(results).map(([name, { handler }]) =>
      endpoint.query({ method: 'get', path: `results/${name}`, handler }),
    ),
    endpoint.query({
      method: 'get',
      path: 'results/thenable-output',
      output: z.object({ a: z.number() }),
      handler: () =>
        // eslint-disable-next-line unicorn/no-thenable -- the case under test
        ({ then: (resolve: (value: unknown) => void) => resolve({ a: 4, extra: true }) }) as any,
    }),
  ],
})
class ResultsModule {}

test('a handler result is sent as JSON unless it is a string', async () => {
  const { app } = await appWith([ResultsModule]);
  try {
    const req = request(app.getHttpServer());
    for (const [name, { type, text }] of Object.entries(results)) {
      const resp = await req.get(`/results/${name}`).expect(200).expect('Content-Type', type);
      expect(resp.text, name).toBe(text);
    }
    // The output schema parses what a thenable resolves to.
    const resp = await req.get('/results/thenable-output').expect(200);
    expect(resp.text).toBe('{"a":4}');
  } finally {
    await app.close();
  }
});
