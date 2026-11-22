# Benchmarks

nestjs-endpoints against the same API written with plain NestJS controllers, both validating
input and output with the same Zod schemas.

```sh
pnpm bench            # the full run, about 35 minutes
pnpm bench --quick    # a smoke run, about 2 minutes; not for publishing

pnpm bench:breakdown  # what each part of Nest's validation costs, about 30 minutes
```

The run writes `results/<timestamp>.md`, the tables, and `results/<timestamp>.json`, every
sample. It needs Node.js 26, the version every result is measured on, and
[oha](https://github.com/hatoo/oha) (`brew install oha`). `results/` is not in
git.

For numbers worth publishing, run it on AC power with nothing else busy: no dev servers, no
builds, no browser tabs doing work. The run warns when it is on battery or the load average is
high, and its noise floor (below) shows how quiet the machine was.

## The two apps

| | `nestjs-endpoints-app` | `nestjs-app` |
| --- | --- | --- |
| Routing | `endpoint.query()` / `endpoint.mutation()`, file-based | `@Controller()` classes |
| Input | `params`, `query`, `input` schemas | `@Param({ schema })`, `@Query({ schema })`, `@Body({ schema })` with the global `StandardSchemaValidationPipe` |
| Output | `output` schema | `StandardSchemaSerializerInterceptor` on the controller, `@SerializeOptions({ schema })` per handler |

Both run on `@nestjs/platform-node`, compiled with tsdown and started with
`NODE_ENV=production node dist/main.js`, logger off, listening on `127.0.0.1`. Schemas, handler
bodies and response data come from `src/shared.ts`, the same file in both apps. Handlers do no
I/O: this measures what the framework costs per request, not what an application does.

Each framework does the work it does in a real app, and that work is not quite the same. Before
validating, Nest's pipe walks every value to delete `__proto__`, `prototype` and `constructor` keys;
nestjs-endpoints hands the value straight to Zod, whose objects keep only the keys they declare.

The vanilla app follows the NestJS docs' setup: the validation pipe bound globally, the
serializer bound to the controller that has schemas. The no-schema route sits in a controller of
its own, so the serializer does not wrap it.

## Scenarios

| Scenario | Request | Validated |
| --- | --- | --- |
| `baseline` | `GET /health` | nothing |
| `params-query` | `GET /user/42?include=profile` | path and query params, object output |
| `valid-body` | `POST /users/create`, a valid JSON object | object input, object output |
| `invalid-body` | `POST /users/create`, a JSON object breaking five rules | object input, answered `400` |
| `list` | `GET /users/list` | an object output holding 50 users |

`list` returns `{ items, total }` rather than a bare array, because the serializer applies a
schema to each element of an array, not to the array as a whole.

## Method

1. **Parity.** `scripts/parity.ts` starts each app and sends every scenario. Both apps must
   answer with the expected status. Every `200` must have the same content type and the same
   body, byte for byte. A `400` body is each framework's own: nestjs-endpoints returns the Zod
   issues, Nest a list of messages. The run reports the sizes.
2. **Throughput.** [oha](https://github.com/hatoo/oha) sends requests as fast as the app answers
   them over 64 keep-alive connections: 3 s of warmup, then 10 s measured. Every measurement
   starts a fresh server process. Each round starts with a different contender, over 6 rounds,
   and the table reports the median and range. A measurement in which any request gets another
   status, or errors, fails the run.
3. **Noise floor.** A third contender is a second process of the vanilla app. The gap between
   it and the vanilla app is what this machine's noise alone produces; a difference smaller than
   that is not one.
4. **Latency.** Both apps at the same fixed rate, 60% of the slower one's median throughput, with
   oha's coordinated-omission correction; p50, p99 and p99.9 over 3 rounds.
5. **Headroom.** The run records how much CPU the server and oha used while measured. The server
   at about 1.0 core is saturated, since Node runs the app on one thread; oha well under the core
   count means the load generator was not the limit.

Run `node benchmarks/scripts/parity.ts` alone to check the apps after changing either one.
`run.ts` also takes `--rounds`, `--duration`, `--warmup`, `--connections`, `--latency-rounds`,
`--skip-build`, and `--scenario <id>` (repeatable).

The apps listen on 22500 (`nestjs-endpoints-app`) and 22501 (`nestjs-app`), set in `ports.ts`.

## The breakdown

`pnpm bench:breakdown` (`scripts/breakdown.ts`) measures where the vanilla app's extra time goes,
by running it without one part of its validation at a time. It writes
`results/<timestamp>-breakdown.md` and `.json`, and takes `--quick`, `--rounds`, `--duration`,
`--warmup`, `--connections`, `--skip-build` and `--scenario <id>`.

Each part is the vanilla app started from a second entry, `nestjs-app/src/breakdown/main.ts`,
with `PART` naming what to leave out. The controllers it uses are in `controllers.ts` beside it:
`UsersController` with the pipe's work, the interceptor's, or both moved into the handlers, as
`parse()` calls on the same schemas. The app `pnpm bench` measures is not touched.

| `PART` | The vanilla app, with |
| --- | --- |
| `no-key-removal` | the schema pipe, without removing the prototype keys |
| `pass-through-pipe` | a pipe that returns its value; the handlers parse their input |
| `no-pipe` | no pipe; the handlers parse their input |
| `pass-through-interceptor` | an interceptor that only calls `next.handle()`; the handlers parse their output |
| `no-interceptor` | no interceptor; the handlers parse their output |
| `neither` | no pipe and no interceptor; the handlers parse both |

1. **Parity.** Every part, and nestjs-endpoints, must answer as the vanilla app does, byte for
   byte.
2. **What a request creates.** Each app answers 500 of each request, and of the one with no
   schemas (`baseline`), one at a time, in a process that counts the promises (Node's
   `async_hooks`) and the RxJS subscriptions it creates (`scripts/count-hook.ts`). That process
   is never timed.
3. **Throughput.** As in the main run: the vanilla app, its control, the six parts and
   nestjs-endpoints take turns over 6 rounds. The report gives each as microseconds per request,
   1,000,000 / the median requests per second.
4. **The parts.** What a part costs is what the app gains without it. Running any interceptor
   is the pass-through one against none; the serializer's own work is the rest. The same goes
   for the pipes, which are also given apart from the key removal: the three steps the
   Performance page names are the interceptor, that, and the key removal. The report adds the
   interceptor and the pipes up beside what taking both out gains, and beside the noise: a part
   smaller than the noise is not measured.

It measures the two requests validated on the way in and out, `params-query` and `valid-body`.
A handler that parses for itself answers an invalid request with a `500`, so `invalid-body` is
not one of them.
