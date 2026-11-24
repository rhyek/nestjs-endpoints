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

The controllers are set up as the NestJS docs describe, and an <Endpoint>endpoint</Endpoint> is
a NestJS controller too. Both apps use the same schemas and handler bodies, and every `200`
response is the same in both, byte for byte.

## Where the time goes

Both apps run the same Zod schemas around the same handlers, so the validation itself costs the
same in each. The difference is what a request passes through to get to them:

- **A controller validates through NestJS's request pipeline.** Every pipe gets every argument
  and picks which to validate, and an interceptor wraps the handler.
- **An <Endpoint>endpoint</Endpoint> calls each schema on its own value**, with `safeParse` in
  its handler, so it needs neither.

<RequestPipeline />

The rest of the pipeline is the same in both. A pipe or an interceptor your app adds runs on an
<Endpoint>endpoint</Endpoint> as it does on a controller, and costs the same.

### What each step costs

Each step's share of what the three cost a controller together, measured by taking it out of the
controller app, to the nearest 5%:

| | `GET` | `POST` |
| --- | --- | --- |
| **The interceptor** | **70%** | **65%** |
| Of which, running any interceptor at all | 55% | 45% |
| **The pipe on each parameter** | **20%** | **15%** |
| **Removing prototype keys** | **10%** | **20%** |

- **Removing prototype keys is a safety step of the schema pipe.** An endpoint leaves those keys
  to Zod: a `z.object()` drops them, a `z.looseObject()` or a `z.record()` keeps `prototype` and
  `constructor`, and `z.any()` keeps all three.
- **The validation is not what is slow.** A controller that calls the same Zod schemas in its
  handler, with no pipe and no interceptor, is about as fast as an <Endpoint>endpoint</Endpoint>.

## What it means for your app

The handlers measured do no I/O, so these numbers are what the framework costs per request:
about 25 microseconds for a validated `GET` in an <Endpoint>endpoint</Endpoint>, and 31 in a
controller. A handler that queries a database spends far longer there, and the share you gain is
smaller.

At the same load, both answer in the same time: a median under a millisecond for every request
above.

## How it was measured

Measured on {{ measuredOn }}. Each app ran its production build on one CPU core, under 64
keep-alive connections sending as fast as it answered. The apps are in the repository's
[`benchmarks`](https://github.com/rhyek/nestjs-endpoints/tree/main/benchmarks) folder.
