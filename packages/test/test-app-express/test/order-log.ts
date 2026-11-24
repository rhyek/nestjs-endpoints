import type { ModuleMetadata } from '@nestjs/common';
import { OrderLog } from '../src/company/order';
import { appWith } from './app-with';

/** An app of `imports`, and the log the company tree's routers note what they do in. */
export async function appWithLog(imports: ModuleMetadata['imports']) {
  const { app } = await appWith(imports);
  return { app, log: app.get(OrderLog, { strict: false }).entries };
}

/** `what`, as each of `routers` notes it, in their order. */
export const each = (routers: string[], what: string) =>
  routers.map((router) => `${router} ${what}`);

/** What `log` has of `what` from any of `routers`, in the order it has it. */
export const noted = (log: string[], routers: string[], what: string) =>
  log.filter((entry) => each(routers, what).includes(entry));

/**
 * What a request for an endpoint under `routers` passes, from the outer router in, with its
 * handler's note, if it has one, between the interceptors.
 */
export const passed = (routers: string[], handler?: string) => [
  ...each(routers, 'middleware'),
  ...each(routers, 'guard'),
  ...each(routers, 'interceptor before'),
  ...(handler === undefined ? [] : [handler]),
  ...each(routers.toReversed(), 'interceptor after'),
];
