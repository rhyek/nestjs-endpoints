import {
  type CallHandler,
  type CanActivate,
  type ExecutionContext,
  Global,
  type INestApplication,
  Inject,
  Injectable,
  Module,
  type NestInterceptor,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  Badge,
  CheckGuard,
  CheckInterceptor,
  type Checked,
  RequestGuard,
} from '../src/checkpoints/checks';
import checkpoints from '../src/checkpoints/router';
import importedGuard from '../src/imported-guard/router';
import { ORIGIN, OriginGuard } from '../src/imported-guard/tokens';
import providedGuard from '../src/provided-guard/router';
import { createApp } from './create-app';

const note = (context: ExecutionContext, what: string) =>
  (context.switchToHttp().getRequest<Checked>().checks ??= []).push(what);

/** What a test puts in place of `CheckGuard`: notes the badge it was made with. */
class StandInGuard implements CanActivate {
  constructor(private readonly badge: Badge) {}

  canActivate(context: ExecutionContext) {
    note(context, `stand-in guard of ${this.badge.router}`);
    return true;
  }
}

/** What a test puts in place of `RequestGuard`: made for each request, as that one is. */
@Injectable()
class StandInRequestGuard implements CanActivate {
  constructor(@Inject(REQUEST) private readonly request: Checked) {}

  canActivate(context: ExecutionContext) {
    const mine = context.switchToHttp().getRequest<Checked>() === this.request;
    note(context, `stand-in request guard ${mine ? 'of this request' : 'of another request'}`);
    return true;
  }
}

/** A value the whole app has, from a module of its own. */
const SETTING = Symbol('setting');

@Global()
@Module({ providers: [{ provide: SETTING, useValue: 'the app' }], exports: [SETTING] })
class SettingsModule {}

/** What a test puts in place of `CheckInterceptor`. */
const standInInterceptor: NestInterceptor = {
  intercept(context: ExecutionContext, next: CallHandler) {
    note(context, 'stand-in interceptor');
    return next.handle();
  },
};

// The checkpoints tree, as in router-instances.e2e-spec.ts: `inner` lists the guard and the
// interceptor of the routers above it again, and the endpoint `gate/own` does too.
describe("a test replaces a router's guards and interceptors as NestJS's own", () => {
  let app: INestApplication;
  afterEach(async () => {
    await app?.close();
  });

  const checks = async (path: string) =>
    ((await request(app.getHttpServer()).post(path).expect(200)).body as Checked).checks;

  test('with overrideGuard() and overrideInterceptor(), wherever a router lists them', async () => {
    const fixture = await Test.createTestingModule({ imports: [checkpoints] })
      .overrideGuard(CheckGuard)
      .useFactory({ factory: (badge: Badge) => new StandInGuard(badge), inject: [Badge] })
      .overrideGuard(RequestGuard)
      .useClass(StandInRequestGuard)
      .overrideInterceptor(CheckInterceptor)
      .useValue(standInInterceptor)
      .compile();
    ({ app } = await createApp(fixture, undefined, { logger: false }));

    expect(await checks('/checkpoints/seen')).toEqual([
      'stand-in guard of checkpoints',
      'stand-in request guard of this request',
      'stand-in interceptor',
    ]);
    expect(await checks('/checkpoints/gate/inner/seen')).toEqual([
      'stand-in guard of checkpoints',
      'stand-in request guard of this request',
      'stand-in guard of gate',
      'stand-in interceptor',
      'stand-in interceptor',
    ]);
    expect(await checks('/checkpoints/gate/own')).toEqual([
      'stand-in guard of checkpoints',
      'stand-in request guard of this request',
      'stand-in guard of gate',
      'stand-in interceptor',
      'stand-in interceptor',
    ]);
  });

  test('of a module the router imports, made with what the app provides', async () => {
    const fixture = await Test.createTestingModule({ imports: [SettingsModule, importedGuard] })
      .overrideGuard(OriginGuard)
      .useFactory({
        factory: (origin: string, setting: string): CanActivate => ({
          canActivate(context: ExecutionContext) {
            note(context, `stand-in guard of ${origin} and ${setting}`);
            return true;
          },
        }),
        inject: [ORIGIN, SETTING],
      })
      .compile();
    ({ app } = await createApp(fixture, undefined, { logger: false }));

    expect(await checks('/imported-guard/seen')).toEqual([
      'stand-in guard of its module and the app',
    ]);
  });

  test('made for each request, that the router provides too', async () => {
    const fixture = await Test.createTestingModule({ imports: [providedGuard] })
      .overrideGuard(RequestGuard)
      .useClass(StandInRequestGuard)
      .compile();
    ({ app } = await createApp(fixture, undefined, { logger: false }));

    expect(await checks('/provided-guard/seen')).toEqual([
      'stand-in request guard of this request',
    ]);
  });

  test('with a value in place of a guard', async () => {
    const fixture = await Test.createTestingModule({ imports: [checkpoints] })
      .overrideGuard(CheckGuard)
      .useValue(new StandInGuard(new Badge('test')))
      .compile();
    ({ app } = await createApp(fixture, undefined, { logger: false }));

    expect(await checks('/checkpoints/seen')).toEqual([
      'stand-in guard of test',
      'request guard of this request',
      expect.stringMatching(/^interceptor \d+ of checkpoints$/),
    ]);
  });
});
