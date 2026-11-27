import { ModulesContainer } from '@nestjs/core';
import { z } from 'zod';
import { empty, start } from '../test/routing';
import { rootOf } from './app-root';
import { descriptorOf } from './descriptors';
import { endpoint } from './endpoint-fn';
import { EndpointRouter } from './endpoint-router';
import { NestjsEndpoints } from './nestjs-endpoints';
import { setupOf } from './settings';
import { PROTOCOL, sharedState } from './shared-state';

// What the copies of the package a process loaded share, and read of each other. A change here
// that a copy of another version would misread takes a new `PROTOCOL`.

const KEY = Symbol.for('nestjs-endpoints/1');
const held = () => (globalThis as unknown as Record<symbol, unknown>)[KEY];

describe('the state the copies of the package share', () => {
  test('is under one registered symbol, named by the protocol', () => {
    expect(PROTOCOL).toBe(1);
    expect(held()).toBe(sharedState);
  });

  test('has these parts', () => {
    expect(Object.keys(sharedState).sort()).toEqual([
      'AppRoot',
      'DeclaresHooks',
      'MountedEndpoint',
      'TopLevelRouter',
      'descriptions',
      'router',
      'setups',
      'subtree',
    ]);
  });

  test('is the one a copy loaded later uses, part for part', async () => {
    const parts = { ...sharedState };
    vi.resetModules();
    const later = await import('./shared-state');
    expect(later.sharedState).toBe(sharedState);
    expect({ ...later.sharedState }).toEqual(parts);
    for (const key of Object.keys(parts) as (keyof typeof parts)[]) {
      expect(later.sharedState[key]).toBe(parts[key]);
    }
  });

  test('is completed by a copy with a part the first one loaded lacked', async () => {
    const { setups, descriptions } = sharedState;
    delete (sharedState as Partial<typeof sharedState>).descriptions;
    vi.resetModules();
    const later = await import('./shared-state');
    expect(later.sharedState.descriptions).toBeInstanceOf(Map);
    expect(later.sharedState.setups).toBe(setups);
    sharedState.descriptions = descriptions;
  });
});

describe('what a copy reads of what another wrote', () => {
  test("an endpoint's descriptor", () => {
    const cls = endpoint.mutation({
      path: '/clinics/:clinicId/visits/book',
      summary: 'Book a visit',
      tags: ['visits'],
      params: z.object({ clinicId: z.string() }),
      query: z.object({ dryRun: z.boolean().optional() }),
      input: z.object({ at: z.string() }),
      output: { 201: z.object({ id: z.number() }).meta({ description: 'Booked' }) },
      handler: ({ response }) => response(201, { id: 1 }),
    });
    expect(descriptorOf(cls)).toMatchInlineSnapshot(`
      {
        "input": {
          "components": {
            "ClinicsVisitsBookInput": {
              "properties": {
                "at": {
                  "type": "string",
                },
              },
              "required": [
                "at",
              ],
              "type": "object",
            },
          },
          "json": {
            "$ref": "#/components/schemas/ClinicsVisitsBookInput",
          },
        },
        "kind": "mutation",
        "method": "post",
        "namespaceChain": [],
        "operationId": "ClinicsVisitsBook",
        "outputs": [
          {
            "description": "Booked",
            "schema": {
              "components": {
                "ClinicsVisitsBook201Output": {
                  "additionalProperties": false,
                  "description": "Booked",
                  "properties": {
                    "id": {
                      "type": "number",
                    },
                  },
                  "required": [
                    "id",
                  ],
                  "type": "object",
                },
              },
              "json": {
                "$ref": "#/components/schemas/ClinicsVisitsBook201Output",
              },
            },
            "status": 201,
          },
        ],
        "params": {
          "components": {},
          "json": {
            "properties": {
              "clinicId": {
                "type": "string",
              },
            },
            "required": [
              "clinicId",
            ],
            "type": "object",
          },
          "parameters": [
            {
              "name": "clinicId",
              "required": true,
              "schema": {
                "type": "string",
              },
              "shape": "value",
            },
          ],
        },
        "path": "/clinics/{clinicId}/visits/book",
        "pathParams": [
          {
            "name": "clinicId",
            "schema": {
              "type": "string",
            },
          },
        ],
        "query": {
          "components": {},
          "json": {
            "properties": {
              "dryRun": {
                "type": "boolean",
              },
            },
            "type": "object",
          },
          "parameters": [
            {
              "name": "dryRun",
              "required": false,
              "schema": {
                "type": "boolean",
              },
              "shape": "value",
            },
          ],
        },
        "summary": "Book a visit",
        "tags": [
          "clinics/visits",
          "visits",
        ],
      }
    `);
  });

  test("the options of an endpoint's setup", async () => {
    // What tells an endpoint is a setup of its class, whichever copy recorded it.
    class Listed {}
    const setup = vi.fn();
    sharedState.setups.set(Listed, setup);
    expect(setupOf(Listed)).toBe(setup);
    await EndpointRouter.create({
      rootDirectory: empty,
      basePath: 'api',
      namespace: 'api',
      endpoints: [Listed],
    });
    expect(setup.mock.calls).toEqual([
      [
        {
          rootDirectories: [empty],
          basePath: 'api',
          namespaceChain: ['api'],
          routerFile: import.meta.filename,
        },
      ],
    ]);
  });

  test("an app's root options", async () => {
    const clients = () => [];
    const app = await start(
      NestjsEndpoints.forRoot({ router: { rootDirectory: empty, endpoints: [] }, clients }),
    );
    expect(rootOf(app.get(ModulesContainer))).toEqual({
      watch: false,
      clients,
      generateClientsOnStart: false,
    });
  });

  test("a router's subtree, on its module", async () => {
    const top = EndpointRouter.create({ rootDirectory: empty, endpoints: () => [] });
    const own = endpoint.query({ path: 'own', handler: () => null });
    const child = await top.child({ rootDirectory: empty, endpoints: [own] });
    const carried = (module: object) => (module as Record<symbol, unknown>)[sharedState.subtree];
    expect(carried(child)).toEqual({ endpoints: [own], childOf: import.meta.filename });
    expect(carried(await top)).toEqual({ endpoints: [] });
    expect(sharedState.router in top).toBe(true);
    // One another lists carries the file of that router, as a child carries its parent's.
    const listed = EndpointRouter.create({ rootDirectory: empty, endpoints: [own] });
    await EndpointRouter.create({ rootDirectory: empty, routers: [listed] });
    expect(carried(await listed)).toEqual({ endpoints: [own], childOf: import.meta.filename });
  });

  test('what a router carries for the router that lists it', () => {
    const router = EndpointRouter.create({ rootDirectory: empty, endpoints: [] });
    const handle = (router as unknown as Record<symbol, object>)[sharedState.router];
    expect(Object.keys(handle!).sort()).toEqual(['file', 'listedBy', 'placedUnder']);
    expect(Object.keys(router.register({ basePath: 'x' })).sort()).toEqual(['basePath', 'router']);
  });

  test('the hooks a class declares', () => {
    const cls = endpoint.query({
      path: 'hooked',
      lifecycle: { onModuleInit() {} },
      handler: () => null,
    });
    expect(Reflect.getMetadata(sharedState.DeclaresHooks.KEY, cls)).toEqual({
      hooks: ['onModuleInit'],
      by: expect.stringMatching(/^the endpoint of .*shared-state\.spec\.ts$/),
    });
  });
});
