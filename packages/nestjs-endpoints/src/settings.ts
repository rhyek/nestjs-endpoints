/** Mounts an endpoint where the router setting it up places it. */
export type EndpointSetupFn = (settings: {
  rootDirectories: string[];
  basePath: string;
  namespaceChain: string[];
  /** The router setting it up; none when it is defined outside any. */
  routerFile?: string;
}) => void;

/**
 * What endpoints and routers register as the app's modules load, read when routers mount
 * endpoints and when clients are generated.
 */
export const settings: {
  endpoints: {
    file: string;
    setupFn: EndpointSetupFn;
  }[];
  /** The `description` of each router that has one, by its namespace or `basePath`. */
  descriptions: { name: string; description: string }[];
} = {
  endpoints: [],
  descriptions: [],
};
