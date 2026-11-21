import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { User } from './current-user.decorator';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return context.switchToHttp().getRequest<{ user?: User }>().user?.role === 'admin';
  }
}
