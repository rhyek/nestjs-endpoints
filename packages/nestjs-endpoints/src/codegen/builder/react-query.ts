import type { OutputClientFunc } from 'orval';

export const reactQuery = (): OutputClientFunc => {
  const fns: string[] = [];
  return (clients) => {
    return {
      ...clients['react-query'],
      dependencies: (...args) => {
        const deps = clients['react-query'].dependencies!(...args);
        deps.unshift({
          dependency: 'react',
          exports: [
            {
              name: 'React',
              default: true,
              values: true,
              syntheticDefaultImport: true,
            },
          ],
        });
        deps
          .find((dep) => dep.dependency === 'axios')
          ?.exports.push(
            {
              name: 'AxiosInstance',
            },
            {
              name: 'CreateAxiosDefaults',
            },
          );
        return deps;
      },
      header: (params) => {
        const operationNames = Object.values(params.verbOptions).map(
          (verb) => verb.operationName,
        );
        return `
const Axios = axios;
export const createApiClient = (config?: CreateAxiosDefaults | AxiosInstance) => {
  const axios =
    config &&
    'defaults' in config &&
    'interceptors' in config &&
    typeof config.request === 'function'
      ? config
      : Axios.create(config as CreateAxiosDefaults);
  ${fns.join('\n')}
  return {
${operationNames.map((name) => `    ${name},`).join('\n')}
    axios
  };
};

export type ApiClient = ReturnType<typeof createApiClient>;

export const ApiClientContext = React.createContext<ApiClient>(null as any);
export const ApiClientProvider = ({ client, children }: { client: ApiClient; children: React.ReactNode }) => {
  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>
};

export const useApiClient = () => {
  const client = React.useContext(ApiClientContext);
  if (!client) throw new Error('useApiClient must be used within a ApiClientProvider');
  return client;
};
`;
      },
      client: async (verbOptions, options, outputClient, output) => {
        const result = await clients['react-query'].client(
          verbOptions,
          options,
          outputClient,
          output,
        );

        const lines = result.implementation.split('\n');
        let queryKeyLine: number | null = null;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('QueryKey')) {
            queryKeyLine = i;
            break;
          }
        }
        if (queryKeyLine === null) {
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('MutationOptions')) {
              queryKeyLine = i;
              break;
            }
          }
        }
        if (queryKeyLine === null) {
          throw new Error('No query key found in implementation');
        }
        const fn = lines
          .slice(0, queryKeyLine)
          .join('\n')
          .replace(/export /, '');
        fns.push(fn);
        result.implementation = lines.slice(queryKeyLine).join('\n');
        result.implementation = result.implementation.replace(
          /const mutationOptions\s+=\s+(.+)\(options\);/,
          (_, captured) => {
            return `
      const client = useApiClient();
      const mutationOptions = ${captured}(Object.assign({ client }, options));
          `;
          },
        );
        result.implementation = result.implementation.replace(
          /const queryOptions\s+=\s+(.+)\(((?:params,)?options)\)/,
          (_, c1, c2) => {
            return `
      const client = useApiClient();
      const queryOptions = ${c1}(${c2.replace('options', 'Object.assign({ client }, options)')});
          `;
          },
        );
        result.implementation = result.implementation.replace(
          /options\?: {.+axios\?: AxiosRequestConfig/,
          (match) => {
            return `${match.replace('options?', 'options')}, client: ApiClient`;
          },
        );
        result.implementation = result.implementation.replace(
          /return\s+(.+\(data,axiosOptions\))/,
          (_, captured) => {
            return `return options.client.${captured}`;
          },
        );
        result.implementation = result.implementation.replace(
          /const queryFn.+=>\s+(.+\((?:params, )?{ signal, ...axiosOptions })/,
          (match, captured) =>
            match.replace(captured, `options.client.${captured}`),
        );
        result.implementation = result.implementation.replaceAll(
          /ReturnType<typeof (.+?)>/g,
          (match, captured) => `ReturnType<ApiClient['${captured}']>`,
        );
        return result;
      },
    };
  };
};
