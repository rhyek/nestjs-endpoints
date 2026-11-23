import type { ServerResponse } from 'node:http';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/** Lets every request through, and says so in the `x-guarded` header. */
@Injectable()
export class GuardedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const response = context.switchToHttp().getResponse<ServerResponse | { raw: ServerResponse }>();
    ('raw' in response ? response.raw : response).setHeader('x-guarded', 'id');
    return true;
  }
}
