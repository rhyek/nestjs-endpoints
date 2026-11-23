import { z } from 'zod';
import type { InjectOnRequestMap, InjectProvidersMap } from './injections';

/**
 * What a router gives every endpoint built with its `endpoint`: its own, over
 * what the router it is a child of gives.
 */
export type RouterContext = {
  inject?: InjectProvidersMap;
  injectOnRequest?: InjectOnRequestMap;
  /** Path parameters, of the endpoint's URL or of a folder above it. */
  params?: z.ZodObject;
};

type Injections = Pick<RouterContext, 'inject' | 'injectOnRequest'>;

// A key `Map` may not declare is typed as a message naming it, so the error
// reads as the cause. `NoInfer` keeps the maps inferred from what they
// declare, not from the message.
export type WithoutKeys<Map, Keys, Reason extends string> = Map & {
  [K in keyof NoInfer<Map> & NoInfer<Keys>]: `\`${K & string}\` ${Reason}`;
};

/**
 * `Outer` with `Inner` over it. The two injection maps name the handler's
 * parameters together, so a key the inner level declares in either map
 * (`Inner` or `InnerOther`) leaves `Outer`.
 */
export type Overriding<Outer, Inner, InnerOther = undefined> = Outer extends undefined
  ? Inner
  : [Inner, InnerOther] extends [undefined, undefined]
    ? Outer
    : {
        [
          K in Exclude<keyof Outer, KeysOf<Inner> | KeysOf<InnerOther>> | KeysOf<Inner>
        ]: K extends KeysOf<Inner> ? Inner[K] : Outer[K & keyof Outer];
      };

type KeysOf<M> = M extends undefined ? never : keyof M;

/**
 * The injections of `inner` over those of `outer`: a key `inner` declares in
 * either map leaves both of `outer`'s.
 */
export function mergeInjections(
  outer: Injections,
  inner: Injections,
): { inject: NonNullable<InjectProvidersMap>; injectOnRequest: NonNullable<InjectOnRequestMap> } {
  const declared = new Set(Object.keys({ ...inner.inject, ...inner.injectOnRequest }));
  const kept = <V>(map: Record<string, V> | undefined) =>
    Object.fromEntries(Object.entries(map ?? {}).filter(([key]) => !declared.has(key)));
  return {
    inject: { ...kept(outer.inject), ...inner.inject },
    injectOnRequest: { ...kept(outer.injectOnRequest), ...inner.injectOnRequest },
  };
}

/** One level may not declare a key in both maps: the handler has one parameter of that name. */
export function assertOneMapPerKey(level: Injections, at: string, under = ''): void {
  const inBoth = Object.keys(level.inject ?? {}).find((key) =>
    Object.hasOwn(level.injectOnRequest ?? {}, key),
  );
  if (inBoth) {
    throw new Error(
      `${at}: \`${inBoth}\` is in both \`${under}inject\` and \`${under}injectOnRequest\`.`,
    );
  }
}

/**
 * The `params` of an endpoint (`Inner`) over its router's (`Outer`): one object schema, the
 * endpoint's own with the router's keys it does not declare.
 */
export type MergedParams<Outer, Inner> =
  Outer extends z.ZodObject<infer OuterShape>
    ? Inner extends undefined
      ? Outer
      : Inner extends z.ZodObject<infer InnerShape, infer InnerConfig>
        ? z.ZodObject<
            {
              [K in keyof OuterShape | keyof InnerShape]: K extends keyof InnerShape
                ? InnerShape[K]
                : OuterShape[K & keyof OuterShape];
            },
            InnerConfig
          >
        : never
    : Inner;

/** A `params` its router's can merge with, or the reason it cannot. */
export type MergeableParams<Params, RouterParams> = RouterParams extends undefined
  ? unknown
  : NonNullable<Params> extends z.ZodObject
    ? unknown
    : "`params` must be a plain z.object() to merge with its router's params";

/**
 * `params` that merge with another level's are a plain object schema: only
 * one can take the other's keys. `why` ends the message, for an endpoint.
 */
export function assertPlainParams(params: unknown, at: string, why = '', option = 'params'): void {
  if (params !== undefined && !(params instanceof z.ZodObject)) {
    throw new Error(`${at}: \`${option}\` must be a plain z.object()${why}.`);
  }
}

/**
 * The params of `inner` over those of `outer`: the inner schema, extended
 * with the outer keys it does not declare. What the inner schema says of the
 * whole object (strictness, a catchall, refinements) stays; what the outer
 * one says does not.
 */
export function mergeParams(
  outer: z.ZodObject | undefined,
  inner: z.ZodObject | undefined,
): z.ZodObject | undefined {
  if (!outer || !inner) {
    return inner ?? outer;
  }
  const missing = Object.entries(outer.shape).filter(([key]) => !Object.hasOwn(inner.shape, key));
  // `safeExtend`, which keeps the refinements of an object that has them.
  return missing.length > 0 ? inner.safeExtend(Object.fromEntries(missing)) : inner;
}

/** The context of `inner` over that of `outer`: a router's over its parent's, an endpoint's over its router's. */
export function mergeContext(outer: RouterContext, inner: RouterContext): RouterContext {
  return { ...mergeInjections(outer, inner), params: mergeParams(outer.params, inner.params) };
}

/** Whether a router gives its endpoints nothing. */
export function isEmptyContext(context: RouterContext): boolean {
  return (
    !context.params && Object.keys({ ...context.inject, ...context.injectOnRequest }).length === 0
  );
}
