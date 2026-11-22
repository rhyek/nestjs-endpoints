import type { ModulesContainer } from '@nestjs/core';
import { type EndpointDescriptor, mountedEndpoints } from './descriptors';
import {
  mergeSharedSchemas,
  reachableSchemas,
  rewriteOutputRefs,
  rootsOf,
  type SharedSchemas,
} from './shared-schemas';
import type { ConvertedSchema, JsonSchema } from './zod-to-openapi';

// What an endpoint tells `@nestjs/swagger` about its schemas, for an app that builds an
// OpenAPI document with `SwaggerModule.createDocument()`. The package takes no part in
// building it: everything the document needs is in the metadata the endpoints carry.

/**
 * A schema as `@nestjs/swagger`'s decorators take one, in their `standardSchema` option: a
 * [Standard JSON Schema](https://standardschema.dev/json-schema) whose `$defs` are the
 * components it names, which `@nestjs/swagger` adds to the document's `components.schemas`.
 *
 * It is read when the document is built, not when the endpoint is defined: only then is it
 * known which other endpoints share its schemas.
 */
export type DocumentedSchema = {
  '~standard': {
    version: 1;
    vendor: string;
    jsonSchema: Record<'input' | 'output', () => JsonSchema>;
  };
};

export function documented(read: () => ConvertedSchema): DocumentedSchema {
  const convert = () => {
    const { json, components } = read();
    return { ...json, $defs: components };
  };
  return {
    '~standard': {
      version: 1,
      vendor: 'nestjs-endpoints',
      jsonSchema: { input: convert, output: convert },
    },
  };
}

// The apps created in this process, oldest first. A shared schema's name depends on every
// endpoint of the app that uses it (`mergeSharedSchemas`), and the document must name it as
// the generated clients do, so an endpoint is documented with the schemas of its own app.
const apps: WeakRef<ModulesContainer>[] = [];
const known = new WeakSet<ModulesContainer>();

/** Called by each endpoint as an app instantiates it, with that app's modules. */
export function instantiatedIn(modules: ModulesContainer) {
  if (!known.has(modules)) {
    known.add(modules);
    apps.push(new WeakRef(modules));
  }
}

// An endpoint set up again has new schemas: what was read before then is stale.
let setups = 0;

/** Called when an endpoint is set up. */
export function endpointSetUp() {
  setups++;
}

type AppEndpoints = {
  /** What it was read from: the setups so far, and the app's module count. */
  version: string;
  endpoints: Map<unknown, EndpointDescriptor>;
  /** Merged when one of the app's endpoints is documented. */
  shared?: SharedSchemas;
};
const endpointsOfApp = new WeakMap<ModulesContainer, AppEndpoints>();

function appEndpoints(modules: ModulesContainer): AppEndpoints {
  const version = `${setups}:${modules.size}`;
  let app = endpointsOfApp.get(modules);
  if (app?.version !== version) {
    const endpoints = new Map(
      Array.from(mountedEndpoints(modules), ({ cls, descriptor }) => [cls, descriptor]),
    );
    app = { version, endpoints };
    endpointsOfApp.set(modules, app);
  }
  return app;
}

/**
 * The shared schemas of the app `endpoint` is in: the newest one, when several apps in the
 * process mount it. Only that app's schemas are merged, so a schema id that two endpoints of
 * another app disagree on is that app's error alone. An endpoint that no app has
 * instantiated is documented by itself.
 */
function sharedSchemasOf(endpoint: unknown, descriptor: EndpointDescriptor): SharedSchemas {
  for (let i = apps.length - 1; i >= 0; i--) {
    const modules = apps[i].deref();
    if (!modules) {
      apps.splice(i, 1);
      continue;
    }
    const app = appEndpoints(modules);
    if (app.endpoints.has(endpoint)) {
      return (app.shared ??= mergeSharedSchemas([...app.endpoints.values()]));
    }
  }
  return mergeSharedSchemas([descriptor]);
}

/**
 * Documents one of an endpoint's schemas: `json`, given the ids whose output schema has a
 * name of its own, with every component the endpoint uses.
 */
export function documentedPart(
  endpoint: unknown,
  descriptor: () => EndpointDescriptor,
  json: (renamed: SharedSchemas['renamed']) => JsonSchema,
): DocumentedSchema {
  return documented(() => {
    const shared = sharedSchemasOf(endpoint, descriptor());
    return {
      json: json(shared.renamed),
      components: reachableSchemas(rootsOf(descriptor(), shared.renamed), shared),
    };
  });
}

/** An output schema, with its refs to renamed ids pointing at their output schemas. */
export function outputJson(json: JsonSchema) {
  return (renamed: SharedSchemas['renamed']) => rewriteOutputRefs(json, renamed);
}
