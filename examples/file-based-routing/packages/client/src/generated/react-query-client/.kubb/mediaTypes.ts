import type { EventStreamOptions, RequestConfig } from './core'
import type { RequestBody } from './serializers'
import { baseContentType, jsonReplacer } from './serializers'
import { ParseError } from './standardSchema'

/**
 * What a media type handler gets next to the body.
 */
export type MediaTypeContext = {
  contentType: string
  /**
   * The response status, or `undefined` while a request body is encoded.
   */
  status?: number | undefined
  signal?: AbortSignal | undefined
  config: Omit<RequestConfig, 'client' | 'transport'> & EventStreamOptions
  /**
   * Where a stream records the last event ID it read, for `StreamResult.lastEventId`.
   */
  cursor?: { lastEventId: string } | undefined
}

/**
 * Encodes and decodes bodies of one media type. Every method is optional.
 */
export type MediaType = {
  encode?: (body: unknown, context: MediaTypeContext) => RequestBody | undefined
  decode?: (response: Response, context: MediaTypeContext) => unknown
  /**
   * Reads a 2xx body item by item. Each item is validated with `validator.response`.
   */
  stream?: (body: ReadableStream<Uint8Array>, context: MediaTypeContext) => AsyncIterable<unknown>
}

/**
 * Handlers keyed by media type. A key may be a pattern such as `application/*+json` or `text/*`.
 */
export type MediaTypes = Record<string, MediaType>

/**
 * Picks the handler for a `Content-Type`: the exact type, then its `+suffix`, then `type/*`, then the catch-all. With `use`, a
 * handler without that method is skipped.
 */
export function resolveMediaType({
  mediaTypes,
  contentType,
  use,
}: {
  mediaTypes: MediaTypes
  contentType: string | null | undefined
  use?: keyof MediaType
}): MediaType | undefined {
  const base = baseContentType(contentType)
  const [type, subtype = ''] = base?.split('/') ?? []
  const suffix = subtype.includes('+') ? subtype.slice(subtype.lastIndexOf('+')) : undefined
  const keys = base ? [base, suffix ? `${type}/*${suffix}` : undefined, `${type}/*`, '*/*'] : ['*/*']
  for (const key of keys) {
    const mediaType = key ? mediaTypes[key] : undefined
    if (mediaType && (!use || mediaType[use])) return mediaType
  }
  return undefined
}

/**
 * Whether a body is already encoded, so every built-in media type sends it as is.
 */
export function isEncodedBody(body: unknown): body is RequestBody {
  return (
    typeof body === 'string' ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream
  )
}

function encodeOrJson(body: unknown, { contentType }: MediaTypeContext): RequestBody {
  if (isEncodedBody(body)) return body
  // XML, YAML, and CSV are never JSON, so a value for one must not go out as JSON under its label.
  const mediaType = baseContentType(contentType)
  if (mediaType && /[/+](xml|yaml|x-yaml|csv)$/.test(mediaType)) {
    throw new TypeError(`Cannot encode the body as ${mediaType}, register mediaTypes['${mediaType}'].encode or pass the encoded body as a string.`)
  }
  return JSON.stringify(body, jsonReplacer)
}

/**
 * Parses JSON text, throwing a `ParseError` that names the content type when it is not valid JSON.
 */
export function parseJson(text: string, contentType: string | undefined): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new ParseError({ message: `Invalid JSON in a ${baseContentType(contentType)} body`, issues: [{ message: String(error) }], cause: error })
  }
}

const json: MediaType = {
  // A string is JSON-encoded too, so it arrives as a JSON string.
  encode: (body) => (isEncodedBody(body) && typeof body !== 'string' ? body : JSON.stringify(body, jsonReplacer)),
  decode: async (response, { contentType }) => {
    const text = await response.text()
    return text ? parseJson(text, contentType) : undefined
  },
}

const text: MediaType = {
  encode: encodeOrJson,
  decode: async (response) => (await response.text()) || undefined,
}

const binary: MediaType = {
  encode: encodeOrJson,
  decode: (response) => response.blob(),
}

const catchAll: MediaType = {
  encode: encodeOrJson,
  // A server may label a plain message such as `Pet deleted` with any type, so non-JSON stays text.
  decode: async (response) => {
    const body = await response.text()
    if (!body) return undefined
    try {
      return JSON.parse(body)
    } catch {
      return body
    }
  },
}

/**
 * The media types every client knows: JSON, text, binary, and a catch-all that sends JSON and reads JSON or text.
 */
export const defaultMediaTypes: MediaTypes = {
  'application/json': json,
  'application/*+json': json,
  'text/json': json,
  'text/*': text,
  'application/octet-stream': binary,
  'application/pdf': binary,
  'image/*': binary,
  'audio/*': binary,
  'video/*': binary,
  '*/*': catchAll,
}
