export type HeaderValue = string | number | boolean | null | undefined | object
export type HeadersInit = Array<[string, HeaderValue]> | Record<string, HeaderValue>

/**
 * A body `fetch` accepts, read from `RequestInit` so a project without the `dom` lib still has it.
 */
export type RequestBody = NonNullable<RequestInit['body']>

export type HttpMethod = 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'QUERY' | 'TRACE' | (string & {})

/**
 * The OpenAPI query style. `form` is the default.
 */
export type QueryStyle = 'form' | 'spaceDelimited' | 'pipeDelimited' | 'deepObject'

export type SerializationStyle<TStyle = string> = {
  style?: TStyle
  explode?: boolean
  allowReserved?: boolean
}

/**
 * The media type of a parameter described with `content`. JSON sends one JSON-encoded value.
 */
export type ParamContentType = {
  contentType?: string
}

/**
 * `querystring` marks an OpenAPI 3.2 `in: querystring` parameter, sent as the whole query string.
 */
export type QueryParamStyle = SerializationStyle<QueryStyle> & ParamContentType & { querystring?: boolean }

/**
 * Turns the query object into a search string, following each parameter's OpenAPI style when given.
 */
export type QuerySerializer = (params: Record<string, unknown>, options?: Record<string, QueryParamStyle>) => string

/**
 * `cookie` is the OpenAPI 3.2 style that sends values as they are, without percent-encoding (RFC 6265). `form` is the default.
 */
export type CookieParamStyle = ParamContentType & {
  style?: 'form' | 'cookie'
  explode?: boolean
}

export type HeaderParamStyle = ParamContentType & {
  explode?: boolean
}

/**
 * The OpenAPI `encoding` of one form body property. `contentType` sets a multipart part's media type.
 */
export type BodyEncoding = SerializationStyle<QueryStyle> & {
  contentType?: string
}

/**
 * The OpenAPI path style. `simple` is the default.
 */
export type PathStyle = 'simple' | 'label' | 'matrix'

export type PathParamStyle = SerializationStyle<PathStyle>

/**
 * Joins the cookie parameters of a call into a `Cookie` header value.
 */
export type CookieSerializer = (cookies: Record<string, unknown>, styles?: Record<string, CookieParamStyle>) => string

/**
 * Serializes the header parameters of a call that are arrays or objects.
 */
export type HeaderSerializer = (headers: HeadersInit | undefined, styles?: Record<string, HeaderParamStyle>) => HeadersInit | undefined

/**
 * Turns one path parameter into its URL segment.
 */
export type PathSerializer = (args: { name: string; value: unknown; options?: PathParamStyle | undefined }) => string

/**
 * Parameter serializers, set per client or per call. `.kubb/client.ts` registers the ones the spec needs. Bodies are
 * encoded by `mediaTypes`.
 */
export type Serializers = {
  query?: QuerySerializer
  path?: PathSerializer
  /**
   * Turns array and object header values into strings. Without one, such a value is sent as JSON.
   */
  header?: HeaderSerializer
  /**
   * Sends the `cookies` of a call. Kubb registers `serializeCookies` when the spec has a cookie parameter.
   */
  cookie?: CookieSerializer
}

/**
 * The OpenAPI styles of a generated call's parameters, by location and name. `body` holds the form `encoding`.
 */
export type Styles = {
  path?: Record<string, PathParamStyle>
  query?: Record<string, QueryParamStyle>
  header?: Record<string, HeaderParamStyle>
  cookie?: Record<string, CookieParamStyle>
  body?: Record<string, BodyEncoding>
}

/**
 * Sends a `bigint` as a JSON number, and throws past the safe-integer range instead of losing precision.
 */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value !== 'bigint') return value
  if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER)
    throw new TypeError(`Cannot serialize ${value}n as JSON without losing precision, register a media type to send it another way.`)
  return Number(value)
}

/**
 * A `Content-Type` without its parameters, in lower case.
 */
export function baseContentType(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  return value.split(';')[0]!.trim().toLowerCase() || undefined
}

/**
 * Whether a media type is JSON, such as `application/json` or `application/problem+json`.
 */
export function isJsonMediaType(contentType: string | null | undefined): boolean {
  const type = baseContentType(contentType) ?? ''
  return type.endsWith('/json') || type.endsWith('+json')
}

function appendQueryValue({ search, key, value }: { search: URLSearchParams; key: string; value: unknown }): void {
  if (value === undefined || value === null) return
  if (Array.isArray(value)) {
    for (const item of value) appendQueryValue({ search, key, value: item })
    return
  }
  if (isRecord(value)) {
    for (const [prop, propValue] of Object.entries(value)) {
      appendQueryValue({ search, key: `${key}[${prop}]`, value: propValue })
    }
    return
  }
  search.append(key, toValue(value))
}

export function notNullish(value: unknown): boolean {
  return value !== undefined && value !== null
}

/**
 * Renders a parameter value as a string. A `Date` becomes ISO-8601, so it does not depend on the locale.
 */
export function toValue(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

export function encodeComponent(value: unknown): string {
  return encodeURIComponent(toValue(value))
}

// A `Date` is a unit, not an object to expand.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
}

/**
 * One parameter as form pairs, with an array repeating its key and an object as `key[prop]`.
 */
export function serializeDefaultQueryParam(key: string, value: unknown): Array<string> {
  const search = new URLSearchParams()
  appendQueryValue({ search, key, value })
  const result = search.toString()
  return result ? [result] : []
}
