/**
 * The HTTP methods an OpenAPI path item can carry, in a stable order. Single
 * source of truth shared by the document filter (`filter-doc`) and the bucket
 * builder (`kubb/buckets`) so the two can't drift.
 */
export const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'head',
  'options',
  'trace',
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Whether `key` is one of the OpenAPI HTTP methods. */
export function isHttpMethod(key: string): key is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(key);
}
