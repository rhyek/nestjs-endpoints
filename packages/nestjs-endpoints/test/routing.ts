// What the router specs share: the folder of their fixtures, and an app made of routers.

import path from 'node:path';
import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/** The folder of the routing fixtures. */
export const fixtures = path.resolve(import.meta.dirname, 'fixtures/routing');

/** A folder with no endpoint file: for a router whose endpoints are listed. */
export const empty = path.join(fixtures, 'empty');

/** Starts an app made of `imports`, short of listening. */
export async function start(...imports: (Type | DynamicModule | Promise<DynamicModule>)[]) {
  @Module({ imports })
  class AppModule {}
  return NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
}

/** The path of an endpoint. */
export const pathOf = (cls: Type) => Reflect.getMetadata('endpoints:path', cls) as string;

/** The paths of the endpoints of a router's module, sorted. */
export const pathsOf = (module: DynamicModule) => (module.controllers ?? []).map(pathOf).sort();

/** The routers nested under a router: those of its imports that have endpoints. */
export const nestedIn = (module: DynamicModule) =>
  (module.imports as DynamicModule[]).filter((imported) => imported.controllers);
