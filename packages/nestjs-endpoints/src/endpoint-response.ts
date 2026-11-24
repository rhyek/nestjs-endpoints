// What a handler returns, parsed by the endpoint's output and sent.
import type { HttpServer } from '@nestjs/common';
import { ZodSerializationException } from './exceptions';
import type { Schema } from './schema-options';

export class EndpointResponse<Status extends number = any, Body = any> {
  constructor(
    public status: Status,
    public body: Body,
  ) {}
}

/**
 * What a handler returned, as a response whose body the output schema of its status
 * parsed; as it came without `output`.
 */
export function toResponse(
  result: unknown,
  outputSchemas: ReadonlyMap<number, Schema> | undefined,
): EndpointResponse {
  const res = result instanceof EndpointResponse ? result : new EndpointResponse(200, result);
  if (outputSchemas) {
    const schema = outputSchemas.get(res.status);
    if (!schema) {
      throw new Error(`Did not find schema for status code ${res.status}`);
    }
    const parsed = schema.safeParse(res.body);
    if (!parsed.success) {
      throw new ZodSerializationException(parsed.error);
    }
    res.body = parsed.data;
  }
  return res;
}

/** Sets a response's status and content type, and returns the body to hand Nest to send. */
export function sendResponse(
  httpAdapter: HttpServer,
  res: unknown,
  { status, body }: EndpointResponse,
): unknown {
  httpAdapter.status(res, status);
  // A plain object or array is sent as JSON by every adapter; anything else
  // but a string is sent as JSON text, so it gets the JSON content type.
  if (typeof body !== 'string' && !isPlainJson(body)) {
    httpAdapter.setHeader(res, 'Content-Type', 'application/json');
  }
  // Every adapter sends a nil body as an empty one, so `null` is handed to
  // Nest as its JSON text, which each sends as is under the JSON content
  // type above. Replying here instead would end the response before the
  // interceptors and the headers they set (https://github.com/nestjs/nest/issues/10415).
  return body === null ? 'null' : body;
}

/**
 * A plain object or an array, which every adapter sends as JSON with its own
 * content type.
 */
function isPlainJson(body: unknown): boolean {
  if (body === null || typeof body !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(body);
  return proto === Object.prototype || proto === Array.prototype;
}
