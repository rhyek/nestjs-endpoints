export const endpointFileRegex = /\bendpoint\.(js|ts|mjs|cjs|mts)$/;

export const routerModuleFileRegex =
  /\brouter\.module\.(js|ts|mjs|cjs|mts)$/;

export const settings: {
  endpoints: {
    file: string;
    setupFn: (settings: {
      rootDirectories: string[];
      basePath: string;
      namespaceChain: string[];
    }) => void;
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
