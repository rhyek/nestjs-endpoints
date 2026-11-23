import {
  DynamicModule,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
  Provider,
  Type,
} from '@nestjs/common';
import { ApplicationConfig, HttpAdapterHost, ModulesContainer } from '@nestjs/core';
import type { z } from 'zod';
import { RootOptions, topLevelProviders } from './app-root';
import { instantiatedIn } from './document-schemas';
import { createRouterEndpoint, type EndpointBuilders } from './endpoint-fn';
import { getCallsiteFile, moduleAls } from './helpers';
import { hooksAreCalled } from './hook-scopes';
import type { Injected, InjectOnRequestMap, InjectProvidersMap } from './injections';
import {
  declaredMembers,
  ENDPOINT_OWN_MEMBERS,
  type InjectNaming,
  LIFECYCLE_HOOKS,
  type InstanceMembers,
  type InstanceOptions,
  type MethodsMap,
} from './instance-members';
import { LazyPromise } from './lazy-promise';
import { appRoutes, warnOfRouteOrder } from './names-beside';
import { underBase } from './route-paths';
import {
  assertOneMapPerKey,
  assertPlainParams,
  mergeContext,
  type MergedParams,
  type Overriding,
  type RouterContext,
} from './router-context';
import {
  type Layout,
  layoutOf,
  NAMESPACE_NAME,
  nestedRouterParents,
  notANamespaceName,
  type ParentStore,
  storeOf,
} from './router-layout';
import { applyLineage, type Lineage, lineageOf, NO_LINEAGE } from './router-lineage';
import { importFile, importRouterFile, isEndpoint, resolveListedEndpoints } from './router-loading';
import {
  type AppliedMiddleware,
  applyRouterMiddleware,
  parseMiddleware,
} from './router-middleware';
import {
  hasModule,
  importInto,
  orderModule,
  sharedProviders,
  type SharedProviders,
} from './router-modules';
import { CONTEXT_KEYS, type DescribesNamespace, type RouterOptions } from './router-options';
import { findRouterFiles, isSameModule, shown, stripExtension } from './routing-files';
import { EndpointSetupFn, settings } from './settings';

/**
 * A provider every router has, which an app creates as it starts: it tells the endpoints'
 * OpenAPI metadata which app they are in. An endpoint tells it too when it is instantiated,
 * which an endpoint that injects a request-scoped provider is not until a request.
 */
const appOfRouter: Provider = {
  provide: Symbol('nestjs-endpoints:app'),
  inject: [ModulesContainer],
  useFactory: (modules: ModulesContainer) => instantiatedIn(modules),
};

/** A router's module carries every endpoint of its subtree under this key. */
const ALL_ENDPOINTS_SYMBOL = Symbol.for('nestjs-endpoints:allEndpoints');
/** The module of a router made with `child()` carries its parent's file under this key. */
const CHILD_OF_SYMBOL = Symbol('nestjs-endpoints:childOf');
type AllEndpointsCarrier = {
  [ALL_ENDPOINTS_SYMBOL]?: Type[];
  [CHILD_OF_SYMBOL]?: string;
};

/**
 * What `create()`, `child()` and `forRoot()` take. `RouterInject`, `RouterInjectOnRequest` and
 * `RouterParams` are its `context`; `Inject` is its own `inject`.
 *
 * A router's lifecycle hooks and methods, written as methods and not as arrow functions,
 * have on `this` what its own `inject` gives, with its `properties` and `methods`. The three
 * are the router's own: its endpoints and the routers under it have none of them.
 */
export type EndpointRouterOptions<
  RouterInject extends InjectProvidersMap,
  RouterInjectOnRequest extends InjectOnRequestMap,
  RouterParams extends z.ZodObject | undefined,
  Inject extends InjectProvidersMap = undefined,
  Properties = object,
  // As `create()` has them when the router declares none.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  Methods = {},
> = RouterOptions<RouterInject, RouterInjectOnRequest, RouterParams> &
  DescribesNamespace & {
    /**
     * Providers to inject into the router's own instance: on `this` in
     * its lifecycle hooks, methods and the getters of its `properties`.
     * Its endpoints and the routers under it do not have them: give
     * those theirs in `context`.
     */
    inject?: InjectNaming<Inject, 'configure'>;
  } & InstanceOptions<Injected<Inject>, Properties, Methods, 'configure'>;

type AnyRouterOptions = EndpointRouterOptions<any, any, any, any, any, any>;

/**
 * What `create()` returns: the module a router module exports by default,
 * carrying the router's `endpoint` builders and its `child()`.
 */
export type EndpointRouter<
  RouterInject extends InjectProvidersMap = undefined,
  RouterInjectOnRequest extends InjectOnRequestMap = undefined,
  RouterParams extends z.ZodObject | undefined = undefined,
> = Promise<DynamicModule> & {
  endpoint: EndpointBuilders<RouterInject, RouterInjectOnRequest, RouterParams>;
  /**
   * Creates a router nested under this one, in a `router.ts` of a
   * folder under this router's. It takes the options `create()` takes, and
   * its endpoints receive this router's `context` under its own: a key
   * both declare is the child's. It has this router's `providers` and
   * `imports` too, as the same instances.
   *
   * ```ts
   * // src/endpoints/clinics/$clinicId/router.ts
   * import clinics from '../router.js';
   *
   * export default clinics.child({
   *   context: { params: z.object({ clinicId: z.uuid() }) },
   * });
   * ```
   */
  child: <
    ChildInject extends InjectProvidersMap = undefined,
    ChildInjectOnRequest extends InjectOnRequestMap = undefined,
    ChildParams extends z.ZodObject | undefined = undefined,
    Inject extends InjectProvidersMap = undefined,
    Properties extends object = object,
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Methods extends MethodsMap = {},
  >(
    params?: EndpointRouterOptions<
      ChildInject,
      ChildInjectOnRequest,
      ChildParams,
      Inject,
      Properties,
      Methods
    >,
  ) => EndpointRouter<
    // `Extract` only tells the compiler what each merge is, while generic.
    Extract<Overriding<RouterInject, ChildInject, ChildInjectOnRequest>, InjectProvidersMap>,
    Extract<
      Overriding<RouterInjectOnRequest, ChildInjectOnRequest, ChildInject>,
      InjectOnRequestMap
    >,
    Extract<MergedParams<RouterParams, ChildParams>, z.ZodObject | undefined>
  >;
};

/**
 * What a router has as it is made, which its registration and the routers made with its
 * `child()` read.
 */
type Router = {
  file: string;
  /** What it gives its endpoints. */
  context: RouterContext;
  /** Its providers and imports, as its children have them. */
  providers: SharedProviders;
  /** Its guards and interceptors, after those of the routers above it. */
  lineage: Lineage;
  instance: RouterInstance;
};

/**
 * The router a child was made from. A root with no router of its own has only its file and
 * an empty context.
 */
type ParentRouter = Pick<Router, 'file' | 'context'> &
  Partial<Pick<Router, 'providers' | 'lineage' | 'instance'>>;

/** What the call that made a router was given, and where it was made. */
type MadeWith = {
  file: string;
  /** The call that made it, and where: how its errors begin. */
  at: string;
  params: AnyRouterOptions | undefined;
  /** Set for the router `NestjsEndpoints.forRoot()` creates. */
  root: RootOptions | undefined;
  /** The router whose `child()` made this one. */
  parent: ParentRouter | undefined;
  /**
   * The store of the router running where it was made, for a router no parent discovered.
   * Never read from the store when the deferred work runs: that could pick up whichever
   * router awaited it.
   */
  capturedStore: ParentStore | undefined;
};

/**
 * What a router declares for the instance of its module, and what the routers under it read
 * of where it is: its lifecycle hooks, properties and methods, and what its own `inject` gives
 * them; its place in NestJS's order; its layout and its middleware.
 */
type RouterInstance = {
  members: InstanceMembers;
  inject: InjectProvidersMap;
  /**
   * The module that has the members: one the router's own module imports, and the routers
   * under it by `order`, so that NestJS starts this router before them. Built once.
   */
  module: () => DynamicModule;
  /** Exports nothing; imports `module()` once the router has one, and the `order` above. */
  order: DynamicModule;
  /**
   * The layout of the router above it: its parent's, the router's that found it, or the
   * store of the router running where it was made.
   */
  above: () => ParentStore | undefined;
  /**
   * Its layout, as the routers under it read it: the one it registered with, or, while it
   * has not, the one its options, its file and the router above it give.
   */
  store: () => ParentStore;
  registeredAs: (store: ParentStore) => void;
  /** The class of its own module, once it has registered: how an app is seen to have it. */
  ownModule?: Type;
  /**
   * Its middleware, after that of the routers above it by `child()`, the outermost first: a
   * router applies that of the routers above it that an app loads it without.
   */
  middleware: () => AppliedMiddleware[];
};

/**
 * What a router's own options give its endpoints, checked. `at` names the call that made the
 * router, for the errors.
 */
function ownContext(at: string, options: AnyRouterOptions | undefined): RouterContext {
  const given: unknown = options?.context;
  const keys = new Intl.ListFormat('en').format(CONTEXT_KEYS.map((key) => `\`${key}\``));
  if (
    given !== undefined &&
    (typeof given !== 'object' || given === null || Array.isArray(given))
  ) {
    throw new Error(`${at}: \`context\` must be an object of ${keys}.`);
  }
  const notContext = Object.keys(given ?? {}).find(
    (key) => !(CONTEXT_KEYS as readonly string[]).includes(key),
  );
  if (notContext !== undefined) {
    throw new Error(
      `${at}: \`context.${notContext}\` is not a key of a context: it takes ${keys}.`,
    );
  }
  const { inject, injectOnRequest, params } = (given ?? {}) as RouterContext;
  const context = { inject, injectOnRequest, params };
  if ((options as { exports?: unknown } | undefined)?.exports !== undefined) {
    throw new Error(
      `${at}: \`exports\` is not a router option. What a router provides is for it and the ` +
        'routers under it. To share a provider with another module, provide it in a module, ' +
        'and import that module in both.',
    );
  }
  const { namespace, description } = options ?? {};
  if (typeof namespace === 'string' && !NAMESPACE_NAME.test(namespace)) {
    throw new Error(`${at}: \`namespace\`, ${notANamespaceName(namespace)}`);
  }
  if (description !== undefined && !namespace) {
    throw new Error(
      `${at}: \`description\` documents a namespace, and this router has none. Set ` +
        '`namespace` on it, or remove `description`.',
    );
  }
  // On each endpoint's `this`; what the router injects into its own is checked with its members.
  for (const key of Object.keys(inject ?? {})) {
    const reason = [...ENDPOINT_OWN_MEMBERS, 'constructor'].includes(key)
      ? 'a name each endpoint has'
      : (LIFECYCLE_HOOKS as readonly string[]).includes(key)
        ? 'a lifecycle hook'
        : undefined;
    if (reason) {
      throw new Error(
        `${at}: \`context.inject\` declares \`${key}\`, ${reason}: \`this\` has one member of ` +
          'each name.',
      );
    }
  }
  assertOneMapPerKey(context, at, 'context.');
  assertPlainParams(params, at, '', 'context.params');
  return context;
}

/** What tells a router from anything else a file exports, whichever copy of the package made it. */
const ROUTER = Symbol.for('nestjs-endpoints:router');

/** Whether `value` is what `create()`, `child()` and `forRoot()` return. */
function isRouter(value: unknown): value is EndpointRouter<any, any, any> {
  return value instanceof Promise && ROUTER in value;
}

/**
 * What a router carries beside its module: its `endpoint` builders, and
 * `child()` for the routers nested under it.
 */
export function routerMembers(
  router: ParentRouter,
): Pick<EndpointRouter<any, any, any>, 'endpoint' | 'child'> {
  const { file, context, providers, instance } = router;
  const members: Pick<EndpointRouter<any, any, any>, 'endpoint' | 'child'> = {
    endpoint: createRouterEndpoint(file, context),
    child: (options) => {
      // Reads its calling file as `create()` does: the router module that calls it.
      const child = createLazily(getCallsiteFile(), options, undefined, router);
      if (providers) {
        providers.wanted = true;
      }
      // Where its children find its members, to start after it.
      if (instance?.members.any) {
        importInto(instance.order, instance.module());
      }
      return child;
    },
  };
  return Object.assign(members, { [ROUTER]: true });
}

/**
 * Captures what must be read at the call itself — the calling file and the
 * store of the router running then — and defers the rest until the module is
 * awaited.
 * NestJS awaits it while scanning modules, after the app's whole import graph
 * has been evaluated, so an endpoint file the router then imports finds the
 * modules it depends on ready, the router's own among them.
 *
 * What the router gives its endpoints is settled here, not when it is
 * awaited: its own context over that of the router it is a child of.
 */
export function createLazily(
  callsiteFile: string,
  params: AnyRouterOptions | undefined,
  root?: RootOptions,
  parent?: ParentRouter,
): EndpointRouter<any, any, any> {
  const madeWith = root
    ? 'NestjsEndpoints.forRoot()'
    : parent
      ? 'child()'
      : 'EndpointRouter.create()';
  const made: MadeWith = {
    file: callsiteFile,
    at: `${madeWith} in ${callsiteFile}`,
    params,
    root,
    parent,
    capturedStore: moduleAls.getStore(),
  };
  const context = mergeContext(parent?.context ?? {}, ownContext(made.at, params));
  const providers = sharedProviders(callsiteFile, params, parent?.providers);
  const router: Router = {
    file: callsiteFile,
    context,
    providers,
    lineage: lineageOf(parent?.lineage ?? NO_LINEAGE, params),
    instance: routerInstance(made, providers),
  };
  return Object.assign(new LazyPromise(() => registerRouter(made, router)), routerMembers(router));
}

/** A router's instance, for the router `made` describes. */
function routerInstance(made: MadeWith, providers: SharedProviders): RouterInstance {
  const { file, at, params, parent, capturedStore } = made;
  const members = declaredMembers(params ?? {}, {
    at,
    owner: 'router',
    injected: Object.keys(params?.inject ?? {}),
    own: ['configure'],
  });
  const order = orderModule(parent?.instance ? [parent.instance.order] : []);
  const ownMiddleware = parseMiddleware(params?.middleware);
  let module: DynamicModule | undefined;
  let registered: ParentStore | undefined;
  // What a router under it was given before this one registered.
  let assumed: ParentStore | undefined;
  const instance: RouterInstance = {
    inject: params?.inject,
    members,
    order,
    middleware: () => {
      const basePath = instance.store().parentBasePath;
      return [
        ...(parent?.instance?.middleware() ?? []),
        {
          handlers: ownMiddleware.handlers,
          // Each given from the router's own base path.
          exclude: ownMiddleware.exclude.map((p) => underBase(basePath, p)),
          basePath,
          isIn: (modules) => hasModule(modules, instance.ownModule),
        },
      ];
    },
    above: () =>
      parent?.instance?.store() ?? nestedRouterParents.get(stripExtension(file)) ?? capturedStore,
    registeredAs: (store) => {
      // A router under it that registered before took it to be where `assumed` says, and
      // registers once: where an app places this one elsewhere, that router is misplaced.
      const moved =
        assumed &&
        (assumed.parentBasePath !== store.parentBasePath ||
          assumed.parentNamespaceChain.join('/') !== store.parentNamespaceChain.join('/'));
      if (moved) {
        // The namespaces are told where the base path alone does not tell the two apart.
        const sameBase = assumed!.parentBasePath === store.parentBasePath;
        const place = ({ parentBasePath, parentNamespaceChain }: ParentStore) =>
          `"/${parentBasePath}"` +
          (sameBase ? ` in the namespace "${parentNamespaceChain.join('/')}"` : '');
        throw new Error(
          `nestjs-endpoints: the router of ${shown(file)} is under ${place(store)} in ` +
            `this app, and was under ${place(assumed!)} for a router made with its child() ` +
            'that was loaded before, without the routers above it. A router registers once ' +
            'in a process, so that one keeps the first place. Load it by itself in another ' +
            'test file.',
        );
      }
      registered = store;
    },
    store: () => {
      if (registered) {
        return registered;
      }
      assumed = storeOf(file, layoutOf(file, params, instance.above()), order);
      return assumed;
    },
    module: () => {
      if (!module) {
        class RouterInstanceModule {
          constructor() {
            members.initialize(this);
          }
        }
        Module({})(RouterInstanceModule);
        // Only a router that declares a member has any: nothing else reads them from its module.
        members.defineOn(RouterInstanceModule, instance.inject, `the router of ${shown(file)}`);
        module = {
          module: RouterInstanceModule,
          // What is injected into it, and the order above: a child's parent is known here.
          imports: [...providers.inherited(), ...(parent?.instance ? [parent.instance.order] : [])],
        };
      }
      return module;
    },
  };
  return instance;
}

/**
 * Creates routers. A router finds the endpoint files of a folder, and gives them, and the
 * routers under it, what it is configured with.
 */
export const EndpointRouter = {
  /**
   * Creates a router: the default export of a `router.ts`, or an import of
   * a module.
   *
   * ```ts
   * // src/endpoints/orders/router.ts
   * export default EndpointRouter.create({ providers: [OrdersService] });
   * ```
   */
  create<
    RouterInject extends InjectProvidersMap = undefined,
    RouterInjectOnRequest extends InjectOnRequestMap = undefined,
    RouterParams extends z.ZodObject | undefined = undefined,
    Inject extends InjectProvidersMap = undefined,
    Properties extends object = object,
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Methods extends MethodsMap = {},
  >(
    options?: EndpointRouterOptions<
      RouterInject,
      RouterInjectOnRequest,
      RouterParams,
      Inject,
      Properties,
      Methods
    >,
  ): EndpointRouter<RouterInject, RouterInjectOnRequest, RouterParams> {
    return createLazily(getCallsiteFile(), options);
  },
};

/**
 * The endpoints a router serves itself, each set up once under its layout, and the modules of
 * the routers nested under it, which it runs. Run inside its own store, as the routers under
 * it read it.
 */
async function loadRouter(
  { file: callsiteFile, at, params }: MadeWith,
  layout: Layout,
  ownStore: ParentStore,
): Promise<{ endpoints: Type[]; nestedModules: DynamicModule[] }> {
  const { rootDirectories, effectiveBasePath, effectiveNamespaceChain } = layout;
  // The files that had defined an endpoint before this router imported any.
  const definedBefore = settings.endpoints.map((e) => e.file);
  const { notImported, endpoints, nestedModules, listedEndpoints } = await moduleAls.run(
    ownStore,
    async () => {
      // A file with a router file's name is one when it exports a router: that is known
      // once it is imported.
      const { endpointFiles, nestedRouterModuleFiles, passedOver } = await findRouterFiles(
        rootDirectories,
        callsiteFile,
        async (file) => Object.values(await importRouterFile(file, callsiteFile)).some(isRouter),
        // A router is told who found it when it registers, which may be while this one
        // still looks: named here, before the first file is imported.
        (file) => nestedRouterParents.set(stripExtension(file), ownStore),
      );
      for (const file of passedOver) {
        nestedRouterParents.delete(stripExtension(file));
      }
      const notImported = [...endpointFiles].filter((f) =>
        definedBefore.every((file) => !isSameModule(file, f)),
      );
      const endpoints: Type[] = [];
      for (const file of notImported) {
        // A file with an endpoint file's name that default-exports no endpoint serves nothing.
        const endpoint: unknown = await (await importFile(file)).default;
        if (isEndpoint(endpoint)) {
          endpoints.push(endpoint);
        }
      }
      const nestedModules: DynamicModule[] = [];
      for (const file of nestedRouterModuleFiles) {
        const router = (await importFile(file)).default;
        // One the file exports by name is registered by the module that imports it.
        if (isRouter(router)) {
          // Awaiting the router runs it.
          nestedModules.push(await router);
        }
      }
      // Imported here, inside this router's run, so each endpoint defined
      // by a listed file is set up once, below, by this router.
      const listed =
        typeof params?.endpoints === 'function' ? params.endpoints() : params?.endpoints;
      const listedEndpoints = (
        await Promise.all((listed ?? []).map((entry) => resolveListedEndpoints(entry, at)))
      ).flat();
      return { notImported, endpoints, nestedModules, listedEndpoints };
    },
  );
  // Each endpoint is set up once, whether this router discovered it, it is
  // listed, or both.
  const setupFns = new Set<EndpointSetupFn>([
    ...settings.endpoints
      .filter((e) => notImported.some((f) => isSameModule(f, e.file)))
      .map((e) => e.setupFn),
    ...listedEndpoints
      .map((ep) => Reflect.getMetadata('endpoints:setupFn', ep) as EndpointSetupFn | undefined)
      .filter((fn) => fn !== undefined),
  ]);
  for (const setupFn of setupFns) {
    setupFn({
      rootDirectories,
      basePath: effectiveBasePath,
      namespaceChain: effectiveNamespaceChain,
      routerFile: callsiteFile,
    });
  }
  return {
    endpoints: [...new Set([...endpoints, ...listedEndpoints])].filter((e) =>
      Reflect.hasMetadata('endpoints:path', e),
    ),
    nestedModules,
  };
}

async function registerRouter(made: MadeWith, router: Router): Promise<DynamicModule> {
  const { file: callsiteFile, params, root, parent } = made;
  const { providers: shared, lineage, instance } = router;
  const childOf = parent?.file;
  const discoveredBy = nestedRouterParents.get(stripExtension(callsiteFile));
  if (childOf && discoveredBy && !isSameModule(discoveredBy.parentRouterFile, childOf)) {
    throw new Error(
      `${shown(callsiteFile)} is made with the child() of ${shown(childOf)} but is nested ` +
        `under ${shown(discoveredBy.parentRouterFile)}. Make it with the \`child()\` of the ` +
        'router it is nested under.',
    );
  }
  // A child's place comes from its parent's, whether or not its parent is in the app.
  const parentStore = discoveredBy ?? instance.above();
  const layout = layoutOf(callsiteFile, params, parentStore);
  if (params?.description) {
    // Of the namespace its endpoints are in, which a router with a description has.
    const name = layout.effectiveNamespaceChain.join('/');
    const existing = settings.descriptions.find((t) => t.name === name);
    if (existing) {
      existing.description = params.description;
    } else {
      settings.descriptions.push({ name, description: params.description });
    }
  }
  const ownStore = storeOf(callsiteFile, layout, instance.order);
  // From here on, what the routers under it read.
  instance.registeredAs(ownStore);
  const { endpoints, nestedModules } = await loadRouter(made, layout, ownStore);

  const endpointsOf = (m: DynamicModule) => (m as AllEndpointsCarrier)[ALL_ENDPOINTS_SYMBOL] ?? [];
  const allEndpoints: Type[] = [...endpoints, ...nestedModules.flatMap(endpointsOf)];
  // Guards, interceptors and middleware apply to every endpoint in the subtree, the outermost
  // router's first. A router made with this one's `child()` applies this one's with its own,
  // its whole lineage, whether this one is in the app or not: this one leaves its endpoints
  // to it. A router made with `create()` has none of them, which come before its own.
  const lineageApplied = [
    ...endpoints,
    ...nestedModules
      .filter((m) => !isSameModule((m as AllEndpointsCarrier)[CHILD_OF_SYMBOL] ?? '', callsiteFile))
      .flatMap(endpointsOf),
  ];
  for (const ep of lineageApplied) {
    applyLineage(ep, lineage);
  }

  const lineageMiddleware = instance.middleware();
  const basePath = ownStore.parentBasePath;
  const modulesKey = Symbol('modules');
  const configKey = Symbol('config');
  const adapterKey = Symbol('adapter');

  // `child()` has been called on this router by now, if it is to be before an app has it:
  // by a router module this one found and loaded above, or one evaluated before.
  //
  // Its members are in a module apart from its endpoints, which the router's own module and
  // the routers under it import: NestJS then starts the router before both. Its providers
  // are apart with them, for what the members inject.
  const membersApart = instance.members.any;
  // The router above, by `child()` or by where this one is nested.
  const above = parent?.instance?.order ?? parentStore?.order;
  importInto(instance.order, above);
  if (membersApart) {
    importInto(instance.module(), above);
    importInto(instance.order, instance.module());
  }

  class RouterModule implements NestModule {
    // Called once for each app, as it starts: what it applies is for that app.
    configure(consumer: MiddlewareConsumer) {
      const injected = this as unknown as Record<symbol, unknown>;
      const modules = injected[modulesKey] as ModulesContainer;
      const config = injected[configKey] as ApplicationConfig;
      const adapter = (injected[adapterKey] as HttpAdapterHost).httpAdapter;
      const routes = appRoutes(modules);
      warnOfRouteOrder(routes, config, adapter);
      applyRouterMiddleware(
        consumer,
        { modules, config, adapter, routes },
        { basePath, endpoints: allEndpoints, lineage: lineageMiddleware },
      );
    }
  }
  Module({})(RouterModule);
  Inject(ModulesContainer)(RouterModule.prototype, modulesKey);
  Inject(ApplicationConfig)(RouterModule.prototype, configKey);
  Inject(HttpAdapterHost)(RouterModule.prototype, adapterKey);
  instance.ownModule = RouterModule;
  // After the router above it, and after its own members.
  const before = [...(membersApart ? [instance.module()] : []), ...(above ? [above] : [])];

  const module = {
    module: RouterModule,
    providers: [
      appOfRouter,
      hooksAreCalled,
      // The app's root, or a router no other router discovered.
      ...(root || !parentStore
        ? topLevelProviders(root, { directories: layout.rootDirectories, near: callsiteFile })
        : []),
    ],
    controllers: endpoints,
    [ALL_ENDPOINTS_SYMBOL]: allEndpoints,
    ...(childOf && { [CHILD_OF_SYMBOL]: childOf }),
  };
  if (shared.wanted || membersApart) {
    // Its providers are in the module its children import, so both have the same
    // instances; and where its members are, for what they inject.
    return {
      ...module,
      imports: [...shared.inherited(), ...before, ...nestedModules],
    } as DynamicModule;
  }
  // Its providers and imports are its own module's, as in any NestJS module.
  shared.keptBy = RouterModule;
  return {
    ...module,
    imports: [
      ...(params?.imports ?? []),
      ...(parent?.providers?.inherited() ?? []),
      ...before,
      ...nestedModules,
    ],
    providers: [...(params?.providers ?? []), ...module.providers],
  } as DynamicModule;
}
