---
description: The generated axios client — creating one, calling operations, reading results, handling errors and configuring requests.
---

# axios client

The axios client is a plain object with one typed function per endpoint. It runs anywhere axios
does: a browser, another Node service, or your tests.

Generate it with [`setupCodegen`](./codegen.md), with `type: 'axios'`.

## Create a client

`createApiClient` takes axios defaults, or an axios instance you already built:

```ts twoslash
import axios from 'axios';
import { createApiClient } from './generated/axios-client.js';
// ---cut---
const client = createApiClient({
  baseURL: 'https://api.example.com',
  headers: { 'x-tenant': 'acme' },
});

// or send through an instance of your own
const instance = axios.create({ baseURL: 'https://api.example.com' });
const sameClient = createApiClient(instance);
```

Every call goes through that instance, which is always at `client.axios`:

```ts twoslash
import { createApiClient } from './generated/axios-client.js';
const client = createApiClient();
declare const token: string;
// ---cut---
client.axios.defaults.headers.common.Authorization = `Bearer ${token}`;
```

## Call an operation

Each operation takes one object that groups its request into `path`, `query` and `body`, from
the endpoint's `params`, `query` and `input`:

```ts twoslash
import { createApiClient } from './generated/axios-client.js';
const client = createApiClient();
// ---cut---
const created = await client.orders.create({
  body: { productId: 'sku_42', quantity: 2 },
});

const page = await client.orders.list({
  query: { page: 2 },
  body: { status: 'pending' },
});

const order = await client.orders.view({ path: { orderId: 1 } });
```

A call resolves to the response: `status`, `data`, `headers` and the rest. `data` is typed from
the endpoint's `output`.

```ts twoslash
import { createApiClient } from './generated/axios-client.js';
const client = createApiClient();
// ---cut---
const result = await client.orders.view({ path: { orderId: 1 } });

result;
// ^?
```

`headers` is a web [`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers) object.

When the body is all you want, `.unwrap()` resolves to it alone:

```ts twoslash
import { createApiClient } from './generated/axios-client.js';
const client = createApiClient();
// ---cut---
const order = await client.orders.view({ path: { orderId: 1 } }).unwrap();
```

## Errors

A response outside the 2xx range throws a `ResponseError`, with the status in `error.status`
and the response body in `error.data`. `isResponseError()` narrows a caught error to it:

```ts twoslash
import { createApiClient, isResponseError } from './generated/axios-client.js';
const client = createApiClient();
// ---cut---
try {
  await client.orders.view({ path: { orderId: 404 } });
} catch (error) {
  if (isResponseError(error) && error.status === 404) {
    // error.data is the response body
    console.log(error.data);
  } else {
    throw error;
  }
}
```

To handle every status without `try` and `catch`, pass `throwOnError: false`. The call then
resolves on any status, with the error body in `error` and `data` undefined:

```ts twoslash
import { createApiClient } from './generated/axios-client.js';
const client = createApiClient();
// ---cut---
const result = await client.orders.view({
  path: { orderId: 404 },
  throwOnError: false,
});

if (result.error) {
  console.log(result.status, result.error);
}
```

A request that gets no response at all, such as when the server is unreachable, throws axios's
own error.

## Per-call options

Beside `path`, `query` and `body`, a call takes:

- **`options`**: axios request config for this call.
- **`signal`**: an `AbortSignal`, to cancel it.
- **`throwOnError`**: see [Errors](#errors).

```ts twoslash
import { createApiClient } from './generated/axios-client.js';
const client = createApiClient();
// ---cut---
const controller = new AbortController();

await client.orders.view({
  path: { orderId: 1 },
  options: { timeout: 5000 },
  signal: controller.signal,
});
```

## Headers and interceptors

- **Set request headers on the axios instance**, `client.axios`, as defaults or in a request
  interceptor. Endpoints declare no header parameters, so a call takes none of its own.
- **Request interceptors apply to every call**, along with the instance's defaults (`baseURL`,
  `headers`, `withCredentials`).
- **Read results and errors from the call, not from response interceptors.** The client decodes
  each response itself, so a response interceptor sees every status as a success, with the body
  not yet decoded.

```ts twoslash
import { createApiClient } from './generated/axios-client.js';
const client = createApiClient();
declare function currentToken(): string;
// ---cut---
client.axios.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${currentToken()}`;
  return config;
});
```
