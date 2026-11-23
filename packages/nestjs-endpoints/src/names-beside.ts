// A name beside a path parameter is a route's: every URL under the name is that route's
// side, and none is the parameter's. An endpoint does not take a name beside its parameter
// as a value of it, and a router's middleware skips the URLs of the names beside the
// parameters of its base path.

import { Logger, type Type } from '@nestjs/common';
import type { ApplicationConfig, HttpAdapterHost, ModulesContainer } from '@nestjs/core';
import { routesOf } from './route-paths';
import { trimSlashes, type UnbracedToken, urlTokens } from './url-params';

/** A segment of a URL: text alone; a parameter; text beside one; a wildcard. */
type Segment =
  | { kind: 'literal'; text: string }
  | { kind: 'param'; name: string }
  | { kind: 'mixed' | 'wildcard' };

/** A piece of a path, with each part that may be left out as a group of its own pieces. */
type Piece = UnbracedToken | { group: Piece[] };

function piecesOf(path: string): Piece[] {
  const groups: Piece[][] = [[]];
  for (const token of urlTokens(path)) {
    const into = groups.at(-1)!;
    if (!('brace' in token)) {
      into.push(token);
    } else if (token.brace === '{') {
      groups.push([]);
    } else if (groups.length > 1) {
      const group = groups.pop()!;
      groups.at(-1)!.push({ group });
    } else {
      into.push({ text: '}' });
    }
  }
  return groups[0]!;
}

/** Each list of pieces a path is, with each part that may be left out in it or not. */
function flattened(pieces: Piece[]): UnbracedToken[][] {
  return pieces.reduce<UnbracedToken[][]>(
    (variants, piece) =>
      'group' in piece
        ? variants.flatMap((before) => [
            before,
            ...flattened(piece.group).map((inner) => [...before, ...inner]),
          ])
        : variants.map((before) => [...before, piece]),
    [[]],
  );
}

/** The URLs a path matches, as lists of segments: one for each part it may leave out or not. */
function variantsOf(path: string): Segment[][] {
  return flattened(piecesOf(path)).map((pieces) => {
    const segments: UnbracedToken[][] = [[]];
    for (const piece of pieces) {
      if (!('text' in piece)) {
        segments.at(-1)!.push(piece);
        continue;
      }
      const [first, ...rest] = piece.text.split('/');
      if (first) {
        segments.at(-1)!.push({ text: first });
      }
      segments.push(...rest.map((text) => (text ? [{ text }] : [])));
    }
    return segments
      .filter((segment) => segment.length > 0)
      .map((segment): Segment => {
        const [only] = segment;
        if (segment.some((piece) => 'param' in piece && piece.wildcard)) {
          return { kind: 'wildcard' };
        }
        if (segment.every((piece) => 'text' in piece)) {
          return { kind: 'literal', text: segment.map((piece) => piece.text).join('') };
        }
        return segment.length === 1 && 'param' in only!
          ? { kind: 'param', name: only.param }
          : { kind: 'mixed' };
      });
  });
}

/**
 * Whether two segments read a URL alike: the same text, or a value. A route whose segment
 * has a name where the other's has a parameter is on its side of the URLs from there on.
 */
function alike(a: Segment, b: Segment): boolean {
  if (a.kind === 'literal' || b.kind === 'literal') {
    return (
      a.kind === 'literal' && b.kind === 'literal' && a.text.toLowerCase() === b.text.toLowerCase()
    );
  }
  return a.kind !== 'wildcard' && b.kind !== 'wildcard';
}

/** The names that `others` have at `at`, where `segments` has a parameter, alike above it. */
function namesAt(segments: Segment[], at: number, others: Segment[][]): string[] {
  return others.flatMap((other) => {
    const there = other[at];
    return there?.kind === 'literal' &&
      segments.slice(0, at).every((segment, i) => alike(segment, other[i]!))
      ? [there.text]
      : [];
  });
}

/**
 * The names beside each parameter of `paths`, in the routes of `others`: the values it does
 * not take. `/lanes/:id/view` beside `/lanes/list` and `/lanes/extra/list` does not take
 * `list` or `extra` as `id`.
 */
export function namesBeside(
  paths: readonly string[],
  others: readonly string[],
): Map<string, Set<string>> {
  const theirs = others.flatMap(variantsOf);
  const names = new Map<string, Set<string>>();
  for (const segments of paths.flatMap(variantsOf)) {
    segments.forEach((segment, at) => {
      if (segment.kind !== 'param') {
        return;
      }
      for (const name of namesAt(segments, at, theirs)) {
        names.set(segment.name, (names.get(segment.name) ?? new Set()).add(name));
      }
    });
  }
  return names;
}

/** Whether the router of an adapter reads URLs as of their case, as NestJS reads it. */
export function caseSensitiveOf(adapter: object): boolean {
  const matching = adapter as {
    getRouteMatchingOptions?: () => { caseSensitive?: boolean } | undefined;
  };
  return matching.getRouteMatchingOptions?.()?.caseSensitive ?? true;
}

/** The routes of an app: the paths of each of its controllers'. */
export type AppRoutes = ReadonlyMap<Type, readonly string[]>;

/** The routes of the app of `modules`. */
export function appRoutes(modules: ModulesContainer): AppRoutes {
  const controllers = [...modules.values()]
    .flatMap((module) => [...module.controllers.values()])
    .map(({ metatype }) => metatype as Type | null)
    .filter((cls): cls is Type => cls !== null);
  return new Map(controllers.map((cls) => [cls, routesOf(cls).map(({ path }) => path)]));
}

/** The paths of the routes of an app, but those of the controllers `leftOut` tells. */
export function routesBut(routes: AppRoutes, leftOut: (cls: Type) => boolean): string[] {
  return [...routes].flatMap(([cls, paths]) => (leftOut(cls) ? [] : paths));
}

/** The names beside each path parameter of an endpoint, in the other routes of the app. */
export function endpointNamesBeside(cls: Type, routes: AppRoutes) {
  return namesBeside(
    routes.get(cls) ?? [],
    routesBut(routes, (other) => other === cls),
  );
}

/** Where an app serves a router's pattern, and how its adapter's router reads case. */
export type Served = {
  /** The app's prefix for all of its URLs, as `/api`, or none. */
  prefix: string;
  /** The version paths of the router's routes, as `/v1`, or `` for none. */
  versionPaths: readonly string[];
  caseSensitive: boolean;
};

const regExpText = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * A test of whether the path of a request that a router's pattern takes in has, where the
 * router's base path has a parameter, a name beside it in `others`: the URL is the name's,
 * and the router's middleware does not run for it. None when no parameter has a name beside it.
 *
 * It costs a match of the path and a lookup for each parameter, however many names there are.
 */
export function namedRequest(
  basePath: string,
  others: readonly string[],
  { prefix, versionPaths, caseSensitive }: Served,
): ((path: string) => boolean) | undefined {
  const [segments] = variantsOf(trimSlashes(basePath));
  if (!segments) {
    return undefined;
  }
  const read = (value: string) => (caseSensitive ? value : value.toLowerCase());
  const theirs = others.flatMap(variantsOf);
  // The names beside each parameter, by the group of the expression that reads it.
  const names = new Map<number, Set<string>>();
  let group = 0;
  const pattern = segments
    .map((segment, at) => {
      if (segment.kind === 'literal') {
        return regExpText(segment.text);
      }
      if (segment.kind !== 'param') {
        return '[^/]+';
      }
      group++;
      const found = namesAt(segments, at, theirs);
      if (found.length > 0) {
        names.set(group, new Set(found.map(read)));
      }
      return '([^/]+)';
    })
    .join('/');
  if (names.size === 0) {
    return undefined;
  }
  // The longest version path first: `/v1` before none.
  const versions = versionPaths.length
    ? `(?:${versionPaths
        .toSorted((a, b) => b.length - a.length)
        .map(regExpText)
        .join('|')})`
    : '';
  const expression = new RegExp(
    `^${prefix ? `(?:${regExpText(prefix)})?` : ''}${versions}/${pattern}(?:/|$)`,
    caseSensitive ? '' : 'i',
  );
  return (path) => {
    const matched = expression.exec(path);
    if (!matched) {
      return false;
    }
    for (const [at, values] of names) {
      let value = matched[at]!;
      try {
        value = decodeURIComponent(value);
      } catch {
        // A value that does not decode is no name.
      }
      if (values.has(read(value))) {
        return true;
      }
    }
    return false;
  };
}

/** The apps warned of the order their routes are registered in. */
const warnedOfRouteOrder = new WeakSet<ApplicationConfig>();

/**
 * Warns an app whose adapter answers a URL with the first route registered that matches it,
 * as Express does, where a path parameter has names beside it: a URL of a name may then be
 * the parameter's, which refuses it. NestJS registers names first when it is told to.
 */
export function warnOfRouteOrder(
  routes: AppRoutes,
  config: ApplicationConfig,
  adapter: HttpAdapterHost['httpAdapter'] | undefined,
): void {
  if (warnedOfRouteOrder.has(config)) {
    return;
  }
  warnedOfRouteOrder.add(config);
  const orderSensitive =
    (adapter as { isRouteOrderSensitive?: () => boolean } | undefined)?.isRouteOrderSensitive?.() ??
    true;
  if (!orderSensitive || config.getRouteResolutionStrategy() === 'specificity') {
    return;
  }
  const named = [...routes]
    .filter(([cls]) => Reflect.hasMetadata('endpoints:path', cls))
    .filter(([cls]) => endpointNamesBeside(cls, routes).size > 0)
    .flatMap(([, paths]) => paths.map((path) => `/${path}`));
  if (named.length === 0) {
    return;
  }
  new Logger('NestjsEndpoints').warn(
    `nestjs-endpoints: ${named.join(', ')} ${named.length > 1 ? 'have' : 'has a'} path ` +
      `parameter${named.length > 1 ? 's' : ''} beside routes with a name there. Every URL ` +
      "under a name is the name's route's, but this app's HTTP adapter answers a URL with the " +
      'first route registered that matches it, which may be one with the parameter: that one ' +
      "then refuses it. Set `routeResolutionStrategy: 'specificity'` in the options the app " +
      'is created with: NestJS then registers names before parameters.',
  );
}
