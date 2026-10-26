# file-based-routing example

A self-contained monorepo demonstrating nestjs-endpoints with file-based routing and a nested router module. One NestJS backend, one React front-end consuming the auto-generated type-safe client.

```
packages/
├── api/     # NestJS server; file-based routing; generates the client SDK on start
└── client/  # React + Vite app using the generated SDK
```

## Run it

Install once at the example root:

```bash
pnpm install
```

Start both packages in parallel — the API boots and writes the generated SDK into `packages/client/src/generated/`, then Vite serves the front-end:

```bash
pnpm dev
```

Visit the URL Vite prints (defaults to <http://localhost:5173>).

## Tests

```bash
pnpm test
```

Integration-level tests that load individual endpoints without spinning up the full HTTP server — see [`packages/api/test/recipes.spec.ts`](./packages/api/test/recipes.spec.ts).
