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
import {
  ApiBody,
  ApiExtension,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { z, ZodNull, ZodNullable, ZodType } from 'zod';
import { EndpointSetupFn, settings } from './consts.js';
import {
  ConvertedSchema,
  DESCRIPTOR_METADATA_KEY,
  EndpointDescriptor,
  toOpenApiPath,
} from './descriptors.js';
import {
  ZodSerializationException,
  ZodValidationException,
} from './exceptions.js';
import {
  getCallsiteFile,
  getEndpointHttpPath,
  getHttpPathPascalName,
  moduleAls,
} from './helpers.js';
import { isSameModule } from './manifest/scan.js';
import { convertObject, ObjectSchemaLike } from './object-parameters.js';
import { JsonSchema, toJsonSchema } from './zod-to-openapi.js';

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class WithDecorator<_T> {
  constructor(public decorator: PropertyDecorator | ParameterDecorator) {}
}

export function decorated<T = any>(
  decorator: PropertyDecorator | ParameterDecorator,
) {
  return new WithDecorator<T>(decorator);
}

export type InjectProvidersMap =
  Record<string, Type<any> | WithDecorator<any>> | undefined;
export type InjectOnRequestMap =
  Record<string, WithDecorator<any>> | undefined;

type MaybePromise<T> = T | Promise<T>;

type Schema = ZodType<any>;

class SchemaDef<S extends Schema = Schema> {
  constructor(
    public schema: S,
    public description: string | undefined,
  ) {}
}
type ExtractSchemaFromSchemaDef<S extends Schema | SchemaDef<Schema>> =
  S extends SchemaDef<infer _S> ? _S : S;

export function schema<S extends Schema>(
  schema: S,
  spec?: { description?: string },
) {
  return new SchemaDef<S>(schema, spec?.description);
}

/** The zod schema of an option, bare or given through `schema()`. */
function unwrapSchema<S extends Schema>(s: S | SchemaDef<S>): S {
  return s instanceof SchemaDef ? s.schema : s;
}

/**
 * A `params` or `query` schema: an object, bare or behind a transform or
 * preprocess.
 */
type ObjectSchemaUnion =
  ObjectSchemaLike | SchemaDef<ObjectSchemaLike> | undefined;

type OutputSchemaUnion =
  Schema | SchemaDef | Record<number, Schema | SchemaDef> | undefined;

type OutputMap<OS extends OutputSchemaUnion> = OS extends undefined
  ? never
  : OS extends Schema | SchemaDef
    ? { 200: ExtractSchemaFromSchemaDef<OS> }
    : OS extends Record<number, Schema | SchemaDef>
      ? { [k in keyof OS & number]: ExtractSchemaFromSchemaDef<OS[k]> }
      : never;

type OutputMapKey<OS extends OutputSchemaUnion> = keyof OutputMap<OS> &
  number;

type OutputMapValue<
  OS extends OutputSchemaUnion,
  K extends OutputMapKey<OS>,
> = OS extends undefined
  ? any
  : OutputMap<OS>[K] extends Schema
    ? z.input<OutputMap<OS>[K]>
    : never;

export class EndpointResponse<Status extends number = any, Body = any> {
  constructor(
    public status: Status,
    public body: Body,
  ) {}
}

type OutputMapResponseUnion<OS extends OutputSchemaUnion> = {
  [Status in OutputMapKey<OS>]: EndpointResponse<
    Status,
    OutputMapValue<OS, Status>
  >;
}[keyof OutputMap<OS> & number];

/**
 * A body as it is *surfaced*, after the output schema has parsed it — so a
 * `.transform()` has already been applied. The mirror image of
 * `OutputMapValue`, which describes what a handler may hand *in*
 * (pre-transform).
 */
type OutputMapBody<
  OS extends OutputSchemaUnion,
  K extends OutputMapKey<OS>,
> = OS extends undefined
  ? any
  : OutputMap<OS>[K] extends Schema
    ? z.output<OutputMap<OS>[K]>
    : never;

type InvokeResponseUnion<OS extends OutputSchemaUnion> = {
  [Status in OutputMapKey<OS>]: EndpointResponse<
    Status,
    OutputMapBody<OS, Status>
  >;
}[keyof OutputMap<OS> & number];

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
    ? z.output<ExtractSchemaFromSchemaDef<OS>>
    : OS extends Record<number, Schema | SchemaDef>
      ? InvokeResponseUnion<OS>
      : never;

type HandlerMethod<
  InjectProviders extends InjectProvidersMap = undefined,
  InjectOnRequestParameters extends InjectOnRequestMap = undefined,
  InputSchema extends Schema | SchemaDef | undefined = undefined,
  ParamsSchema extends Schema | SchemaDef | undefined = undefined,
  QuerySchema extends Schema | SchemaDef | undefined = undefined,
  OutputSchema extends OutputSchemaUnion = undefined,
> = (
  params: (InjectProviders extends undefined
    ? object
    : {
        [
          p in keyof InjectProviders
        ]: InjectProviders[p] extends WithDecorator<infer ParameterType>
          ? ParameterType
          : InjectProviders[p] extends Type<infer ParameterType>
            ? ParameterType
            : never;
      }) &
    (InjectOnRequestParameters extends undefined
      ? object
      : {
          [
            p in keyof InjectOnRequestParameters
          ]: InjectOnRequestParameters[p] extends WithDecorator<
            infer ParameterType
          >
            ? ParameterType
            : never;
        }) &
    (InputSchema extends undefined
      ? object
      : {
          input: z.output<
            ExtractSchemaFromSchemaDef<NonNullable<InputSchema>>
          >;
          rawInput: unknown;
        }) &
    (ParamsSchema extends undefined
      ? object
      : {
          params: z.output<
            ExtractSchemaFromSchemaDef<NonNullable<ParamsSchema>>
          >;
        }) &
    (QuerySchema extends undefined
      ? object
      : {
          query: z.output<
            ExtractSchemaFromSchemaDef<NonNullable<QuerySchema>>
          >;
        }) & {
      response: <
        Status extends OutputMapKey<OutputSchema>,
        Body extends OutputMapValue<OutputSchema, Status>,
      >(
        status: Status,
        body: Body,
      ) => EndpointResponse<Status, Body>;
    } & {
      schemas: object &
        (InputSchema extends undefined
          ? object
          : {
              input: ExtractSchemaFromSchemaDef<NonNullable<InputSchema>>;
            }) &
        (ParamsSchema extends undefined
          ? object
          : {
              params: ExtractSchemaFromSchemaDef<
                NonNullable<ParamsSchema>
              >;
            }) &
        (QuerySchema extends undefined
          ? object
          : {
              query: ExtractSchemaFromSchemaDef<NonNullable<QuerySchema>>;
            });
    },
) => OutputSchema extends undefined
  ? MaybePromise<any>
  : OutputSchema extends Record<number, Schema | SchemaDef>
    ? MaybePromise<OutputMapResponseUnion<OutputSchema>>
    : OutputSchema extends Schema
      ? MaybePromise<
          | z.input<NonNullable<OutputSchema>>
          | OutputMapResponseUnion<OutputSchema>
        >
      : never;

type QueryInput<QuerySchema extends Schema | SchemaDef | undefined> =
  z.input<ExtractSchemaFromSchemaDef<NonNullable<QuerySchema>>>;

type InvokeOptions<
  ParamsSchema extends Schema | SchemaDef | undefined = undefined,
  QuerySchema extends Schema | SchemaDef | undefined = undefined,
> = (ParamsSchema extends undefined
  ? object
  : {
      params: z.input<
        ExtractSchemaFromSchemaDef<NonNullable<ParamsSchema>>
      >;
    }) &
  (QuerySchema extends undefined
    ? object
    : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      {} extends QueryInput<QuerySchema>
      ? { query?: QueryInput<QuerySchema> }
      : { query: QueryInput<QuerySchema> });

/**
 * Whether `invoke` may leave out its options: no path params, and no search
 * param it must be given.
 */
type InvokeOptionsOptional<
  ParamsSchema extends Schema | SchemaDef | undefined,
  QuerySchema extends Schema | SchemaDef | undefined,
> = ParamsSchema extends undefined
  ? QuerySchema extends undefined
    ? true
    : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      {} extends QueryInput<QuerySchema>
      ? true
      : false
  : false;

type InvokeMethod<
  InputSchema extends Schema | SchemaDef | undefined = undefined,
  ParamsSchema extends Schema | SchemaDef | undefined = undefined,
  QuerySchema extends Schema | SchemaDef | undefined = undefined,
  OutputSchema extends OutputSchemaUnion = undefined,
> = InputSchema extends undefined
  ? [ParamsSchema, QuerySchema] extends [undefined, undefined]
    ? () => MaybePromise<InvokeReturn<OutputSchema>>
    : InvokeOptionsOptional<ParamsSchema, QuerySchema> extends true
      ? (
          opts?: InvokeOptions<ParamsSchema, QuerySchema>,
        ) => MaybePromise<InvokeReturn<OutputSchema>>
      : (
          opts: InvokeOptions<ParamsSchema, QuerySchema>,
        ) => MaybePromise<InvokeReturn<OutputSchema>>
  : [ParamsSchema, QuerySchema] extends [undefined, undefined]
    ? (
        rawInput: z.input<
          ExtractSchemaFromSchemaDef<NonNullable<InputSchema>>
        >,
      ) => MaybePromise<InvokeReturn<OutputSchema>>
    : InvokeOptionsOptional<ParamsSchema, QuerySchema> extends true
      ? (
          rawInput: z.input<
            ExtractSchemaFromSchemaDef<NonNullable<InputSchema>>
          >,
          opts?: InvokeOptions<ParamsSchema, QuerySchema>,
        ) => MaybePromise<InvokeReturn<OutputSchema>>
      : (
          rawInput: z.input<
            ExtractSchemaFromSchemaDef<NonNullable<InputSchema>>
          >,
          opts: InvokeOptions<ParamsSchema, QuerySchema>,
        ) => MaybePromise<InvokeReturn<OutputSchema>>;

type EndpointControllerClass<
  InjectProviders extends InjectProvidersMap = undefined,
  InjectOnRequestParameters extends InjectOnRequestMap = undefined,
  InputSchema extends Schema | SchemaDef | undefined = undefined,
  ParamsSchema extends Schema | SchemaDef | undefined = undefined,
  QuerySchema extends Schema | SchemaDef | undefined = undefined,
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
  invoke: InvokeMethod<
    InputSchema,
    ParamsSchema,
    QuerySchema,
    OutputSchema
  >;
}>;

/** Both maps' entries, when either may be `undefined`. */
type MergeInjections<A, B> = A extends undefined
  ? B
  : B extends undefined
    ? A
    : A & B;

/** The keys a router injects, which its endpoints may not declare again. */
type RouterInjectedKeys<RouterInject, RouterInjectOnRequest> =
  | (RouterInject extends undefined ? never : keyof RouterInject)
  | (RouterInjectOnRequest extends undefined
      ? never
      : keyof RouterInjectOnRequest);

// A key `Map` may not declare is typed as a message naming it, so the error
// reads as the cause. `NoInfer` keeps the maps inferred from what they
// declare, not from the message.
export type WithoutKeys<Map, Keys, Reason extends string> = Map & {
  [K in keyof NoInfer<Map> & NoInfer<Keys>]: `\`${K & string}\` ${Reason}`;
};

type WithoutRouterKeys<Map, RouterInject, RouterInjectOnRequest> =
  WithoutKeys<
    Map,
    RouterInjectedKeys<RouterInject, RouterInjectOnRequest>,
    'is already injected by its router'
  >;

type EndpointOptions<
  InjectProviders extends InjectProvidersMap,
  InjectOnRequestParameters extends InjectOnRequestMap,
  Method extends EndpointMethod,
  InputSchema extends Schema | SchemaDef | undefined,
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
   * Output Zod schema.
   *
   * Cannot use nullable output type, since NestJS will not actually responde with `null`.
   * More info: https://github.com/nestjs/nest/issues/10415
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
  output?: OutputSchema extends ZodNull | ZodNullable<any>
    ? never
    : OutputSchema;
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
  inject?: WithoutRouterKeys<
    InjectProviders,
    RouterInject,
    RouterInjectOnRequest
  >;
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
  injectMethod?: WithoutRouterKeys<
    InjectOnRequestParameters,
    RouterInject,
    RouterInjectOnRequest
  >;
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
  InputSchema extends Schema | SchemaDef | undefined = undefined,
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
  query: (params) =>
    defineEndpoint('query', getCallsiteFile(), params as any),
  mutation: (params) =>
    defineEndpoint('mutation', getCallsiteFile(), params as any),
};

/** An endpoint's `injectOnRequest`, or the deprecated name it gave it. */
function injectOnRequestOf(params: {
  injectOnRequest?: InjectOnRequestMap;
  injectMethod?: InjectOnRequestMap;
  injectAtRequest?: InjectOnRequestMap;
}): InjectOnRequestMap {
  return (
    params.injectOnRequest ?? params.injectMethod ?? params.injectAtRequest
  );
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
  const inBoth = Object.keys(inject ?? {}).find((key) =>
    Object.hasOwn(injectOnRequest ?? {}, key),
  );
  if (inBoth) {
    throw new Error(
      `EndpointRouterModule.create() in ${routerFile}: \`${inBoth}\` is in ` +
        'both `inject` and `injectOnRequest`.',
    );
  }
  const routerKeys = new Set(
    Object.keys({ ...inject, ...injectOnRequest }),
  );
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
    Schema | SchemaDef | undefined,
    ObjectSchemaUnion,
    ObjectSchemaUnion,
    OutputSchemaUnion
  >,
  // The router whose `endpoint` built it; none for the package's builders.
  builderRouterFile?: string,
): any {
  const {
    method: httpMethod = 'post',
    path: explicitPath,
    summary,
    tags,
    output,
    inject,
    decorators,
    handler,
  } = params;
  if (!Object.hasOwn(httpMethodDecorators, httpMethod)) {
    const methods = Object.keys(httpMethodDecorators)
      .map((m) => `'${m}'`)
      .join(', ');
    throw new Error(
      `endpoint.${kind}() in ${file}: \`method\` must be one of ` +
        `${methods}; got ${JSON.stringify(httpMethod)}.`,
    );
  }
  // `input` is typed `never` here, where `method` may be any method.
  const inputOption = params.input as Schema | SchemaDef | undefined;
  const inputSchema = inputOption && unwrapSchema(inputOption);
  const paramsSchema = params.params && unwrapSchema(params.params);
  const querySchema = params.query && unwrapSchema(params.query);
  if (inputSchema && httpMethod === 'get') {
    throw new Error(
      `endpoint.${kind}() in ${file}: a GET endpoint cannot declare ` +
        '`input`, since a GET request has no body. Use `query` for ' +
        'search parameters, or another `method`.',
    );
  }
  const injectOnRequest = injectOnRequestOf(params);
  class cls {}
  const setupFn: EndpointSetupFn = ({
    rootDirectories,
    basePath,
    namespaceChain,
    routerFile,
  }) => {
    // Before anything is applied: a listed endpoint may be set up again.
    if (
      builderRouterFile &&
      routerFile &&
      !isSameModule(builderRouterFile, routerFile)
    ) {
      const shown = (f: string) => path.relative(process.cwd(), f);
      throw new Error(
        `${shown(file)} is built with the endpoint of ` +
          `${shown(builderRouterFile)} but is owned by ` +
          `${shown(routerFile)}. Build it with the \`endpoint\` of the ` +
          'router module that owns it.',
      );
    }
    const { httpPath, httpPathPascalName, httpPathSegments } = (() => {
      if (explicitPath) {
        const segments = [
          ...basePath.split('/').filter(Boolean),
          ...explicitPath.split('/').filter(Boolean),
        ];
        const combined = '/' + segments.join('/');
        return {
          httpPath: combined,
          httpPathSegments: segments,
          httpPathPascalName: getHttpPathPascalName(combined),
        };
      }
      return getEndpointHttpPath(rootDirectories, basePath, file);
    })();
    let outputSchemas: Record<number, Schema | SchemaDef> | null = null;
    if (output) {
      if (
        output.constructor === Object &&
        Object.keys(output).length > 0 &&
        Object.keys(output).every((k) => Number.isInteger(Number(k)))
      ) {
        outputSchemas = output as any;
      } else {
        outputSchemas = { 200: output as any };
      }
    }

    // class
    Object.defineProperty(cls, 'name', {
      value: `${httpPathPascalName}Endpoint`,
    });
    const controllerDecorator = applyDecorators(Controller(httpPath));
    controllerDecorator(cls);
    const httpAdapterHostKey = Symbol('httpAdapterHost');
    Inject(HttpAdapterHost)(cls.prototype, httpAdapterHostKey);
    if (inject) {
      for (const [key, token] of Object.entries(inject)) {
        if (token instanceof WithDecorator) {
          (token.decorator as PropertyDecorator)(cls.prototype, key);
        } else {
          Inject(token)(cls.prototype, key);
        }
      }
    }

    // define method parameters
    const inputKey = Symbol('input');
    const paramsKey = Symbol('params');
    const queryKey = Symbol('query');
    const resKey = Symbol('res');
    const methodParamDecorators: Record<
      string | symbol,
      ParameterDecorator
    >[] = [{ [resKey]: Res({ passthrough: true }) }];
    if (inputSchema) {
      methodParamDecorators.push({
        [inputKey]: Body(),
      });
    }
    if (paramsSchema) {
      methodParamDecorators.push({ [paramsKey]: Param() });
    }
    if (querySchema) {
      methodParamDecorators.push({ [queryKey]: Query() });
    }
    if (injectOnRequest) {
      for (const [key, wd] of Object.entries(injectOnRequest)) {
        methodParamDecorators.push({
          [key]: wd.decorator as ParameterDecorator,
        });
      }
    }

    const validateOutput = (endpointResponse: EndpointResponse) => {
      if (outputSchemas) {
        const schema = outputSchemas[endpointResponse.status];
        if (!schema) {
          throw new Error(
            `Did not find schema for status code ${endpointResponse.status}`,
          );
        }
        const parsed = unwrapSchema(schema).safeParse(
          endpointResponse.body,
        );
        if (parsed.error) {
          throw new ZodSerializationException(parsed.error);
        }
        endpointResponse.body = parsed.data;
      }
    };

    const response = (s: number, b: any) => new EndpointResponse(s, b);

    const commonHandlerLogic = async function (
      this: any,
      handlerParams: Record<string | symbol, any>,
      rawInput: any,
      rawParams: any,
      rawQuery: any,
    ) {
      if (inject) {
        for (const key of Object.keys(inject)) {
          handlerParams[key] = this[key];
        }
      }
      if (inputSchema) {
        // A request without a body reads as `{}`, like `query` and
        // `params`, unless the schema accepts a missing body as it is.
        let parsed = inputSchema.safeParse(rawInput);
        if (parsed.error && rawInput === undefined) {
          parsed = inputSchema.safeParse({});
        }
        if (parsed.error) {
          throw new ZodValidationException(parsed.error);
        }
        handlerParams.input = parsed.data;
        handlerParams.rawInput = rawInput;
        handlerParams.schemas.input = inputSchema;
      }
      if (paramsSchema) {
        const parsed = paramsSchema.safeParse(rawParams ?? {});
        if (parsed.error) {
          throw new ZodValidationException(parsed.error);
        }
        handlerParams.params = parsed.data;
        handlerParams.schemas.params = paramsSchema;
      }
      if (querySchema) {
        const parsed = querySchema.safeParse(rawQuery ?? {});
        if (parsed.error) {
          throw new ZodValidationException(parsed.error);
        }
        handlerParams.query = parsed.data;
        handlerParams.schemas.query = querySchema;
      }

      const result: any = await handler(handlerParams as any);
      return result;
    };

    // invoke method
    (cls.prototype as any).invoke = async function (
      rawInputOrOpts?: any,
      maybeOpts?: any,
    ) {
      // When the endpoint has no `input` schema, callers can pass the
      // options object as the first argument: `invoke({ params, query })`.
      const rawInput = inputSchema ? rawInputOrOpts : undefined;
      const opts = inputSchema ? maybeOpts : rawInputOrOpts;
      const rawParams = paramsSchema ? opts?.params : undefined;
      const rawQuery = querySchema ? opts?.query : undefined;
      const handlerParams: Record<string | symbol, any> = {
        response,
        schemas: {},
      };
      const result = await commonHandlerLogic.call(
        this,
        handlerParams,
        rawInput,
        rawParams,
        rawQuery,
      );
      if (result instanceof EndpointResponse) {
        validateOutput(result);
        return result;
      } else {
        const endpointResponse = new EndpointResponse(200, result);
        validateOutput(endpointResponse);
        return endpointResponse.body;
      }
    };

    // handler method
    (cls.prototype as any).handler = async function (...params: any[]) {
      const injectedMethodParams: Record<string | symbol, any> =
        Object.fromEntries(
          methodParamDecorators.map((p, i) => {
            const key = Reflect.ownKeys(p)[0];
            return [key, params[i]] as const;
          }),
        );
      const handlerParams: Record<string | symbol, any> = {
        response,
        schemas: {},
      };
      if (injectOnRequest) {
        for (const key of Object.keys(injectOnRequest)) {
          handlerParams[key] = injectedMethodParams[key];
        }
      }
      const rawInput = injectedMethodParams[inputKey];
      const rawParams = injectedMethodParams[paramsKey];
      const rawQuery = injectedMethodParams[queryKey];
      const result = await commonHandlerLogic.call(
        this,
        handlerParams,
        rawInput,
        rawParams,
        rawQuery,
      );
      let endpointResponse: EndpointResponse;
      if (result instanceof EndpointResponse) {
        endpointResponse = result;
      } else {
        endpointResponse = new EndpointResponse(200, result);
      }
      validateOutput(endpointResponse);
      const res = injectedMethodParams[resKey];
      const httpAdapterHost: HttpAdapterHost = this[httpAdapterHostKey];
      const httpAdapter = httpAdapterHost.httpAdapter;
      const { status, body } = endpointResponse;
      httpAdapter.status(res, status);
      if (typeof body !== 'string') {
        httpAdapter.setHeader(res, 'Content-Type', 'application/json');
      }
      // The following affects middleware that adds headers after controller execution.
      // Best to let NestJS do the default. Hence, null outputs are no longer supported.
      // http://github.com/nestjs/nest/issues/10415
      // if (body === null) {
      //   httpAdapter.reply(res, JSON.stringify(null));
      //   return;
      // }
      return body;
    };
    // configure method parameters
    for (let i = 0; i < methodParamDecorators.length; i++) {
      const paramDecorator = methodParamDecorators[i];
      const key = Reflect.ownKeys(paramDecorator)[0];
      const decorator = paramDecorator[key];
      decorator(cls.prototype, 'handler', i);
    }

    // method
    const autoTag = ((): string | null => {
      if (namespaceChain.length > 0) {
        return namespaceChain.join('/');
      }
      // No namespace declared — fall back to the URL prefix (everything
      // but the leaf) so Swagger UI still groups meaningfully. Path
      // parameters (`:id`) are dropped so the tag stays a clean folder
      // name like `recipes` rather than `recipes/:id`.
      if (httpPathSegments.length > 1) {
        const tagSegments = httpPathSegments
          .slice(0, -1)
          .filter((s) => !s.startsWith(':'));
        if (tagSegments.length > 0) {
          return tagSegments.join('/');
        }
      }
      return null;
    })();
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
      ...(namespaceChain.length > 0
        ? [ApiExtension('x-namespace', namespaceChain)]
        : []),
      httpMethodDecorators[httpMethod](''),
      // The handler sets the status itself; this is the one the OpenAPI
      // document gives an endpoint without `output`, which a POST would
      // otherwise get as 201.
      HttpCode(200),
      ...(decorators ?? []),
    ];
    // Each schema is converted once; the decorators and the descriptor
    // read the same results.
    const endpointLabel = `endpoint "${httpPathPascalName}" (${httpMethod.toUpperCase()} /${httpPathSegments.join('/')})`;
    let descriptorInput: ConvertedSchema | undefined;
    let descriptorQuery: EndpointDescriptor['query'];
    if (inputSchema) {
      const converted = toJsonSchema(
        inputSchema,
        'input',
        httpPathPascalName + 'Input',
      );
      descriptorInput = {
        json: converted.schema,
        components: converted.components,
      };
      methodDecorators.push(ApiBody({ schema: converted.schema }));
    }
    if (querySchema) {
      const converted = convertObject(
        querySchema,
        `The query of ${endpointLabel}`,
      );
      descriptorQuery = {
        json: converted.schema,
        components: converted.components,
        parameters: converted.parameters,
      };
      methodDecorators.push(
        ...converted.parameters.map((p) =>
          ApiQuery({
            name: p.name,
            required: p.required,
            schema: p.schema,
          }),
        ),
      );
    }
    const paramSchemas = new Map<string, JsonSchema>();
    let descriptorParams: ConvertedSchema | undefined;
    if (paramsSchema) {
      const converted = convertObject(
        paramsSchema as any,
        `The params of ${endpointLabel}`,
      );
      descriptorParams = {
        json: converted.schema,
        components: converted.components,
      };
      for (const p of converted.parameters) {
        paramSchemas.set(p.name, p.schema);
        // Path parameters are always required in OpenAPI.
        methodDecorators.push(
          ApiParam({ name: p.name, required: true, schema: p.schema }),
        );
      }
    }
    const descriptorOutputs: EndpointDescriptor['outputs'] = [];
    if (outputSchemas) {
      for (const [status, schema] of Object.entries(outputSchemas)) {
        const schemaName =
          httpPathPascalName +
          `${status === '200' ? '' : status}` +
          'Output';
        const converted = toJsonSchema(
          unwrapSchema(schema),
          'output',
          schemaName,
        );
        const description =
          schema instanceof SchemaDef ? schema.description : undefined;
        descriptorOutputs.push({
          status: Number(status),
          description,
          schema: {
            json: converted.schema,
            components: converted.components,
          },
        });
        methodDecorators.push(
          ApiResponse({
            status: Number(status),
            schema: converted.schema,
            description,
          }),
        );
      }
    }
    const methodDecorator = applyDecorators(...methodDecorators);
    const descriptor = Object.getOwnPropertyDescriptor(
      cls.prototype,
      'handler',
    );
    methodDecorator(cls.prototype, 'handler', descriptor);
    Reflect.defineMetadata('endpoints:path', httpPath, cls);
    const endpointDescriptor: EndpointDescriptor = {
      operationId: httpPathPascalName,
      kind,
      method: httpMethod,
      path: toOpenApiPath('/' + httpPathSegments.join('/')),
      pathParams: httpPathSegments
        .filter((segment) => segment.startsWith(':'))
        .map((segment) => {
          const name = segment.slice(1);
          return {
            name,
            schema: paramSchemas.get(name) ?? { type: 'string' },
          };
        }),
      ...(descriptorParams ? { params: descriptorParams } : {}),
      ...(descriptorQuery ? { query: descriptorQuery } : {}),
      namespaceChain,
      tags: operationTags,
      summary: operationSummary,
      ...(descriptorInput ? { input: descriptorInput } : {}),
      outputs: descriptorOutputs,
    };
    Reflect.defineMetadata(
      DESCRIPTOR_METADATA_KEY,
      endpointDescriptor,
      cls,
    );
  };
  Reflect.defineMetadata('endpoints:setupFn', setupFn, cls);
  if (moduleAls.getStore()) {
    settings.endpoints.push({
      file,
      setupFn,
    });
  } else {
    setupFn({
      rootDirectories: [process.cwd()],
      basePath: '',
      namespaceChain: [],
    });
  }

  return cls as any;
}
