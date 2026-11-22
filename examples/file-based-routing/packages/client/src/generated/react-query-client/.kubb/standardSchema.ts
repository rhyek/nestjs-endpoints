/**
 * A Standard Schema validator, such as a Zod, Valibot, or ArkType schema.
 */
export type StandardSchemaValidator<TOutput = unknown> = {
  readonly '~standard': {
    validate(value: unknown): StandardSchemaResult<TOutput> | Promise<StandardSchemaResult<TOutput>>
  }
}

export type StandardSchemaResult<TOutput> = { readonly value: TOutput; readonly issues?: undefined } | { readonly issues: ReadonlyArray<StandardSchemaIssue> }

export type StandardSchemaIssue = {
  readonly message?: string
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined
}

/**
 * Thrown when validation fails, with the schema's `issues`.
 */
export class ParseError extends Error {
  readonly issues: ReadonlyArray<StandardSchemaIssue>
  // Declared here and set below, since the `cause` constructor option needs the ES2022 library.
  declare readonly cause?: unknown

  constructor({ issues, message, cause }: { issues: ReadonlyArray<StandardSchemaIssue>; message?: string; cause?: unknown }) {
    super(message ?? 'Validation failed')
    this.name = 'ParseError'
    this.issues = issues
    if (cause !== undefined) this.cause = cause
  }
}

/**
 * Returns the parsed value, or throws a `ParseError` with the schema's `issues`.
 */
export async function validateStandardSchema<TOutput>(schema: StandardSchemaValidator<TOutput>, value: unknown): Promise<TOutput> {
  const result = await schema['~standard'].validate(value)
  if (result.issues) {
    throw new ParseError({ issues: result.issues })
  }
  return (result as { value: TOutput }).value
}

/**
 * Wraps an object schema so its keys match in any letter case. `entries` are the keys the schema declares.
 *
 * @example
 * ```ts
 * validator: { headers: toHeadersStandardSchema(putEventHeadersSchema, putEventHeadersSchema.shape) }
 * ```
 */
export function toHeadersStandardSchema(schema: StandardSchemaValidator, entries: Record<string, unknown>): StandardSchemaValidator {
  const declared = new Map(Object.keys(entries).map((name) => [name.toLowerCase(), name]))

  function validate(value: unknown): StandardSchemaResult<unknown> | Promise<StandardSchemaResult<unknown>> {
    if (typeof value !== 'object' || value === null) {
      return { issues: [{ message: 'Expected an object' }] }
    }

    const originalKeys = new Map<string, string>()
    const declaredValues: Record<string, unknown> = {}
    const undeclaredValues: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      const name = declared.get(key.toLowerCase())
      if (name === undefined) {
        undeclaredValues[key] = entry
        continue
      }
      originalKeys.set(name, key)
      declaredValues[name] = entry
    }

    const toOriginal = (key: string) => originalKeys.get(key) ?? key
    const settle = (result: StandardSchemaResult<unknown>): StandardSchemaResult<unknown> => {
      if (result.issues) {
        return {
          issues: result.issues.map((issue): StandardSchemaIssue => ({
            ...issue,
            path: issue.path?.map((segment, index) => (index === 0 && typeof segment === 'string' ? toOriginal(segment) : segment)),
          })),
        }
      }
      const validated = Object.entries((result.value ?? {}) as Record<string, unknown>).map(([key, entry]) => [toOriginal(key), entry])
      return { value: { ...undeclaredValues, ...Object.fromEntries(validated) } }
    }

    const result = schema['~standard'].validate(declaredValues)
    return result instanceof Promise ? result.then(settle) : settle(result)
  }

  return { '~standard': { validate } }
}

/**
 * Which value and request failed validation.
 */
export type ValidationErrorContext = {
  value: unknown
  direction: 'request' | 'response' | 'error'
  source: 'body' | 'path' | 'query' | 'headers' | 'cookies'
  method?: string | undefined
  url?: string | undefined
  status?: number | undefined
}

/**
 * Return `{ value }` to use instead of a failed value. Return nothing to rethrow the `ParseError`.
 */
export type ValidationErrorHandler = (error: ParseError, context: ValidationErrorContext) => { value: unknown } | void | Promise<{ value: unknown } | void>

/**
 * Turns generated validation on or off, for every direction or per direction.
 * @default true
 */
export type ValidateOption = boolean | { request?: boolean; params?: boolean; response?: boolean; error?: boolean }

export function isValidationEnabled(validate: ValidateOption | undefined, direction: 'request' | 'params' | 'response' | 'error'): boolean {
  return typeof validate === 'object' ? validate[direction] !== false : validate !== false
}

export async function runValidator<T>({
  validator,
  value,
  context,
  onValidationError,
}: {
  validator: StandardSchemaValidator<T> | undefined
  value: T
  context: Omit<ValidationErrorContext, 'value'>
  onValidationError: ValidationErrorHandler | undefined
}): Promise<T> {
  if (!validator) return value
  try {
    return await validateStandardSchema(validator, value)
  } catch (error) {
    if (!onValidationError || !(error instanceof ParseError)) throw error
    const handled = await onValidationError(error, { ...context, value })
    if (!handled) throw error
    return handled.value as T
  }
}
