import type { NativeOptions, NativeRequest, NativeResponse } from './client'
import type { MediaTypeContext, MediaTypes } from './mediaTypes'
import type { HeadersInit, HttpMethod, RequestBody, Serializers, Styles } from './serializers'
import type { StandardSchemaValidator, ValidateOption, ValidationErrorHandler } from './standardSchema'
import { defaultMediaTypes, isEncodedBody, resolveMediaType } from './mediaTypes'
import { baseContentType, toValue } from './serializers'
import { isValidationEnabled, runValidator } from './standardSchema'
export * from './mediaTypes'
export type { ValidateOption, ValidationErrorContext, ValidationErrorHandler } from './standardSchema'

/**
 * The status keys that count as success. `2xx` covers every 2xx status.
 */
export type SuccessStatusCode = '200' | '201' | '202' | '203' | '204' | '205' | '206' | '207' | '208' | '226' | '2xx'

export type SuccessOf<TResponses> = TResponses[Extract<keyof TResponses, SuccessStatusCode>]

export type ErrorOf<TResponses> = TResponses[Exclude<keyof TResponses, SuccessStatusCode>]

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

type ToNumber<T> = T extends `${infer TNumber extends number}` ? TNumber : never

/**
 * Maps a status key such as `404` or `4xx` to its numeric statuses. `default` becomes `number`.
 */
export type ToStatusNumber<TStatus, TKeys = never> = TStatus extends `${infer TNumber extends number}`
  ? TNumber
  : TStatus extends `${infer TFirst extends '1' | '2' | '3' | '4' | '5'}xx`
    ? Exclude<ToNumber<`${TFirst}${Digit}${Digit}`>, ToNumber<TKeys>>
    : number

/**
 * The `error` of a failed call without a body, so `if (error)` still sees the failure.
 */
export type EmptyErrorBody = { status: number; statusText: string }

export type DataOf<T> = T extends { contentType: string; data: infer TData } ? TData : T

/**
 * A response's `Headers`, whose `get` suggests the header names the spec declares. Values stay strings, as sent.
 */
export type ResponseHeaders<THeaders = unknown> = Omit<Headers, 'get'> & {
  get: (name: Extract<keyof THeaders, string> | (string & {})) => string | null
}

// The media types `streamMediaTypes` reads as a stream: a response with one of them resolves to its raw body.
type StreamContentType =
  | `text/event-stream${string}`
  | `application/jsonl${string}`
  | `application/x-ndjson${string}`
  | `application/json-seq${string}`
  | `application/${string}+json-seq${string}`

type HeadersFor<THeaders, TStatus> = ResponseHeaders<TStatus extends keyof THeaders ? THeaders[TStatus] : unknown>

export type SuccessVariant<TStatus, TEntry, TRequest, TResponse, TKeys = never, THeaders = unknown> = TEntry extends { contentType: string; data: unknown }
  ? TEntry extends { contentType: infer TContentType; data: infer TData }
    ? {
        status: ToStatusNumber<TStatus, TKeys>
        data: TContentType extends StreamContentType ? ReadableStream<Uint8Array> : TData
        error: undefined
        contentType: TContentType
        headers: HeadersFor<THeaders, TStatus>
        request: TRequest
        response: TResponse
      }
    : never
  : {
      status: ToStatusNumber<TStatus, TKeys>
      data: TEntry
      error: undefined
      contentType: string | undefined
      headers: HeadersFor<THeaders, TStatus>
      request: TRequest
      response: TResponse
    }

export type ResultByStatus<TResponses, TStatus extends keyof TResponses, TRequest, TResponse, THeaders = unknown> = TStatus extends SuccessStatusCode
  ? SuccessVariant<TStatus, TResponses[TStatus], TRequest, TResponse, keyof TResponses, THeaders>
  : {
      status: ToStatusNumber<TStatus, keyof TResponses>
      data: undefined
      error: DataOf<TResponses[TStatus]> | EmptyErrorBody
      contentType: string | undefined
      headers: HeadersFor<THeaders, TStatus>
      request: TRequest
      response: TResponse
    }

export type ResultUnion<TResponses, TRequest, TResponse, THeaders = unknown> = {
  [TStatus in keyof TResponses]: ResultByStatus<TResponses, TStatus, TRequest, TResponse, THeaders>
}[keyof TResponses]

export type SuccessResultUnion<TResponses, TRequest, TResponse, THeaders = unknown> = {
  [TStatus in Extract<keyof TResponses, SuccessStatusCode>]: ResultByStatus<TResponses, TStatus, TRequest, TResponse, THeaders>
}[Extract<keyof TResponses, SuccessStatusCode>]

/**
 * The result of a call, narrowed by `status`. With `throwOnError`, it holds only the success variants. `THeaders` keys the
 * declared response headers by status like the responses record, so `headers.get` suggests them for the narrowed status.
 */
export type RequestResult<
  TResponses,
  ThrowOnError extends boolean = true,
  TRequest = NativeRequest,
  TResponse = NativeResponse,
  THeaders = unknown,
> = ThrowOnError extends true
  ? [SuccessResultUnion<TResponses, TRequest, TResponse, THeaders>] extends [never]
    ? {
        status: number
        data: SuccessOf<TResponses>
        error: undefined
        contentType: string | undefined
        headers: ResponseHeaders
        request: TRequest
        response: TResponse
      }
    : SuccessResultUnion<TResponses, TRequest, TResponse, THeaders>
  : [ResultUnion<TResponses, TRequest, TResponse, THeaders>] extends [never]
    ? { status: number; data: undefined; error: undefined; contentType: string | undefined; headers: ResponseHeaders; request: TRequest; response: TResponse }
    : ResultUnion<TResponses, TRequest, TResponse, THeaders>

/**
 * `RequestResult` with the declared response headers by status: `RequestResultWithHeaders<ListPetsResponses, { '200': ListPetsStatus200Headers }>`.
 */
export type RequestResultWithHeaders<TResponses, THeaders, ThrowOnError extends boolean = true> = RequestResult<
  TResponses,
  ThrowOnError,
  NativeRequest,
  NativeResponse,
  THeaders
>

/**
 * A result promise whose `unwrap()` resolves to the success body.
 */
export type Unwrappable<T extends { data: unknown; error: unknown }> = Promise<T> & {
  unwrap: () => Promise<Extract<T, { error: undefined }>['data']>
}

/**
 * Adds `unwrap()` to a result promise. It rejects with `error` when the result has one.
 */
export function withUnwrap<T extends { data: unknown; error: unknown }>(promise: Promise<T>): Unwrappable<T> {
  const unwrappable = promise as Unwrappable<T>
  unwrappable.unwrap = () =>
    promise.then((result) => {
      if (result.error !== undefined) throw result.error
      return result.data as Extract<T, { error: undefined }>['data']
    })
  return unwrappable
}

export type Unwrapped<T, ThrowOnError extends boolean> = ThrowOnError extends true ? (T extends { data: infer TData } ? TData : never) : T

/**
 * What an operation returns with `returnType: 'data'`: the success body, or the full result when `throwOnError` is false.
 */
export type UnwrappedResult<
  TResponses,
  ThrowOnError extends boolean = true,
  TRequest = NativeRequest,
  TResponse = NativeResponse,
  THeaders = unknown,
> = Unwrapped<RequestResult<TResponses, ThrowOnError, TRequest, TResponse, THeaders>, ThrowOnError>

/**
 * `UnwrappedResult` with the declared response headers by status, for the full result a `throwOnError: false` call resolves to.
 */
export type UnwrappedResultWithHeaders<TResponses, THeaders, ThrowOnError extends boolean = true> = UnwrappedResult<
  TResponses,
  ThrowOnError,
  NativeRequest,
  NativeResponse,
  THeaders
>

/**
 * Resolves to the success body when `throwOnError` is true, or to the full result when it is false.
 */
export function unwrapResult<T extends { data: unknown; error: unknown }, ThrowOnError extends boolean>(
  promise: Promise<T>,
  throwOnError: ThrowOnError,
): Promise<Unwrapped<T, ThrowOnError>> {
  return promise.then((result) => (throwOnError ? result.data : result) as Unwrapped<T, ThrowOnError>)
}

/**
 * The call's `throwOnError`, or the operation's generated default when the call leaves it unset.
 */
export function resolveThrowOnError<ThrowOnError extends boolean>(throwOnError: ThrowOnError | undefined, fallback: boolean): ThrowOnError {
  return (throwOnError ?? fallback) as ThrowOnError
}

export type DataShape = { body?: unknown; cookies?: unknown; headers?: unknown; path?: unknown; query?: unknown }

export type RequestCredentials = 'omit' | 'same-origin' | 'include'

/**
 * Reads a 2xx body as this format instead of by its media type. An error body still uses its media type.
 */
export type ParseAs = 'json' | 'text' | 'blob' | 'arrayBuffer' | 'stream'

/**
 * The request content type, or `{ request, response }` to also set `Accept`.
 */
export type ContentType = string | { request?: string; response?: string }

export type Validator<T = unknown> = StandardSchemaValidator<T>



/**
 * A security scheme of a generated call, passed to the `auth` resolver. OAuth2 `flows` and `metadataUrl` (RFC 8414) and
 * the OpenID Connect `url` tell the resolver where to get a token.
 */
export type Auth = {
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect'
  scheme?: 'bearer' | 'basic'
  name?: string
  in?: 'header' | 'query' | 'cookie'
  scopes?: Array<string>
  flows?: Record<string, { authorizationUrl?: string; deviceAuthorizationUrl?: string; tokenUrl?: string; refreshUrl?: string }>
  metadataUrl?: string
  url?: string
}

/**
 * One scheme, or the schemes one requirement sends together.
 */
export type SecurityRequirement = Auth | Array<Auth>

/**
 * `user:password` for basic auth, or `undefined` to skip the scheme.
 */
export type AuthToken = string | undefined

/**
 * A static token, or a callback per scheme. The first requirement whose schemes all get a token is sent.
 */
export type AuthResolver = AuthToken | ((auth: Auth) => AuthToken | Promise<AuthToken>)

/**
 * One Server-Sent Event. `data` is parsed JSON when it parses, otherwise the raw string.
 */
export type ServerSentEvent<TData = unknown> = {
  data: TData
  event: string
  id?: string
  retry?: number
}

/**
 * An event the document types by name, plus the `id` and `retry` any event may carry.
 */
export type TypedEvent<TEvent> = TEvent & Pick<ServerSentEvent, 'id' | 'retry'>

/**
 * Per-call options of a stream operation.
 */
export type EventStreamOptions = {
  /**
   * The most characters one event or JSON line may hold. A larger one throws a `RangeError`, and `Infinity` turns the limit off.
   * @default 16777216
   */
  maxEventSize?: number | undefined
  /**
   * Ends the stream when an event's raw `data` or a JSON line equals this value, such as `[DONE]`.
   */
  terminator?: string | undefined
  /**
   * Maps each Server-Sent Event before validation.
   */
  transform?: (event: ServerSentEvent) => ServerSentEvent
  /**
   * What `validator.response` checks on each event: the payload (`data`) or the whole event (`event`).
   */
  eventShape?: 'event' | 'data'
  /**
   * Keeps each Server-Sent Event's `data` as the raw text instead of JSON-parsing it. The generated client sets it when the
   * document types `data` as a string. A list of event names keeps it for those events only.
   */
  rawData?: boolean | Array<string> | undefined
}

export type RequestConfig<TBody = unknown, TRequest = NativeRequest, TResponse = NativeResponse> = {
  baseURL?: string
  url?: string
  method?: HttpMethod
  path?: unknown
  query?: unknown
  /**
   * Alias of `query`.
   */
  params?: unknown
  cookies?: unknown
  body?: TBody
  headers?: unknown
  styles?: Styles | undefined
  signal?: AbortSignal | undefined
  credentials?: RequestCredentials | undefined
  options?: NativeOptions | undefined
  contentType?: ContentType
  parseAs?: ParseAs
  throwOnError?: boolean
  client?: ClientInstance<TRequest, TResponse>
  transport?: Transport<TRequest, TResponse>
  serializer?: Serializers
  /**
   * Merged per key over the client's media types.
   */
  mediaTypes?: MediaTypes
  /**
   * `error` takes one validator, or a map by status such as `{ 404: schema, '5xx': schema, default: schema }`.
   */
  validator?: {
    request?: Validator
    path?: Validator
    query?: Validator
    headers?: Validator
    cookies?: Validator
    response?: Validator
    error?: Validator | Record<string, Validator>
  }
  onValidationError?: ValidationErrorHandler
  validate?: ValidateOption
  security?: Array<SecurityRequirement>
  auth?: AuthResolver
}

/**
 * The options of a generated operation: its typed request groups plus the call config.
 */
export type Options<TData extends DataShape, ThrowOnError extends boolean = true, TRequest = NativeRequest, TResponse = NativeResponse> = Omit<
  RequestConfig<unknown, TRequest, TResponse>,
  keyof DataShape | 'url'
> &
  TData & {
    client?: ClientInstance<TRequest, TResponse>
    throwOnError?: ThrowOnError
  }

export type StreamOptions<TData extends DataShape, ThrowOnError extends boolean = true> = Options<TData, ThrowOnError> & EventStreamOptions

/**
 * Config shared by every call of a client. A call's own config overrides it.
 */
export type ClientConfig<TRequest = NativeRequest, TResponse = NativeResponse> = {
  baseURL?: string
  headers?: HeadersInit
  credentials?: RequestCredentials
  options?: NativeOptions
  throwOnError?: boolean
  transport?: Transport<TRequest, TResponse>
  serializer?: Serializers
  /**
   * Merged per key over `defaultMediaTypes`.
   */
  mediaTypes?: MediaTypes
  onValidationError?: ValidationErrorHandler
  validate?: ValidateOption
  auth?: AuthResolver
}

/**
 * The request a transport sends, with its URL, headers, body, and auth already resolved.
 */
export type ResolvedRequest = {
  url: string
  method: string
  headers: Record<string, string>
  body?: RequestBody | undefined
  signal?: AbortSignal | undefined
  credentials?: RequestCredentials | undefined
  options?: NativeOptions | undefined
  /**
   * Read the response as a stream. A transport that buffers bodies, such as axios, must stream it.
   */
  stream?: boolean
}

/**
 * A transport's `Response` with the native request and response that results and errors carry.
 */
export type TransportResult<TRequest = NativeRequest, TResponse = NativeResponse> = {
  webResponse: Response
  request: TRequest
  response: TResponse
}

/**
 * Sends a resolved request and returns its `Response` with the body unread. The client decodes it.
 */
export type Transport<TRequest = NativeRequest, TResponse = NativeResponse> = (
  request: ResolvedRequest,
) => Promise<Response | TransportResult<TRequest, TResponse>>

/**
 * What a response interceptor gets: the decoded body with the status, headers, and native objects.
 */
export type DecodedResponse<TData = unknown, TRequest = NativeRequest, TResponse = NativeResponse> = {
  data: TData
  status: number
  statusText: string
  headers: Headers
  contentType?: string | undefined
  request: TRequest
  response: TResponse
}

export type InterceptorFn<T, TContext = never, TResult = T> = (value: T, context?: TContext) => TResult | Promise<TResult>

export type InterceptorStack<T, TContext = never, TResult = T> = {
  use: (fn: InterceptorFn<T, TContext, TResult>) => number
  eject: (id: number) => void
  update: (id: number, fn: InterceptorFn<T, TContext, TResult>) => void
  run: (value: T, context?: TContext) => Promise<T>
}

export type Interceptors<TRequest = NativeRequest, TResponse = NativeResponse> = {
  request: InterceptorStack<ResolvedRequest, RequestConfig<unknown, TRequest, TResponse>>
  response: InterceptorStack<DecodedResponse<unknown, TRequest, TResponse>, RequestConfig<unknown, TRequest, TResponse>>
  /**
   * Sees every failure: a `ResponseError`, a network error, an abort, or a validation error. Return another error to throw it instead.
   */
  error: InterceptorStack<ResponseError<unknown, TRequest, TResponse> | Error, RequestConfig<unknown, TRequest, TResponse>, Error | void>
}

export type UrlConfig = Pick<RequestConfig, 'baseURL' | 'url' | 'path' | 'query' | 'params' | 'serializer' | 'styles'>

type StreamParts<TEvent> = AsyncIterable<TEvent> & {
  stream: AsyncGenerator<TEvent>
  /**
   * The last event ID the server sent, for a `Last-Event-ID` header on a new call.
   */
  readonly lastEventId: string
}

type WithEvents<TResult, TEvent> = TResult extends { error: undefined } ? Omit<TResult, 'data'> & { data: AsyncGenerator<TEvent> } : TResult

/**
 * The result of a stream call. Iterate it, or its `data`, for the items. A failed call yields none.
 */
export type StreamResult<
  TResponses,
  ThrowOnError extends boolean = true,
  TEvent = ServerSentEvent<SuccessOf<TResponses>>,
  TRequest = NativeRequest,
  TResponse = NativeResponse,
  THeaders = unknown,
> = WithEvents<RequestResult<TResponses, ThrowOnError, TRequest, TResponse, THeaders>, TEvent> & StreamParts<TEvent>

/**
 * `StreamResult` with the declared response headers by status: `StreamResultWithHeaders<StreamEventsResponses, { '200': StreamEventsStatus200Headers }>`.
 */
export type StreamResultWithHeaders<TResponses, THeaders, ThrowOnError extends boolean = true, TEvent = ServerSentEvent<SuccessOf<TResponses>>> = StreamResult<
  TResponses,
  ThrowOnError,
  TEvent,
  NativeRequest,
  NativeResponse,
  THeaders
>

/**
 * What a stream operation returns with `returnType: 'data'`.
 */
export type UnwrappedStreamResult<
  TResponses,
  ThrowOnError extends boolean = true,
  TEvent = ServerSentEvent<SuccessOf<TResponses>>,
  THeaders = unknown,
> = Unwrapped<StreamResult<TResponses, ThrowOnError, TEvent, NativeRequest, NativeResponse, THeaders>, ThrowOnError>

/**
 * `UnwrappedStreamResult` with the declared response headers by status, for the full result a `throwOnError: false` call resolves to.
 */
export type UnwrappedStreamResultWithHeaders<
  TResponses,
  THeaders,
  ThrowOnError extends boolean = true,
  TEvent = ServerSentEvent<SuccessOf<TResponses>>,
> = UnwrappedStreamResult<TResponses, ThrowOnError, TEvent, THeaders>

/**
 * A client. Call it to send a request.
 */
export type ClientInstance<TRequest = NativeRequest, TResponse = NativeResponse> = {
  <TResponses = unknown, ThrowOnError extends boolean = true, THeaders = unknown>(
    config: RequestConfig<unknown, TRequest, TResponse> & { throwOnError?: ThrowOnError },
  ): Promise<RequestResult<TResponses, ThrowOnError, TRequest, TResponse, THeaders>>
  /**
   * Sends the request and reads a 2xx body item by item. A body whose media type cannot stream throws a `TypeError`.
   */
  stream: <TResponses = unknown, ThrowOnError extends boolean = true, TItem = ServerSentEvent<SuccessOf<TResponses>>, THeaders = unknown>(
    config: RequestConfig<unknown, TRequest, TResponse> & EventStreamOptions & { throwOnError?: ThrowOnError },
  ) => Promise<StreamResult<TResponses, ThrowOnError, TItem, TRequest, TResponse, THeaders>>
  getConfig: () => ClientConfig<TRequest, TResponse>
  setConfig: (config: ClientConfig<TRequest, TResponse>) => ClientConfig<TRequest, TResponse>
  getUrl: (config: UrlConfig) => string
  interceptors: Interceptors<TRequest, TResponse>
  /**
   * A client with this config and no interceptors.
   */
  createClient: (config?: ClientConfig<TRequest, TResponse>) => ClientInstance<TRequest, TResponse>
  /**
   * A client with this config that runs this client's interceptors before its own.
   */
  extend: (config?: ClientConfig<TRequest, TResponse>) => ClientInstance<TRequest, TResponse>
}

/**
 * Thrown for a non-2xx response when `throwOnError` is true.
 */
export class ResponseError<TError = unknown, TRequest = NativeRequest, TResponse = NativeResponse> extends Error {
  data: TError
  status: number
  statusText: string
  contentType: string | undefined
  /**
   * The response's `Headers`, the same on every transport.
   */
  headers: ResponseHeaders
  request: TRequest
  response: TResponse

  constructor(config: {
    data: TError
    status: number
    statusText: string
    contentType?: string | undefined
    headers?: Headers | undefined
    request: TRequest
    response: TResponse
    method?: string | undefined
    url?: string | undefined
  }) {
    // The query and hash stay out of the message, so secrets in them do not reach logs.
    const cleanUrl = config.url?.split(/[?#]/)[0]
    const target = [config.method, cleanUrl].filter(Boolean).join(' ')
    const statusText = config.statusText?.trim()
    super(`${target ? `${target} failed` : 'Request failed'} with status ${config.status}${statusText ? ` ${statusText}` : ''}`)
    this.name = 'ResponseError'
    this.data = config.data
    this.status = config.status
    this.statusText = config.statusText
    this.contentType = config.contentType
    this.headers = config.headers ?? new Headers()
    this.request = config.request
    this.response = config.response
  }

  /**
   * Matches on `name`, since every generated client has its own `ResponseError` class.
   */
  static is(error: unknown): error is ResponseError<unknown, unknown, unknown> {
    return error instanceof Error && error.name === 'ResponseError'
  }
}

export type ResponseErrorConfig<TError = unknown> = ResponseError<TError>

type ErrorStatus<TResponses> = Exclude<keyof TResponses, SuccessStatusCode>

/**
 * The `ResponseError` an operation throws. Checking `status` narrows `data` to that status's body, and `headers.get` to
 * the header names in `THeaders`, the same record `RequestResult` takes.
 */
export type ResponseErrorOf<TResponses, TRequest = NativeRequest, TResponse = NativeResponse, THeaders = unknown> = [ErrorStatus<TResponses>] extends [never]
  ? ResponseError<unknown, TRequest, TResponse>
  : {
      [TStatus in ErrorStatus<TResponses>]: ResponseError<DataOf<TResponses[TStatus]>, TRequest, TResponse> & {
        status: ToStatusNumber<TStatus, keyof TResponses>
        headers: HeadersFor<THeaders, TStatus>
      }
    }[ErrorStatus<TResponses>]

/**
 * Narrows a caught error to the `ResponseError` of the operation whose responses record you pass.
 *
 * @example
 * ```ts
 * try {
 *   await getPetById({ path: { petId: 7 } })
 * } catch (error) {
 *   if (isResponseError<GetPetByIdResponses>(error) && error.status === 404) error.data // GetPetById404
 * }
 * ```
 */
export function isResponseError<TResponses = unknown, TRequest = NativeRequest, TResponse = NativeResponse, THeaders = unknown>(
  error: unknown,
): error is ResponseErrorOf<TResponses, TRequest, TResponse, THeaders> {
  return ResponseError.is(error)
}

function headerEntries(headers: object): Array<[string, unknown]> {
  if (Array.isArray(headers)) return headers as Array<[string, unknown]>
  return headers instanceof Headers ? [...headers] : Object.entries(headers)
}

function serializeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {}
  const entries = headerEntries(headers)
  const result: Record<string, string> = {}
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue
    // A `Date` is a unit like in the parameter serializers, not an object to send as JSON.
    result[key] = typeof value === 'object' && !(value instanceof Date) ? JSON.stringify(value) : toValue(value)
  }
  return result
}

function collectHeadersCaseInsensitive(...sources: Array<unknown>): Record<string, unknown> {
  const keys = new Map<string, string>()
  const result: Record<string, unknown> = {}
  for (const source of sources) {
    if (!source) continue
    const entries = headerEntries(source)
    for (const [key, value] of entries) {
      if (value === undefined || value === null) continue
      const lowerCase = key.toLowerCase()
      const previous = keys.get(lowerCase)
      if (previous !== undefined) delete result[previous]
      keys.set(lowerCase, key)
      result[key] = value
    }
  }
  return result
}

/**
 * The value of a header, matched by name in any letter case.
 */
export function getHeader(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? headers[key] : undefined
}

function deleteHeader(headers: Record<string, string>, name: string): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) delete headers[key]
  }
}

function serializeUrl({
  parts,
  pathParams,
  query,
  serializers,
  styles,
}: {
  parts: Array<string | undefined>
  pathParams: Record<string, unknown>
  query: Record<string, unknown>
  serializers: Serializers
  styles?: Styles | undefined
}): string {
  const path = parts
    // A base URL that ends in `/` would give `//` before a path that starts with one.
    .reduce<string>((url, part) => (part ? url + (url.endsWith('/') && part.startsWith('/') ? part.slice(1) : part) : url), '')
    .replace(/\{([^{}]+)\}/g, (_, key: string) => requireSerializer(serializers, 'path')({ name: key, value: pathParams[key], options: styles?.path?.[key] }))
  // A query without values needs no serializer.
  const hasQuery = Object.values(query).some((value) => value !== undefined && value !== null)
  const search = serializers.query || hasQuery ? requireSerializer(serializers, 'query')(query, styles?.query) : ''
  return path + (search ? `?${search}` : '')
}

export function createInterceptorStack<T, TContext = never, TResult = T>(): InterceptorStack<T, TContext, TResult> {
  let entries: Array<{ id: number; fn: InterceptorFn<T, TContext, TResult> }> = []
  let counter = 0
  return {
    use(fn) {
      const id = ++counter
      entries.push({ id, fn })
      return id
    },
    eject(id) {
      entries = entries.filter((entry) => entry.id !== id)
    },
    update(id, fn) {
      const entry = entries.find((item) => item.id === id)
      if (entry) entry.fn = fn
    },
    async run(value, context) {
      let result = value
      for (const entry of entries) {
        const next = await entry.fn(result, context)
        if (next !== undefined) result = next as T
      }
      return result
    },
  }
}

function placeToken({ scheme, token, headers, query }: { scheme: Auth; token: string; headers: Record<string, string>; query: Record<string, unknown> }): void {
  if (scheme.type !== 'apiKey') {
    if (getHeader(headers, 'Authorization') === undefined) {
      headers['Authorization'] = scheme.scheme === 'basic' ? `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(token)))}` : `Bearer ${token}`
    }
    return
  }
  const name = scheme.name ?? 'Authorization'
  if (scheme.in === 'query') {
    if (query[name] === undefined) query[name] = token
    return
  }
  if (scheme.in === 'cookie') {
    appendCookie(headers, `${name}=${token}`)
    return
  }
  if (getHeader(headers, name) === undefined) headers[name] = token
}

/**
 * Adds the tokens of the first security requirement whose schemes all get one to `headers` and `query`.
 */
export async function resolveAuth(params: {
  security: Array<SecurityRequirement> | undefined
  auth: AuthResolver | undefined
  headers: Record<string, string>
  query: Record<string, unknown>
}): Promise<void> {
  const { security, auth, headers, query } = params
  if (!security?.length || auth === undefined) return

  for (const requirement of security) {
    const schemes = Array.isArray(requirement) ? requirement : [requirement]
    const tokens = await Promise.all(schemes.map((scheme) => (typeof auth === 'function' ? auth(scheme) : auth)))
    if (tokens.some((token) => token === undefined)) continue
    schemes.forEach((scheme, index) => placeToken({ scheme, token: tokens[index]!, headers, query }))
    return
  }
}

function appendCookie(headers: Record<string, string>, cookie: string): void {
  const key = Object.keys(headers).find((name) => name.toLowerCase() === 'cookie') ?? 'Cookie'
  headers[key] = [headers[key], cookie].filter(Boolean).join('; ')
}

/**
 * The `RequestInit` of a resolved request, for `fetch` or a library that takes the same init, such as ky.
 *
 * @example
 * ```ts
 * client.setConfig({ transport: (request) => ky(request.url, { ...toRequestInit(request), throwHttpErrors: false, retry: 0, timeout: false }) })
 * ```
 */
export function toRequestInit(request: ResolvedRequest): RequestInit {
  const init: RequestInit = {
    ...request.options,
    method: request.method,
    headers: request.headers,
    body: request.body ?? null,
    signal: request.signal ?? null,
  }
  if (request.credentials) init.credentials = request.credentials
  return init
}

function pickErrorValidator(error: Validator | Record<string, Validator> | undefined, status: number): Validator | undefined {
  if (!error || '~standard' in error) return error as Validator | undefined
  const range = String(status)[0]
  return error[String(status)] ?? error[`${range}xx`] ?? error['default']
}

// Checks the shape, so a `Response` from another realm or a polyfill counts too.
function isResponse(value: unknown): value is Response {
  return typeof (value as Response | undefined)?.arrayBuffer === 'function'
}

// Leaves out the body, which was already sent. A relative URL keeps the resolved request.
function toNativeRequest(request: ResolvedRequest): Request | ResolvedRequest {
  try {
    return new Request(request.url, { ...toRequestInit(request), body: null })
  } catch {
    return request
  }
}

async function readAs(response: Response, parseAs: Exclude<ParseAs, 'json'>): Promise<unknown> {
  switch (parseAs) {
    case 'text':
      return response.text()
    case 'blob':
      return response.blob()
    case 'arrayBuffer':
      return response.arrayBuffer()
    case 'stream':
      return response.body ?? undefined
  }
}

function isEmpty(response: Response, method: string): boolean {
  return [204, 205, 304].includes(response.status) || method === 'HEAD' || !response.body || response.headers.get('Content-Length') === '0'
}

function mergeConfig<T extends { headers?: HeadersInit; mediaTypes?: MediaTypes; serializer?: Serializers }>(config: T, next: T): T {
  return {
    ...config,
    ...next,
    headers: { ...serializeHeaders(config.headers), ...serializeHeaders(next.headers) },
    mediaTypes: { ...config.mediaTypes, ...next.mediaTypes },
    serializer: { ...config.serializer, ...next.serializer },
  }
}

// The serializer for `name`, which `.kubb/client.ts` registers for a spec that needs it.
function requireSerializer<TName extends keyof Serializers>(serializers: Serializers, name: TName): NonNullable<Serializers[TName]> {
  const serializer = serializers[name]
  if (!serializer) throw new TypeError(`Cannot send ${name} parameters without a serializer, register serializer.${name} on the client.`)
  return serializer
}

async function resolveRequest<TBody, TRequest, TResponse>({
  config,
  requestConfig,
}: {
  config: ClientConfig<TRequest, TResponse>
  requestConfig: RequestConfig<TBody, TRequest, TResponse>
}): Promise<{ request: ResolvedRequest; mediaTypes: MediaTypes; validate: ValidateOption | undefined; responseContentType: string | undefined }> {
  const serializers = { ...config.serializer, ...requestConfig.serializer }
  const mediaTypes = { ...defaultMediaTypes, ...config.mediaTypes, ...requestConfig.mediaTypes }
  const onValidationError = requestConfig.onValidationError ?? config.onValidationError
  const validate = requestConfig.validate ?? config.validate
  const validationContext = { direction: 'request', method: requestConfig.method, url: requestConfig.url } as const

  const paramValues = {
    path: { ...(requestConfig.path as Record<string, unknown> | undefined) },
    query: { ...((requestConfig.query ?? requestConfig.params) as Record<string, unknown> | undefined) },
    headers: collectHeadersCaseInsensitive(config.headers, requestConfig.headers),
    cookies: requestConfig.cookies as Record<string, unknown> | undefined,
  }
  const [validatedPath, validatedQuery, validatedHeaders, validatedCookies] = await Promise.all(
    (['path', 'query', 'headers', 'cookies'] as const).map((source) =>
      runValidator({
        validator: isValidationEnabled(validate, 'params') && paramValues[source] !== undefined ? requestConfig.validator?.[source] : undefined,
        value: paramValues[source],
        context: { ...validationContext, source },
        onValidationError,
      }),
    ),
  )

  const headerValues = validatedHeaders as HeadersInit | undefined
  const headers = serializeHeaders(serializers.header ? serializers.header(headerValues, requestConfig.styles?.header) : headerValues)
  const contentType = requestConfig.contentType
  const { request: requestContentTypeOption, response: responseContentType } = typeof contentType === 'string' ? { request: contentType } : (contentType ?? {})
  if (responseContentType && getHeader(headers, 'accept') === undefined) {
    headers['Accept'] = responseContentType
  }

  const query: Record<string, unknown> = { ...(validatedQuery as Record<string, unknown> | undefined) }

  await resolveAuth({
    security: requestConfig.security,
    auth: requestConfig.auth ?? config.auth,
    headers,
    query,
  })

  const cookies = validatedCookies as Record<string, unknown> | undefined
  // An object with only nullish values sends nothing, so it needs no serializer.
  if (cookies && Object.values(cookies).some((value) => value !== undefined && value !== null)) {
    const cookie = requireSerializer(serializers, 'cookie')(cookies, requestConfig.styles?.cookie)
    if (cookie) appendCookie(headers, cookie)
  }

  const validatedBody = await runValidator({
    validator: isValidationEnabled(validate, 'request') ? requestConfig.validator?.request : undefined,
    value: requestConfig.body,
    context: { ...validationContext, source: 'body' },
    onValidationError,
  })
  const requestContentType = requestContentTypeOption ?? getHeader(headers, 'content-type') ?? (isEncodedBody(validatedBody) ? undefined : 'application/json')
  const body =
    // `null` is a valid JSON body, such as a merge patch that clears a resource.
    validatedBody === undefined
      ? undefined
      : resolveMediaType({ mediaTypes, contentType: requestContentType, use: 'encode' })?.encode?.(validatedBody, {
          contentType: requestContentType ?? '',
          signal: requestConfig.signal,
          config: requestConfig,
        })
  if (body !== undefined && requestContentType && getHeader(headers, 'content-type') !== requestContentType) {
    deleteHeader(headers, 'content-type')
    headers['Content-Type'] = requestContentType
  }
  // The transport sets the multipart boundary.
  if (body instanceof FormData) deleteHeader(headers, 'content-type')

  const url = serializeUrl({
    parts: [requestConfig.baseURL ?? config.baseURL, requestConfig.url],
    pathParams: (validatedPath ?? {}) as Record<string, unknown>,
    query,
    serializers,
    styles: requestConfig.styles,
  })

  const options = config.options || requestConfig.options ? { ...config.options, ...requestConfig.options } : undefined
  const accept = getHeader(headers, 'accept')

  return {
    mediaTypes,
    validate,
    responseContentType,
    request: {
      url,
      method: (requestConfig.method ?? 'GET').toUpperCase(),
      headers,
      body,
      signal: signalOf({ signal: requestConfig.signal, options }),
      credentials: requestConfig.credentials ?? config.credentials,
      options,
      stream:
        requestConfig.parseAs === 'stream' || Boolean(accept?.split(',').some((type) => resolveMediaType({ mediaTypes, contentType: type, use: 'stream' }))),
    },
  }
}

// A signal in `options` counts too, since every transport spreads `options` under the resolved fields.
function signalOf(config: { signal?: AbortSignal | undefined; options?: unknown }): AbortSignal | undefined {
  return config.signal ?? (config.options as { signal?: AbortSignal } | undefined)?.signal
}

async function* readItems({
  items,
  validateItem,
  signal,
}: {
  items: AsyncIterable<unknown>
  validateItem: (item: unknown) => unknown
  signal: AbortSignal | undefined
}): AsyncGenerator<unknown> {
  try {
    for await (const item of items) {
      yield await validateItem(item)
      if (signal?.aborted) throw signal.reason
    }
  } catch (error) {
    // A transport reports an abort in its own error type, such as axios's `CanceledError`.
    throw signal?.aborted ? signal.reason : error
  }
}

type InterceptorRuns<TRequest, TResponse> = {
  request: (value: ResolvedRequest, context?: RequestConfig<unknown, TRequest, TResponse>) => Promise<ResolvedRequest>
  response: (
    value: DecodedResponse<unknown, TRequest, TResponse>,
    context?: RequestConfig<unknown, TRequest, TResponse>,
  ) => Promise<DecodedResponse<unknown, TRequest, TResponse>>
  error: (value: Error, context?: RequestConfig<unknown, TRequest, TResponse>) => Promise<Error>
}

/**
 * Creates a client that sends through `defaultTransport`.
 */
export function createClientCore<TRequest = NativeRequest, TResponse = NativeResponse>(
  options: { defaultTransport: Transport<TRequest, TResponse>; parent?: InterceptorRuns<TRequest, TResponse> } & ClientConfig<TRequest, TResponse>,
): ClientInstance<TRequest, TResponse> {
  const { defaultTransport, parent, ...initialConfig } = options
  let config: ClientConfig<TRequest, TResponse> = { ...initialConfig }

  const own: Interceptors<TRequest, TResponse> = {
    request: createInterceptorStack(),
    response: createInterceptorStack(),
    error: createInterceptorStack(),
  }
  const run: InterceptorRuns<TRequest, TResponse> = {
    request: async (value, context) => own.request.run(parent ? await parent.request(value, context) : value, context),
    response: async (value, context) => own.response.run(parent ? await parent.response(value, context) : value, context),
    error: async (value, context) => own.error.run(parent ? await parent.error(value, context) : value, context),
  }

  async function send(requestConfig: RequestConfig<unknown, TRequest, TResponse> & EventStreamOptions, streaming: boolean) {
    const transport = requestConfig.transport ?? config.transport ?? defaultTransport
    // Read before the first await, so a `setConfig` during the call does not change it.
    const throwOnError = requestConfig.throwOnError ?? config.throwOnError ?? true
    const onValidationError = requestConfig.onValidationError ?? config.onValidationError
    const { request, mediaTypes, validate, responseContentType } = await resolveRequest({ config, requestConfig })
    if (streaming) {
      request.stream = true
      // `client.stream` without a response content type would otherwise ask for the default, often JSON.
      if (getHeader(request.headers, 'accept') === undefined) request.headers['Accept'] = 'text/event-stream'
    }

    const resolvedRequest = await run.request(request, requestConfig)
    const sent = await transport(resolvedRequest)
    const {
      webResponse,
      request: nativeRequest,
      response: nativeResponse,
    } = isResponse(sent) ? { webResponse: sent, request: toNativeRequest(resolvedRequest) as TRequest, response: sent as TResponse & Response } : sent

    const status = webResponse.status
    const isSuccess = status >= 200 && status < 300
    const header = webResponse.headers.get('Content-Type')
    const contentType = header ?? (isSuccess ? responseContentType : undefined) ?? '*/*'
    const cursor = { lastEventId: '' }
    const context: MediaTypeContext = { contentType, status, signal: resolvedRequest.signal, config: requestConfig, cursor }
    const streamType = isSuccess ? resolveMediaType({ mediaTypes, contentType, use: 'stream' }) : undefined
    const decode = async (): Promise<unknown> => {
      if (isEmpty(webResponse, resolvedRequest.method)) return undefined
      if (streamType) return webResponse.body
      const parseAs = isSuccess ? requestConfig.parseAs : undefined
      if (parseAs && parseAs !== 'json') return readAs(webResponse, parseAs)
      // `parseAs: 'json'` uses the registered JSON handler, so a lenient one applies.
      return resolveMediaType({ mediaTypes, contentType: parseAs === 'json' ? 'application/json' : contentType, use: 'decode' })?.decode?.(webResponse, context)
    }

    const result = await run.response(
      {
        data: await decode(),
        status,
        statusText: webResponse.statusText,
        headers: webResponse.headers,
        contentType: baseContentType(header),
        request: nativeRequest,
        response: nativeResponse,
      },
      requestConfig,
    )

    const validator = requestConfig.validator
    const resultSuccess = result.status >= 200 && result.status < 300
    const direction = resultSuccess ? 'response' : 'error'
    const validationContext = { direction, source: 'body', method: resolvedRequest.method, url: resolvedRequest.url, status: result.status } as const
    const validatorFor = isValidationEnabled(validate, direction)
      ? resultSuccess
        ? validator?.response
        : pickErrorValidator(validator?.error, result.status)
      : undefined
    const rawStream = result.data instanceof ReadableStream
    const readsItems = streaming && resultSuccess && streamType?.stream !== undefined && rawStream

    if (streaming && resultSuccess && !readsItems && result.data != null) {
      // Release the connection, since nobody reads this body.
      if (rawStream) await (result.data as ReadableStream).cancel().catch(() => {})
      // `cause` is set afterwards, since the constructor option needs the ES2022 library.
      const error: TypeError & { cause?: unknown } = new TypeError(`Expected a streamed body, got ${result.contentType ?? 'a body without a content type'}`)
      error.cause = result.data
      throw error
    }

    const data = rawStream ? result.data : await runValidator({ validator: validatorFor, value: result.data, context: validationContext, onValidationError })
    if (!resultSuccess && throwOnError) {
      throw new ResponseError({
        data,
        status: result.status,
        statusText: result.statusText,
        contentType: result.contentType,
        headers: result.headers,
        request: result.request,
        response: result.response,
        method: resolvedRequest.method,
        url: resolvedRequest.url,
      })
    }

    const validateItem = async (item: unknown) => {
      if (!validatorFor) return item
      const validate = (value: unknown) => runValidator({ validator: validatorFor, value, context: validationContext, onValidationError })
      if (requestConfig.eventShape === 'data') {
        const event = item as ServerSentEvent
        return { ...event, data: await validate(event.data) }
      }
      // Merged over the event, since the schema may not declare `id` and `retry`.
      if (requestConfig.eventShape === 'event') return { ...(item as object), ...((await validate(item)) as object) }
      return validate(item)
    }
    const items = readsItems && streamType?.stream && result.data instanceof ReadableStream ? streamType.stream(result.data, context) : undefined
    return {
      cursor,
      items: readItems({ items: items ?? emptyItems(), validateItem, signal: resolvedRequest.signal }),
      result: {
        status: result.status,
        data: resultSuccess ? data : undefined,
        error: resultSuccess
          ? undefined
          : data == null || data === ''
            ? ({ status: result.status, statusText: result.statusText } satisfies EmptyErrorBody)
            : data,
        contentType: result.contentType,
        headers: result.headers,
        request: result.request,
        response: result.response,
      },
    }
  }

  async function call<T>(requestConfig: RequestConfig<unknown, TRequest, TResponse>, work: () => Promise<T>): Promise<T> {
    const signal = signalOf(requestConfig)
    try {
      return await work()
    } catch (caught) {
      const error: unknown = signal?.aborted ? signal.reason : caught
      throw error instanceof Error ? await run.error(error, requestConfig) : error
    }
  }

  const client = (<TResponses, ThrowOnError extends boolean, THeaders>(requestConfig: RequestConfig<unknown, TRequest, TResponse>) =>
    call(
      requestConfig,
      async () => (await send(requestConfig, false)).result as RequestResult<TResponses, ThrowOnError, TRequest, TResponse, THeaders>,
    )) as ClientInstance<TRequest, TResponse>

  client.stream = <TResponses, ThrowOnError extends boolean, TItem, THeaders>(
    requestConfig: RequestConfig<unknown, TRequest, TResponse> & EventStreamOptions,
  ) =>
    call(requestConfig, async () => {
      const { result, items, cursor } = await send(requestConfig, true)
      const stream = items as AsyncGenerator<TItem>
      const streamed = {
        ...result,
        stream,
        data: result.error === undefined ? stream : undefined,
        get lastEventId() {
          return cursor.lastEventId
        },
        [Symbol.asyncIterator]: () => stream,
      }
      return streamed as unknown as StreamResult<TResponses, ThrowOnError, TItem, TRequest, TResponse, THeaders>
    })

  client.getConfig = () => config
  client.setConfig = (next) => {
    config = mergeConfig(config, next)
    return config
  }
  client.getUrl = (requestConfig) => {
    const query: Record<string, unknown> = { ...((requestConfig.query ?? requestConfig.params) as Record<string, unknown> | undefined) }
    return serializeUrl({
      parts: [requestConfig.baseURL ?? config.baseURL, requestConfig.url],
      pathParams: (requestConfig.path ?? {}) as Record<string, unknown>,
      query,
      serializers: { ...config.serializer, ...requestConfig.serializer },
      styles: requestConfig.styles,
    })
  }
  client.interceptors = own
  client.createClient = (next = {}) => createClientCore({ defaultTransport, ...mergeConfig(config, next) })
  client.extend = (next = {}) => createClientCore({ defaultTransport, parent: run, ...mergeConfig(config, next) })

  return client
}

async function* emptyItems(): AsyncGenerator<unknown> {}

/**
 * A client created on first use, so importing an operation runs no setup. Config set before that is passed to `create`.
 */
export function createLazyClient<TRequest = NativeRequest, TResponse = NativeResponse>(
  create: (config: ClientConfig<TRequest, TResponse>) => ClientInstance<TRequest, TResponse>,
): ClientInstance<TRequest, TResponse> {
  let instance: ClientInstance<TRequest, TResponse> | undefined
  let pending: ClientConfig<TRequest, TResponse> = {}
  const get = () => (instance ??= create(pending))

  const client = (<TResponses, ThrowOnError extends boolean>(requestConfig: RequestConfig<unknown, TRequest, TResponse> & { throwOnError?: ThrowOnError }) =>
    get()<TResponses, ThrowOnError>(requestConfig)) as ClientInstance<TRequest, TResponse>
  client.stream = (requestConfig) => get().stream(requestConfig)
  client.getConfig = () => instance?.getConfig() ?? pending
  client.setConfig = (next) => (instance ? instance.setConfig(next) : (pending = mergeConfig(pending, next)))
  client.getUrl = (requestConfig) => get().getUrl(requestConfig)
  client.createClient = (next) => get().createClient(next)
  client.extend = (next) => get().extend(next)
  Object.defineProperty(client, 'interceptors', { get: () => get().interceptors, enumerable: true })
  return client
}
