---
layout: home
title: nestjs-endpoints
titleTemplate: End-to-end type safety, built on NestJS controllers

intro:
  name: nestjs-endpoints
  # Non-breaking hyphens (U+2011), so a line never ends inside "End-to-end".
  text: End‑to‑end type safety, built on NestJS controllers.
  tagline: Small files, serious APIs. Each endpoint carries its own route, rules and logic, so the code you need is always the code in front of you.
  file: src/endpoints/orders/create.endpoint.ts
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Why nestjs-endpoints
      link: /guide/why
    - theme: alt
      text: GitHub
      link: https://github.com/rhyek/nestjs-endpoints
  yieldsLead: What comes with that one file
  yields:
    - label: Route
      value: POST /orders/create
      details: Derived from where the file sits. There is no decorator to write and no module to add it to.
    - label: Schemas
      value: 'input.quantity: number'
      details: The request is parsed before the handler runs and arrives typed. The response is checked against output as you type, and again before it is sent, with the keys output doesn't declare stripped.
    - label: Context
      value: router.child()
      details: The routers of the folders above hand it their path parameters, providers, per-request values and guards, through every level. A file declares only what is its own.
    - label: Client
      value: client.orders.create()
      details: A generated axios call and a React Query hook, typed from the same schemas.

types:
  handler:
    eyebrow: Server
    title: Your schemas type the handler.
    details: The body, search parameters and path parameters arrive parsed and typed, and so does everything you inject. You write no DTO classes, and no type annotations to keep in step with a schema.
    file: src/endpoints/orders/list.endpoint.ts
    linkText: Type safety
    link: /guide/type-safety
  client:
    eyebrow: Client
    title: Your front end knows the API.
    details: Generate an axios or React Query client from the same schemas. Routes, request bodies and responses autocomplete as you type, nested the way your routers are, and a change on the server reaches the front end as types.
    linkText: Generating clients
    link: /clients/codegen

context:
  row:
    eyebrow: Router context
    title: Declare it once, on the router.
    details: A router declares what its folder shares, once. Path parameters, providers, per-request values, guards and middleware reach every <span class="endpoint-term">endpoint</span> under it, typed, through as many levels of child routers as your folders have.
    linkText: Router context
    link: /guide/router-context
    moreLinks:
      - text: Recommended architecture
        link: /guide/architecture
  files:
    parent: src/endpoints/teams/router.ts
    child: src/endpoints/teams/$teamId/router.ts
    endpoint: src/endpoints/teams/$teamId/members/find.endpoint.ts

nest:
  eyebrow: NestJS
  title: It's still NestJS.
  details: Each <span class="endpoint-term">endpoint</span> is an ordinary controller class. Providers, guards, interceptors, lifecycle hooks, exception filters and the testing module work the way they do in any Nest app, on Express, Fastify or the Node adapter. Add one endpoint beside the controllers you already have, and move the rest when it suits you.
  points:
    - term: inject
      text: Providers, as a constructor takes them.
    - term: injectOnRequest
      text: '@Req(), @Session() and your own parameter decorators.'
    - term: guards, interceptors
      text: '@UseGuards() and @UseInterceptors().'
    - term: lifecycle
      text: onModuleInit(), onApplicationBootstrap() and the other lifecycle hooks.
    - term: decorators
      text: Any other method decorator, such as @SetMetadata().
  file: src/endpoints/admin/refund.endpoint.ts
  linkText: How it fits NestJS
  link: /guide/nestjs
  moreLinks:
    - text: What it adds
      link: /guide/improvements

performance:
  eyebrow: Performance
  title: Faster than a controller that validates.
  details: Validating a request and its response costs less in an <span class="endpoint-term">endpoint</span> than in a NestJS controller with NestJS's own schema validation. The same API, with the same Zod schemas, serves about a quarter more requests per second where both are validated, and the same number where nothing is.
  linkText: Performance
  link: /guide/performance

routes:
  title: Your folders are your API.
  details: A router finds the endpoint files in a folder and derives each URL from the file's path. A router.ts gives a folder its own providers, guards and interceptors, and its own namespace in the generated client. Services, guards and tests sit beside the endpoints they belong to.
  columns:
    file: src/endpoints/
    route: Route
    client: Generated client
  rows:
    - file: health.endpoint.ts
      depth: 0
      method: GET
      path: /health
      client: client.health()
    - file: orders/
      depth: 0
      note: A folder is a path segment.
    - file: router.ts
      depth: 1
      note: 'The folder''s providers and guards, and the client''s "orders" namespace.'
    - file: orders.service.ts
      depth: 1
      note: Not an endpoint file, so not a route.
    - file: create.endpoint.ts
      depth: 1
      method: POST
      path: /orders/create
      client: client.orders.create()
    - file: list.endpoint.ts
      depth: 1
      method: POST
      path: /orders/list
      client: client.orders.list()
    - file: $orderId.view.endpoint.ts
      depth: 1
      method: POST
      path: /orders/:orderId/view
      client: client.orders.view()
    - file: $orderId.cancel.endpoint.ts
      depth: 1
      method: POST
      path: /orders/:orderId/cancel
      client: client.orders.cancel()
  linkText: File-based routing
  link: /guide/file-based-routing

featuresTitle: What else is in the box

features:
  - icon: 🤖
    title: Ready for coding agents
    details: The docs ship inside the package, indexed by llms.txt, and installing it gives your agent a rules file and a skill that point at them, and a skill that reworks an API to the recommended architecture.
    link: /ai/overview
  - icon: 🔁
    title: Queries and mutations
    details: endpoint.query() and endpoint.mutation() decide whether the React Query client gives an operation a query hook or a mutation hook.
    link: /guide/endpoints
  - icon: 🛡️
    title: Solid
    details: Built on NestJS's foundations, and covered by {{ testCount }} tests, run on Express, Fastify and the Node adapter.
    link: /guide/nestjs
  - icon: 📜
    title: Works with @nestjs/swagger
    details: Endpoints carry the metadata SwaggerModule reads, so they are in the OpenAPI document your app builds.
    link: /clients/openapi
  - icon: ⚛️
    title: React Query, in and out of React
    details: Hooks on the client object, queryOptions and mutationOptions for route loaders, and each operation's input as JSON Schema for forms.
    link: /clients/react-query
  - icon: 🧭
    title: A client shaped like your routers
    details: Namespaces nest operations as client.shop.recipes.create(), and one server can generate a narrower client for each front end.
    link: /clients/namespaces
  - icon: 🧪
    title: Tests at every level
    details: Call an endpoint's invoke() with only its providers, load one router, or start the app and call it through the generated client.
    link: /guide/testing
  - icon: ♻️
    title: State and lifecycle hooks
    details: An endpoint or a router keeps its own properties and methods, and runs NestJS's lifecycle hooks, such as onModuleInit, with all of it on this.
    link: /guide/state-and-lifecycle
  - icon: 🔌
    title: Your HTTP adapter
    details: Express, Fastify, or node:http through @nestjs/platform-node.
    link: /guide/nestjs

install:
  title: Add it to a NestJS app.
  details: Install the package, then add NestjsEndpoints.forRoot to your app module. It needs Node.js 24.22, NestJS 12, TypeScript 6 and Zod 4.1 or later, in an ESM project.
  linkText: Get started
  link: /guide/getting-started
---
