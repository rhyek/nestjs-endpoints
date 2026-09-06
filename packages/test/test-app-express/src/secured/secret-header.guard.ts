import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class SecretHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
    }>();
    return req.headers['x-secret'] === 'let-me-in';
  }
}
