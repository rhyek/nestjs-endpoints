---
description: Benchmarks of nestjs-endpoints against NestJS controllers that validate with NestJS's own schema validation — about 25% more requests per second where both validate.
---

<script setup>
import { measuredOn, noisePercent } from '../.vitepress/theme/performance/results';
</script>

# Performance

A NestJS controller validates a request and its response through a pipe and an interceptor. An
<Endpoint>endpoint</Endpoint> validates with the same schemas and runs neither. The same API,
with the same Zod schemas and the same handlers, serves about **25% more requests per second**
where both are validated, and the same number where nothing is.

<BenchmarkStats />

## The numbers

Each pair of bars is one request, sent as fast as each app answers it. Hover over a bar for the
range it was measured in.

<BenchmarkChart />

- **Validated requests are where the difference is.** A `GET` with path and search parameters
  and a `POST` with a JSON body each validate on the way in and on the way out.
- **A long response narrows it.** For a 14 KB list, most of the time goes to validating and
  serializing fifty items, which both do alike.
- **A rejected request is level**, and an endpoint's `400` carries the full Zod issues.
- **A route with no schemas is level.** An <Endpoint>endpoint</Endpoint> adds nothing to a
  request it doesn't validate.

::: details The same numbers as a table

<BenchmarkTable />

Medians of six rounds, with the range across them. Two runs of the same app differed by up to
{{ noisePercent }}%, so a difference that small is shown as level.

:::

## What was compared

One API, written twice:

| | nestjs-endpoints | NestJS |
| --- | --- | --- |
| Routes | `endpoint.query()` and `endpoint.mutation()` | `@Controller()` classes |
| Requests | `params`, `query` and `input` schemas | `@Param({ schema })`, `@Query({ schema })` and `@Body({ schema })`, with the global `StandardSchemaValidationPipe` |
| Responses | An `output` schema | `StandardSchemaSerializerInterceptor`, with `@SerializeOptions({ schema })` on each handler |

The controllers are set up as the NestJS docs describe. Both apps use the same schemas and
handler bodies, and every `200` response is the same in both, byte for byte.

The comparison is between two ways to validate in NestJS, not between NestJS and something else:
an <Endpoint>endpoint</Endpoint> is a NestJS controller too.

## Where the time goes

Both apps run the same Zod schemas around the same handlers, so the validation itself costs the
same in each. The difference is what a request passes through to get to them:

- **A controller validates through NestJS's request pipeline**: a pipe on each parameter, and
  an interceptor around the handler.
- **An <Endpoint>endpoint</Endpoint> calls its schemas itself.** It is a controller whose
  handler parses the request and the return value with `safeParse`, so it needs neither.

<RequestPipeline />

The rest of the pipeline is the same in both. A pipe or an interceptor your app adds runs on an
<Endpoint>endpoint</Endpoint> as it does on a controller, and costs the same.

### What each step costs

The pipe's first job, removing prototype keys, is counted on its own below, so a controller
runs three steps an endpoint doesn't. Taking each one out of the controller shows what it costs.
Their shares of what the three cost together, to the nearest 5%:

| | `GET` | `POST` |
| --- | --- | --- |
| **The interceptor** | **70%** | **65%** |
| Of which, running any interceptor at all | 55% | 45% |
| **The pipe on each parameter** | **20%** | **15%** |
| **Removing prototype keys** | **10%** | **20%** |

- **The interceptor is most of it.** NestJS runs every interceptor through RxJS: with the
  serializer, 15 subscriptions and 19 promises a request. About half of the whole is what NestJS
  spends to run any interceptor, even one that only calls `next.handle()`. The serializer also
  looks up its schema in the handler's metadata each time.
- **A pipe is a chain of async calls.** A parameter's value passes through five async functions
  on its way to the handler, and the handler waits for all of them: 26 promises for the `GET`'s
  two parameters, and 14 for the `POST`'s body.
- **Removing prototype keys is a safety measure.** Before validating, the schema pipe removes
  `__proto__`, `prototype` and `constructor` keys from each value. An endpoint hands the value
  to Zod as it is. A `z.object()` keeps only the keys it declares, so they don't reach the
  handler. A `z.looseObject()` or a `z.record()` drops `__proto__` and keeps the other two, and
  `z.any()` keeps all three.
- **The validation is not what is slow.** With the pipe and the interceptor both taken out, and
  the same Zod calls written in each handler, the controller is about as fast as the
  <Endpoint>endpoint</Endpoint>. An endpoint gets you that speed without writing it by hand.

### What a request creates

The steps can be counted too, in what one request creates. A validated request creates in an
<Endpoint>endpoint</Endpoint> what a request with no schemas does:

| One request creates | Controller | <Endpoint>Endpoint</Endpoint> |
| --- | --- | --- |
| `GET` with no schemas | 14 promises | 14 promises |
| `GET` with path and search parameters | 59 promises, 15 RxJS subscriptions | 14 promises |
| `POST` with a JSON body | 47 promises, 15 RxJS subscriptions | 14 promises |

## What it means for your app

The handlers measured do no I/O, so these numbers are what the framework costs per request:
about 25 microseconds for a validated `GET` in an <Endpoint>endpoint</Endpoint>, and 31 in a
controller. A handler that queries a database spends far longer there, and the share you gain is
smaller.

At the same load, both answer in the same time: a median under a millisecond for every request
above.

## How it was measured

- **Where:** {{ measuredOn }}. Each app runs its production build on one CPU core.
- **Load:** 64 keep-alive connections, each sending as fast as the app answers.
- **Rounds:** six ten-second rounds for each app, after a warm-up, with a new server process
  for every round and the apps taking turns.
- **The steps:** each is the controller app with that step taken out, measured against the
  app as it is. The pipe's share leaves out the key removal, which is counted on its own.
  Together they add up to what taking the pipe and the interceptor out saves, to within 4%. The
  promises are counted with Node's `async_hooks` and the subscriptions at RxJS's `subscribe`,
  over 500 requests.

The apps and the scripts are in the repository's
[`benchmarks`](https://github.com/rhyek/nestjs-endpoints/tree/main/benchmarks) folder, to run
on your own machine: `pnpm bench` for the numbers, and `pnpm bench:breakdown` for what each step
costs.
