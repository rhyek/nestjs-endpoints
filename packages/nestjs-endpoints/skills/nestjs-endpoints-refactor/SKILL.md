---
name: nestjs-endpoints-refactor
description: Reworks this repo's nestjs-endpoints API to the recommended architecture - the resource in the path, routers with `context` for what a folder shares, self-contained endpoints, GET where it fits - and updates the generated clients and their callers. Runs only when asked.
disable-model-invocation: true
---

# nestjs-endpoints-refactor

Reworks an API built with nestjs-endpoints to the recommended architecture, one router at a
time, without changing what any endpoint does.

## Read the docs first

From the API's directory (the repository's root, when it has one API), find the docs of the
version it installed:

```bash
node -p "require.resolve('nestjs-endpoints/docs/llms.txt')"
```

Read, with the Read tool, the file it prints, then the agent playbook it starts with, then
`guide/architecture.md` beside it. Its rules and its "What to reach for" table are what this
refactor applies. If the command finds nothing, you are not in the API's directory: ask which
one it is, and change nothing until the command finds its docs.

## Steps

0. **Check the installed docs have `guide/architecture.md`.** If they don't, stop: say the API
   needs a newer nestjs-endpoints before this refactor, and change nothing.
1. **Take stock, router by router.** For each router and the endpoints under it, list:
   - the ids that arrive in `input` but name the thing acted on;
   - the path parameters, providers and per-request values three or more endpoints share;
   - each service, the endpoints that use it, and whether it only forwards to the database or
     another client;
   - the reads that a browser, a probe or another system calls directly, which want `GET`;
   - the guards, middleware and interceptors repeated per endpoint, and the statuses an
     endpoint returns that its `output` doesn't declare. Declare each with the body the
     endpoint sends now. A thrown exception, such as `NotFoundException`, stays thrown.
2. **Write the plan for the whole API, and show it before you edit anything.** Name every URL,
   every method and every generated-client call that changes: a read that becomes a `GET`
   takes its request in the query string, not the body. Those changes break anyone calling the
   API, so ask whether to go on, and whether anything is to stay as it is. A service goes into its
   endpoint when one endpoint uses it, or when it only forwards. A service several endpoints
   share for domain knowledge stays.
3. **Work one router at a time.** Move and rename the files to their `$param` paths, change the
   schemas, add a `router.ts` with `context` where three or more endpoints share something, and
   fold services in. A test that replaced a folded service with a mock, as with
   `overrideProvider`, gets the same mock on what the endpoint injects now. Then regenerate the
   clients, update every call site in the repository, and run the type-check and the tests
   before you start the next router.
4. **Keep the behavior.** Status codes, error bodies and side effects stay as they were. A test
   that needs a different expected value, other than a URL or a call's shape, means the change
   altered behavior: undo it, and say so.

End with the list of URLs and client calls that changed, and anything you left as it was, with
why.
