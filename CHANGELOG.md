# Changelog

## 1.1.0 (2025-03-29)

### Breaking Changes

- Replaced `EndpointsRouterModule.forRoot()` with `EndpointsRouterModule.register()`
- Removed `EndpointsModule` decorator

### Features

- Added support for multiple router registrations in different modules
- Each registration will have its own `rootDirectory` and `baseBath`
