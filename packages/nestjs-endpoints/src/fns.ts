/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Patch,
  Post,
  Put,
  Query,
  Res,
  Type,
  UsePipes,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  createZodDto,
  ZodSerializerDto,
  ZodValidationPipe,
} from 'nestjs-zod';
import { z, ZodObject, ZodSchema } from 'zod';
import { ApiQueries, getEndpointHttpPath, shouldJson } from './helpers';

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';
const httpMethodDecorators = {
  get: Get,
  post: Post,
  put: Put,
  delete: Delete,
  patch: Patch,
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

class EndpointResponse<Status extends number = any, Body = any> {
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
  method?: 'get' | 'post' | 'put' | 'delete' | 'patch';
  summary?: string;
  tags?: string[];
  input?: InputSchema;
  output?: OutputSchema;
  inject?: InjectProviders;
  injectMethod?: InjectMethodParameters;
  decorators?: MethodDecorator[];
  handler: (
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
          }) & {
        response: <
          Status extends OutputMapKey<OutputSchema>,
          Body extends OutputMapValue<OutputSchema, Status>,
        >(
          status: Status,
          body: Body,
        ) => EndpointResponse<Status, Body>;
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
}) {
  const {
    method: httpMethod = 'get',
    summary,
    tags,
    input,
    output,
    inject,
    injectMethod,
    decorators,
    handler,
  } = params;
  const { httpPath, httpPathPascalName, httpPathSegments } =
    getEndpointHttpPath();

  let outputSchemas: Record<number, Schema | SchemaDef> | null = null;
  if (output) {
    if (output instanceof SchemaDef || output instanceof ZodSchema) {
      outputSchemas = { 200: output };
    } else {
      outputSchemas = output;
    }
  }

  // class
  class cls {}
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
  const resKey = Symbol('res');
  const methodParamDecorators: Record<
    string | symbol,
    ParameterDecorator
  >[] = [{ [resKey]: Res() }];
  if (injectMethod) {
    for (const [key, wd] of Object.entries(injectMethod)) {
      methodParamDecorators.push({
        [key]: wd.decorator as ParameterDecorator,
      });
    }
  }
  if (input) {
    methodParamDecorators.push({
      input: httpMethod === 'get' ? Query() : Body(),
    });
  }

  // handler method
  const response = (s: number, b: any) => new EndpointResponse(s, b);
  (cls.prototype as any).handler = function (...params: any[]) {
    const injectedMethodParams: Record<string | symbol, any> =
      Object.fromEntries(
        methodParamDecorators.map((p, i) => {
          const key = Reflect.ownKeys(p)[0];
          return [key, params[i]] as const;
        }),
      );
    const handlerParams: Record<string | symbol, any> = { response };
    if (inject) {
      for (const key of Object.keys(inject)) {
        handlerParams[key] = this[key];
      }
    }
    if (injectMethod) {
      for (const key of Object.keys(injectMethod)) {
        handlerParams[key] = injectedMethodParams[key];
      }
    }
    if (input) {
      handlerParams.input = injectedMethodParams.input;
    }
    const result: any = handler(handlerParams as any);
    let endpointResponse: EndpointResponse;
    if (result instanceof EndpointResponse) {
      endpointResponse = result;
    } else {
      endpointResponse = new EndpointResponse(200, result);
    }
    if (outputSchemas) {
      const schema = outputSchemas[endpointResponse.status];
      if (!schema) {
        throw new Error(
          `Did not find schema for status code ${endpointResponse.status}`,
        );
      }
      const s = schema instanceof SchemaDef ? schema.schema : schema;
      endpointResponse.body = s.parse(endpointResponse.body);
    }
    const res = injectedMethodParams[resKey];
    const httpAdapterHost: HttpAdapterHost = this[httpAdapterHostKey];
    const httpAdapter = httpAdapterHost.httpAdapter;
    const { status, body } = endpointResponse;
    httpAdapter.status(res, status);
    if (shouldJson(body)) {
      httpAdapter.setHeader(res, 'Content-Type', 'application/json');
      httpAdapter.reply(res, JSON.stringify(body));
    } else {
      httpAdapter.setHeader(res, 'Content-Type', 'text/plain');
      httpAdapter.reply(res, body);
    }
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
    const dto = createZodDto(input as any);
    if (!(dto.schema instanceof ZodObject)) {
      throw new Error('Input dto.schema must be a ZodObject');
    }
    const schemaName = httpPathPascalName + 'Input';
    Object.defineProperty(dto, 'name', { value: schemaName });
    if (httpMethod === 'get') {
      methodDecorators.push(ApiQueries(dto.schema));
    } else {
      methodDecorators.push(ApiBody({ type: dto }));
    }
    methodDecorators.push(UsePipes(new ZodValidationPipe(dto)));
  }
  if (outputSchemas) {
    for (const [status, schema] of Object.entries(outputSchemas)) {
      const s = schema instanceof SchemaDef ? schema.schema : schema;
      const dto = createZodDto(s as any);
      const schemaName =
        httpPathPascalName +
        `${status === '200' ? '' : status}` +
        'Output';
      Object.defineProperty(dto, 'name', { value: schemaName });
      methodDecorators.push(
        ApiResponse({
          status: Number(status),
          type: dto,
          description:
            schema instanceof SchemaDef ? schema.description : undefined,
        }),
      );
      methodDecorators.push(ZodSerializerDto(dto));
    }
  }
  const methodDecorator = applyDecorators(...methodDecorators);
  const descriptor = Object.getOwnPropertyDescriptor(
    cls.prototype,
    'handler',
  );
  methodDecorator(cls.prototype, 'handler', descriptor);

  return cls;
}
