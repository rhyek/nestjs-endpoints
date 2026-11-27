import { sharedState } from './shared-state';

const { setups } = sharedState;

/** Records the setup of an endpoint's class, as `endpoint.query()` and `endpoint.mutation()` make it. */
export function setUpBy(cls: object, setupFn: EndpointSetupFn): void {
  setups.set(cls, setupFn);
}

/** The setup of an endpoint's class; none for any other value. */
export function setupOf(value: unknown): EndpointSetupFn | undefined {
  return typeof value === 'function' ? setups.get(value) : undefined;
}

/** Mounts an endpoint where the router setting it up places it. */
export type EndpointSetupFn = (settings: {
  rootDirectories: string[];
  basePath: string;
  namespaceChain: string[];
  /** The router setting it up; none when it is defined outside any. */
  routerFile?: string;
}) => void;

/**
 * The endpoints defined while a router of this copy loads its files, which it then sets up.
 */
export const settings: {
  endpoints: {
    file: string;
    setupFn: EndpointSetupFn;
  }[];
} = {
  endpoints: [],
};
