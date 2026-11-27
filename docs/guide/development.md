---
description: The commands to run an app in development, so that the endpoint files you add are served and the clients follow.
---

# Development

Run the app with one of these while you work on it. They make the routers pick up the endpoint
files you add, rename or delete, so that:

1. the new HTTP endpoints are served, and
2. the [client SDKs](../clients/codegen.md) the app declares are regenerated.

## With the Nest CLI

```bash
npx nest start --watch
```

## With Node and a TypeScript loader

::: code-group

```bash [SWC]
NODE_ENV=development node --watch \
  --import @swc-node/register/esm-register src/main.ts
```

```bash [oxc]
NODE_ENV=development node --watch \
  --import @oxc-node/core/register src/main.ts
```

:::

Also turn on `watch` in `NestjsEndpoints.forRoot`. `node --watch` restarts only for files the app
has already loaded, and `watch` makes it restart for a new endpoint file too:

```ts
NestjsEndpoints.forRoot({
  router: { rootDirectory: './endpoints' },
  watch: process.env.NODE_ENV === 'development',
});
```
