---
description: The generated React Query client — hooks on the client object, queryOptions and mutationOptions outside React, query keys and input schemas.
---

# React Query client

The React Query client is the [axios client](./axios.md) with a typed
[TanStack Query](https://tanstack.com/query) hook beside every operation. An
`endpoint.query()` gets a query hook and an `endpoint.mutation()` a mutation hook.

Generate it with [`setupCodegen`](./codegen.md), with `type: 'react-query'`. It needs
`@tanstack/react-query` 5.82 or later.

## Provide the client

Create a client, and put it in context beside your `QueryClient`:

```tsx twoslash
import type { ReactNode } from 'react';
// ---cut---
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiClientProvider, createApiClient } from './generated/react-query-client.js';

const queryClient = new QueryClient();
export const api = createApiClient({ baseURL: 'https://api.example.com' });

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={api}>{children}</ApiClientProvider>
    </QueryClientProvider>
  );
}
```

`createApiClient` takes axios defaults or an axios instance, as the
[axios client](./axios.md#create-a-client)'s does.

## Hooks

`useApiClient()` returns the client. Hooks and request functions sit side by side on it, under
the [namespaces](./namespaces.md) your routers declare:

```tsx twoslash
import { useApiClient } from './generated/react-query-client.js';
// ---cut---
export function Orders() {
  const client = useApiClient();

  // endpoint.query()  →  a query hook
  const orders = client.orders.useList({ query: { page: 1 }, body: {} });
  // endpoint.mutation()  →  a mutation hook
  const cancel = client.orders.useCancel();

  return (
    <ul>
      {orders.data?.map((order) => (
        <li key={order.id}>
          #{order.id} is {order.status}
          <button onClick={() => cancel.mutate({ path: { orderId: order.id } })}>
            Cancel
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- **A hook's `data` is the response body**, typed from the endpoint's `output`. The request
  function on the same object, `client.orders.list(...)`, resolves to the
  [whole response](./axios.md#call-an-operation).
- **A hook's `error` is a [`ResponseError`](./axios.md#errors)**: read `error.status` and
  `error.data`.
- **`useApiClient()` must be called under `<ApiClientProvider>`.** It throws otherwise.

### Options

Every hook takes a trailing options object, whose `query` or `mutation` key is passed on to
TanStack Query:

```tsx twoslash
import { useApiClient } from './generated/react-query-client.js';
declare const orderId: number | undefined;
declare function notify(message: string): void;
// ---cut---
const client = useApiClient();

const order = client.orders.useView(
  { path: { orderId: orderId ?? 0 } },
  { query: { enabled: orderId !== undefined, staleTime: 30_000 } },
);

const create = client.orders.useCreate({
  mutation: { onSuccess: (created) => notify(`Order ${created.id} placed`) },
});
```

## Outside React

Each operation's request function also carries what TanStack Query needs where a hook can't run,
such as a route loader. These are bound to the client instance they came from, with its base URL
and interceptors:

| Property | On | What it is |
| --- | --- | --- |
| `queryOptions(request, config?)` | Queries | Options for `useQuery`, `queryClient.ensureQueryData`, `prefetchQuery`, and the like. |
| `queryKey(request)` | Queries | The key the query is cached under. |
| `mutationOptions(config?)` | Mutations | Options for `useMutation`. |
| `mutationKey()` | Mutations | The mutation's key. |

`request` is the same `{ path, query, body }` object the call takes. An operation without
request data takes none.

Use the instance you gave `<ApiClientProvider>`:

```tsx twoslash
import type { QueryClient } from '@tanstack/react-query';
import { createApiClient } from './generated/react-query-client.js';
const api = createApiClient();
// ---cut---
// A route loader: no React, no hooks.
export const loader = (queryClient: QueryClient, orderId: number) =>
  queryClient.ensureQueryData(api.orders.view.queryOptions({ path: { orderId } }));
```

Inside a component, they compose with TanStack Query's own hooks:

```tsx twoslash
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from './generated/react-query-client.js';
// ---cut---
const client = useApiClient();
const queryClient = useQueryClient();

const create = useMutation({
  ...client.orders.create.mutationOptions(),
  onSuccess: () =>
    queryClient.invalidateQueries({
      queryKey: client.orders.list.queryKey({ query: { page: 1 }, body: {} }),
    }),
});

create.mutate({ body: { productId: 'sku_42', quantity: 2 } });
```

### Query keys

A query's key is `[{ url, params? }, query?, body?]`. `url` is the path the app serves the
endpoint at, with its `:param` segments, and `params` the path parameters. The hook and
`queryOptions` use the same key.

`invalidateQueries` matches keys by prefix, so the URL alone covers every cached page and filter
of an operation:

```ts
// every cached call of /orders/list
queryClient.invalidateQueries({ queryKey: [{ url: '/orders/list' }] });

// one of them
queryClient.invalidateQueries({
  queryKey: client.orders.list.queryKey({ query: { page: 2 }, body: {} }),
});
```

## Input schemas

Each operation that takes input carries it as JSON Schema, for a form to read:

| Property | On | What it is |
| --- | --- | --- |
| `schemas.input` | Operations that declare `input` | The body, as JSON Schema. |
| `schemas.query` | Operations that declare `query` with properties | The search parameters, as JSON Schema. |

```tsx twoslash
import { useApiClient } from './generated/react-query-client.js';
const client = useApiClient();
// ---cut---
const schema = client.orders.create.schemas.input;
//    ^?
```

Each is self-contained, with every `$ref` resolved. Its type, `InputSchema<T>`, carries the
request type, so a form library can infer a form's values from the schema alone.

## Plugin options

A client's `options` in [`setupCodegen`](./codegen.md#set-it-up) are passed to
[`@kubb/plugin-react-query`](https://kubb.dev/extensions/kubb-labs/plugin-react-query/options),
which generates the hooks. The endpoint's builder decides an operation's kind, so
`query.methods` and `mutation.methods` are ignored. nestjs-endpoints sets `client`, `hooks`,
`output` and `group` itself.
