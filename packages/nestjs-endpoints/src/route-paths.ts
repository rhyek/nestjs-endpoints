// The routes a controller has, as NestJS reads its decorators, and the paths a router's
// middleware is registered for: its base path and every URL under it, under the versions its
// routes have.

import {
  RequestMethod,
  VERSION_NEUTRAL,
  VersioningType,
  type Type,
  type VersioningOptions,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import { trimSlashes } from './url-params';

type Version = string | typeof VERSION_NEUTRAL | (string | typeof VERSION_NEUTRAL)[];

/** A route an app serves: a pattern, without the app's prefix or version. */
export type Route = { path: string; method: RequestMethod; version?: Version };

const segmentsOf = (path: string) => path.split('/').filter(Boolean);

/**
 * The pattern of a router's base path and of every URL under it: `venues{/*path}` is
 * `/venues` and `/venues/…`. The wildcard is named, as path-to-regexp 8 has it.
 */
export function underPattern(basePath: string): string {
  const base = trimSlashes(basePath);
  return base ? `${base}{/*path}` : '{*path}';
}

/** `path`, given from a router's base path, as a whole path. The base path may be the root. */
export function underBase(basePath: string, path: string): string {
  return [trimSlashes(basePath), trimSlashes(path)].filter(Boolean).join('/');
}

/** Whether `basePath` is `above` or under it, segment by segment. */
export function isUnder(basePath: string, above: string): boolean {
  const [segments, over] = [segmentsOf(basePath), segmentsOf(above)];
  return over.every((segment, i) => segments[i] === segment);
}

/**
 * The versions an app serves a route without one under, as NestJS has them: with versions in
 * its URLs and a default version, that one and none.
 */
export function unversionedVersion(versioning: VersioningOptions | undefined): Version | undefined {
  if (versioning?.type !== VersioningType.URI || !versioning.defaultVersion) {
    return undefined;
  }
  return [
    VERSION_NEUTRAL,
    ...([versioning.defaultVersion].flat() as Exclude<Version, unknown[]>[]),
  ];
}

/**
 * The methods of a class's prototype chain, the nearest of each name, as NestJS's
 * `MetadataScanner` lists them: an accessor is none, and is not read.
 */
function methodsOf(prototype: object): object[] {
  const seen = new Set<string>();
  const methods: object[] = [];
  for (let proto = prototype; proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      const { value } = Object.getOwnPropertyDescriptor(proto, name)!;
      if (name !== 'constructor' && typeof value === 'function') {
        methods.push(value as object);
      }
    }
  }
  return methods;
}

/** The routes a controller has, as NestJS reads its decorators. */
export function routesOf(cls: Type): Route[] {
  const pathsOf = (target: object): string[] => {
    const paths =
      (Reflect.getMetadata(PATH_METADATA, target) as string | string[] | undefined) ?? '/';
    return Array.isArray(paths) ? paths : [paths];
  };
  if (!Reflect.hasOwnMetadata(PATH_METADATA, cls)) {
    return [];
  }
  const own = Reflect.getMetadata(VERSION_METADATA, cls) as Version | undefined;
  return methodsOf(cls.prototype as object).flatMap((handler) => {
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
    if (method === undefined) {
      return [];
    }
    const version = (Reflect.getMetadata(VERSION_METADATA, handler) as Version | undefined) ?? own;
    return pathsOf(cls).flatMap((path) =>
      pathsOf(handler).map((handlerPath) => ({
        path: underBase(path, handlerPath),
        method,
        version,
      })),
    );
  });
}
