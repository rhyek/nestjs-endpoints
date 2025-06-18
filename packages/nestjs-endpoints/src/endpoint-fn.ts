import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  Head,
  Inject,
  Options,
  Patch,
  Post,
  Put,
  Query,
  Res,
  Type,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { z, ZodSchema } from 'zod';
import { settings } from './consts';
import {
  ZodSerializationException,
  ZodValidationException,
} from './exceptions';
import {
  ApiQueries,
  getCallsiteFile,
  getEndpointHttpPath,
  getHttpPathPascalName,
  moduleAls,
} from './helpers';
import { zodToOpenApi } from './zod-to-openapi';

type HttpMethod =
  | 'get'
  | 'post'
  | 'put'
  | 'delete'
  | 'patch'
  | 'head'
  | 'options';

const httpMethodDecorators = {
  get: Get,
  post: Post,
  put: Put,
  delete: Delete,
  patch: Patch,
  head: Head,
  options: Options,
} satisfies Record<HttpMethod, () => MethodDecorator>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class WithDecorator<_T> {
  constructor(public decorator: PropertyDecorator | ParameterDecorator) {}
}

export function decorated<T = any>(
  decorator: PropertyDecorator | ParameterDecorator,
) {
  return new WithDecorator<T>(decorator);
}

type MaybePromise<T> = T | Promise<T>;

type Schema = ZodSchema<any>;

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

type OutputSchemaUnion =
  | Schema
  | SchemaDef
  | Record<number, Schema | SchemaDef>
  | undefined;

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

type HandlerMethod<
  InjectProviders extends
    | Record<string, Type<any> | WithDecorator<any>>
    | undefined = undefined,
  InjectMethodParameters extends
    | Record<string, WithDecorator<any>>
    | undefined = undefined,
  InputSchema extends Schema | SchemaDef | undefined = undefined,
  OutputSchema extends OutputSchemaUnion = undefined,
> = (
  params: (InjectProviders extends undefined
    ? object
    : {
        [p in keyof InjectProviders]: InjectProviders[p] extends WithDecorator<
          infer ParameterType
        >
          ? ParameterType
          : InjectProviders[p] extends Type<infer ParameterType>
            ? ParameterType
            : never;
      }) &
    (InjectMethodParameters extends undefined
      ? object
      : {
          [p in keyof InjectMethodParameters]: InjectMethodParameters[p] extends WithDecorator<
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

type InvokeMethod<
  InputSchema extends Schema | SchemaDef | undefined = undefined,
  OutputSchema extends OutputSchemaUnion = undefined,
> = InputSchema extends undefined
  ? () => MaybePromise<OutputMapResponseUnion<OutputSchema>>
  : (
      rawInput: z.input<
        ExtractSchemaFromSchemaDef<NonNullable<InputSchema>>
      >,
    ) => MaybePromise<OutputMapResponseUnion<OutputSchema>>;

type EndpointControllerClass<
  InjectProviders extends
    | Record<string, Type<any> | WithDecorator<any>>
    | undefined = undefined,
  InjectMethodParameters extends
    | Record<string, WithDecorator<any>>
    | undefined = undefined,
  InputSchema extends Schema | SchemaDef | undefined = undefined,
  OutputSchema extends OutputSchemaUnion = undefined,
> = Type<{
  handler: HandlerMethod<
    InjectProviders,
    InjectMethodParameters,
    InputSchema,
    OutputSchema
  >;
  /**
   * Invoke the endpoint with raw input. Useful for testing.
   */
  invoke: InvokeMethod<InputSchema, OutputSchema>;
}>;

export function endpoint<
  InjectProviders extends
    | Record<string, Type<any> | WithDecorator<any>>
    | undefined = undefined,
  InjectMethodParameters extends
    | Record<string, WithDecorator<any>>
    | undefined = undefined,
  InputSchema extends Schema | SchemaDef | undefined = undefined,
  OutputSchema extends OutputSchemaUnion = undefined,
>(params: {
  /**
   * HTTP method.
   *
   * @default 'get'
   */
  method?: 'get' | 'post' | 'put' | 'delete' | 'patch';
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
   * Input Zod schema.
   *
   * ```ts
   * endpoint({
   *   input: z.object({
   *     name: z.string(),
   *   }),
   *   handler: ({ input: { name } }) => {}
   * })
   * ```
   */
  input?: InputSchema;
  /**
   * Output Zod schema.
   *
   * ```ts
   * endpoint({
   *   output: z.object({
   *     name: z.string(),
   *   }),
   *   handler: () => ({ name: 'John' })
   * })
   * ```
   */
  output?: OutputSchema;
  /**
   * Inject controller providers.
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
   * endpoint({
   *   inject: {
   *     userService: UserService,
   *   },
   *   handler: ({ userService }) => {},
   * })
   * ```
   */
  inject?: InjectProviders;
  /**
   * Inject method parameters.
   *
   * ```ts
   * // NestJS controller:
   * ⁣@Controller()
   * class UserController {
   *   ⁣@Get('/user')
   *   async getUser(@Req() req: Request) {}
   * }
   *
   * // nestjs-endpoints:
   * endpoint({
   *   injectMethod: {
   *     req: decorated<Request>(Req()),
   *   },
   *   handler: async ({ req }) => {},
   * })
   * ```
   */
  injectMethod?: InjectMethodParameters;
  /**
   * Method decorators.
   *
   * ```ts
   * // NestJS controller:
   * ⁣@Controller()
   * class UserController {
   *   ⁣@UseGuards(AuthGuard)
   *   ⁣@Get('/user')
   *   async getUser() {}
   * }
   *
   * // nestjs-endpoints:
   * endpoint({
   *   decorators: [UseGuards(AuthGuard)],
   *   handler: async () => {},
   * })
   * ```
   */
  decorators?: MethodDecorator[];
  handler: HandlerMethod<
    InjectProviders,
    InjectMethodParameters,
    InputSchema,
    OutputSchema
  >;
}): EndpointControllerClass<
  InjectProviders,
  InjectMethodParameters,
  InputSchema,
  OutputSchema
> {
  const {
    method: httpMethod = 'get',
    path: explicitPath,
    summary,
    tags,
    input,
    output,
    inject,
    injectMethod,
    decorators,
    handler,
  } = params;
  class cls {}
  const file = getCallsiteFile();
  const setupFn = ({
    rootDirectory,
    basePath,
  }: {
    rootDirectory: string;
    basePath: string;
  }) => {
    const { httpPath, httpPathPascalName, httpPathSegments } = (() => {
      if (explicitPath) {
        return {
          httpPath: explicitPath,
          httpPathSegments: explicitPath.split('/').filter(Boolean),
          httpPathPascalName: getHttpPathPascalName(explicitPath),
        };
      }
      return getEndpointHttpPath(rootDirectory, basePath, file);
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
    const resKey = Symbol('res');
    const methodParamDecorators: Record<
      string | symbol,
      ParameterDecorator
    >[] = [{ [resKey]: Res({ passthrough: true }) }];
    if (input) {
      methodParamDecorators.push({
        [inputKey]: httpMethod === 'get' ? Query() : Body(),
      });
    }
    if (injectMethod) {
      for (const [key, wd] of Object.entries(injectMethod)) {
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
        const s = schema instanceof SchemaDef ? schema.schema : schema;
        const parsed = s.safeParse(endpointResponse.body);
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
    ) {
      if (inject) {
        for (const key of Object.keys(inject)) {
          handlerParams[key] = this[key];
        }
      }
      if (input) {
        const schema: ZodSchema =
          input instanceof SchemaDef ? input.schema : input;
        const parsed = schema.safeParse(rawInput);
        if (parsed.error) {
          throw new ZodValidationException(parsed.error);
        }
        handlerParams.input = parsed.data;
        handlerParams.rawInput = rawInput;
        handlerParams.schemas.input = schema;
      }
      // eslint-disable-next-line @typescript-eslint/await-thenable
      const result: any = await handler(handlerParams as any);
      return result;
    };

    // invoke method
    (cls.prototype as any).invoke = async function (rawInput: any) {
      const handlerParams: Record<string | symbol, any> = {
        response,
        schemas: {},
      };
      const result = await commonHandlerLogic.call(
        this,
        handlerParams,
        rawInput,
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
      if (injectMethod) {
        for (const key of Object.keys(injectMethod)) {
          handlerParams[key] = injectedMethodParams[key];
        }
      }
      const rawInput = injectedMethodParams[inputKey];
      const result = await commonHandlerLogic.call(
        this,
        handlerParams,
        rawInput,
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
      if (body === null) {
        httpAdapter.reply(res, JSON.stringify(null));
        return;
      }
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
    const _tags: string[] = [];
    for (let i = 0; i < httpPathSegments.length - 1; i++) {
      const tag = httpPathSegments.slice(0, i + 1).join('/');
      _tags.push(tag);
    }
    const methodDecorators: MethodDecorator[] = [
      ApiOperation({
        operationId: httpPathPascalName,
        tags: [..._tags, ...(tags ?? [])],
        summary: summary ?? '',
      }),
      httpMethodDecorators[httpMethod](''),
      ...(decorators ?? []),
    ];
    if (input) {
      const schema: ZodSchema =
        input instanceof SchemaDef ? input.schema : input;
      const schemaName = httpPathPascalName + 'Input';
      if (httpMethod === 'get') {
        methodDecorators.push(ApiQueries(schema as any));
      } else {
        const { openApiSchema } = zodToOpenApi({
          schema,
          schemaType: 'input',
          ref: schemaName,
        });
        methodDecorators.push(ApiBody({ schema: openApiSchema }));
      }
    }
    if (outputSchemas) {
      for (const [status, schema] of Object.entries(outputSchemas)) {
        const s: ZodSchema =
          schema instanceof SchemaDef ? schema.schema : schema;
        const schemaName =
          httpPathPascalName +
          `${status === '200' ? '' : status}` +
          'Output';
        const { openApiSchema } = zodToOpenApi({
          schema: s,
          schemaType: 'output',
          ref: schemaName,
        });
        methodDecorators.push(
          ApiResponse({
            status: Number(status),
            schema: openApiSchema,
            description:
              schema instanceof SchemaDef ? schema.description : undefined,
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
  };
  if (moduleAls.getStore()) {
    settings.endpoints.push({
      file,
      setupFn,
    });
  } else {
    setupFn({ rootDirectory: process.cwd(), basePath: '' });
  }

  return cls as any;
}
