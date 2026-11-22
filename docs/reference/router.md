---
description: Every option of NestjsEndpoints.forRoot() and EndpointRouterModule.create(), and what they return.
---

# Router options

## `NestjsEndpoints.forRoot()` {#nestjsendpoints-forroot}

```ts
import { Module } from '@nestjs/common';
import { NestjsEndpoints } from 'nestjs-endpoints';

@Module({
  imports: [
    NestjsEndpoints.forRoot({
      router: { /* options */ },
    }),
  ],
})
export class AppModule {}
```

Sets the library up for an app, and creates its root router. Call it once, in the app's root
module: a second call fails the start.

| Option | Type | |
| --- | --- | --- |
| `router` | the router [options](#options) | The app's root router. Its `rootDirectory` is relative to the file that calls `forRoot()`. An app made only of routers it imports can leave `router` out. |
| `watch` | `boolean` | Whether the app watches its endpoint folders, so that `node --watch` restarts it when an endpoint file is added or removed. `nest start --watch` restarts by itself. The app keeps a small file per router under `node_modules/.cache/nestjs-endpoints/` for it. Defaults to `false`. See [Development](../guide/development.md#with-node-and-a-typescript-loader). |

`forRoot()` returns what `create()` returns.

## `EndpointRouterModule.create()` {#endpointroutermodule-create}

```ts
import { EndpointRouterModule } from 'nestjs-endpoints';

export default EndpointRouterModule.create({ /* options */ });
```

Creates every router but the root one: a [nested router](../guide/routers.md#nested-routers), or
one a module imports [beside the root router](../guide/routers.md#inside-a-regular-module).

`create()` returns a promise of a NestJS dynamic module. Pass it to a module's `imports`, or
default-export it from a `router.module.ts` for a parent router to find.

The returned promise also has an `endpoint` property: the router's own `endpoint.query()` and
`endpoint.mutation()` builders, which add the router's
[`endpointConfig`](../guide/routers.md#shared-injections) to the endpoints built
with them.

## Options

| Option | Type | |
| --- | --- | --- |
| `rootDirectory` | `string \| string[]` | The folder to look for endpoint files in, relative to the calling file, or several, all under the same `basePath`. Defaults to the calling file's own folder. |
| `basePath` | `string` | The URL prefix of everything the router owns. [Inferred](../guide/routers.md#base-path) when left out. `''` or `'/'` mounts the router at the root. |
| `namespace` | `boolean \| string` | The router's [namespace](../clients/namespaces.md) in the generated clients. It does not affect URLs. |
| `description` | `string` | Documents the router's namespace: a comment on it in the generated clients. |
| `endpoints` | array of endpoints, or a function returning endpoints and `import()`s | Endpoints [registered by hand](../guide/explicit-paths.md#on-a-router). They get the router's `basePath`. |
| `middleware` | array of `NestMiddleware` classes and functions | Middleware for every endpoint under the router. Its last entry may be `{ exclude: string[] }`, with paths relative to `basePath`. |
| `interceptors` | array of interceptor classes or instances | Interceptors for every endpoint under the router. |
| `guards` | array of guard classes or instances | Guards for every endpoint under the router. |
| `endpointConfig` | `{ inject?, injectOnRequest? }` | Injections for every endpoint built with the router's `endpoint`. Shaped as the [endpoint options](./endpoint.md#options) of the same names. |
| `imports`, `providers`, `exports` | as in `@Module()` | The module's own. |

How a router finds endpoint files and builds their URLs is in
[File-based routing](../guide/file-based-routing.md), and how it finds nested routers in
[Routers](../guide/routers.md#nested-routers).
