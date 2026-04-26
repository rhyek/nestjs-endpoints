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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          // Match `getXxxQueryOptions(...args, options)` regardless of how
          // many positional arguments precede `options`. Path-param queries
          // generate calls like `getXxxQueryOptions(restaurantId, recipeId,
          // options)`, which the previous regex (only `(params,)?options`)
          // missed — leaving `client` un-merged and TS complaining.
          /const queryOptions\s+=\s+([\w$]+)\(([^()]*)\)/,
          (match, fnName: string, args: string) => {
            if (!/\boptions\b/.test(args)) return match;
            const newArgs = args.replace(
              /\boptions\b/,
              'Object.assign({ client }, options)',
            );
            return `
      const client = useApiClient();
      const queryOptions = ${fnName}(${newArgs});
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
          // Match `return fnName(...args, axiosOptions)` regardless of
          // how many positional args precede `axiosOptions`. Path-param
          // mutations generate calls like
          // `return recipesEdit(recipeId, data, axiosOptions)`, which the
          // previous regex (only `(data,)?axiosOptions`) missed.
          /return\s+([\w$]+)\(([^()]*)\)/,
          (match, fnName: string, args: string) => {
            if (!/\baxiosOptions\b/.test(args)) return match;
            return `return options.client.${fnName}(${args}).then((res) => res.data);`;
          },
        );
        result.implementation = result.implementation.replace(
          /const queryFn.+=>\s+(.+\().+\)/,
          (match, captured) =>
            `${match.replace(captured, `options.client.${captured}`)}.then((res) => res.data)`,
        );
        result.implementation = result.implementation.replaceAll(
          /Awaited<ReturnType<typeof (.+?)>>/g,
          (match, captured) =>
            `Awaited<ReturnType<ApiClient['${captured}']>>['data']`,
        );
        return result;
      },
    };
  };
};
