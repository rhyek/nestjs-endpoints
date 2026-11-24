---
description: Every option of NestjsEndpoints.forRoot() and EndpointRouter.create(), and what they return.
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
module.

| Option | Type | |
| --- | --- | --- |
| `router` | the router [options](#options) | The app's root router. Its `rootDirectory` is relative to the file that calls `forRoot()`. An app made only of routers it imports can leave `router` out. |
| `watch` | `boolean` | Whether the app watches its endpoint folders, so that `node --watch` restarts it when an endpoint file is added or removed. `nest start --watch` restarts by itself. Defaults to `false`. See [Development](../guide/development.md#with-node-and-a-typescript-loader). |

`forRoot()` returns what `create()` returns.

## `EndpointRouter.create()` {#endpointrouter-create}

```ts
import { EndpointRouter } from 'nestjs-endpoints';

export default EndpointRouter.create({ /* options */ });
```

Creates every router but the root one: a [nested router](../guide/routers.md#nested-routers), or
one a module imports [beside the root router](../guide/routers.md#inside-a-regular-module).

`create()` returns a promise of a NestJS dynamic module. Pass it to a module's `imports`, or
default-export it from a `router.ts` for a parent router to find.

The returned promise also has:

| Property | |
| --- | --- |
| `endpoint` | The router's own `endpoint.query()` and `endpoint.mutation()` builders, which give the endpoints built with them the router's [context](../guide/router-context.md). |
| `child()` | Creates a [child router](../guide/what-flows-down.md): a nested router that inherits this one's context, and its `providers` and `imports`. It takes the same [options](#options) and returns what `create()` returns. |

## Options

| Option | Type | |
| --- | --- | --- |
| `rootDirectory` | `string \| string[]` | The folder to look for endpoint files in, relative to the calling file, or several, all under the same `basePath`. Defaults to the calling file's own folder. |
| `basePath` | `string` | The URL prefix of everything the router owns. [Inferred](../guide/routers.md#base-path) when left out. `''` or `'/'` mounts the router at the root. |
| `namespace` | `boolean \| string` | The router's [namespace](../clients/namespaces.md) in the generated clients. It does not affect URLs. |
| `description` | `string` | Documents the router's namespace: a comment on it in the generated clients. |
| `endpoints` | array of endpoints, or a function returning endpoints and `import()`s | Endpoints [registered by hand](../guide/explicit-paths.md#on-a-router). They get the router's `basePath`. |
| `middleware` | array of `NestMiddleware` classes and functions | Middleware for every endpoint under the router. Its last entry may be `{ exclude: string[] }`, with paths relative to `basePath`. |
| `interceptors` | array of interceptor classes or instances | Interceptors for every endpoint under the router: one instance of each, made with the router's providers and imports. See [What flows down](../guide/what-flows-down.md#instances). |
| `guards` | array of guard classes or instances | Guards for every endpoint under the router, as `interceptors`. |
| `context` | `{ params, inject, injectOnRequest }`, each optional | What every endpoint built with the router's `endpoint` receives, and every router made with its `child()` passes on, under what each declares itself. See [Router context](../guide/router-context.md). |
| `context.params` | a plain `z.object()` | [Path parameters](../guide/router-context.md#path-parameters) of those endpoints. Each key is a `:param` in every one of their URLs. |
| `context.inject` | object of provider classes or `decorated<T>()` | Providers for those endpoints, as the [endpoint option](./endpoint.md#options) of the same name. |
| `context.injectOnRequest` | object of `decorated<T>()` | Per-request values for those endpoints, as the endpoint option of the same name. |
| `inject` | object of provider classes or `decorated<T>()` | Providers for the router's own instance: on [`this`](./endpoint.md#this) in its `lifecycle` hooks, `methods` and the getters of its `properties`. Its endpoints and the routers under it don't get them. |
| `imports`, `providers` | as in `@Module()` | The router's own, which every router made with its [`child()`](../guide/what-flows-down.md#context) has too. |
| `properties`, `methods` | as the [endpoint options](./endpoint.md#options) of the same names | Properties and methods of the router's instance, read from `this`. They are the router's own: its endpoints and the routers under it do not have them. |
| `lifecycle` | object of functions: `onModuleInit`, `onApplicationBootstrap`, `onModuleDestroy`, `beforeApplicationShutdown`, `onApplicationShutdown` | [Lifecycle hooks](https://docs.nestjs.com/fundamentals/lifecycle-events), called as a module's are, [before those of what is under the router](../guide/what-flows-down.md#lifecycle) at startup and after them at shutdown. Written as a method, a hook has on [`this`](./endpoint.md#this) what the router's own `inject` gives, with its `properties` and `methods`. |

How a router finds endpoint files and builds their URLs is in
[File-based routing](../guide/file-based-routing.md), and how it finds nested routers in
[Routers](../guide/routers.md#nested-routers).
