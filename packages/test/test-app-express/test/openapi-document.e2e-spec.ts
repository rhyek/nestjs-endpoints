import { Injectable, Module, Scope } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { endpoint, EndpointRouterModule, z } from 'nestjs-endpoints';
import { AppModule } from '../src/app.module';
import { createApp } from './create-app';
import { openApiDocument, schemaRefs } from './openapi-document';

async function documentOf(module: object, configure?: Parameters<typeof openApiDocument>[1]) {
  const moduleFixture = await Test.createTestingModule({ imports: [module as never] }).compile();
  const { app } = await createApp(moduleFixture);
  try {
    return openApiDocument(app, configure);
  } finally {
    await app.close();
  }
}

/** A module of `controllers`, as a test's own little app. */
function moduleOf(...controllers: unknown[]) {
  @Module({ controllers: controllers as never[] })
  class TestModule {}
  return TestModule;
}

describe('the document @nestjs/swagger builds from the endpoints alone', () => {
  test('has every schema its operations and schemas refer to', async () => {
    const document = await documentOf(AppModule);
    const schemas = document.components?.schemas ?? {};

    const referred = [...schemaRefs(document.paths), ...schemaRefs(schemas)];
    expect(referred.length).toBeGreaterThan(50);
    expect(referred.filter((name) => !(name in schemas))).toEqual([]);
  });

  test('is the same under the OpenAPI version the schemas are written for', async () => {
    const document = await documentOf(AppModule);
    const versioned = await documentOf(AppModule, (builder) => builder.setOpenAPIVersion('3.1.1'));

    expect(versioned).toEqual({ ...document, openapi: '3.1.1' });
  });

  test('names a shared schema once per shape, whichever endpoint is registered first', async () => {
    const price = z
      .object({ amount: z.number(), currency: z.string().default('USD') })
      .meta({ id: 'OrderPrice' });
    const quote = endpoint.mutation({
      path: '/order-price/quote',
      input: z.object({ price }),
      handler: () => ({}),
    });
    const read = endpoint.query({
      path: '/order-price/read',
      output: z.object({ price }),
      handler: () => ({ price: { amount: 1, currency: 'USD' } }),
    });

    for (const module of [moduleOf(quote, read), moduleOf(read, quote)]) {
      const document = await documentOf(module);
      const schemas = document.components!.schemas as Record<string, any>;

      expect(schemas.OrderPrice.required).toEqual(['amount']);
      expect(schemas.OrderPriceOutput.required).toEqual(['amount', 'currency']);
      expect(schemas.OrderPriceReadOutput.properties.price).toEqual({
        $ref: '#/components/schemas/OrderPriceOutput',
      });
      expect(schemas.OrderPriceQuoteInput.properties.price).toEqual({
        $ref: '#/components/schemas/OrderPrice',
      });
    }
  });

  test('names a shared schema by the app it documents, not by another app in the process', async () => {
    const weight = z
      .object({ grams: z.number(), unit: z.string().default('g') })
      .meta({ id: 'ParcelWeight' });
    const send = endpoint.mutation({
      path: '/parcel/send',
      input: z.object({ weight }),
      handler: () => ({}),
    });
    const track = endpoint.query({
      path: '/parcel/track',
      output: z.object({ weight }),
      handler: () => ({ weight: { grams: 1, unit: 'g' } }),
    });

    // An app that only answers with the schema has one shape of it, under its own name.
    const tracking = await documentOf(moduleOf(track));
    expect(Object.keys(tracking.components!.schemas!).sort()).toEqual([
      'ParcelTrackOutput',
      'ParcelWeight',
    ]);
    expect((tracking.components!.schemas as any).ParcelWeight.required).toEqual(['grams', 'unit']);

    // An app that also takes it has both.
    const both = await documentOf(moduleOf(send, track));
    expect(Object.keys(both.components!.schemas!).sort()).toEqual([
      'ParcelSendInput',
      'ParcelTrackOutput',
      'ParcelWeight',
      'ParcelWeightOutput',
    ]);

    // And the first app's document is the same after the second app was created.
    expect(await documentOf(moduleOf(track))).toEqual(tracking);
  });

  test("names the shared schemas of a router's endpoints that no app has instantiated yet", async () => {
    // An endpoint that injects a request-scoped provider is created per request.
    @Injectable({ scope: Scope.REQUEST })
    class Tenant {}
    const size = z
      .object({ cm: z.number(), unit: z.string().default('cm') })
      .meta({ id: 'CrateSize' });
    const router = EndpointRouterModule.create({
      basePath: 'crate',
      providers: [Tenant],
      endpoints: [
        endpoint.mutation({
          path: 'pack',
          input: z.object({ size }),
          inject: { tenant: Tenant },
          handler: () => ({}),
        }),
        endpoint.query({
          path: 'measure',
          output: z.object({ size }),
          inject: { tenant: Tenant },
          handler: () => ({ size: { cm: 1, unit: 'cm' } }),
        }),
      ],
    });

    const document = await documentOf(router);

    expect(Object.keys(document.components!.schemas!).sort()).toEqual([
      'CrateMeasureOutput',
      'CratePackInput',
      'CrateSize',
      'CrateSizeOutput',
    ]);
  });

  test('is not broken by another app whose endpoints disagree on a schema', async () => {
    const stock = endpoint.query({
      path: '/warehouse/stock',
      output: z.object({ units: z.number() }),
      handler: () => ({ units: 1 }),
    });
    // Two schemas under one id.
    const move = endpoint.mutation({
      path: '/warehouse/move',
      input: z.object({ bin: z.object({ aisle: z.string() }).meta({ id: 'WarehouseBin' }) }),
      handler: () => ({}),
    });
    const relabel = endpoint.mutation({
      path: '/warehouse/relabel',
      input: z.object({ bin: z.object({ label: z.number() }).meta({ id: 'WarehouseBin' }) }),
      handler: () => ({}),
    });
    const appOf = async (module: object) => {
      const fixture = await Test.createTestingModule({ imports: [module as never] }).compile();
      return (await createApp(fixture)).app;
    };
    // The app with the disagreement is the newer of the two, and still running.
    const sound = await appOf(moduleOf(stock));
    const unsound = await appOf(moduleOf(move, relabel));
    try {
      expect(() => openApiDocument(unsound)).toThrow(
        /"WarehouseBin" names two different input schemas/,
      );
      expect(openApiDocument(sound).paths).toHaveProperty('/warehouse/stock');
    } finally {
      await sound.close();
      await unsound.close();
    }
  });

  test('reads a literal as a one-value enum and keeps the first of several examples', async () => {
    // What `@nestjs/swagger` does to every schema it is given as a Standard Schema.
    const label = endpoint.query({
      path: '/parcel/label',
      output: z.object({
        kind: z.literal('label'),
        carrier: z.string().meta({ examples: ['dhl', 'ups'] }),
      }),
      handler: () => ({ kind: 'label' as const, carrier: 'dhl' }),
    });

    const document = await documentOf(moduleOf(label));

    expect((document.components!.schemas as any).ParcelLabelOutput.properties).toEqual({
      kind: { type: 'string', enum: ['label'] },
      carrier: { type: 'string', example: 'dhl' },
    });
  });

  test("gives a parameter its schema's description", async () => {
    const find = endpoint.query({
      path: '/parcel/find',
      method: 'get',
      query: z.object({ code: z.string().describe('The tracking code') }),
      handler: () => ({}),
    });

    const document = await documentOf(moduleOf(find));

    expect((document.paths['/parcel/find'] as any).get.parameters).toEqual([
      {
        name: 'code',
        in: 'query',
        required: true,
        description: 'The tracking code',
        schema: { type: 'string', description: 'The tracking code' },
      },
    ]);
  });
});
