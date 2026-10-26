export const endpointFileRegex = /\bendpoint\.(js|ts|mjs|mts)$/;

export const routerModuleFileRegex = /\brouter\.module\.(js|ts|mjs|mts)$/;

/** Mounts an endpoint where the router setting it up places it. */
export type EndpointSetupFn = (settings: {
  rootDirectories: string[];
  basePath: string;
  namespaceChain: string[];
  /** The router setting it up; none when it is defined outside any. */
  routerFile?: string;
}) => void;

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

export const openApiVersion = '3.1.1';
