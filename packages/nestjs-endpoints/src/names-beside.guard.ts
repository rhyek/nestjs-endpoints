import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
  type Type,
} from '@nestjs/common';
import { HttpAdapterHost, ModulesContainer } from '@nestjs/core';
import { appRoutes, caseSensitiveOf, endpointNamesBeside } from './names-beside';

/**
 * Answers a request for an endpoint as for a URL no route answers when a value of a path
 * parameter is a name beside it: every URL under the name is the name's side, as the
 * middleware of the endpoint's routers has it. Before any other guard of the endpoint's.
 */
@Injectable()
export class NamesBesideGuard implements CanActivate {
  /** For each endpoint of the app, as it is first requested. */
  private readonly refused = new Map<
    Type,
    { read: (value: string) => string; names: Map<string, Set<string>> }
  >();

  constructor(
    @Inject(ModulesContainer) private readonly modules: ModulesContainer,
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const adapter = this.adapterHost.httpAdapter;
    const cls = context.getClass<Type>();
    let refused = this.refused.get(cls);
    if (!refused) {
      // As NestJS reads the names a router's middleware leaves out.
      const caseSensitive = caseSensitiveOf(adapter);
      const read = (value: string) => (caseSensitive ? value : value.toLowerCase());
      const names = endpointNamesBeside(cls, appRoutes(this.modules));
      refused = {
        read,
        names: new Map(
          [...names].map(([param, values]) => [param, new Set([...values].map(read))]),
        ),
      };
      this.refused.set(cls, refused);
    }
    const { read, names } = refused;
    const request = context.switchToHttp().getRequest<{ params?: Record<string, unknown> }>();
    for (const [param, values] of names) {
      const value = request.params?.[param];
      if (typeof value === 'string' && values.has(read(value))) {
        // As NestJS answers a URL no route answers.
        throw new NotFoundException(
          `Cannot ${adapter.getRequestMethod(request)} ${adapter.getRequestUrl(request)}`,
        );
      }
    }
    return true;
  }
}
