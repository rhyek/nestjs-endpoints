import path from 'node:path';
import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  Type,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ApiBody, ApiExtension, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { z, ZodType } from 'zod';
import { DESCRIPTOR_METADATA_KEY, EndpointDescriptor, toOpenApiPath } from './descriptors.js';
import { ZodSerializationException, ZodValidationException } from './exceptions.js';
import {
  getCallsiteFile,
  getEndpointHttpPath,
  getHttpPathPascalName,
  moduleAls,
} from './helpers.js';
import { isSameModule } from './manifest/scan.js';
import {
  apiParameters,
  convertObject,
  ObjectSchemaLike,
  loneValuesAsArrays,
} from './object-parameters.js';
import { EndpointSetupFn, settings } from './settings.js';
import { toJsonSchema } from './zod-to-openapi.js';

const httpMethodDecorators = {
  get: Get,
  post: Post,
  put: Put,
  delete: Delete,
  patch: Patch,
} satisfies Record<string, () => MethodDecorator>;

/** The methods an endpoint may declare; one that omits `method` is a POST. */
type EndpointMethod = keyof typeof httpMethodDecorators;

/**
 * Which react-query helpers the generated SDK gives an endpoint: query hooks
 * for `endpoint.query()`, mutation hooks for `endpoint.mutation()`.
 */
export type EndpointKind = 'query' | 'mutation';

class WithDecorator<_T> {
  constructor(public decorator: PropertyDecorator | ParameterDecorator) {}
}

export function decorated<T = any>(decorator: PropertyDecorator | ParameterDecorator) {
  return new WithDecorator<T>(decorator);
}

export type InjectProvidersMap = Record<string, Type | WithDecorator<any>> | undefined;
export type InjectOnRequestMap = Record<string, WithDecorator<any>> | undefined;

type MaybePromise<T> = T | Promise<T>;

type Schema = ZodType<any>;

class SchemaDef<S extends Schema = Schema> {
  constructor(
    public schema: S,
    public description: string | undefined,
  ) {}
}

export function schema<S extends Schema>(schema: S, spec?: { description?: string }) {
  return new SchemaDef<S>(schema, spec?.description);
}

/** The zod schema of an option, bare or given through `schema()`. */
function unwrapSchema<S extends Schema>(s: S | SchemaDef<S>): S {
  return s instanceof SchemaDef ? s.schema : s;
}

type SchemaOption = Schema | SchemaDef | undefined;

/** The zod schema of an option given bare or through `schema()`. */
type SchemaOf<S> = S extends SchemaDef<infer Inner> ? Inner : NonNullable<S>;

/** `T` when the endpoint declares the option `S`, else nothing. */
type IfDeclared<S, T> = S extends undefined ? object : T;

/**
 * A `params` or `query` schema: an object, bare or behind a transform or
 * preprocess.
 */
type ObjectSchemaUnion = ObjectSchemaLike | SchemaDef<ObjectSchemaLike> | undefined;

type OutputSchemaUnion = Schema | SchemaDef | Record<number, Schema | SchemaDef> | undefined;

/** The output schemas by status: a single schema is the 200 one. */
type OutputMap<OS extends OutputSchemaUnion> = OS extends undefined
  ? never
  : OS extends Schema | SchemaDef
    ? { 200: SchemaOf<OS> }
    : OS extends Record<number, Schema | SchemaDef>
      ? { [K in keyof OS & number]: SchemaOf<OS[K]> }
      : never;

type OutputStatus<OS extends OutputSchemaUnion> = keyof OutputMap<OS> & number;

/**
 * The body of a status: what a handler may hand *in* (`z.input`, before any
 * `.transform()`), or what the output schema surfaces (`z.output`).
 */
type OutputBody<
  OS extends OutputSchemaUnion,
  K extends OutputStatus<OS>,
  IO extends 'input' | 'output',
> = OS extends undefined
  ? any
  : OutputMap<OS>[K] extends Schema
    ? IO extends 'input'
      ? z.input<OutputMap<OS>[K]>
      : z.output<OutputMap<OS>[K]>
    : never;

export class EndpointResponse<Status extends number = any, Body = any> {
  constructor(
    public status: Status,
    public body: Body,
  ) {}
}

/** One `EndpointResponse` per status the output declares. */
type ResponseUnion<OS extends OutputSchemaUnion, IO extends 'input' | 'output'> = {
  [Status in OutputStatus<OS>]: EndpointResponse<Status, OutputBody<OS, Status, IO>>;
}[OutputStatus<OS>];

/**
 * What `invoke()` resolves to, mirroring what it actually returns.
 *
 * A handler that returns an explicit `response(...)` has its
 * `EndpointResponse` passed straight through; a handler that returns a plain
 * value has the parsed body returned instead. Only the per-status map form
 * obliges a handler to return a response, so that form resolves to the
 * response union and the single-schema form resolves to the body.
 */
type InvokeReturn<OS extends OutputSchemaUnion> = OS extends undefined
  ? any
  : OS extends Schema | SchemaDef
    ? z.output<SchemaOf<OS>>
    : ResponseUnion<OS, 'output'>;

/** The values of an `inject` or `injectOnRequest` map. */
type Injected<M> = M extends undefined
  ? object
  : {
      [K in keyof M]: M[K] extends WithDecorator<infer T>
        ? T
        : M[K] extends Type<infer T>
          ? T
          : never;
    };

type HandlerMethod<
  InjectProviders extends InjectProvidersMap = undefined,
  InjectOnRequestParameters extends InjectOnRequestMap = undefined,
  InputSchema extends SchemaOption = undefined,
  ParamsSchema extends SchemaOption = undefined,
  QuerySchema extends SchemaOption = undefined,
  OutputSchema extends OutputSchemaUnion = undefined,
> = (
  params: Injected<InjectProviders> &
    Injected<InjectOnRequestParameters> &
    IfDeclared<InputSchema, { input: z.output<SchemaOf<InputSchema>>; rawInput: unknown }> &
    IfDeclared<ParamsSchema, { params: z.output<SchemaOf<ParamsSchema>> }> &
    IfDeclared<QuerySchema, { query: z.output<SchemaOf<QuerySchema>> }> & {
      response: <
        Status extends OutputStatus<OutputSchema>,
        Body extends OutputBody<OutputSchema, Status, 'input'>,
      >(
        status: Status,
        body: Body,
      ) => EndpointResponse<Status, Body>;
      schemas: IfDeclared<InputSchema, { input: SchemaOf<InputSchema> }> &
        IfDeclared<ParamsSchema, { params: SchemaOf<ParamsSchema> }> &
        IfDeclared<QuerySchema, { query: SchemaOf<QuerySchema> }>;
    },
) => OutputSchema extends undefined
  ? MaybePromise<any>
  : OutputSchema extends Record<number, Schema | SchemaDef>
    ? MaybePromise<ResponseUnion<OutputSchema, 'input'>>
    : OutputSchema extends Schema
      ? MaybePromise<z.input<OutputSchema> | ResponseUnion<OutputSchema, 'input'>>
      : never;

type QueryInput<QuerySchema extends SchemaOption> = z.input<SchemaOf<QuerySchema>>;

type InvokeOptions<
  ParamsSchema extends SchemaOption,
  QuerySchema extends SchemaOption,
> = IfDeclared<ParamsSchema, { params: z.input<SchemaOf<ParamsSchema>> }> &
  IfDeclared<
    QuerySchema,
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {} extends QueryInput<QuerySchema>
      ? { query?: QueryInput<QuerySchema> }
      : { query: QueryInput<QuerySchema> }
  >;

/**
 * `invoke`'s arguments: the raw input when the endpoint has an `input`, then
 * the raw path and search params when it has `params` or `query`. The
 * options may be left out when there are no path params and no search param
 * is required.
 */
type InvokeArgs<
  InputSchema extends SchemaOption,
  ParamsSchema extends SchemaOption,
  QuerySchema extends SchemaOption,
> = [
  ...(InputSchema extends undefined ? [] : [rawInput: z.input<SchemaOf<InputSchema>>]),
  ...([ParamsSchema, QuerySchema] extends [undefined, undefined]
    ? []
    : ParamsSchema extends undefined
      ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        {} extends QueryInput<QuerySchema>
        ? [opts?: InvokeOptions<ParamsSchema, QuerySchema>]
        : [opts: InvokeOptions<ParamsSchema, QuerySchema>]
      : [opts: InvokeOptions<ParamsSchema, QuerySchema>]),
];

type EndpointControllerClass<
  InjectProviders extends InjectProvidersMap = undefined,
  InjectOnRequestParameters extends InjectOnRequestMap = undefined,
  InputSchema extends SchemaOption = undefined,
  ParamsSchema extends SchemaOption = undefined,
  QuerySchema extends SchemaOption = undefined,
  OutputSchema extends OutputSchemaUnion = undefined,
> = Type<{
  handler: HandlerMethod<
    InjectProviders,
    InjectOnRequestParameters,
    InputSchema,
    ParamsSchema,
    QuerySchema,
    OutputSchema
  >;
  /**
   * Invoke the endpoint with raw input. Useful for testing. When the
   * endpoint declares a `params` or `query` schema, the last argument
   * carries the raw path or search parameters
   * (`{ params: { ... }, query: { ... } }`).
   */
  invoke: (
    ...args: InvokeArgs<InputSchema, ParamsSchema, QuerySchema>
  ) => MaybePromise<InvokeReturn<OutputSchema>>;
}>;

/** Both maps' entries, when either may be `undefined`. */
type MergeInjections<A, B> = A extends undefined ? B : B extends undefined ? A : A & B;

/** The keys a router injects, which its endpoints may not declare again. */
type RouterInjectedKeys<RouterInject, RouterInjectOnRequest> =
  | (RouterInject extends undefined ? never : keyof RouterInject)
  | (RouterInjectOnRequest extends undefined ? never : keyof RouterInjectOnRequest);

// A key `Map` may not declare is typed as a message naming it, so the error
// reads as the cause. `NoInfer` keeps the maps inferred from what they
// declare, not from the message.
export type WithoutKeys<Map, Keys, Reason extends string> = Map & {
  [K in keyof NoInfer<Map> & NoInfer<Keys>]: `\`${K & string}\` ${Reason}`;
};

type WithoutRouterKeys<Map, RouterInject, RouterInjectOnRequest> = WithoutKeys<
  Map,
  RouterInjectedKeys<RouterInject, RouterInjectOnRequest>,
  'is already injected by its router'
>;

type EndpointOptions<
  InjectProviders extends InjectProvidersMap,
  InjectOnRequestParameters extends InjectOnRequestMap,
  Method extends EndpointMethod,
  InputSchema extends SchemaOption,
  ParamsSchema extends ObjectSchemaUnion,
  QuerySchema extends ObjectSchemaUnion,
  OutputSchema extends OutputSchemaUnion,
  RouterInject extends InjectProvidersMap = undefined,
  RouterInjectOnRequest extends InjectOnRequestMap = undefined,
> = {
  /**
   * HTTP method. Leave it out unless a caller other than the generated SDK
   * needs another one, such as a link or redirect that must be a GET.
   *
   * @default 'post'
   */
  method?: Method;
  /**
   * HTTP path. By default, inferred from file path.
   */
  path?: string;
  /**
   * OpenAPI endpoint summary.
   */
  summary?: string;
  /**
   * OpenAPI endpoint tags.
   */
  tags?: string[];
  /**
   * Input Zod schema: the request's JSON body. A GET carries no body, so an
   * endpoint with `method: 'get'` takes `query` instead.
   *
   * ```ts
   * endpoint.mutation({
   *   input: z.object({
   *     name: z.string(),
   *   }),
   *   handler: ({ input: { name } }) => {}
   * })
   * ```
   */
  // `'get' extends Method` rather than `Method extends 'get'`, which would
  // distribute over a widened `'get' | 'post'` and let `input` through.
  input?: 'get' extends Method ? never : InputSchema;
  /**
   * Path parameters Zod object schema. Keys must match the URL parameter names
   * in the endpoint's path (e.g. `:recipeId` ↔ `params: { recipeId }`).
   * Path params arrive as strings — use `z.coerce` for numbers.
   *
   * With file-based routing, declare path params in the filename or
   * folder using a `$`-prefix (e.g. `recipes/$recipeId/view.endpoint.ts`
   * → `recipes/:recipeId/view`).
   *
   * ```ts
   * endpoint.query({
   *   params: z.object({
   *     recipeId: z.coerce.number(),
   *   }),
   *   handler: ({ params: { recipeId } }) => {}
   * })
   * ```
   */
  params?: ParamsSchema;
  /**
   * Search parameters Zod schema, an object with one key per parameter.
   * Search params arrive as strings — use `z.coerce` for numbers.
   *
   * ```ts
   * endpoint.query({
   *   method: 'get',
   *   query: z.object({
   *     code: z.string(),
   *   }),
   *   handler: ({ query: { code } }) => {}
   * })
   * ```
   */
  query?: QuerySchema;
  /**
   * Output Zod schema. A `null` output is sent as the JSON `null`.
   *
   * ```ts
   * endpoint.query({
   *   output: z.object({
   *     name: z.string(),
   *   }),
   *   handler: () => ({ name: 'John' })
   * })
   * ```
   */
  output?: OutputSchema;
  /**
   * Inject controller providers at class instance level.
   *
   * ```ts
   * // NestJS controller:
   * ⁣@Controller()
   * class UserController {
   *   constructor(
   *     private readonly userService: UserService,
   *   ) {}
   * }
   *
   * // nestjs-endpoints:
   * endpoint.query({
   *   inject: {
   *     userService: UserService,
   *   },
   *   handler: ({ userService }) => {},
   * })
   * ```
   */
  inject?: WithoutRouterKeys<InjectProviders, RouterInject, RouterInjectOnRequest>;
  /**
   * Inject parameters at request time (e.g. `@Req()`, `@Session()`).
   *
   * ```ts
   * // NestJS controller:
   * ⁣@Controller()
   * class UserController {
   *   ⁣@Post('/user')
   *   async getUser(@Req() req: Request) {}
   * }
   *
   * // nestjs-endpoints:
   * endpoint.query({
   *   injectOnRequest: {
   *     req: decorated<Request>(Req()),
   *   },
   *   handler: async ({ req }) => {},
   * })
   * ```
   */
  injectOnRequest?: WithoutRouterKeys<
    InjectOnRequestParameters,
    RouterInject,
    RouterInjectOnRequest
  >;
  /**
   * @deprecated Use `injectOnRequest` instead.
   */
  injectMethod?: WithoutRouterKeys<InjectOnRequestParameters, RouterInject, RouterInjectOnRequest>;
  /**
   * @deprecated Use `injectOnRequest` instead.
   */
  injectAtRequest?: WithoutRouterKeys<
    InjectOnRequestParameters,
    RouterInject,
    RouterInjectOnRequest
  >;
  /**
   * Method decorators.
   *
   * ```ts
   * // NestJS controller:
   * ⁣@Controller()
   * class UserController {
   *   ⁣@UseGuards(AuthGuard)
   *   ⁣@Post('/user')
   *   async getUser() {}
   * }
   *
   * // nestjs-endpoints:
   * endpoint.query({
   *   decorators: [UseGuards(AuthGuard)],
   *   handler: async () => {},
   * })
   * ```
   */
  decorators?: MethodDecorator[];
  handler: HandlerMethod<
    MergeInjections<RouterInject, InjectProviders>,
    MergeInjections<RouterInjectOnRequest, InjectOnRequestParameters>,
    InputSchema,
    ParamsSchema,
    QuerySchema,
    OutputSchema
  >;
};

/**
 * `endpoint.query` / `endpoint.mutation`. A router's builder carries the
 * router's `inject` and `injectOnRequest`, which its handlers receive with
 * their own.
 */
export type EndpointBuilder<
  RouterInject extends InjectProvidersMap = undefined,
  RouterInjectOnRequest extends InjectOnRequestMap = undefined,
> = <
  InjectProviders extends InjectProvidersMap = undefined,
  InjectOnRequestParameters extends InjectOnRequestMap = undefined,
  Method extends EndpointMethod = 'post',
  InputSchema extends SchemaOption = undefined,
  ParamsSchema extends ObjectSchemaUnion = undefined,
  QuerySchema extends ObjectSchemaUnion = undefined,
  OutputSchema extends OutputSchemaUnion = undefined,
>(
  params: EndpointOptions<
    InjectProviders,
    InjectOnRequestParameters,
    Method,
    InputSchema,
    ParamsSchema,
    QuerySchema,
    OutputSchema,
    RouterInject,
    RouterInjectOnRequest
  >,
) => EndpointControllerClass<
  MergeInjections<RouterInject, InjectProviders>,
  MergeInjections<RouterInjectOnRequest, InjectOnRequestParameters>,
  InputSchema,
  ParamsSchema,
  QuerySchema,
  OutputSchema
>;

export type EndpointBuilders<
  RouterInject extends InjectProvidersMap = undefined,
  RouterInjectOnRequest extends InjectOnRequestMap = undefined,
> = {
  /**
   * Defines an endpoint that reads. The generated react-query client gives
   * it query helpers: `useX`, `queryKey`, `queryOptions`. It is a POST whose
   * `input` is the JSON body unless it declares another `method`.
   *
   * ```ts
   * export default endpoint.query({
   *   input: z.object({ id: z.number() }),
   *   output: userSchema,
   *   inject: { users: UsersService },
   *   handler: ({ input, users }) => users.find(input.id),
   * });
   * ```
   */
  query: EndpointBuilder<RouterInject, RouterInjectOnRequest>;
  /**
   * Defines an endpoint that changes something. The generated react-query
   * client gives it mutation helpers: `useX`, `mutationKey`,
   * `mutationOptions`. It is a POST whose `input` is the JSON body unless it
   * declares another `method`.
   *
   * ```ts
   * export default endpoint.mutation({
   *   input: z.object({ name: z.string() }),
   *   output: userSchema,
   *   inject: { users: UsersService },
   *   handler: ({ input, users }) => users.create(input.name),
   * });
   * ```
   */
  mutation: EndpointBuilder<RouterInject, RouterInjectOnRequest>;
};

/**
 * Defines an endpoint. Every endpoint is a POST whose `input` is the JSON
 * body, unless it declares another `method`; the builder decides which
 * react-query helpers the generated SDK gives it.
 *
 * ```ts
 * export default endpoint.query({ ... });    // useX, queryKey, queryOptions
 * export default endpoint.mutation({ ... }); // useX, mutationKey, mutationOptions
 * ```
 */
export const endpoint: EndpointBuilders = {
  // The builders' generics only shape the types; `defineEndpoint` sees the
  // options as plain values.
  query: (params) => defineEndpoint('query', getCallsiteFile(), params as any),
  mutation: (params) => defineEndpoint('mutation', getCallsiteFile(), params as any),
};

/** An endpoint's `injectOnRequest`, or the deprecated name it gave it. */
function injectOnRequestOf(params: {
  injectOnRequest?: InjectOnRequestMap;
  injectMethod?: InjectOnRequestMap;
  injectAtRequest?: InjectOnRequestMap;
}): InjectOnRequestMap {
  return params.injectOnRequest ?? params.injectMethod ?? params.injectAtRequest;
}

/**
 * The builders a router hands out as its `endpoint`: the package's, with
 * the router's injections added to each endpoint's own when it is defined.
 * An endpoint built with them carries the injections however it is loaded,
 * on its own in a test too.
 */
export function createRouterEndpoint(
  routerFile: string,
  inject: InjectProvidersMap,
  injectOnRequest: InjectOnRequestMap,
): EndpointBuilders<any, any> {
  const inBoth = Object.keys(inject ?? {}).find((key) => Object.hasOwn(injectOnRequest ?? {}, key));
  if (inBoth) {
    throw new Error(
      `EndpointRouterModule.create() in ${routerFile}: \`${inBoth}\` is in ` +
        'both `inject` and `injectOnRequest`.',
    );
  }
  const routerKeys = new Set(Object.keys({ ...inject, ...injectOnRequest }));
  if (routerKeys.size === 0) {
    return endpoint;
  }
  // The returned builder calls `getCallsiteFile()` itself, at the depth the
  // package's builders call it, so the endpoint's path is inferred from its
  // own file.
  const build =
    (kind: EndpointKind): EndpointBuilder<any, any> =>
    (params: any) => {
      const file = getCallsiteFile();
      const ownInjectOnRequest = injectOnRequestOf(params);
      const redeclared = Object.keys({
        ...params.inject,
        ...ownInjectOnRequest,
      }).find((key) => routerKeys.has(key));
      if (redeclared) {
        throw new Error(
          `endpoint.${kind}() in ${file}: \`${redeclared}\` is already ` +
            `injected by its router (${routerFile}).`,
        );
      }
      // The merged `injectOnRequest` takes precedence over the deprecated
      // names left in `params`.
      return defineEndpoint(
        kind,
        file,
        {
          ...params,
          inject: { ...inject, ...params.inject },
          injectOnRequest: { ...injectOnRequest, ...ownInjectOnRequest },
        },
        routerFile,
      );
    };
  return { query: build('query'), mutation: build('mutation') };
}

function defineEndpoint(
  kind: EndpointKind,
  file: string,
  params: EndpointOptions<
    InjectProvidersMap,
    InjectOnRequestMap,
    EndpointMethod,
    SchemaOption,
    ObjectSchemaUnion,
    ObjectSchemaUnion,
    OutputSchemaUnion
  >,
  // The router whose `endpoint` built it; none for the package's builders.
  builderRouterFile?: string,
): any {
  const { method: httpMethod = 'post', path: explicitPath, summary, tags, decorators } = params;
  const fail = (message: string) => new Error(`endpoint.${kind}() in ${file}: ${message}`);
  if (!Object.hasOwn(httpMethodDecorators, httpMethod)) {
    const methods = Object.keys(httpMethodDecorators)
      .map((m) => `'${m}'`)
      .join(', ');
    throw fail(`\`method\` must be one of ${methods}; got ${JSON.stringify(httpMethod)}.`);
  }
  // `input` is typed `never` here, where `method` may be any method.
  const inputOption = params.input as SchemaOption;
  const inputSchema = inputOption && unwrapSchema(inputOption);
  const paramsSchema = params.params && unwrapSchema(params.params);
  const querySchema = params.query && unwrapSchema(params.query);
  if (inputSchema && httpMethod === 'get') {
    throw fail(
      'a GET endpoint cannot declare `input`, since a GET request has no body. ' +
        'Use `query` for search parameters, or another `method`.',
    );
  }
  const outputs = outputsOf(params.output);
  const outputSchemas = outputs && new Map(outputs.map((o) => [o.status, o.schema]));
  const inject: NonNullable<InjectProvidersMap> = params.inject ?? {};
  const injectKeys = Object.keys(inject);
  const injectOnRequest = injectOnRequestOf(params) ?? {};
  const injectOnRequestKeys = Object.keys(injectOnRequest);
  // What the handler is given besides the request: the same objects for every
  // request.
  const response = (status: number, body: unknown) => new EndpointResponse(status, body);
  const schemas = Object.freeze({
    ...(inputSchema && { input: inputSchema }),
    ...(paramsSchema && { params: paramsSchema }),
    ...(querySchema && { query: querySchema }),
  });
  // How the search parameters are read before validation (see
  // `loneValuesAsArrays`): decided once, by the setup, which converts the
  // query anyway, or on first use. `null` reads them as they come.
  let readQuery: ((query: unknown) => unknown) | null | undefined;

  class cls {}
  const proto = cls.prototype as any;
  const httpAdapterHostKey = Symbol('httpAdapterHost');
  Inject(HttpAdapterHost)(proto, httpAdapterHostKey);
  for (const [key, token] of Object.entries(inject)) {
    if (token instanceof WithDecorator) {
      (token.decorator as PropertyDecorator)(proto, key);
    } else {
      Inject(token)(proto, key);
    }
  }

  /**
   * Validates the request and calls the handler. `handlerParams` already
   * holds what `injectOnRequest` gave, if anything.
   */
  const callHandler = (
    instance: any,
    handlerParams: Record<string, unknown>,
    rawInput: unknown,
    rawParams: unknown,
    rawQuery: unknown,
  ): unknown => {
    for (const key of injectKeys) {
      handlerParams[key] = instance[key];
    }
    if (inputSchema) {
      // A request without a body reads as `{}`, like `query` and `params`,
      // unless the schema accepts a missing body as it is.
      let parsed = inputSchema.safeParse(rawInput);
      if (!parsed.success && rawInput === undefined) {
        parsed = inputSchema.safeParse({});
      }
      handlerParams.input = validated(parsed);
      handlerParams.rawInput = rawInput;
    }
    if (paramsSchema) {
      handlerParams.params = validated(paramsSchema.safeParse(rawParams ?? {}));
    }
    if (querySchema) {
      if (readQuery === undefined) {
        readQuery = loneValuesAsArrays(convertObject(querySchema).parameters);
      }
      const query = readQuery ? readQuery(rawQuery) : rawQuery;
      handlerParams.query = validated(querySchema.safeParse(query ?? {}));
    }
    return params.handler(handlerParams as any);
  };

  /** What the handler returned, as a response whose body the output parsed. */
  const toResponse = (result: unknown): EndpointResponse => {
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
  };

  /** Sets the status and content type, and hands Nest the body to send. */
  const send = (instance: any, res: unknown, result: unknown) => {
    const { status, body } = toResponse(result);
    const { httpAdapter } = instance[httpAdapterHostKey] as HttpAdapterHost;
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
  };

  proto.invoke = async function (...args: any[]) {
    // Without an `input` schema the options come first: `invoke({ params, query })`.
    const [rawInput, opts] = inputSchema ? args : [undefined, args[0]];
    const result = await callHandler(
      this,
      { response, schemas },
      rawInput,
      paramsSchema && opts?.params,
      querySchema && opts?.query,
    );
    const res = toResponse(result);
    return result instanceof EndpointResponse ? res : res.body;
  };

  // The handler's parameters, in order: the response (to set its status and
  // content type), what the endpoint validates, then `injectOnRequest`.
  const parameterDecorators: ParameterDecorator[] = [
    Res({ passthrough: true }),
    ...(inputSchema ? [Body()] : []),
    ...(paramsSchema ? [Param()] : []),
    ...(querySchema ? [Query()] : []),
    ...Object.values(injectOnRequest).map((d) => d.decorator as ParameterDecorator),
  ];
  // A new function each time the endpoint is set up, so that the method
  // decorators a setup applies do not add to the ones an earlier one did.
  // It returns a promise only when the handler does.
  const createHandlerMethod = () =>
    function (this: any, res: unknown, ...request: unknown[]) {
      let next = 0;
      const rawInput = inputSchema ? request[next++] : undefined;
      const rawParams = paramsSchema ? request[next++] : undefined;
      const rawQuery = querySchema ? request[next++] : undefined;
      const handlerParams: Record<string, unknown> = { response, schemas };
      for (const key of injectOnRequestKeys) {
        handlerParams[key] = request[next++];
      }
      const result = callHandler(this, handlerParams, rawInput, rawParams, rawQuery);
      return isThenable(result) ? result.then((r) => send(this, res, r)) : send(this, res, result);
    };

  const setupFn: EndpointSetupFn = ({ rootDirectories, basePath, namespaceChain, routerFile }) => {
    // Before anything is applied: a listed endpoint may be set up again.
    if (builderRouterFile && routerFile && !isSameModule(builderRouterFile, routerFile)) {
      const shown = (f: string) => path.relative(process.cwd(), f);
      throw new Error(
        `${shown(file)} is built with the endpoint of ${shown(builderRouterFile)} but is ` +
          `owned by ${shown(routerFile)}. Build it with the \`endpoint\` of the router ` +
          'module that owns it.',
      );
    }
    const { httpPath, httpPathPascalName, httpPathSegments } = explicitPath
      ? explicitHttpPath(basePath, explicitPath)
      : getEndpointHttpPath(rootDirectories, basePath, file);
    Object.defineProperty(cls, 'name', { value: `${httpPathPascalName}Endpoint` });
    Controller(httpPath)(cls);

    proto.handler = createHandlerMethod();
    parameterDecorators.forEach((decorator, i) => decorator(proto, 'handler', i));

    // A namespace tags the operation; without one, the URL's folders do
    // (everything but the leaf, without path params), so Swagger UI still
    // groups it.
    const autoTag =
      namespaceChain.length > 0
        ? namespaceChain.join('/')
        : httpPathSegments
            .slice(0, -1)
            .filter((s) => !s.startsWith(':'))
            .join('/');
    const operationTags = [...(autoTag ? [autoTag] : []), ...(tags ?? [])];
    const operationSummary = summary ?? '';
    const methodDecorators: MethodDecorator[] = [
      ApiOperation({
        operationId: httpPathPascalName,
        tags: operationTags,
        summary: operationSummary,
      }),
      // Every endpoint is a POST unless it says otherwise, so the method
      // does not tell a generator reading the document which it is.
      ApiExtension('x-endpoint-kind', kind),
      ...(namespaceChain.length > 0 ? [ApiExtension('x-namespace', namespaceChain)] : []),
      httpMethodDecorators[httpMethod](''),
      // The handler sets the status itself; this is the one the OpenAPI
      // document gives an endpoint without `output`, which a POST would
      // otherwise get as 201.
      HttpCode(200),
      ...(decorators ?? []),
    ];
    // Each schema is converted once; the decorators and the descriptor read
    // the same results.
    const endpointLabel = `endpoint "${httpPathPascalName}" (${httpMethod.toUpperCase()} /${httpPathSegments.join('/')})`;
    const input = inputSchema && toJsonSchema(inputSchema, 'input', httpPathPascalName + 'Input');
    if (input) {
      methodDecorators.push(ApiBody({ schema: input.json }));
    }
    const query = querySchema && convertObject(querySchema, `The query of ${endpointLabel}`);
    if (query) {
      methodDecorators.push(...apiParameters('query', query.parameters));
      readQuery = loneValuesAsArrays(query.parameters);
    }
    const paramsObject =
      paramsSchema && convertObject(paramsSchema, `The params of ${endpointLabel}`);
    if (paramsObject) {
      methodDecorators.push(...apiParameters('path', paramsObject.parameters));
    }
    const descriptorOutputs = (outputs ?? []).map(({ status, schema, description }) => {
      const schemaName = httpPathPascalName + (status === 200 ? '' : status) + 'Output';
      const converted = toJsonSchema(schema, 'output', schemaName);
      methodDecorators.push(ApiResponse({ status, schema: converted.json, description }));
      return { status, description, schema: converted };
    });
    applyDecorators(...methodDecorators)(
      proto,
      'handler',
      Object.getOwnPropertyDescriptor(proto, 'handler')!,
    );
    Reflect.defineMetadata('endpoints:path', httpPath, cls);
    const descriptor: EndpointDescriptor = {
      operationId: httpPathPascalName,
      kind,
      method: httpMethod,
      path: toOpenApiPath('/' + httpPathSegments.join('/')),
      pathParams: httpPathSegments
        .filter((segment) => segment.startsWith(':'))
        .map((segment) => {
          const name = segment.slice(1);
          const schema = paramsObject?.parameters.find((p) => p.name === name)?.schema;
          return { name, schema: schema ?? { type: 'string' } };
        }),
      ...(paramsObject && { params: paramsObject }),
      ...(query && { query }),
      namespaceChain,
      tags: operationTags,
      summary: operationSummary,
      ...(input && { input }),
      outputs: descriptorOutputs,
    };
    Reflect.defineMetadata(DESCRIPTOR_METADATA_KEY, descriptor, cls);
  };
  Reflect.defineMetadata('endpoints:setupFn', setupFn, cls);
  if (moduleAls.getStore()) {
    settings.endpoints.push({ file, setupFn });
  } else {
    setupFn({ rootDirectories: [process.cwd()], basePath: '', namespaceChain: [] });
  }

  return cls;
}

/**
 * The output schemas by status, a single schema being the 200 one; none
 * without `output`.
 */
function outputsOf(
  output: OutputSchemaUnion,
): { status: number; schema: Schema; description: string | undefined }[] | undefined {
  if (!output) {
    return undefined;
  }
  const isStatusMap =
    output.constructor === Object &&
    Object.keys(output).length > 0 &&
    Object.keys(output).every((k) => Number.isInteger(Number(k)));
  const byStatus = (isStatusMap ? output : { 200: output }) as Record<number, Schema | SchemaDef>;
  return Object.entries(byStatus).map(([status, s]) => ({
    status: Number(status),
    schema: unwrapSchema(s),
    description: s instanceof SchemaDef ? s.description : undefined,
  }));
}

/** An endpoint's own `path` under its router's base path. */
function explicitHttpPath(basePath: string, explicitPath: string) {
  const httpPathSegments = [
    ...basePath.split('/').filter(Boolean),
    ...explicitPath.split('/').filter(Boolean),
  ];
  const httpPath = '/' + httpPathSegments.join('/');
  return { httpPath, httpPathSegments, httpPathPascalName: getHttpPathPascalName(httpPath) };
}

/** A parse's data, or the 400 its issues make. */
function validated<T>(parsed: z.ZodSafeParseResult<T>): T {
  if (!parsed.success) {
    throw new ZodValidationException(parsed.error);
  }
  return parsed.data;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | null)?.then === 'function';
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
