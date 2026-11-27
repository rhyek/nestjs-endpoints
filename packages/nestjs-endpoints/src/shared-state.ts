// A process may load this package from two places: an app's own copy, and one a library of its
// monorepo resolved for itself. What either makes is the other's own, because every copy keeps
// what tells its routers and endpoints in one state for the process, not in its own modules.

import type { Type } from '@nestjs/common';
import { type DiscoverableDecorator, DiscoveryService } from '@nestjs/core';
import type { RootOptions } from './app-root';
import type { EndpointDescriptor } from './descriptors';
import type { DeclaredHooks } from './hook-scopes';
import type { EndpointSetupFn } from './settings';

/**
 * The version of what copies share: the keys of `SharedState`, and the shape of what each holds
 * (an `EndpointDescriptor`, the options an `EndpointSetupFn` takes, `RootOptions`). A copy
 * reads what another wrote, so a change to any of them that an older copy would misread takes a
 * new number: copies of two numbers then leave each other's routers and endpoints alone.
 * `shared-state.spec.ts` pins the shapes.
 */
export const PROTOCOL = 1;

/** What a router's module carries for the router it is nested under. */
export type RouterSubtree = {
  /** Every endpoint of the router and of the routers under it. */
  endpoints: Type[];
  /**
   * The file of the router whose guards and interceptors it applies itself, with its own: its
   * parent, for a router made with `child()`, or the router that lists it in `routers`.
   */
  childOf?: string;
};

export type SharedState = {
  /**
   * Marks the class of an endpoint a setup has mounted, with its descriptor. NestJS's discovery
   * finds an app's endpoints among its controllers by this mark.
   */
  MountedEndpoint: DiscoverableDecorator<EndpointDescriptor>;
  /** Marks a class that declares lifecycle hooks. */
  DeclaresHooks: DiscoverableDecorator<DeclaredHooks>;
  /** Marks a provider of the module `NestjsEndpoints.forRoot()` returns, with its options. */
  AppRoot: DiscoverableDecorator<RootOptions>;
  /** Marks a provider of the module of a router no other router discovered. */
  TopLevelRouter: DiscoverableDecorator<undefined>;
  /** The setup of each endpoint's class: having one is what tells an endpoint. */
  setups: WeakMap<object, EndpointSetupFn>;
  /**
   * The `description` of each router that has one, by its namespace chain joined with `/`: the
   * last one given for a namespace.
   */
  descriptions: Map<string, string>;
  /**
   * The key, on what `create()`, `child()` and `forRoot()` return, that tells a router. Under
   * it, a router made with `create()` or `child()` has what the router that lists it in
   * `routers` calls: `file`, `listedBy()` and `placedUnder()`, which take that router's
   * context, providers and layout. Their shapes are part of the protocol too.
   */
  router: symbol;
  /** The key, on a router's module, of its `RouterSubtree`. */
  subtree: symbol;
};

/** Where the state is: the same symbol in every copy, as the registry gives it by name. */
const KEY = Symbol.for(`nestjs-endpoints/${PROTOCOL}`);

// The first copy loaded makes each part, and a copy with a part that one lacked adds it.
const state = ((globalThis as { [KEY]?: Partial<SharedState> })[KEY] ??= {});
state.MountedEndpoint ??= DiscoveryService.createDecorator();
state.DeclaresHooks ??= DiscoveryService.createDecorator();
state.AppRoot ??= DiscoveryService.createDecorator();
state.TopLevelRouter ??= DiscoveryService.createDecorator();
state.setups ??= new WeakMap();
state.descriptions ??= new Map();
state.router ??= Symbol('nestjs-endpoints:router');
state.subtree ??= Symbol('nestjs-endpoints:subtree');

/** What every copy of the package in the process shares, read once as this copy loads. */
export const sharedState = state as SharedState;
