export const endpointFileRegex = /\bendpoint\.(js|ts|mjs|cjs|mts)$/;

export const settings: {
  rootDirectory: string | null;
  decorateEndpointFns: (() => void)[];
} = {
  rootDirectory: null,
  decorateEndpointFns: [],
};
