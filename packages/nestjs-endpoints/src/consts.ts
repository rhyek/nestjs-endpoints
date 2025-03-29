export const endpointFileRegex = /\bendpoint\.(js|ts|mjs|cjs|mts)$/;

export const settings: {
  endpoints: {
    file: string;
    setupFn: (settings: {
      rootDirectory: string;
      basePath: string;
    }) => void;
  }[];
} = {
  endpoints: [],
};
