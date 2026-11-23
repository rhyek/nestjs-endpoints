import { Req } from '@nestjs/common';
import { z } from 'zod';
import { decorated } from './injections';
import {
  assertOneMapPerKey,
  assertPlainParams,
  mergeContext,
  mergeInjections,
  mergeParams,
} from './router-context';

class A {}
class B {}
class Service {}

describe('merging the injections of two levels', () => {
  test('keeps the outer keys the inner level does not declare', () => {
    expect(mergeInjections({ inject: { a: A, b: B } }, { inject: { a: Service } })).toEqual({
      inject: { b: B, a: Service },
      injectOnRequest: {},
    });
  });

  test("an inner injectOnRequest key replaces the outer level's inject key", () => {
    const user = decorated<string>(Req());
    expect(
      mergeInjections({ inject: { user: Service, a: A } }, { injectOnRequest: { user } }),
    ).toEqual({ inject: { a: A }, injectOnRequest: { user } });
  });

  test("an inner inject key replaces the outer level's injectOnRequest key", () => {
    const user = decorated<string>(Req());
    const tenant = decorated<string>(Req());
    expect(
      mergeInjections({ injectOnRequest: { user, tenant } }, { inject: { user: Service } }),
    ).toEqual({ inject: { user: Service }, injectOnRequest: { tenant } });
  });

  test('of two empty levels is two empty maps', () => {
    expect(mergeInjections({}, {})).toEqual({ inject: {}, injectOnRequest: {} });
  });
});

describe('a level that declares a key in both maps', () => {
  test('is refused, naming the key', () => {
    expect(() =>
      assertOneMapPerKey(
        { inject: { user: Service }, injectOnRequest: { user: decorated<string>(Req()) } },
        'here',
      ),
    ).toThrow('here: `user` is in both `inject` and `injectOnRequest`.');
  });

  test('is accepted when each key is in one', () => {
    expect(() =>
      assertOneMapPerKey(
        { inject: { a: A }, injectOnRequest: { user: decorated<string>(Req()) } },
        'here',
      ),
    ).not.toThrow();
  });
});

describe('merging the params of two levels', () => {
  const clinicId = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
  const outer = z.object({ clinicId: z.uuid() });

  test('extends the inner schema with the outer keys it lacks, keeping its strictness', () => {
    const merged = mergeParams(outer, z.strictObject({ visitId: z.coerce.number() }))!;
    expect(merged.parse({ clinicId, visitId: '7' })).toEqual({ clinicId, visitId: 7 });
    expect(merged.safeParse({ clinicId: 'no', visitId: '7' }).success).toBe(false);
    expect(merged.safeParse({ clinicId, visitId: '7', extra: 1 }).success).toBe(false);
  });

  test("an inner key replaces the outer level's", () => {
    const merged = mergeParams(outer, z.object({ clinicId: z.coerce.number() }))!;
    expect(merged.parse({ clinicId: '12' })).toEqual({ clinicId: 12 });
  });

  test("keeps the inner schema's refinements", () => {
    const inner = z
      .object({ from: z.coerce.number(), to: z.coerce.number() })
      .refine((range) => range.from <= range.to);
    const merged = mergeParams(outer, inner)!;
    expect(merged.safeParse({ clinicId, from: '1', to: '2' }).success).toBe(true);
    expect(merged.safeParse({ clinicId, from: '3', to: '2' }).success).toBe(false);
  });

  test('of one level alone is that level, the same schema', () => {
    expect(mergeParams(outer, undefined)).toBe(outer);
    expect(mergeParams(undefined, outer)).toBe(outer);
    expect(mergeParams(undefined, undefined)).toBeUndefined();
  });

  test('is the inner schema itself when it declares every outer key', () => {
    const inner = z.object({ clinicId: z.string() });
    expect(mergeParams(outer, inner)).toBe(inner);
  });
});

describe("a router's params", () => {
  test.each([
    ['a transformed object', z.object({}).transform((x) => x)],
    ['a preprocessed object', z.preprocess((x) => x, z.object({}))],
    ['a string', z.string()],
  ])('may not be %s', (_, params) => {
    expect(() => assertPlainParams(params, 'here')).toThrow(
      'here: `params` must be a plain z.object().',
    );
  });

  test.each([
    ['a strict object', z.strictObject({})],
    ['a refined object', z.object({}).refine(() => true)],
    ['left out', undefined],
  ])('may be %s', (_, params) => {
    expect(() => assertPlainParams(params, 'here')).not.toThrow();
  });
});

test('the context of a level over another merges both kinds, by the same rule', () => {
  const outer = { inject: { a: A }, params: z.object({ x: z.string() }) };
  const inner = { inject: { b: B }, params: z.object({ y: z.string() }) };
  const merged = mergeContext(outer, inner);
  expect(merged.inject).toEqual({ a: A, b: B });
  expect(Object.keys(merged.params!.shape).sort()).toEqual(['x', 'y']);
});
