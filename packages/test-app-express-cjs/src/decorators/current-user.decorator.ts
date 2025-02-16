import { createParamDecorator } from '@nestjs/common';

export const CurrentUser = createParamDecorator(() => {
  return {
    name: 'John Smith',
    isSuperAdmin: true,
  }
});
