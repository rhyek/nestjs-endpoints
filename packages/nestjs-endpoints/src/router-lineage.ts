// A router's guards and interceptors, and those of the routers above it by `child()`: what it
// applies to its endpoints, the outermost router's first.

import {
  type CanActivate,
  type NestInterceptor,
  type Type,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { NamesBesideGuard } from './names-beside.guard';

export type Guard = Type<CanActivate> | CanActivate;

export type Interceptor = Type<NestInterceptor> | NestInterceptor;

/**
 * The guards and interceptors of a router and of those above it, the outermost first: what a
 * router applies to its endpoints, and the routers made with its `child()` apply to theirs.
 */
export type Lineage = { guards: Guard[]; interceptors: Interceptor[] };

export const NO_LINEAGE: Lineage = { guards: [], interceptors: [] };

/** The lineage of a router: its parent's, then its own guards and interceptors. */
export function lineageOf(parent: Lineage, own: Partial<Lineage> | undefined): Lineage {
  return {
    guards: [...parent.guards, ...(own?.guards ?? [])],
    interceptors: [...parent.interceptors, ...(own?.interceptors ?? [])],
  };
}

/** Puts a lineage's guards and interceptors before those `endpoint` has. */
export function applyLineage(endpoint: Type, lineage: Lineage): void {
  prependClassMetadata(endpoint, GUARDS_METADATA, lineage.guards, UseGuards);
  prependClassMetadata(endpoint, INTERCEPTORS_METADATA, lineage.interceptors, UseInterceptors);
}

/**
 * Puts `items` before what `cls` has under the class metadata `key`, through the NestJS
 * decorator that sets it: a router's guards and interceptors run before those of the
 * routers under it.
 */
function prependClassMetadata<T>(
  cls: Type,
  key: string,
  items: T[],
  decorator: (...items: T[]) => ClassDecorator,
): void {
  if (items.length === 0) {
    return;
  }
  const existing = (Reflect.getMetadata(key, cls) as unknown[] | undefined) ?? [];
  // The guard that refuses a name beside a path parameter stays first: a URL it refuses is
  // one no route answers.
  const first = existing.filter((item) => item === NamesBesideGuard);
  const rest = existing.filter((item) => item !== NamesBesideGuard);
  Reflect.deleteMetadata(key, cls);
  decorator(...items)(cls);
  Reflect.defineMetadata(
    key,
    [...first, ...(Reflect.getMetadata(key, cls) as unknown[]), ...rest],
    cls,
  );
}
