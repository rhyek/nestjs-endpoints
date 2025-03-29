import type { AxiosRequestConfig, AxiosInstance } from 'axios';

let AXIOS_INSTANCE: AxiosInstance | null = null;

export const setAxiosInstance = (instance: AxiosInstance) => {
  AXIOS_INSTANCE = instance;
};

export const customInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  if (!AXIOS_INSTANCE) {
    throw new Error('Axios instance is not initialized');
  }
  const promise = AXIOS_INSTANCE({
    ...config,
    ...options,
  }).then(({ data }) => data);
  return promise;
};
