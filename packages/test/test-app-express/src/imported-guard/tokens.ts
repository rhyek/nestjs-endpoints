import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Module,
} from '@nestjs/common';
import type { Checked } from '../checkpoints/checks';

/** A value the module below provides, which says where a guard was made. */
export const ORIGIN = Symbol('origin');

/** Notes the origin it was made with. */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(ORIGIN) private readonly origin: string) {}

  canActivate(context: ExecutionContext) {
    (context.switchToHttp().getRequest<Checked>().checks ??= []).push(
      `origin guard of ${this.origin}`,
    );
    return true;
  }
}

/** Provides and exports the guard, as a module of an app's own does. */
@Module({
  providers: [OriginGuard, { provide: ORIGIN, useValue: 'its module' }],
  exports: [OriginGuard, ORIGIN],
})
export class OriginModule {}
