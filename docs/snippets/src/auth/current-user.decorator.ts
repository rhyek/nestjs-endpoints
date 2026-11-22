import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export type User = { id: number; email: string; role: 'admin' | 'member' };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User =>
    context.switchToHttp().getRequest<{ user: User }>().user,
);
