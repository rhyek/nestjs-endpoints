/** Mounts an endpoint where the router setting it up places it. */
export type EndpointSetupFn = (settings: {
  rootDirectories: string[];
  basePath: string;
  namespaceChain: string[];
  /** The router setting it up; none when it is defined outside any. */
  routerFile?: string;
}) => void;

/**
 * What endpoints and `ApiQueries()` / `ApiParams()` register as the app's
 * modules load, read when routers mount endpoints and when the OpenAPI
 * document is built.
 */
export const settings: {
  endpoints: {
    file: string;
    setupFn: EndpointSetupFn;
  }[];
  openapi: {
    components: {
      schemas: Record<string, any>;
    };
    tags: { name: string; description: string }[];
  };
} = {
  endpoints: [],
  openapi: {
    components: {
      schemas: {},
    },
    tags: [],
  },
};
