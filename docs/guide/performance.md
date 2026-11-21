---
description: Benchmarks of nestjs-endpoints against NestJS controllers that validate with NestJS's own schema validation — about 25% more requests per second where both validate.
---

<script setup>
import { measuredOn, noisePercent } from '../.vitepress/theme/performance/results';
</script>

# Performance

An endpoint validates its request and its response for less than a NestJS controller does with
NestJS's own schema validation. The same API, with the same Zod schemas and the same handlers,
serves about **25% more requests per second** where both are validated, and the same number
where nothing is.

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
- **A route with no schemas is level.** An endpoint adds nothing to a request it doesn't
  validate.

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

The comparison is with NestJS's schema validation, not with NestJS. A controller that calls
Zod by hand inside its handler, with no pipe and no interceptor, is about as fast as an
endpoint. An endpoint gets you that speed without writing it by hand.

## Where the time goes

A controller validates through a pipe for each parameter, and an interceptor around the
handler for the response. An endpoint parses its schemas in one step, with neither.

The two do slightly different work. Before validating, NestJS's pipe removes `__proto__`,
`prototype` and `constructor` keys from each value. An endpoint hands the value to Zod, whose
objects keep only the keys they declare.

## What it means for your app

The handlers measured do no I/O, so these numbers are what the framework costs per request:
about 25 microseconds for a validated `GET` in an endpoint, and 31 in a controller. A handler
that queries a database spends far longer there, and the share you gain is smaller.

At the same load, both answer in the same time: a median under a millisecond for every request
above.

## How it was measured

- **Where:** {{ measuredOn }}. Each app runs its production build on one CPU core.
- **Load:** 64 keep-alive connections, each sending as fast as the app answers.
- **Rounds:** six ten-second rounds for each app, after a warm-up, with a new server process
  for every round and the apps taking turns.

The apps and the script are in the repository's
[`benchmarks`](https://github.com/rhyek/nestjs-endpoints/tree/main/benchmarks) folder, to run
on your own machine.
