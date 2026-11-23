import type { Type } from '@nestjs/common';
import { declaresHooks } from './hook-scopes';
import { injectInto, type InjectProvidersMap } from './injections';

/**
 * The hooks NestJS calls on a controller and on a module, by the names it gives them.
 */
export const LIFECYCLE_HOOKS = [
  'onModuleInit',
  'onApplicationBootstrap',
  'onModuleDestroy',
  'beforeApplicationShutdown',
  'onApplicationShutdown',
] as const;

export type LifecycleHooks = {
  /** Called once what the module depends on is resolved. */
  onModuleInit?(): unknown;
  /** Called once every module is initialized, before the app listens. */
  onApplicationBootstrap?(): unknown;
  /** Called when the app is closed, or gets a signal it shuts down on. */
  onModuleDestroy?(): unknown;
  /** Called after every `onModuleDestroy`; once all are done, connections close. */
  beforeApplicationShutdown?(signal?: string): unknown;
  /** Called after connections close. */
  onApplicationShutdown?(signal?: string): unknown;
};

/** The members an endpoint's instance has before any it declares. */
export const ENDPOINT_OWN_MEMBERS = ['handler', 'invoke'] as const;

export type EndpointOwnMembers = (typeof ENDPOINT_OWN_MEMBERS)[number];

/**
 * An `inject` map that names none of `Own` or the lifecycle hooks: NestJS sets what is
 * injected on the instance, over a member of the same name.
 */
export type InjectNaming<Map, Own extends string> = Map & {
  [K in keyof NoInfer<Map> & (Own | keyof LifecycleHooks | 'constructor')]: [
    `\`${K & string}\` is already a member of \`this\``,
  ];
};

/** `methods`, as an endpoint or router declares them. */
export type MethodsMap = Record<string, (...args: any[]) => any>;

/**
 * What an endpoint or a router declares for its instance, and what `this` is where it is
 * declared: `Injections`, what is injected into the instance, with its properties and
 * methods. `Own` names the members the instance has before any it declares.
 */
export type InstanceOptions<
  Injections,
  Properties,
  Methods,
  Own extends string,
> = LifecycleHooks & {
  /**
   * Properties of the instance, as a class's fields are: of an endpoint's
   * controller, or of a router's module. A function that returns them,
   * called for each instance, so each has its own.
   *
   * They are on `this` in the methods and the lifecycle hooks, and in an
   * endpoint's handler, when those are written as methods and not as arrow
   * functions. A getter or a setter among them stays one, with the instance
   * as its `this`.
   *
   * ```ts
   * endpoint.query({
   *   properties: () => ({ cache: new Map<number, User>() }),
   *   handler({ input }) {
   *     return this.cache.get(input.id);
   *   },
   * })
   * ```
   */
  // No `this` in the function itself: it makes the instance's properties. The getters it
  // returns have one.
  properties?: (this: void) => Properties & {
    [
      K in keyof NoInfer<Properties> &
        (Own | keyof LifecycleHooks | keyof NoInfer<Methods> | keyof Injections)
    ]: [`\`${K & string}\` is already a member of \`this\``];
  } & ThisType<Injections & Properties & Methods>;
  /**
   * Methods of the instance, as a class's are. `this` has them, the
   * `properties` and what is injected.
   *
   * Declare them above the handler and the hooks: TypeScript reads the
   * options in order, and a function that returns from a method declared
   * below it does not have that method on `this`, unless it declares its
   * return type.
   *
   * ```ts
   * endpoint.query({
   *   inject: { users: UsersService },
   *   methods: {
   *     find(id: number) {
   *       return this.users.find(id);
   *     },
   *   },
   *   handler({ input }) {
   *     return this.find(input.id);
   *   },
   * })
   * ```
   */
  methods?: Methods & {
    [
      K in keyof NoInfer<Methods> & (Own | keyof LifecycleHooks | keyof Injections)
    ]: `\`${K & string}\` is already a member of \`this\``;
  };
} & ThisType<Injections & Properties & Methods>;

type Declared = LifecycleHooks & { properties?: unknown; methods?: unknown };

export type InstanceMembers = {
  /** Whether anything is declared: whether anything reads `this`. */
  any: boolean;
  /** The lifecycle hooks declared. */
  hooks: readonly (typeof LIFECYCLE_HOOKS)[number][];
  /**
   * Puts the hooks and methods on a class, and has NestJS set what `inject` gives on its
   * instances. `by` names the class where a hook of it is never called.
   */
  defineOn: (cls: Type, inject: InjectProvidersMap, by: string) => void;
  /** Gives an instance its properties. */
  initialize: (instance: object) => void;
};

/**
 * What an endpoint or a router declares for its instance, checked: its lifecycle hooks and
 * `methods`, which go on the class, and its `properties`, which each instance asks for.
 * `this` has one member of each name, so a name is declared once.
 */
export function declaredMembers(
  declared: Declared,
  names: {
    /** Starts each error: the call and the file. */
    at: string;
    /** `endpoint` or `router`. */
    owner: string;
    /** The keys of what is injected into the instance. */
    injected: readonly string[];
    /** The members the instance has of its own. */
    own: readonly string[];
  },
): InstanceMembers {
  const { at, owner } = names;
  const fail = (message: string) => new Error(`${at}: ${message}`);
  const twice = (option: string, name: string, reason: string) =>
    fail(`\`${option}\` declares \`${name}\`, ${reason}: \`this\` has one member of each name.`);
  const hooks = LIFECYCLE_HOOKS.filter((hook) => declared[hook] !== undefined);
  for (const hook of hooks) {
    if (typeof declared[hook] !== 'function') {
      throw fail(`\`${hook}\` must be a function.`);
    }
  }
  /** Why the instance has a member of that name before any it declares. */
  const itsOwn = (name: string): string | undefined => {
    if (names.own.includes(name) || name === 'constructor') {
      return `a name the ${owner} has`;
    }
    return (LIFECYCLE_HOOKS as readonly string[]).includes(name) ? 'a lifecycle hook' : undefined;
  };
  // NestJS sets what is injected on the instance, over a method or a hook of that name.
  for (const name of names.injected) {
    const reason = itsOwn(name);
    if (reason) {
      throw twice('inject', name, reason);
    }
  }
  const taken = (name: string) =>
    itsOwn(name) ?? (names.injected.includes(name) ? 'which is injected' : undefined);
  const methods = Object.entries((declared.methods ?? {}) as Record<string, unknown>);
  for (const [name, method] of methods) {
    if (typeof method !== 'function') {
      throw fail(`\`methods.${name}\` must be a function.`);
    }
    const reason = taken(name);
    if (reason) {
      throw twice('methods', name, reason);
    }
  }
  const methodNames = new Set(methods.map(([name]) => name));
  const { properties } = declared;
  if (properties !== undefined && typeof properties !== 'function') {
    throw fail(
      `\`properties\` must be a function that returns them: each instance of the ${owner} ` +
        'has its own.',
    );
  }
  return {
    any: hooks.length > 0 || methods.length > 0 || properties !== undefined,
    hooks,
    defineOn: (cls, inject, by) => {
      const prototype = cls.prototype as object;
      const members = [...methods, ...hooks.map((hook) => [hook, declared[hook]] as const)];
      for (const [name, value] of members) {
        Object.defineProperty(prototype, name, { value, writable: true, configurable: true });
      }
      declaresHooks(cls, hooks, by);
      injectInto(prototype, inject);
    },
    initialize: (instance) => {
      if (!properties) {
        return;
      }
      const made: unknown = (properties as () => unknown)();
      if (typeof made !== 'object' || made === null) {
        throw fail('`properties` must return an object.');
      }
      // Known only now, which is as the app starts: NestJS makes each instance then.
      const descriptors = Object.getOwnPropertyDescriptors(made);
      for (const name of Object.keys(descriptors)) {
        const reason = methodNames.has(name) ? 'which `methods` declares too' : taken(name);
        if (reason) {
          throw twice('properties', name, reason);
        }
      }
      for (const key of Reflect.ownKeys(descriptors)) {
        const descriptor = (descriptors as Record<PropertyKey, PropertyDescriptor>)[key];
        // A getter or a setter stays one, and, as a class's, is not among the instance's keys.
        const accessor = !('value' in descriptor);
        Object.defineProperty(instance, key, {
          ...descriptor,
          ...(accessor && { enumerable: false }),
        });
      }
    },
  };
}
