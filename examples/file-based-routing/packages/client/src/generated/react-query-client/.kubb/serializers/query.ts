import type { QuerySerializer } from '../serializers'
import { encodeComponent, isRecord, notNullish, serializeDefaultQueryParam } from '../serializers'

/**
 * The query serializer for a spec without styled query parameters: arrays repeat their key, objects use `form` with explode.
 */
export const serializeQuery: QuerySerializer = (params, options) => {
  const parts: Array<string> = []
  for (const [key, value] of Object.entries(params)) {
    if (options?.[key]) throw new TypeError(`Cannot send query parameter ${key} with a style, register serializer.query on the client.`)
    // `URLSearchParams` writes a space as `+`, form encoding for bodies. A query follows RFC 6570: `%20`.
    parts.push(
      ...(isRecord(value)
        ? Object.entries(value)
            .filter(([, item]) => notNullish(item))
            .map(([prop, item]) => `${encodeComponent(prop)}=${encodeComponent(item)}`)
        : serializeDefaultQueryParam(key, value).map((part) => part.replaceAll('+', '%20'))),
    )
  }
  return parts.join('&')
}
