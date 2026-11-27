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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  OPTIONAL_PROPERTY_DEPS_METADATA,
  PROPERTY_DEPS_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { HttpAdapterHost, ModulesContainer } from '@nestjs/core';
import { z, type ZodType } from 'zod';
import { type EndpointDescriptor, mounted } from './descriptors';
import { documentedPart, endpointSetUp, instantiatedIn, outputJson } from './document-schemas';
import { EndpointResponse, sendResponse, toResponse } from './endpoint-response';
import { ZodValidationException } from './exceptions';
import { getCallsiteFile, getEndpointHttpPath, moduleAls } from './helpers';
import { assertHooksAreCalled } from './hook-scopes';
import type { Injected, InjectOnRequestMap, InjectProvidersMap } from './injections';
import {
  declaredMembers,
  ENDPOINT_OWN_MEMBERS,
  type EndpointOwnMembers,
  type InjectNaming,
  type InstanceOptions,
  type MethodsMap,
} from './instance-members';
import { NamesBesideGuard } from './names-beside.guard';
import { apiParameters, convertObject, loneValuesAsArrays } from './object-parameters';
import {
  assertOneMapPerKey,
  assertPlainParams,
  isEmptyContext,
  mergeContext,
  type MergeableParams,
  type MergedParams,
  type Overriding,
  type RouterContext,
  type WithoutKeys,
} from './router-context';
import type { Guard, Interceptor } from './router-lineage';
import { isSameModule, shown } from './routing-files';
import {
  type ObjectSchemaUnion,
  outputsOf,
  type OutputSchemaUnion,
  type SchemaOption,
} from './schema-options';
import { type EndpointSetupFn, settings, setUpBy } from './settings';
import { ApiBody, ApiExtension, ApiOperation, ApiResponse } from './swagger';
import { operationName, pathFolders, toOpenApiPath, urlParamNames } from './url-params';
import { toJsonSchema } from './zod-to-openapi';

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

type MaybePromise<T> = T | Promise<T>;

/** `T` when the endpoint declares the option `S`, else nothing. */
type IfDeclared<S, T> = S extends undefined ? object : T;

// The types from here to `ResponseUnion` are this module's own, and not exported: a project
// that emits declarations spells an endpoint's type out with them, which it could not do with
// the types of a module the package does not export.
type Schema = ZodType<any>;

/** The output schemas by status: a single schema is the 200 one. */
type OutputMap<OS extends OutputSchemaUnion> = OS extends undefined
  ? never
  : OS extends Schema
    ? { 200: OS }
    : OS extends Record<number, Schema>
      ? { [K in keyof OS & number]: OS[K] }
      : never;

type OutputStatus<OS extends OutputSchemaUnion> = keyof OutputMap<OS> & number;

/** An `output` that is a map has statuses for keys. */
type StatusesOnly<OS> = OS extends Schema | undefined
  ? unknown
  : {
      [K in Exclude<keyof OS, number>]: `\`${K & string}\` is not a status code`;
    };

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
  : OS extends Schema
    ? z.output<OS>
    : ResponseUnion<OS, 'output'>;

// The two maps are not constrained here and in `EndpointControllerClass`:
// a router's merged with an endpoint's is a map only once both are known.
type HandlerMethod<
  InjectProviders = undefined,
  InjectOnRequestParameters = undefined,
  InputSchema extends SchemaOption = undefined,
  ParamsSchema extends SchemaOption = undefined,
  QuerySchema extends SchemaOption = undefined,
  OutputSchema extends OutputSchemaUnion = undefined,
> = (
  params: Injected<InjectProviders> &
    Injected<InjectOnRequestParameters> &
    IfDeclared<InputSchema, { input: z.output<InputSchema>; rawInput: unknown }> &
    IfDeclared<ParamsSchema, { params: z.output<ParamsSchema> }> &
    IfDeclared<QuerySchema, { query: z.output<QuerySchema> }> & {
      response: <
        Status extends OutputStatus<OutputSchema>,
        Body extends OutputBody<OutputSchema, Status, 'input'>,
      >(
        status: Status,
        body: Body,
      ) => EndpointResponse<Status, Body>;
      schemas: IfDeclared<InputSchema, { input: InputSchema }> &
        IfDeclared<ParamsSchema, { params: ParamsSchema }> &
        IfDeclared<QuerySchema, { query: QuerySchema }>;
    },
) => OutputSchema extends undefined
  ? MaybePromise<any>
  : OutputSchema extends Record<number, Schema>
    ? MaybePromise<ResponseUnion<OutputSchema, 'input'>>
    : OutputSchema extends Schema
      ? MaybePromise<z.input<OutputSchema> | ResponseUnion<OutputSchema, 'input'>>
      : never;

/** An `injectOnRequest` with no key of `inject`: the handler has one parameter of each name. */
type OnRequestOnly<OnRequest, Inject> = WithoutKeys<
  OnRequest,
  keyof Inject,
  'is in both inject and injectOnRequest'
>;

/**
 * The raw value of a schema the endpoint declares, under `Key`, which a call may leave out:
 * validation refuses what it requires. An endpoint that declares no such schema takes no key.
 */
type RawOption<Key extends string, S extends SchemaOption> = S extends undefined
  ? { [K in Key]?: never }
  : { [K in Key]?: z.input<S> };

/** `invoke`'s request: the raw `params`, `query` and `input`, named as the endpoint's options. */
type InvokeRequest<
  InputSchema extends SchemaOption,
  ParamsSchema extends SchemaOption,
  QuerySchema extends SchemaOption,
> = RawOption<'params', ParamsSchema> &
  RawOption<'query', QuerySchema> &
  RawOption<'input', InputSchema>;

type EndpointControllerClass<
  InjectProviders = undefined,
  InjectOnRequestParameters = undefined,
  InputSchema extends SchemaOption = undefined,
  ParamsSchema extends SchemaOption = undefined,
  QuerySchema extends SchemaOption = undefined,
  OutputSchema extends OutputSchemaUnion = undefined,
  Properties = object,
  Methods = object,
> = Type<
  EndpointInstance<
    InjectProviders,
    InjectOnRequestParameters,
    InputSchema,
    ParamsSchema,
    QuerySchema,
    OutputSchema
  > &
    Properties &
    Methods
>;

type EndpointInstance<
  InjectProviders,
  InjectOnRequestParameters,
  InputSchema extends SchemaOption,
  ParamsSchema extends SchemaOption,
  QuerySchema extends SchemaOption,
  OutputSchema extends OutputSchemaUnion,
> = {
  handler: HandlerMethod<
    InjectProviders,
    InjectOnRequestParameters,
    InputSchema,
    ParamsSchema,
    QuerySchema,
    OutputSchema
  >;
  /**
   * Calls the handler without HTTP, with the raw `params`, `query` and
   * `input` validated as a request's are: `invoke({ params, query, input })`.
   * Useful for testing.
   */
  invoke: (
    request?: InvokeRequest<InputSchema, ParamsSchema, QuerySchema>,
  ) => MaybePromise<InvokeReturn<OutputSchema>>;
};

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
  RouterParams extends z.ZodObject | undefined = undefined,
  Properties = object,
  Methods = object,
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
   *
   * An endpoint built with a router's `endpoint` also has the router's
   * `params`, and declares only its own. A key both declare is the
   * endpoint's.
   */
  params?: ParamsSchema & MergeableParams<NoInfer<ParamsSchema>, RouterParams>;
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
   * Output Zod schema, or one per status code. In an OpenAPI document, a
   * schema's `.meta({ description })` describes its response too. A `null`
   * output is sent as the JSON `null`.
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
  output?: OutputSchema & StatusesOnly<NoInfer<OutputSchema>>;
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
  inject?: InjectNaming<InjectProviders, EndpointOwnMembers>;
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
  injectOnRequest?: OnRequestOnly<InjectOnRequestParameters, InjectProviders>;
  /**
   * @deprecated Use `injectOnRequest` instead.
   */
  injectMethod?: OnRequestOnly<InjectOnRequestParameters, InjectProviders>;
  /**
   * @deprecated Use `injectOnRequest` instead.
   */
  injectAtRequest?: OnRequestOnly<InjectOnRequestParameters, InjectProviders>;
  /**
   * Guards for this endpoint, as `@UseGuards()` on a controller method takes
   * them. They run after its routers' guards, and before any in
   * `decorators`.
   *
   * @example
   *   guards: [AdminGuard]
   */
  guards?: Guard[];
  /**
   * Interceptors for this endpoint, as `@UseInterceptors()` on a controller
   * method takes them. They run inside its routers' interceptors, and
   * outside any in `decorators`.
   *
   * @example
   *   interceptors: [AuditInterceptor]
   */
  interceptors?: Interceptor[];
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
    Overriding<RouterInject, InjectProviders, InjectOnRequestParameters>,
    Overriding<RouterInjectOnRequest, InjectOnRequestParameters, InjectProviders>,
    InputSchema,
    MergedParams<RouterParams, ParamsSchema>,
    QuerySchema,
    OutputSchema
  >;
} & InstanceOptions<
  Injected<Overriding<RouterInject, InjectProviders, InjectOnRequestParameters>>,
  Properties,
  Methods,
  EndpointOwnMembers
>;

/**
 * `endpoint.query` / `endpoint.mutation`. A router's builder carries the
 * router's `inject`, `injectOnRequest` and `params`, which its handlers
 * receive with their own; a key the endpoint declares itself is the
 * endpoint's.
 */
export type EndpointBuilder<
  RouterInject extends InjectProvidersMap = undefined,
  RouterInjectOnRequest extends InjectOnRequestMap = undefined,
  RouterParams extends z.ZodObject | undefined = undefined,
> = <
  InjectProviders extends InjectProvidersMap = undefined,
  InjectOnRequestParameters extends InjectOnRequestMap = undefined,
  Method extends EndpointMethod = 'post',
  InputSchema extends SchemaOption = undefined,
  ParamsSchema extends ObjectSchemaUnion = undefined,
  QuerySchema extends ObjectSchemaUnion = undefined,
  OutputSchema extends OutputSchemaUnion = undefined,
  Properties extends object = object,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  Methods extends MethodsMap = {},
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
    RouterInjectOnRequest,
    RouterParams,
    Properties,
    Methods
  >,
) => EndpointControllerClass<
  Overriding<RouterInject, InjectProviders, InjectOnRequestParameters>,
  Overriding<RouterInjectOnRequest, InjectOnRequestParameters, InjectProviders>,
  InputSchema,
  MergedParams<RouterParams, ParamsSchema>,
  QuerySchema,
  OutputSchema,
  Properties,
  Methods
>;

export type EndpointBuilders<
  RouterInject extends InjectProvidersMap = undefined,
  RouterInjectOnRequest extends InjectOnRequestMap = undefined,
  RouterParams extends z.ZodObject | undefined = undefined,
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
  query: EndpointBuilder<RouterInject, RouterInjectOnRequest, RouterParams>;
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
  mutation: EndpointBuilder<RouterInject, RouterInjectOnRequest, RouterParams>;
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
export const endpoint: EndpointBuilders = builders();

/**
 * The builders a router hands out as its `endpoint`: the package's, with
 * the router's context under each endpoint's own options when it is defined.
 * An endpoint built with them carries the context however it is loaded, on
 * its own in a test too.
 */
export function createRouterEndpoint(
  routerFile: string,
  context: RouterContext,
): EndpointBuilders<any, any, any> {
  return isEmptyContext(context) ? endpoint : builders({ file: routerFile, context });
}

/**
 * The builders of a router: each endpoint reads `router.context` when it is set up, so one
 * defined before another router listed this one has what that router gives too.
 */
export function routerEndpoint(router: BuilderRouter): EndpointBuilders<any, any, any> {
  return builders(router);
}

/** The router whose `endpoint` builds an endpoint, and what it gives the endpoint. */
export type BuilderRouter = { file: string; readonly context: RouterContext };

/** `endpoint.query` and `endpoint.mutation`: the package's, or a router's. */
function builders(router?: BuilderRouter): EndpointBuilders<any, any, any> {
  // Each calls `getCallsiteFile()` itself, so that the endpoint's path is
  // inferred from the file that calls it. The builders' generics only shape
  // the types; `defineEndpoint` sees the options as plain values.
  const build =
    (kind: EndpointKind): EndpointBuilder<any, any, any> =>
    (params) =>
      defineEndpoint(kind, getCallsiteFile(), params as DefinedOptions, router);
  return { query: build('query'), mutation: build('mutation') };
}

/** An endpoint's options as `defineEndpoint` reads them. */
type DefinedOptions = EndpointOptions<
  InjectProvidersMap,
  InjectOnRequestMap,
  EndpointMethod,
  SchemaOption,
  ObjectSchemaUnion,
  ObjectSchemaUnion,
  OutputSchemaUnion
>;

/** An endpoint's `injectOnRequest`, or the deprecated name it gave it. */
function injectOnRequestOf(options: {
  injectOnRequest?: InjectOnRequestMap;
  injectMethod?: InjectOnRequestMap;
  injectAtRequest?: InjectOnRequestMap;
}): InjectOnRequestMap {
  return options.injectOnRequest ?? options.injectMethod ?? options.injectAtRequest;
}

/**
 * An endpoint's options, checked, with the context of the router that builds
 * it under them. `at` starts each error.
 */
function withRouterContext(
  at: string,
  options: DefinedOptions,
  router: BuilderRouter | undefined,
): DefinedOptions {
  const injectOnRequest = injectOnRequestOf(options);
  if (!router) {
    return options;
  }
  const ownParams = options.params;
  if (router.context.params) {
    assertPlainParams(
      ownParams,
      at,
      `, to merge with the \`params\` of its router (${router.file})`,
    );
  }
  // The merged `injectOnRequest` takes precedence over the deprecated names
  // left in the options.
  const merged = mergeContext(router.context, {
    inject: options.inject,
    injectOnRequest,
    // A plain object, checked above, when the router has `params` to merge.
    params: ownParams as z.ZodObject | undefined,
  });
  return { ...options, ...merged };
}

function defineEndpoint(
  kind: EndpointKind,
  file: string,
  options: DefinedOptions,
  router: BuilderRouter | undefined,
): any {
  const at = `endpoint.${kind}() in ${file}`;
  // What the endpoint declares itself is read here, where it is defined. What its router
  // gives it is read by each setup, in `build`: a router's context is whole once it loads.
  const {
    method: httpMethod = 'post',
    path: explicitPath,
    summary,
    tags,
    guards,
    interceptors,
    decorators,
  } = options;
  // As on a router; before the router's are merged in, which they may replace.
  assertOneMapPerKey({ inject: options.inject, injectOnRequest: injectOnRequestOf(options) }, at);
  const fail = (message: string) => new Error(`${at}: ${message}`);
  if (!Object.hasOwn(httpMethodDecorators, httpMethod)) {
    const methods = Object.keys(httpMethodDecorators)
      .map((m) => `'${m}'`)
      .join(', ');
    throw fail(`\`method\` must be one of ${methods}; got ${JSON.stringify(httpMethod)}.`);
  }
  // `input` is typed `never` here, where `method` may be any method.
  const inputSchema = options.input as SchemaOption;
  const { query: querySchema } = options;
  if (inputSchema && httpMethod === 'get') {
    throw fail(
      'a GET endpoint cannot declare `input`, since a GET request has no body. ' +
        'Use `query` for search parameters, or another `method`.',
    );
  }
  const outputs = outputsOf(options.output, fail);
  const outputSchemas = outputs && new Map(outputs.map((o) => [o.status, o.schema]));
  // Under a key of its own: `this` has the handler's names, and those `inject` declares.
  const httpAdapterHostKey = Symbol('httpAdapterHost');

  class cls {
    readonly [httpAdapterHostKey]?: HttpAdapterHost;

    // Each app that mounts the endpoint instantiates it, with its own modules.
    constructor(
      @Inject(ModulesContainer) modules?: ModulesContainer,
      @Inject(HttpAdapterHost) httpAdapterHost?: HttpAdapterHost,
    ) {
      this[httpAdapterHostKey] = httpAdapterHost;
      built!.members.initialize(this);
      if (modules) {
        // In an app with no router and no root, nothing else would tell.
        if (built!.members.hooks.length > 0) {
          assertHooksAreCalled(modules, cls);
        }
        instantiatedIn(modules);
      }
    }
  }
  const proto = cls.prototype as any;
  // Whether a setup has given the class the guard that refuses a name beside a parameter.
  let refusesNamesBeside = false;
  /** What the last setup built, with the context its router had then. */
  let built: ReturnType<typeof build> | undefined;

  /**
   * The endpoint with what its router gives it: its members, its handler, and `mount`, which
   * places it. Built by the first setup, and again by one whose router's context is another.
   */
  const build = (context: RouterContext | undefined) => {
    if (built) {
      // What the build before this one had NestJS inject, by a context this one replaces.
      Reflect.deleteMetadata(PROPERTY_DEPS_METADATA, cls);
      Reflect.deleteMetadata(OPTIONAL_PROPERTY_DEPS_METADATA, cls);
      Reflect.deleteMetadata(ROUTE_ARGS_METADATA, cls, 'handler');
    }
    // A router that gives nothing leaves the endpoint as the package's own `endpoint` builds it.
    const giving =
      router && context && !isEmptyContext(context) ? { file: router.file, context } : undefined;
    const params = withRouterContext(at, options, giving);
    const paramsSchema = params.params;
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

    const members = declaredMembers(params, {
      at,
      owner: 'endpoint',
      injected: injectKeys,
      own: ENDPOINT_OWN_MEMBERS,
    });

    members.defineOn(cls, inject, `the endpoint of ${shown(file)}`);

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
      // The instance is `this` in a handler written as a method.
      return (params.handler as (this: unknown, handlerParams: any) => unknown).call(
        instance,
        handlerParams,
      );
    };

    const send = (instance: any, res: unknown, result: unknown) => {
      const { httpAdapter } = (instance as cls)[httpAdapterHostKey]!;
      return sendResponse(httpAdapter, res, toResponse(result, outputSchemas));
    };

    proto.invoke = async function (
      request: { params?: unknown; query?: unknown; input?: unknown } = {},
    ) {
      const result = await callHandler(
        this,
        { response, schemas },
        inputSchema && request.input,
        paramsSchema && request.params,
        querySchema && request.query,
      );
      const res = toResponse(result, outputSchemas);
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
        return isThenable(result)
          ? result.then((r) => send(this, res, r))
          : send(this, res, result);
      };

    const mount: EndpointSetupFn = ({ rootDirectories, basePath, namespaceChain, routerFile }) => {
      const { httpPath, httpPathPascalName, httpPathSegments } = explicitPath
        ? explicitHttpPath(basePath, explicitPath)
        : getEndpointHttpPath(rootDirectories, basePath, file);
      const url = '/' + httpPathSegments.join('/');
      // The path parameters it names, as the router reads them, in order.
      const urlParams = urlParamNames(url);
      // Before anything is applied: a listed endpoint may be set up again.
      if (giving && routerFile) {
        if (!isSameModule(giving.file, routerFile)) {
          throw new Error(
            `${shown(file)} is built with the endpoint of ${shown(giving.file)} but is ` +
              `owned by ${shown(routerFile)}. Build it with the \`endpoint\` of the router ` +
              'module that owns it.',
          );
        }
        const notInUrl = Object.keys(context?.params?.shape ?? {}).find(
          (key) => !urlParams.includes(key),
        );
        if (notInUrl) {
          throw new Error(
            `${shown(file)}: the \`params\` of its router include the path parameter ` +
              `\`${notInUrl}\`, but its URL, ${url}, has no ` +
              `\`:${notInUrl}\`. Put the endpoint under a \`$${notInUrl}\` folder, or declare ` +
              `the parameter on a router that only has endpoints under one. Its router is ` +
              `${shown(giving.file)}.`,
          );
        }
      }
      Object.defineProperty(cls, 'name', { value: `${httpPathPascalName}Endpoint` });
      Controller(httpPath)(cls);
      // A value of a path parameter that is a name beside it is no value: the URL is the name's.
      // Once, as a listed endpoint may be set up again.
      if (urlParams.length > 0 && !refusesNamesBeside) {
        UseGuards(NamesBesideGuard)(cls);
        refusesNamesBeside = true;
      }

      proto.handler = createHandlerMethod();
      parameterDecorators.forEach((decorator, i) => decorator(proto, 'handler', i));

      // A namespace tags the operation; without one, the URL's folders do
      // (everything but the leaf, without path params), so Swagger UI still
      // groups it.
      const autoTag =
        namespaceChain.length > 0 ? namespaceChain.join('/') : pathFolders(url).join('/');
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
        // Before `decorators`, so their guards and interceptors run first.
        ...(guards?.length ? [UseGuards(...guards)] : []),
        ...(interceptors?.length ? [UseInterceptors(...interceptors)] : []),
        ...(decorators ?? []),
      ];
      // Each schema is converted once; the decorators and the descriptor read
      // the same results. The decorators give `@nestjs/swagger` each schema as
      // the document should have it, which is known when the document is built.
      const document = (json: Parameters<typeof documentedPart>[2]) =>
        documentedPart(cls, () => descriptor, json);
      const endpointLabel = `endpoint "${httpPathPascalName}" (${httpMethod.toUpperCase()} ${url})`;
      const input = inputSchema && toJsonSchema(inputSchema, 'input', httpPathPascalName + 'Input');
      if (input) {
        // As a status's describes its response, the schema's description describes the body.
        const { description } = inputSchema;
        methodDecorators.push(
          ApiBody({
            ...(description && { description }),
            standardSchema: document(() => input.json),
          }),
        );
      }
      const query = querySchema && convertObject(querySchema, `The query of ${endpointLabel}`);
      if (query) {
        methodDecorators.push(
          ...apiParameters('query', query.parameters, (schema) => document(() => schema)),
        );
        readQuery = loneValuesAsArrays(query.parameters);
      }
      const paramsObject =
        paramsSchema && convertObject(paramsSchema, `The params of ${endpointLabel}`);
      if (paramsObject) {
        // A key the URL lacks is one NestJS never fills, and no path parameter of an OpenAPI
        // document. The URL is whole once a router sets the endpoint up: one evaluated outside
        // any router (a test imports it first) has no base path yet.
        const notInUrl = routerFile
          ? paramsObject.parameters.find(({ name }) => !urlParams.includes(name))
          : undefined;
        if (notInUrl) {
          const { name } = notInUrl;
          throw new Error(
            `${shown(file)}: its \`params\` include \`${name}\`, but its URL, ` +
              `${url}, has no \`:${name}\`. Remove it from \`params\`, or ` +
              `add it to the URL: a \`$${name}\` folder or file name, or \`:${name}\` in \`path\`.`,
          );
        }
        // Listed as the URL has them: in the schema, the parameters a router
        // declares come after the endpoint's own.
        const position = (name: string) => urlParams.indexOf(name);
        paramsObject.parameters.sort((a, b) => position(a.name) - position(b.name));
        methodDecorators.push(
          ...apiParameters('path', paramsObject.parameters, (schema) => document(() => schema)),
        );
      }
      const descriptorOutputs = (outputs ?? []).map(({ status, schema, description }) => {
        const schemaName = httpPathPascalName + (status === 200 ? '' : status) + 'Output';
        const converted = toJsonSchema(schema, 'output', schemaName);
        methodDecorators.push(
          ApiResponse({
            status,
            description,
            standardSchema: document(outputJson(converted.json)),
          }),
        );
        return { status, description, schema: converted };
      });
      applyDecorators(...methodDecorators)(
        proto,
        'handler',
        Object.getOwnPropertyDescriptor(proto, 'handler')!,
      );
      const descriptor: EndpointDescriptor = {
        operationId: httpPathPascalName,
        kind,
        method: httpMethod,
        path: toOpenApiPath(url),
        pathParams: urlParams.map((name) => {
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
      mounted(cls, descriptor);
      endpointSetUp();
    };
    return { context, members, mount };
  };
  const setupFn: EndpointSetupFn = (placement) => {
    const context = router?.context;
    if (!built || built.context !== context) {
      built = build(context);
    }
    built.mount(placement);
  };
  setUpBy(cls, setupFn);
  if (moduleAls.getStore()) {
    settings.endpoints.push({ file, setupFn });
  } else {
    setupFn({ rootDirectories: [process.cwd()], basePath: '', namespaceChain: [] });
  }

  return cls;
}

/** An endpoint's own `path` under its router's base path. */
function explicitHttpPath(basePath: string, explicitPath: string) {
  const httpPathSegments = [
    ...basePath.split('/').filter(Boolean),
    ...explicitPath.split('/').filter(Boolean),
  ];
  const httpPath = '/' + httpPathSegments.join('/');
  return { httpPath, httpPathSegments, httpPathPascalName: operationName(httpPath) };
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
