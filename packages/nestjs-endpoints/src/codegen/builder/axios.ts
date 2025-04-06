import type { OutputClientFunc } from 'orval';

export const axios = (): OutputClientFunc => {
  return (clients) => {
    return {
      ...clients.axios,
      dependencies: () => {
        // https://github.com/orval-labs/orval/blob/a154264719ccc49b3ab95dadbb3d62513110d8c3/packages/axios/src/index.ts#L22
        return [
          {
            exports: [
              {
                name: 'Axios',
                default: true,
                values: true,
                syntheticDefaultImport: true,
              },
              { name: 'AxiosRequestConfig' },
              { name: 'AxiosResponse' },
              { name: 'CreateAxiosDefaults' },
              { name: 'AxiosInstance' },
            ],
            dependency: 'axios',
          },
        ];
      },
      header: () => {
        return `
export const createApiClient = (config?: CreateAxiosDefaults | AxiosInstance) => {
  const axios =
    config &&
    'defaults' in config &&
    'interceptors' in config &&
    typeof config.request === 'function'
      ? config
      : Axios.create(config as CreateAxiosDefaults);

`;
      },
      footer: (params) => {
        const result = clients.axios.footer!(params);
        return result.replace(
          /return {(.+?)}/,
          (_, captured) => `return {${captured}, axios}`,
        );
      },
    };
  };
};
