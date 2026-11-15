import type { ClientConfig } from './core'
import { serializePath } from './serializers/path'
import { serializeQuery } from './serializers/query'

/**
 * The config `client.ts` starts with: what this spec needs from the runtime.
 */
export const defaultConfig: ClientConfig = { serializer: { query: serializeQuery, path: serializePath } }
