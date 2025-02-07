import { Module, ModuleMetadata, Type } from '@nestjs/common';

export function EndpointsModule(
  metadata: Omit<ModuleMetadata, 'controllers'> & {
    endpoints: Type<any>[];
  },
): ClassDecorator {
  const { endpoints = [], ...rest } = metadata;
  return Module({
    ...rest,
    controllers: endpoints,
  });
}
