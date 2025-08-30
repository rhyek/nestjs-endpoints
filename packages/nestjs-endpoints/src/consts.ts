export const endpointFileRegex = /\bendpoint\.(js|ts|mjs|cjs|mts)$/;

export const settings: {
  endpoints: {
    file: string;
    setupFn: (settings: {
      rootDirectory: string;
      basePath: string;
    }) => void;
  }[];
  openapi: {
    components: {
      schemas: Record<string, any>;
    };
  };
} = {
  endpoints: [],
  openapi: {
    components: {
      schemas: {},
    },
  },
};

export const openApiVersion = '3.1.1';
