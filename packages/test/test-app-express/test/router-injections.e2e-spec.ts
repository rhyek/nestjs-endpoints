import { Headers, INestApplication } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import { decorated, EndpointRouter } from 'nestjs-endpoints';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import misroutedRouter from '../src/misrouted/router.module';
import { AuditService } from '../src/workspace/audit.service';
import workspaceRouter from '../src/workspace/router.module';
import { WorkspaceService } from '../src/workspace/workspace.service';
import { appWith } from './app-with';

describe('inject and injectOnRequest on a router', () => {
  let app: INestApplication;
  let req: ReturnType<typeof request>;
  beforeAll(async () => {
    ({ app } = await appWith([AppModule]));
    req = request(app.getHttpServer());
  });
  afterAll(async () => {
    await app.close();
  });
  // Imported once the app is built: an endpoint file evaluated outside any
  // router keeps the default path it is given then.
  const membersList = async () =>
    (await import('../src/workspace/endpoints/members/list.endpoint')).default;

  test('a router injects into the endpoints it owns, with their own injections', async () => {
    await req.post('/workspace/whoami').set('x-tenant', 't1').set('user-agent', 'ua').expect(200, {
      workspace: 'acme',
      tenant: 't1',
      agent: 'ua',
      audit: 'audited',
    });
  });

  test('endpoints in a subfolder get the router injections', async () => {
    await req
      .post('/workspace/members/list')
      .set('x-tenant', 't1')
      .expect(200, { workspace: 'acme', tenant: 't1' });
  });

  test("deprecated injectAtRequest merges with the router's injectOnRequest", async () => {
    await req
      .post('/workspace/legacy')
      .set('x-tenant', 't1')
      .set('user-agent', 'ua')
      .expect(200, { tenant: 't1', agent: 'ua' });
  });

  test('a router lists endpoints built with its own endpoint through a callback', async () => {
    await req.post('/team/roster').expect(200, { team: 'core' });
    await req.post('/team/lead').expect(200, { team: 'core', lead: 'ada' });
  });

  test("a nested router's endpoints get none of the parent's injections", async () => {
    await req
      .post('/workspace/billing/invoice')
      .expect(200, { billing: 'billing', hasWorkspace: false });
  });

  test("invoke() sees the router's inject", async () => {
    const list = await membersList();
    const fixture = await Test.createTestingModule({
      controllers: [list],
      providers: [WorkspaceService],
    }).compile();
    // `injectOnRequest` is not supplied by invoke(), as for an endpoint's own.
    await expect(fixture.get(list).invoke()).resolves.toEqual({
      workspace: 'acme',
      tenant: undefined,
    });
  });

  test("an endpoint built with the router's endpoint gets its path from its own file", async () => {
    expect(Reflect.getMetadata(PATH_METADATA, await membersList())).toBe('workspace/members/list');
  });

  test('an endpoint may declare a key its router injects, and its own wins', () => {
    workspaceRouter.endpoint.query({
      path: 'types-only',
      inject: { tenant: AuditService },
      injectOnRequest: { workspace: decorated<number>(Headers('x-workspace')) },
      handler: (params) => {
        expectTypeOf(params.tenant).toEqualTypeOf<AuditService>();
        expectTypeOf(params.workspace).toEqualTypeOf<number>();
        return null;
      },
    });
  });

  test('the handler sees the router keys, with its own or none', () => {
    workspaceRouter.endpoint.query({
      path: 'types-only',
      injectOnRequest: { agent: decorated<string>(Headers('user-agent')) },
      handler: (params) => {
        expectTypeOf(params.workspace).toEqualTypeOf<WorkspaceService>();
        expectTypeOf(params.tenant).toEqualTypeOf<string>();
        expectTypeOf(params.agent).toEqualTypeOf<string>();
        return null;
      },
    });
    workspaceRouter.endpoint.query({
      path: 'types-only',
      handler: (params) => {
        expectTypeOf(params.workspace).toEqualTypeOf<WorkspaceService>();
        expectTypeOf(params.tenant).toEqualTypeOf<string>();
        return null;
      },
    });
  });

  test("a router with only injectOnRequest adds it to the handler's own inject", () => {
    EndpointRouter.create({
      endpoints: [],
      context: {
        injectOnRequest: { tenant: decorated<string>(Headers('x-tenant')) },
      },
    }).endpoint.query({
      path: 'types-only',
      inject: { workspace: WorkspaceService },
      handler: (params) => {
        expectTypeOf(params.workspace).toEqualTypeOf<WorkspaceService>();
        expectTypeOf(params.tenant).toEqualTypeOf<string>();
        return null;
      },
    });
  });

  test("a router without injections builds an endpoint as the package's endpoint does", async () => {
    const plain = EndpointRouter.create({ endpoints: [] }).endpoint;
    const built = plain.query({
      path: 'types-only',
      inject: { workspace: WorkspaceService },
      handler: (params) => {
        expectTypeOf(params.workspace).toEqualTypeOf<WorkspaceService>();
        expectTypeOf(params).not.toHaveProperty('tenant');
        return null;
      },
    });
    // Any router may own it: one built with a router's injections is owned by that router.
    const elsewhere = await EndpointRouter.create({ basePath: 'elsewhere', endpoints: [built] });
    expect(elsewhere.controllers).toEqual([built]);
    expect(Reflect.getMetadata(PATH_METADATA, built)).toBe('/elsewhere/types-only');
  });
});

describe("an endpoint built with another router's endpoint", () => {
  test('fails startup in the router that discovers it', async () => {
    await expect(
      Test.createTestingModule({ imports: [misroutedRouter] }).compile(),
    ).rejects.toThrow(
      /borrowed\.endpoint[\s\S]*workspace[/\\]router\.module[\s\S]*misrouted[/\\]router\.module/,
    );
  });

  test('fails startup in a router that lists it in endpoints', async () => {
    const { default: whoami } = await import('../src/workspace/endpoints/whoami.endpoint');
    const listed = EndpointRouter.create({ endpoints: [whoami] });
    await expect(Test.createTestingModule({ imports: [listed] }).compile()).rejects.toThrow(
      /whoami\.endpoint[\s\S]*workspace[/\\]router\.module[\s\S]*router-injections\.e2e-spec/,
    );
  });
});
