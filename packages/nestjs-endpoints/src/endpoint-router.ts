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
import { RootOptions, topLevelProviders, watching } from './app-root';
import { sourceDirectoryOf, sourceFileOf } from './compiled-source';
import { descriptorOf } from './descriptors';
import { instantiatedIn } from './document-schemas';
import { type EndpointBuilders, routerEndpoint } from './endpoint-fn';
import { getCallsiteFile, moduleAls } from './helpers';
import { hooksAreCalled } from './hook-scopes';
import {
  given,
  type Injected,
  type InjectOnRequestMap,
  type InjectProvidersMap,
} from './injections';
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
import { logger } from './logger';
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
  type Listing,
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
import {
  CONTEXT_KEYS,
  type DescribesNamespace,
  type ListedRouter,
  type RegisteredRouter,
  type RouterOptions,
} from './router-options';
import { findRouterFiles, isSameModule, shown, stripExtension } from './routing-files';
import { type EndpointSetupFn, settings, setupOf } from './settings';
import { type RouterSubtree, sharedState } from './shared-state';

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

const { router: ROUTER, subtree: SUBTREE } = sharedState;

/**
 * What a router's module carries for the router it is nested under. A property, which a module
 * spread into another keeps.
 */
function subtreeOf(module: DynamicModule): RouterSubtree | undefined {
  return (module as unknown as Record<symbol, RouterSubtree | undefined>)[SUBTREE];
}

/** Every endpoint of a router's subtree, read off its module. */
export function endpointsUnder(module: DynamicModule): Type[] {
  return subtreeOf(module)?.endpoints ?? [];
}

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

/** What `create()` takes besides: the names the router that lists this one gives its endpoints. */
type Expecting<Expects extends InjectOnRequestMap> = {
  /**
   * The names this router's endpoints are given by the router that lists it in `routers`,
   * each typed with `EndpointRouter.given<T>()`. A library's router declares here what the
   * app's router gives it: the app decides how, in its own `context`.
   *
   * ```ts
   * expects: { db: EndpointRouter.given<Db>(), user: EndpointRouter.given<AppUser>() }
   * ```
   */
  expects?: Expects;
};

type AnyRouterOptions = EndpointRouterOptions<any, any, any, any, any, any> & Expecting<any>;

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
   * This router as another lists it in `routers`, with a base path in place of its own: the
   * app that imports a library's router says where it is.
   *
   * ```ts
   * NestjsEndpoints.forRoot({
   *   router: { routers: [sharedRouter.register({ basePath: 'v1/shared' })] },
   * });
   * ```
   */
  register: (listing?: Listing) => RegisteredRouter;
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
  /**
   * What it gives its endpoints: its own, over that of the router above it. Read when it is
   * needed, as a router that lists this one in `routers` may be made after it.
   */
  readonly context: RouterContext;
  /** Its providers and imports, as its children have them. */
  providers: SharedProviders;
  /** Its guards and interceptors, after those of the routers above it. Read as it loads. */
  readonly lineage: Lineage;
  instance: RouterInstance;
};

/**
 * The router a child was made from. A root with no router of its own has only its file and
 * an empty context.
 */
type ParentRouter = Pick<Router, 'file' | 'context'> &
  Partial<Pick<Router, 'providers' | 'lineage' | 'instance'>>;

/** What the call that made a router was given, and where it was made. */
/** A router as another lists it in `routers`. */
type Listed = { router: Promise<DynamicModule>; handle: RouterHandle; listing: Listing };

/**
 * What a router carries for the router that lists it in `routers`, under the key that tells a
 * router: who it is, and how it is put under that router. One copy of the package calls
 * another's, so its shape is part of what copies share.
 */
type RouterHandle = {
  file: string;
  /**
   * Has it take the context, the providers and the guards and interceptors of the router that
   * lists it, `above`, as one made with that router's `child()` has its parent's. When that
   * router is made.
   */
  listedBy: (above: Above) => void;
  /** Places it under the layout of the router that lists it. When that router loads. */
  placedUnder: (store: ParentStore, listing: Listing) => void;
};

/** What a router has of the router above it: its parent, or the one that lists it. */
type Above = Pick<Router, 'file' | 'context' | 'providers' | 'lineage'>;

type MadeWith = {
  file: string;
  /** The call that made it, and where: how its errors begin. */
  at: string;
  params: AnyRouterOptions | undefined;
  /** Set for the router `NestjsEndpoints.forRoot()` creates. */
  root: RootOptions | undefined;
  /** The router whose `child()` made this one. */
  parent: ParentRouter | undefined;
  /** The routers its `routers` lists. */
  listed: Listed[];
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
  /** How the router that lists it in `routers` placed it; none for any other router. */
  placed?: { store: ParentStore; listing: Listing };
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

/** Whether `value` is what `create()`, `child()` and `forRoot()` return. */
function isRouter(value: unknown): value is EndpointRouter<any, any, any> {
  return value instanceof Promise && ROUTER in value;
}

/**
 * What a router carries beside its module: its `endpoint` builders, and
 * `child()` for the routers nested under it.
 */
function routerMembers(
  router: ParentRouter,
  handle?: RouterHandle,
): Pick<EndpointRouter<any, any, any>, 'endpoint' | 'child'> {
  const members: Pick<EndpointRouter<any, any, any>, 'endpoint' | 'child'> = {
    endpoint: routerEndpoint(router),
    child: (options) => {
      // Reads its calling file as `create()` does: the router module that calls it.
      const child = createLazily(getCallsiteFile(), options, undefined, router);
      hasRoutersUnder(router);
      return child;
    },
  };
  return Object.assign(members, { [ROUTER]: handle ?? true });
}

/**
 * A router's endpoints are given every name it `expects`: by its own context, or by that of
 * the router that lists it in `routers`, `listedBy`. Checked as it loads, when both are known.
 */
function assertGiven(
  { at, params }: MadeWith,
  context: RouterContext,
  listedBy: string | undefined,
): void {
  const given = { ...context.inject, ...context.injectOnRequest };
  const missing = Object.keys(params?.expects ?? {}).filter((name) => !Object.hasOwn(given, name));
  if (missing.length === 0) {
    return;
  }
  const names = new Intl.ListFormat('en').format(missing.map((name) => `\`${name}\``));
  throw new Error(
    listedBy
      ? `${at}: \`expects\` names ${names}, which ${shown(listedBy)}, the router that lists it ` +
          `in \`routers\`, does not give its endpoints. Add ${names} to the \`context\` of ` +
          'that router.'
      : `${at}: \`expects\` names ${names}, and no router lists it in \`routers\`: an app ` +
          'lists it in the `routers` of a router whose `context` gives them.',
  );
}

/**
 * `module` as a router: with the members `router` gives it, and `register()`, which returns it
 * as another router lists it.
 */
export function asRouter(
  module: Promise<DynamicModule>,
  router: ParentRouter,
  handle?: RouterHandle,
): EndpointRouter<any, any, any> {
  const created = Object.assign(module, routerMembers(router, handle));
  return Object.assign(created, {
    register: (listing: Listing = {}): RegisteredRouter => ({ router: created, ...listing }),
  });
}

/**
 * A router that has one under it by `child()` or by `routers` keeps its providers where that
 * one finds them, and its members where that one starts after them.
 */
function hasRoutersUnder({ providers, instance }: ParentRouter): void {
  if (providers) {
    providers.wanted = true;
  }
  if (instance?.members.any) {
    importInto(instance.order, instance.module());
  }
}

/** The routers a router's `routers` lists, each with how it is listed. `at` begins an error. */
function listedRouters(at: string, routers: ListedRouter[] | undefined): Listed[] {
  return (routers ?? []).map((entry) => {
    const registered = (isRouter(entry) ? { router: entry } : entry) as
      | Partial<RegisteredRouter>
      | undefined;
    const { router, ...listing } = registered ?? {};
    const handle = isRouter(router) ? (router as unknown as Record<symbol, unknown>)[ROUTER] : 0;
    if (typeof handle !== 'object' || handle === null) {
      const name = (entry as { name?: string } | undefined)?.name || 'a value';
      throw new Error(
        `${at}: \`routers\` lists ${name}, which is not a router. A router is made with ` +
          'EndpointRouter.create(), and is listed as it is or as its register() returns it.',
      );
    }
    return { router: router as Promise<DynamicModule>, handle: handle as RouterHandle, listing };
  });
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
  const at = `${madeWith} in ${callsiteFile}`;
  const made: MadeWith = {
    file: callsiteFile,
    at,
    params,
    root,
    parent,
    listed: listedRouters(at, params?.routers),
    capturedStore: moduleAls.getStore(),
  };
  const own = ownContext(made.at, params);
  // The router that lists this one in `routers`, once one does.
  let listedBy: Above | undefined;
  // Its context, for the one the router above it had when it was read last.
  let given: { above: RouterContext | undefined; context: RouterContext } | undefined;
  // Its guards and interceptors are among its providers: one instance of each.
  const { lineage: ownLineage, providers: checks } = lineageOf(NO_LINEAGE, params);
  const providers = sharedProviders(
    callsiteFile,
    { imports: params?.imports, providers: [...(params?.providers ?? []), ...checks] },
    parent?.providers,
  );
  // In a module apart from its endpoints: one of its endpoints that lists one again has an
  // instance of its own, which NestJS makes in the endpoint's module by the same class.
  if (checks.length) {
    providers.wanted = true;
  }
  const instance = routerInstance(made, providers);
  const router: Router = {
    file: callsiteFile,
    get context() {
      const above = (listedBy ?? parent)?.context;
      if (given?.above !== above || !given) {
        given = { above, context: mergeContext(above ?? {}, own) };
      }
      return given.context;
    },
    providers,
    get lineage() {
      const above = (listedBy ?? parent)?.lineage ?? NO_LINEAGE;
      return {
        guards: [...above.guards, ...ownLineage.guards],
        interceptors: [...above.interceptors, ...ownLineage.interceptors],
      };
    },
    instance,
  };
  const handle: RouterHandle = {
    file: callsiteFile,
    listedBy: (above) => {
      if (loading) {
        throw new Error(
          `${shown(above.file)} lists the router of ${shown(callsiteFile)} in \`routers\`, ` +
            'which has loaded already: where it is, and what its endpoints are given, are ' +
            'settled as it loads. List it before an app loads it.',
        );
      }
      if (parent) {
        throw new Error(
          `${shown(above.file)} lists the router of ${shown(callsiteFile)} in \`routers\`, ` +
            `which is made with the child() of ${shown(parent.file)}: it is under that router.`,
        );
      }
      if (listedBy) {
        throw new Error(
          `${shown(above.file)} lists the router of ${shown(callsiteFile)} in \`routers\`, ` +
            `which ${shown(listedBy.file)} lists already. A router is under one router.`,
        );
      }
      listedBy = above;
      providers.under(above.providers);
    },
    placedUnder: (store, listing) => {
      instance.placed = { store, listing };
    },
  };
  for (const listed of made.listed) {
    listed.handle.listedBy(router);
  }
  if (made.listed.length > 0) {
    hasRoutersUnder(router);
  }
  // Whether it has begun to load, which settles where it is and what it gives.
  let loading = false;
  const load = () => {
    loading = true;
    return registerRouter(made, router);
  };
  return asRouter(new LazyPromise(load), router, handle);
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
      parent?.instance?.store() ??
      instance.placed?.store ??
      nestedRouterParents.get(stripExtension(file)) ??
      capturedStore,
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
      assumed = storeOf(
        file,
        layoutOf(file, params, instance.above(), instance.placed?.listing),
        order,
      );
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
    Expects extends InjectOnRequestMap = undefined,
  >(
    options?: EndpointRouterOptions<
      RouterInject,
      RouterInjectOnRequest,
      RouterParams,
      Inject,
      Properties,
      Methods
    > &
      Expecting<Expects>,
  ): EndpointRouter<
    RouterInject,
    // What it expects is among its handlers' parameters, under what it declares itself.
    Extract<Overriding<Expects, RouterInjectOnRequest, RouterInject>, InjectOnRequestMap>,
    RouterParams
  > {
    return createLazily(getCallsiteFile(), options);
  },
  /**
   * A name in a router's `expects`, typed as `T`: what its endpoints are given under that name
   * by the router that lists it in `routers`.
   */
  given,
};

/**
 * The endpoints a router serves itself, each set up once under its layout, and the modules of
 * the routers nested under it, which it runs. Run inside its own store, as the routers under
 * it read it.
 */
async function loadRouter(
  { file: callsiteFile, at, params, root, listed: routers }: MadeWith,
  layout: Layout,
  ownStore: ParentStore,
): Promise<{ endpoints: Type[]; nestedModules: DynamicModule[] }> {
  const { rootDirectories, effectiveBasePath, effectiveNamespaceChain } = layout;
  // The modules that had defined an endpoint before this router imported any, by file
  // without its extension, as `isSameModule` reads them.
  const definedBefore = new Set(settings.endpoints.map((e) => stripExtension(e.file)));
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
      const notImported = [...endpointFiles].filter((f) => !definedBefore.has(stripExtension(f)));
      const endpoints: Type[] = [];
      for (const file of notImported) {
        // A file with an endpoint file's name that default-exports no endpoint serves nothing.
        const endpoint: unknown = await (await importFile(file)).default;
        if (isEndpoint(endpoint)) {
          endpoints.push(endpoint);
        } else {
          logger.warn(
            `${shown(sourceFileOf(file) ?? file)} default-exports no endpoint, so it serves nothing.`,
          );
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
      // Those its `routers` lists, placed under it before each runs.
      for (const { router, handle, listing } of routers) {
        handle.placedUnder(ownStore, listing);
        nestedModules.push(await router);
      }
      // Imported here, inside this router's run, so each endpoint defined
      // by a listed file is set up once, below, by this router.
      const listed =
        typeof params?.endpoints === 'function' ? params.endpoints() : params?.endpoints;
      const listedEndpoints = (
        await Promise.all((listed ?? []).map((entry) => resolveListedEndpoints(entry, at)))
      ).flat();
      // The app's root is where a new project's first endpoint file goes: a folder that is
      // missing or misnamed would otherwise be an app that starts and answers 404.
      if (
        root &&
        endpointFiles.size +
          nestedRouterModuleFiles.size +
          routers.length +
          listedEndpoints.length ===
          0
      ) {
        const folders = rootDirectories.map((directory) =>
          shown(sourceDirectoryOf(directory, callsiteFile)),
        );
        logger.warn(`No endpoint files found in ${folders.join(', ')}.`);
      }
      return { notImported, endpoints, nestedModules, listedEndpoints };
    },
  );
  // Each endpoint is set up once, whether this router discovered it, it is listed, or both:
  // those its files defined, which waited for it, and those it mounts, by their class. One
  // another copy of the package built did not wait, and is set up again here.
  const imported = new Set(notImported.map(stripExtension));
  const setupFns = new Set<EndpointSetupFn>([
    ...settings.endpoints.filter((e) => imported.has(stripExtension(e.file))).map((e) => e.setupFn),
    ...[...endpoints, ...listedEndpoints].map(setupOf).filter((fn) => fn !== undefined),
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
    endpoints: [...new Set([...endpoints, ...listedEndpoints])].filter(
      (e) => descriptorOf(e) !== undefined,
    ),
    nestedModules,
  };
}

async function registerRouter(made: MadeWith, router: Router): Promise<DynamicModule> {
  const { file: callsiteFile, params, root, parent } = made;
  const { providers: shared, lineage, instance } = router;
  const childOf = parent?.file;
  // The router whose guards and interceptors this one applies with its own.
  const under = childOf ?? instance.placed?.store.parentRouterFile;
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
  const layout = layoutOf(callsiteFile, params, parentStore, instance.placed?.listing);
  assertGiven(made, router.context, instance.placed?.store.parentRouterFile);
  if (params?.description) {
    // Of the namespace its endpoints are in, which a router with a description has.
    sharedState.descriptions.set(layout.effectiveNamespaceChain.join('/'), params.description);
  }
  const ownStore = storeOf(callsiteFile, layout, instance.order);
  // From here on, what the routers under it read.
  instance.registeredAs(ownStore);
  const { endpoints, nestedModules } = await loadRouter(made, layout, ownStore);

  const allEndpoints: Type[] = [...endpoints, ...nestedModules.flatMap(endpointsUnder)];
  // Guards, interceptors and middleware apply to every endpoint in the subtree, the outermost
  // router's first. A router made with this one's `child()`, or one its `routers` lists,
  // applies this one's with its own, its whole lineage, whether this one is in the app or not:
  // this one leaves its endpoints to it. A router made with `create()` that it finds in a
  // folder has none of them, which come before its own.
  const lineageApplied = [
    ...endpoints,
    ...nestedModules
      .filter((m) => !isSameModule(subtreeOf(m)?.childOf ?? '', callsiteFile))
      .flatMap(endpointsUnder),
  ];
  for (const ep of lineageApplied) {
    applyLineage(ep, lineage);
  }

  const lineageMiddleware = instance.middleware();
  const basePath = ownStore.parentBasePath;

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
    constructor(
      @Inject(ModulesContainer) private readonly modules: ModulesContainer,
      @Inject(ApplicationConfig) private readonly config: ApplicationConfig,
      @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    ) {}

    // Called once for each app, as it starts: what it applies is for that app.
    configure(consumer: MiddlewareConsumer) {
      const { modules, config } = this;
      const adapter = this.adapterHost.httpAdapter;
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
      // One another lists has folders of its own, which that router's are not over.
      ...(instance.placed
        ? [watching({ directories: layout.rootDirectories, near: callsiteFile })]
        : []),
    ],
    controllers: endpoints,
    // One another lists applies what is above it itself too, as one made with `child()` does.
    [SUBTREE]: {
      endpoints: allEndpoints,
      ...(under && { childOf: under }),
    } satisfies RouterSubtree,
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
      ...(shared.above()?.inherited() ?? []),
      ...before,
      ...nestedModules,
    ],
    providers: [...shared.own, ...module.providers],
  } as DynamicModule;
}
