import path from 'node:path';
import { Headers, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  decorated,
  endpoint,
  EndpointRouterModule,
} from 'nestjs-endpoints';
import request from 'supertest';
import ts from 'typescript';
import { AppModule } from '../src/app.module';
import misroutedRouter from '../src/misrouted/router.module';
import workspaceRouter from '../src/workspace/router.module';
import { WorkspaceService } from '../src/workspace/workspace.service';
import { createApp } from './create-app';

describe('inject and injectOnRequest on a router module', () => {
  let app: INestApplication;
  let req: ReturnType<typeof request>;
  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    ({ app } = await createApp(moduleFixture));
    app.useLogger(false);
    req = request(app.getHttpServer());
  });
  afterAll(async () => {
    await app.close();
  });
  // Imported once the app is built: an endpoint file evaluated outside any
  // router keeps the default path it is given then.
  const membersList = async () =>
    (await import('../src/workspace/endpoints/members/list.endpoint'))
      .default;

  test('a router injects into the endpoints it owns, with their own injections', async () => {
    await req
      .post('/workspace/whoami')
      .set('x-tenant', 't1')
      .set('user-agent', 'ua')
      .expect(200, {
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
    await req
      .post('/team/lead')
      .expect(200, { team: 'core', lead: 'ada' });
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
    expect(
      Reflect.getMetadata('endpoints:path', await membersList()),
    ).toBe('workspace/members/list');
  });

  test('a key the router already injects is an error', () => {
    expect(() =>
      workspaceRouter.endpoint.query({
        // @ts-expect-error `workspace` is injected by the router
        inject: { workspace: WorkspaceService },
        handler: () => null,
      }),
    ).toThrow(/router-injections\.e2e-spec[\s\S]*`workspace`/);
  });

  test('a key the router injects on request is an error in inject too', () => {
    expect(() =>
      workspaceRouter.endpoint.mutation({
        // @ts-expect-error `tenant` is injected on request by the router
        inject: { tenant: WorkspaceService },
        handler: () => null,
      }),
    ).toThrow(/`tenant`/);
  });

  test('a key the router injects is an error in injectOnRequest too', () => {
    expect(() =>
      workspaceRouter.endpoint.query({
        injectOnRequest: {
          // @ts-expect-error `workspace` is injected by the router
          workspace: decorated<string>(Headers('x-workspace')),
        },
        handler: () => null,
      }),
    ).toThrow(/`workspace`/);
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
    EndpointRouterModule.create({
      endpoints: [],
      endpointConfig: {
        injectOnRequest: {
          tenant: decorated<string>(Headers('x-tenant')),
        },
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

  test("a router without injections hands out the package's endpoint", () => {
    const plain = EndpointRouterModule.create({ endpoints: [] }).endpoint;
    expect(plain).toBe(endpoint);
    plain.query({
      path: 'types-only',
      inject: { workspace: WorkspaceService },
      handler: (params) => {
        expectTypeOf(params.workspace).toEqualTypeOf<WorkspaceService>();
        expectTypeOf(params).not.toHaveProperty('tenant');
        return null;
      },
    });
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
    const { default: whoami } =
      await import('../src/workspace/endpoints/whoami.endpoint');
    const listed = EndpointRouterModule.create({ endpoints: [whoami] });
    await expect(
      Test.createTestingModule({ imports: [listed] }).compile(),
    ).rejects.toThrow(
      /whoami\.endpoint[\s\S]*workspace[/\\]router\.module[\s\S]*router-injections\.e2e-spec/,
    );
  });
});

describe('the type error for a key the router already injects', () => {
  test('names the key', { timeout: 60_000 }, () => {
    const errors = typeErrors(`
      import { Headers } from '@nestjs/common';
      import { decorated } from 'nestjs-endpoints';
      import router from '../src/workspace/router.module';
      import { WorkspaceService } from '../src/workspace/workspace.service';
      import { AuditService } from '../src/workspace/audit.service';

      router.endpoint.query({
        inject: { audit: AuditService, workspace: WorkspaceService },
        handler: () => null,
      });
      router.endpoint.query({
        inject: { tenant: WorkspaceService },
        handler: () => null,
      });
      router.endpoint.query({
        injectOnRequest: {
          workspace: decorated<string>(Headers('x-workspace')),
        },
        handler: () => null,
      });
    `);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain(
      '`workspace` is already injected by its router',
    );
    expect(errors[1]).toContain(
      '`tenant` is already injected by its router',
    );
    expect(errors[2]).toContain(
      '`workspace` is already injected by its router',
    );
  });
});

/**
 * The type errors of `source`, compiled as a file in this folder with the
 * app's tsconfig. Not on disk, so `tscheck` never sees the errors.
 */
function typeErrors(source: string): string[] {
  const configPath = path.resolve(import.meta.dirname, '../tsconfig.json');
  const { config } = ts.readConfigFile(configPath, (f) =>
    ts.sys.readFile(f),
  );
  const { options } = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    path.dirname(configPath),
  );
  const file = path.join(import.meta.dirname, 'collision.virtual.ts');
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, ...rest) =>
    name === file
      ? ts.createSourceFile(name, source, languageVersion)
      : getSourceFile(name, languageVersion, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => name === file || fileExists(name);
  const program = ts.createProgram([file], options, host);
  return ts
    .getPreEmitDiagnostics(program, program.getSourceFile(file))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}
