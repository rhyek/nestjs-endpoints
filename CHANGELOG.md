# Changelog

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
