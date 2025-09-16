# Changelog

## 2.0.0 (2025-09-15)

### Breaking Changes

- **Upgraded to Zod v4**: Zod v3 schemas will have to be upgraded to v4.
- **Upgraded to zod-openapi v5**: See the [v5 migration guide](https://github.com/samchungy/zod-openapi/blob/HEAD/docs/v5.md) if you used `.openapi()` extensions.
- **OpenAPI version upgrade**: Now generates OpenAPI 3.1.1 schemas (previously 3.0.0).

### Minor changes

- Deprecated `injectMethod` parameter in favor of `injectAtRequest` for clarity.

## 1.5.1 (2025-06-28)

### Testing

- Added more tests

## 1.5.0 (2025-06-22)

### Features

- Replaced `nestjs-zod` with [zod-openapi](https://github.com/samchungy/zod-openapi). The main benefit is output schemas will now emit OpenApi schemas and consequently TypeScript definitions for endpoint payloads that consider zod transforms.

Example:

```typescript
const schema = z.object({
  age: z.number().default(30),
});
```

The above schema when used in `input` will still mark `age` as optional, but when used in `output` it will not.

```typescript
type ExampleInput = {
  age?: number;
};

type ExampleOutput = {
  age: number;
};
```

## 1.4.0 (2025-06-13)

### Features

- Provide `rawInput` to handlers with input schemas. This is the request body parsed by NestJS, but before zod.

## 1.3.1 (2025-05-26)

### Bugfixes

- Support OPTIONS HTTP method
- Use my fork of @nestjs/zod until this is merged: https://github.com/BenLorantfy/nestjs-zod/pull/151

## 1.3.0 (2025-04-12)

### Features

- Added support for traditional controller imports + explicit HTTP paths
- Can now call `invoke()` on endpoint instances. Useful for integration testing. [Example](https://github.com/rhyek/nestjs-endpoints/blob/1b1242348ebc77abad5ad0c67ab372690102d736/packages/test/test-app-express-cjs/test/app.e2e-spec.ts#L467).

## 1.2.0 (2025-04-05)

### Features

- Integrated orval setup for axios and react-query clients using `setupCodegen`. No longer necessary for users to set this up themselves.

## 1.1.0 (2025-03-29)

### Breaking Changes

- Replaced `EndpointsRouterModule.forRoot()` with `EndpointsRouterModule.register()`
- Removed `EndpointsModule` decorator

### Features

- Added support for multiple router registrations in different modules
- Each registration will have its own `rootDirectory` and `baseBath`
