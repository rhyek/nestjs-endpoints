/**
 * Generated by orval v7.8.0 🍺
 * Do not edit manually.
 * OpenAPI spec version: 1.0.0
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  DataTag,
  MutationFunction,
  QueryClient,
  QueryFunction,
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query';

import axios from 'axios';
import type {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  CreateAxiosDefaults,
} from 'axios';

import React from 'react';

export interface AuthLoginInput {
  email: string;
  password: string;
}

export interface AuthLoginOutput {
  token: string;
}

export type UserAppointmentCountOutput = number;

export interface UserAppointmentCreateInput {
  userId: number;
  date: unknown;
}

export interface UserAppointmentCreate201Output {
  id: number;
  date: unknown;
  address: string;
}

export type UserAppointmentCreate400OutputOneOf = {
  message: string;
  errorCode: string;
};

export type UserAppointmentCreate400Output =
  | string
  | UserAppointmentCreate400OutputOneOf;

export interface UserCreateInput {
  name: string;
  email: string;
}

export interface UserCreateOutput {
  id: number;
}

/**
 * @nullable
 */
export type UserFindOutput = {
  id: number;
  name: string;
  email: string;
} | null;

/**
 * @nullable
 */
export type UserGetOutput = {
  id: number;
  name: string;
  email: string;
} | null;

export type UserListForRouterWithPathOutputItem = {
  id: number;
  name: string;
  email: string;
};

export type UserListForRouterWithPathOutput =
  UserListForRouterWithPathOutputItem[];

export type SrcEndpointsUserListUserListNoPathOutputItem = {
  id: number;
  name: string;
  email: string;
};

export type SrcEndpointsUserListUserListNoPathOutput =
  SrcEndpointsUserListUserListNoPathOutputItem[];

export type UserListWithPathOutputItem = {
  id: number;
  name: string;
  email: string;
};

export type UserListWithPathOutput = UserListWithPathOutputItem[];

export type UserListWithPathNoSuffixOutputItem = {
  id: number;
  name: string;
  email: string;
};

export type UserListWithPathNoSuffixOutput =
  UserListWithPathNoSuffixOutputItem[];

export type UserAppointmentCountParams = {
  userId: number;
};

export type UserFindParams = {
  id: number;
};

export type UserGetParams = {
  id: number;
};

const Axios = axios;
export const createApiClient = (
  config?: CreateAxiosDefaults | AxiosInstance,
) => {
  const axios =
    config &&
    'defaults' in config &&
    'interceptors' in config &&
    typeof config.request === 'function'
      ? config
      : Axios.create(config as CreateAxiosDefaults);
  const authLogin = (
    authLoginInput: AuthLoginInput,
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<AuthLoginOutput>> => {
    return axios.post(`/auth/login`, authLoginInput, options);
  };

  const testError = (
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<void>> => {
    return axios.get(`/test/error`, options);
  };

  const testStatus = (
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<void>> => {
    return axios.get(`/test/status`, options);
  };

  const userAppointmentCount = (
    params: UserAppointmentCountParams,
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<UserAppointmentCountOutput>> => {
    return axios.get(`/user/appointment/count`, {
      ...options,
      params: { ...params, ...options?.params },
    });
  };

  const userAppointmentCreate = (
    userAppointmentCreateInput: UserAppointmentCreateInput,
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<UserAppointmentCreate201Output>> => {
    return axios.post(
      `/user/appointment/create`,
      userAppointmentCreateInput,
      options,
    );
  };

  const userCreate = (
    userCreateInput: UserCreateInput,
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<UserCreateOutput>> => {
    return axios.post(`/user/create`, userCreateInput, options);
  };

  const userFind = (
    params: UserFindParams,
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<UserFindOutput>> => {
    return axios.get(`/user/find`, {
      ...options,
      params: { ...params, ...options?.params },
    });
  };

  const userGet = (
    params: UserGetParams,
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<UserGetOutput>> => {
    return axios.get(`/user/get`, {
      ...options,
      params: { ...params, ...options?.params },
    });
  };

  const userListForRouterWithPath = (
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<UserListForRouterWithPathOutput>> => {
    return axios.get(`/user/list-for-router-with-path`, options);
  };

  const userPurge = (
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<void>> => {
    return axios.post(`/user/purge`, undefined, options);
  };

  const srcEndpointsUserListUserListNoPath = (
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<SrcEndpointsUserListUserListNoPathOutput>> => {
    return axios.get(
      `/src/endpoints/user/list/user-list-no-path`,
      options,
    );
  };

  const userListWithPath = (
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<UserListWithPathOutput>> => {
    return axios.get(`/user/list-with-path`, options);
  };

  const userListWithPathNoSuffix = (
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<UserListWithPathNoSuffixOutput>> => {
    return axios.get(`/user/list-with-path-no-suffix`, options);
  };

  return {
    authLogin,
    testError,
    testStatus,
    userAppointmentCount,
    userAppointmentCreate,
    userCreate,
    userFind,
    userGet,
    userListForRouterWithPath,
    userPurge,
    srcEndpointsUserListUserListNoPath,
    userListWithPath,
    userListWithPathNoSuffix,
    axios,
  };
};

export type ApiClient = ReturnType<typeof createApiClient>;

export const ApiClientContext = React.createContext<ApiClient>(
  null as any,
);
export const ApiClientProvider = ({
  client,
  children,
}: {
  client: ApiClient;
  children: React.ReactNode;
}) => {
  return (
    <ApiClientContext.Provider value={client}>
      {children}
    </ApiClientContext.Provider>
  );
};

export const useApiClient = () => {
  const client = React.useContext(ApiClientContext);
  if (!client)
    throw new Error(
      'useApiClient must be used within a ApiClientProvider',
    );
  return client;
};
export const getAuthLoginMutationOptions = <
  TError = AxiosError<unknown>,
  TContext = unknown,
>(options: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<ApiClient['authLogin']>>['data'],
    TError,
    { data: AuthLoginInput },
    TContext
  >;
  axios?: AxiosRequestConfig;
  client: ApiClient;
}): UseMutationOptions<
  Awaited<ReturnType<ApiClient['authLogin']>>['data'],
  TError,
  { data: AuthLoginInput },
  TContext
> => {
  const mutationKey = ['authLogin'];
  const { mutation: mutationOptions, axios: axiosOptions } = options
    ? options.mutation &&
      'mutationKey' in options.mutation &&
      options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, axios: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<ApiClient['authLogin']>>['data'],
    { data: AuthLoginInput }
  > = (props) => {
    const { data } = props ?? {};

    return options.client
      .authLogin(data, axiosOptions)
      .then((res) => res.data);
  };

  return { mutationFn, ...mutationOptions };
};

export type AuthLoginMutationResult = NonNullable<
  Awaited<ReturnType<ApiClient['authLogin']>>['data']
>;
export type AuthLoginMutationBody = AuthLoginInput;
export type AuthLoginMutationError = AxiosError<unknown>;

export const useAuthLogin = <
  TError = AxiosError<unknown>,
  TContext = unknown,
>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<ApiClient['authLogin']>>['data'],
      TError,
      { data: AuthLoginInput },
      TContext
    >;
    axios?: AxiosRequestConfig;
  },
  queryClient?: QueryClient,
) => {
  const client = useApiClient();
  const mutationOptions = getAuthLoginMutationOptions(
    Object.assign({ client }, options),
  );

  return useMutation(mutationOptions, queryClient);
};

export const getTestErrorQueryKey = () => {
  return [`/test/error`] as const;
};

export const getTestErrorQueryOptions = <
  TData = Awaited<ReturnType<ApiClient['testError']>>['data'],
  TError = AxiosError<unknown>,
>(options: {
  query?: Partial<
    UseQueryOptions<
      Awaited<ReturnType<ApiClient['testError']>>['data'],
      TError,
      TData
    >
  >;
  axios?: AxiosRequestConfig;
  client: ApiClient;
}) => {
  const { query: queryOptions, axios: axiosOptions } = options ?? {};

  const queryKey = queryOptions?.queryKey ?? getTestErrorQueryKey();

  const queryFn: QueryFunction<
    Awaited<ReturnType<ApiClient['testError']>>['data']
  > = ({ signal }) =>
    options.client
      .testError({ signal, ...axiosOptions })
      .then((res) => res.data);

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<ApiClient['testError']>>['data'],
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> };
};

export type TestErrorQueryResult = NonNullable<
  Awaited<ReturnType<ApiClient['testError']>>['data']
>;
export type TestErrorQueryError = AxiosError<unknown>;

export function useTestError<
  TData = Awaited<ReturnType<ApiClient['testError']>>['data'],
  TError = AxiosError<unknown>,
>(
  options?: {
    query?: Partial<
      UseQueryOptions<
        Awaited<ReturnType<ApiClient['testError']>>['data'],
        TError,
        TData
      >
    >;
    axios?: AxiosRequestConfig;
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & {
  queryKey: DataTag<QueryKey, TData, TError>;
} {
  const client = useApiClient();
  const queryOptions = getTestErrorQueryOptions(
    Object.assign({ client }, options),
  );

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<
    TData,
    TError
  > & { queryKey: DataTag<QueryKey, TData, TError> };

  query.queryKey = queryOptions.queryKey;

  return query;
}

export const getTestStatusQueryKey = () => {
  return [`/test/status`] as const;
};

export const getTestStatusQueryOptions = <
  TData = Awaited<ReturnType<ApiClient['testStatus']>>['data'],
  TError = AxiosError<unknown>,
>(options: {
  query?: Partial<
    UseQueryOptions<
      Awaited<ReturnType<ApiClient['testStatus']>>['data'],
      TError,
      TData
    >
  >;
  axios?: AxiosRequestConfig;
  client: ApiClient;
}) => {
  const { query: queryOptions, axios: axiosOptions } = options ?? {};

  const queryKey = queryOptions?.queryKey ?? getTestStatusQueryKey();

  const queryFn: QueryFunction<
    Awaited<ReturnType<ApiClient['testStatus']>>['data']
  > = ({ signal }) =>
    options.client
      .testStatus({ signal, ...axiosOptions })
      .then((res) => res.data);

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<ApiClient['testStatus']>>['data'],
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> };
};

export type TestStatusQueryResult = NonNullable<
  Awaited<ReturnType<ApiClient['testStatus']>>['data']
>;
export type TestStatusQueryError = AxiosError<unknown>;

export function useTestStatus<
  TData = Awaited<ReturnType<ApiClient['testStatus']>>['data'],
  TError = AxiosError<unknown>,
>(
  options?: {
    query?: Partial<
      UseQueryOptions<
        Awaited<ReturnType<ApiClient['testStatus']>>['data'],
        TError,
        TData
      >
    >;
    axios?: AxiosRequestConfig;
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & {
  queryKey: DataTag<QueryKey, TData, TError>;
} {
  const client = useApiClient();
  const queryOptions = getTestStatusQueryOptions(
    Object.assign({ client }, options),
  );

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<
    TData,
    TError
  > & { queryKey: DataTag<QueryKey, TData, TError> };

  query.queryKey = queryOptions.queryKey;

  return query;
}

export const getUserAppointmentCountQueryKey = (
  params: UserAppointmentCountParams,
) => {
  return [`/user/appointment/count`, ...(params ? [params] : [])] as const;
};

export const getUserAppointmentCountQueryOptions = <
  TData = Awaited<ReturnType<ApiClient['userAppointmentCount']>>['data'],
  TError = AxiosError<unknown>,
>(
  params: UserAppointmentCountParams,
  options: {
    query?: Partial<
      UseQueryOptions<
        Awaited<ReturnType<ApiClient['userAppointmentCount']>>['data'],
        TError,
        TData
      >
    >;
    axios?: AxiosRequestConfig;
    client: ApiClient;
  },
) => {
  const { query: queryOptions, axios: axiosOptions } = options ?? {};

  const queryKey =
    queryOptions?.queryKey ?? getUserAppointmentCountQueryKey(params);

  const queryFn: QueryFunction<
    Awaited<ReturnType<ApiClient['userAppointmentCount']>>['data']
  > = ({ signal }) =>
    options.client
      .userAppointmentCount(params, { signal, ...axiosOptions })
      .then((res) => res.data);

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<ApiClient['userAppointmentCount']>>['data'],
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> };
};

export type UserAppointmentCountQueryResult = NonNullable<
  Awaited<ReturnType<ApiClient['userAppointmentCount']>>['data']
>;
export type UserAppointmentCountQueryError = AxiosError<unknown>;

export function useUserAppointmentCount<
  TData = Awaited<ReturnType<ApiClient['userAppointmentCount']>>['data'],
  TError = AxiosError<unknown>,
>(
  params: UserAppointmentCountParams,
  options?: {
    query?: Partial<
      UseQueryOptions<
        Awaited<ReturnType<ApiClient['userAppointmentCount']>>['data'],
        TError,
        TData
      >
    >;
    axios?: AxiosRequestConfig;
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & {
  queryKey: DataTag<QueryKey, TData, TError>;
} {
  const client = useApiClient();
  const queryOptions = getUserAppointmentCountQueryOptions(
    params,
    Object.assign({ client }, options),
  );

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<
    TData,
    TError
  > & { queryKey: DataTag<QueryKey, TData, TError> };

  query.queryKey = queryOptions.queryKey;

  return query;
}

/**
 * @summary Create an appointment
 */
export const getUserAppointmentCreateMutationOptions = <
  TError = AxiosError<UserAppointmentCreate400Output>,
  TContext = unknown,
>(options: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<ApiClient['userAppointmentCreate']>>['data'],
    TError,
    { data: UserAppointmentCreateInput },
    TContext
  >;
  axios?: AxiosRequestConfig;
  client: ApiClient;
}): UseMutationOptions<
  Awaited<ReturnType<ApiClient['userAppointmentCreate']>>['data'],
  TError,
  { data: UserAppointmentCreateInput },
  TContext
> => {
  const mutationKey = ['userAppointmentCreate'];
  const { mutation: mutationOptions, axios: axiosOptions } = options
    ? options.mutation &&
      'mutationKey' in options.mutation &&
      options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, axios: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<ApiClient['userAppointmentCreate']>>['data'],
    { data: UserAppointmentCreateInput }
  > = (props) => {
    const { data } = props ?? {};

    return options.client
      .userAppointmentCreate(data, axiosOptions)
      .then((res) => res.data);
  };

  return { mutationFn, ...mutationOptions };
};

export type UserAppointmentCreateMutationResult = NonNullable<
  Awaited<ReturnType<ApiClient['userAppointmentCreate']>>['data']
>;
export type UserAppointmentCreateMutationBody = UserAppointmentCreateInput;
export type UserAppointmentCreateMutationError =
  AxiosError<UserAppointmentCreate400Output>;

/**
 * @summary Create an appointment
 */
export const useUserAppointmentCreate = <
  TError = AxiosError<UserAppointmentCreate400Output>,
  TContext = unknown,
>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<ApiClient['userAppointmentCreate']>>['data'],
      TError,
      { data: UserAppointmentCreateInput },
      TContext
    >;
    axios?: AxiosRequestConfig;
  },
  queryClient?: QueryClient,
) => {
  const client = useApiClient();
  const mutationOptions = getUserAppointmentCreateMutationOptions(
    Object.assign({ client }, options),
  );

  return useMutation(mutationOptions, queryClient);
};

export const getUserCreateMutationOptions = <
  TError = AxiosError<unknown>,
  TContext = unknown,
>(options: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<ApiClient['userCreate']>>['data'],
    TError,
    { data: UserCreateInput },
    TContext
  >;
  axios?: AxiosRequestConfig;
  client: ApiClient;
}): UseMutationOptions<
  Awaited<ReturnType<ApiClient['userCreate']>>['data'],
  TError,
  { data: UserCreateInput },
  TContext
> => {
  const mutationKey = ['userCreate'];
  const { mutation: mutationOptions, axios: axiosOptions } = options
    ? options.mutation &&
      'mutationKey' in options.mutation &&
      options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, axios: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<ApiClient['userCreate']>>['data'],
    { data: UserCreateInput }
  > = (props) => {
    const { data } = props ?? {};

    return options.client
      .userCreate(data, axiosOptions)
      .then((res) => res.data);
  };

  return { mutationFn, ...mutationOptions };
};

export type UserCreateMutationResult = NonNullable<
  Awaited<ReturnType<ApiClient['userCreate']>>['data']
>;
export type UserCreateMutationBody = UserCreateInput;
export type UserCreateMutationError = AxiosError<unknown>;

export const useUserCreate = <
  TError = AxiosError<unknown>,
  TContext = unknown,
>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<ApiClient['userCreate']>>['data'],
      TError,
      { data: UserCreateInput },
      TContext
    >;
    axios?: AxiosRequestConfig;
  },
  queryClient?: QueryClient,
) => {
  const client = useApiClient();
  const mutationOptions = getUserCreateMutationOptions(
    Object.assign({ client }, options),
  );

  return useMutation(mutationOptions, queryClient);
};

export const getUserFindQueryKey = (params: UserFindParams) => {
  return [`/user/find`, ...(params ? [params] : [])] as const;
};

export const getUserFindQueryOptions = <
  TData = Awaited<ReturnType<ApiClient['userFind']>>['data'],
  TError = AxiosError<unknown>,
>(
  params: UserFindParams,
  options: {
    query?: Partial<
      UseQueryOptions<
        Awaited<ReturnType<ApiClient['userFind']>>['data'],
        TError,
        TData
      >
    >;
    axios?: AxiosRequestConfig;
    client: ApiClient;
  },
) => {
  const { query: queryOptions, axios: axiosOptions } = options ?? {};

  const queryKey = queryOptions?.queryKey ?? getUserFindQueryKey(params);

  const queryFn: QueryFunction<
    Awaited<ReturnType<ApiClient['userFind']>>['data']
  > = ({ signal }) =>
    options.client
      .userFind(params, { signal, ...axiosOptions })
      .then((res) => res.data);

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<ApiClient['userFind']>>['data'],
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> };
};

export type UserFindQueryResult = NonNullable<
  Awaited<ReturnType<ApiClient['userFind']>>['data']
>;
export type UserFindQueryError = AxiosError<unknown>;

export function useUserFind<
  TData = Awaited<ReturnType<ApiClient['userFind']>>['data'],
  TError = AxiosError<unknown>,
>(
  params: UserFindParams,
  options?: {
    query?: Partial<
      UseQueryOptions<
        Awaited<ReturnType<ApiClient['userFind']>>['data'],
        TError,
        TData
      >
    >;
    axios?: AxiosRequestConfig;
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & {
  queryKey: DataTag<QueryKey, TData, TError>;
} {
  const client = useApiClient();
  const queryOptions = getUserFindQueryOptions(
    params,
    Object.assign({ client }, options),
  );

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<
    TData,
    TError
  > & { queryKey: DataTag<QueryKey, TData, TError> };

  query.queryKey = queryOptions.queryKey;

  return query;
}

export const getUserGetQueryKey = (params: UserGetParams) => {
  return [`/user/get`, ...(params ? [params] : [])] as const;
};

export const getUserGetQueryOptions = <
  TData = Awaited<ReturnType<ApiClient['userGet']>>['data'],
  TError = AxiosError<unknown>,
>(
  params: UserGetParams,
  options: {
    query?: Partial<
      UseQueryOptions<
        Awaited<ReturnType<ApiClient['userGet']>>['data'],
        TError,
        TData
      >
    >;
    axios?: AxiosRequestConfig;
    client: ApiClient;
  },
) => {
  const { query: queryOptions, axios: axiosOptions } = options ?? {};

  const queryKey = queryOptions?.queryKey ?? getUserGetQueryKey(params);

  const queryFn: QueryFunction<
    Awaited<ReturnType<ApiClient['userGet']>>['data']
  > = ({ signal }) =>
    options.client
      .userGet(params, { signal, ...axiosOptions })
      .then((res) => res.data);

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<ApiClient['userGet']>>['data'],
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> };
};

export type UserGetQueryResult = NonNullable<
  Awaited<ReturnType<ApiClient['userGet']>>['data']
>;
export type UserGetQueryError = AxiosError<unknown>;

export function useUserGet<
  TData = Awaited<ReturnType<ApiClient['userGet']>>['data'],
  TError = AxiosError<unknown>,
>(
  params: UserGetParams,
  options?: {
    query?: Partial<
      UseQueryOptions<
        Awaited<ReturnType<ApiClient['userGet']>>['data'],
        TError,
        TData
      >
    >;
    axios?: AxiosRequestConfig;
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & {
  queryKey: DataTag<QueryKey, TData, TError>;
} {
  const client = useApiClient();
  const queryOptions = getUserGetQueryOptions(
    params,
    Object.assign({ client }, options),
  );

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<
    TData,
    TError
  > & { queryKey: DataTag<QueryKey, TData, TError> };

  query.queryKey = queryOptions.queryKey;

  return query;
}

export const getUserListForRouterWithPathQueryKey = () => {
  return [`/user/list-for-router-with-path`] as const;
};

export const getUserListForRouterWithPathQueryOptions = <
  TData = Awaited<
    ReturnType<ApiClient['userListForRouterWithPath']>
  >['data'],
  TError = AxiosError<unknown>,
>(options: {
  query?: Partial<
    UseQueryOptions<
      Awaited<ReturnType<ApiClient['userListForRouterWithPath']>>['data'],
      TError,
      TData
    >
  >;
  axios?: AxiosRequestConfig;
  client: ApiClient;
}) => {
  const { query: queryOptions, axios: axiosOptions } = options ?? {};

  const queryKey =
    queryOptions?.queryKey ?? getUserListForRouterWithPathQueryKey();

  const queryFn: QueryFunction<
    Awaited<ReturnType<ApiClient['userListForRouterWithPath']>>['data']
  > = ({ signal }) =>
    options.client
      .userListForRouterWithPath({ signal, ...axiosOptions })
      .then((res) => res.data);

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<ApiClient['userListForRouterWithPath']>>['data'],
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> };
};

export type UserListForRouterWithPathQueryResult = NonNullable<
  Awaited<ReturnType<ApiClient['userListForRouterWithPath']>>['data']
>;
export type UserListForRouterWithPathQueryError = AxiosError<unknown>;

export function useUserListForRouterWithPath<
  TData = Awaited<
    ReturnType<ApiClient['userListForRouterWithPath']>
  >['data'],
  TError = AxiosError<unknown>,
>(
  options?: {
    query?: Partial<
      UseQueryOptions<
        Awaited<
          ReturnType<ApiClient['userListForRouterWithPath']>
        >['data'],
        TError,
        TData
      >
    >;
    axios?: AxiosRequestConfig;
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & {
  queryKey: DataTag<QueryKey, TData, TError>;
} {
  const client = useApiClient();
  const queryOptions = getUserListForRouterWithPathQueryOptions(
    Object.assign({ client }, options),
  );

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<
    TData,
    TError
  > & { queryKey: DataTag<QueryKey, TData, TError> };

  query.queryKey = queryOptions.queryKey;

  return query;
}

export const getUserPurgeMutationOptions = <
  TError = AxiosError<unknown>,
  TContext = unknown,
>(options: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<ApiClient['userPurge']>>['data'],
    TError,
    void,
    TContext
  >;
  axios?: AxiosRequestConfig;
  client: ApiClient;
}): UseMutationOptions<
  Awaited<ReturnType<ApiClient['userPurge']>>['data'],
  TError,
  void,
  TContext
> => {
  const mutationKey = ['userPurge'];
  const { mutation: mutationOptions, axios: axiosOptions } = options
    ? options.mutation &&
      'mutationKey' in options.mutation &&
      options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, axios: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<ApiClient['userPurge']>>['data'],
    void
  > = () => {
    return options.client.userPurge(axiosOptions).then((res) => res.data);
  };

  return { mutationFn, ...mutationOptions };
};

export type UserPurgeMutationResult = NonNullable<
  Awaited<ReturnType<ApiClient['userPurge']>>['data']
>;

export type UserPurgeMutationError = AxiosError<unknown>;

export const useUserPurge = <
  TError = AxiosError<unknown>,
  TContext = unknown,
>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<ApiClient['userPurge']>>['data'],
      TError,
      void,
      TContext
    >;
    axios?: AxiosRequestConfig;
  },
  queryClient?: QueryClient,
) => {
  const client = useApiClient();
  const mutationOptions = getUserPurgeMutationOptions(
    Object.assign({ client }, options),
  );

  return useMutation(mutationOptions, queryClient);
};

export const getSrcEndpointsUserListUserListNoPathQueryKey = () => {
  return [`/src/endpoints/user/list/user-list-no-path`] as const;
};

export const getSrcEndpointsUserListUserListNoPathQueryOptions = <
  TData = Awaited<
    ReturnType<ApiClient['srcEndpointsUserListUserListNoPath']>
  >['data'],
  TError = AxiosError<unknown>,
>(options: {
  query?: Partial<
    UseQueryOptions<
      Awaited<
        ReturnType<ApiClient['srcEndpointsUserListUserListNoPath']>
      >['data'],
      TError,
      TData
    >
  >;
  axios?: AxiosRequestConfig;
  client: ApiClient;
}) => {
  const { query: queryOptions, axios: axiosOptions } = options ?? {};

  const queryKey =
    queryOptions?.queryKey ??
    getSrcEndpointsUserListUserListNoPathQueryKey();

  const queryFn: QueryFunction<
    Awaited<
      ReturnType<ApiClient['srcEndpointsUserListUserListNoPath']>
    >['data']
  > = ({ signal }) =>
    options.client
      .srcEndpointsUserListUserListNoPath({ signal, ...axiosOptions })
      .then((res) => res.data);

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<
      ReturnType<ApiClient['srcEndpointsUserListUserListNoPath']>
    >['data'],
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> };
};

export type SrcEndpointsUserListUserListNoPathQueryResult = NonNullable<
  Awaited<
    ReturnType<ApiClient['srcEndpointsUserListUserListNoPath']>
  >['data']
>;
export type SrcEndpointsUserListUserListNoPathQueryError =
  AxiosError<unknown>;

export function useSrcEndpointsUserListUserListNoPath<
  TData = Awaited<
    ReturnType<ApiClient['srcEndpointsUserListUserListNoPath']>
  >['data'],
  TError = AxiosError<unknown>,
>(
  options?: {
    query?: Partial<
      UseQueryOptions<
        Awaited<
          ReturnType<ApiClient['srcEndpointsUserListUserListNoPath']>
        >['data'],
        TError,
        TData
      >
    >;
    axios?: AxiosRequestConfig;
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & {
  queryKey: DataTag<QueryKey, TData, TError>;
} {
  const client = useApiClient();
  const queryOptions = getSrcEndpointsUserListUserListNoPathQueryOptions(
    Object.assign({ client }, options),
  );

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<
    TData,
    TError
  > & { queryKey: DataTag<QueryKey, TData, TError> };

  query.queryKey = queryOptions.queryKey;

  return query;
}

export const getUserListWithPathQueryKey = () => {
  return [`/user/list-with-path`] as const;
};

export const getUserListWithPathQueryOptions = <
  TData = Awaited<ReturnType<ApiClient['userListWithPath']>>['data'],
  TError = AxiosError<unknown>,
>(options: {
  query?: Partial<
    UseQueryOptions<
      Awaited<ReturnType<ApiClient['userListWithPath']>>['data'],
      TError,
      TData
    >
  >;
  axios?: AxiosRequestConfig;
  client: ApiClient;
}) => {
  const { query: queryOptions, axios: axiosOptions } = options ?? {};

  const queryKey = queryOptions?.queryKey ?? getUserListWithPathQueryKey();

  const queryFn: QueryFunction<
    Awaited<ReturnType<ApiClient['userListWithPath']>>['data']
  > = ({ signal }) =>
    options.client
      .userListWithPath({ signal, ...axiosOptions })
      .then((res) => res.data);

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<ApiClient['userListWithPath']>>['data'],
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> };
};

export type UserListWithPathQueryResult = NonNullable<
  Awaited<ReturnType<ApiClient['userListWithPath']>>['data']
>;
export type UserListWithPathQueryError = AxiosError<unknown>;

export function useUserListWithPath<
  TData = Awaited<ReturnType<ApiClient['userListWithPath']>>['data'],
  TError = AxiosError<unknown>,
>(
  options?: {
    query?: Partial<
      UseQueryOptions<
        Awaited<ReturnType<ApiClient['userListWithPath']>>['data'],
        TError,
        TData
      >
    >;
    axios?: AxiosRequestConfig;
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & {
  queryKey: DataTag<QueryKey, TData, TError>;
} {
  const client = useApiClient();
  const queryOptions = getUserListWithPathQueryOptions(
    Object.assign({ client }, options),
  );

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<
    TData,
    TError
  > & { queryKey: DataTag<QueryKey, TData, TError> };

  query.queryKey = queryOptions.queryKey;

  return query;
}

export const getUserListWithPathNoSuffixQueryKey = () => {
  return [`/user/list-with-path-no-suffix`] as const;
};

export const getUserListWithPathNoSuffixQueryOptions = <
  TData = Awaited<
    ReturnType<ApiClient['userListWithPathNoSuffix']>
  >['data'],
  TError = AxiosError<unknown>,
>(options: {
  query?: Partial<
    UseQueryOptions<
      Awaited<ReturnType<ApiClient['userListWithPathNoSuffix']>>['data'],
      TError,
      TData
    >
  >;
  axios?: AxiosRequestConfig;
  client: ApiClient;
}) => {
  const { query: queryOptions, axios: axiosOptions } = options ?? {};

  const queryKey =
    queryOptions?.queryKey ?? getUserListWithPathNoSuffixQueryKey();

  const queryFn: QueryFunction<
    Awaited<ReturnType<ApiClient['userListWithPathNoSuffix']>>['data']
  > = ({ signal }) =>
    options.client
      .userListWithPathNoSuffix({ signal, ...axiosOptions })
      .then((res) => res.data);

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<ApiClient['userListWithPathNoSuffix']>>['data'],
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> };
};

export type UserListWithPathNoSuffixQueryResult = NonNullable<
  Awaited<ReturnType<ApiClient['userListWithPathNoSuffix']>>['data']
>;
export type UserListWithPathNoSuffixQueryError = AxiosError<unknown>;

export function useUserListWithPathNoSuffix<
  TData = Awaited<
    ReturnType<ApiClient['userListWithPathNoSuffix']>
  >['data'],
  TError = AxiosError<unknown>,
>(
  options?: {
    query?: Partial<
      UseQueryOptions<
        Awaited<ReturnType<ApiClient['userListWithPathNoSuffix']>>['data'],
        TError,
        TData
      >
    >;
    axios?: AxiosRequestConfig;
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & {
  queryKey: DataTag<QueryKey, TData, TError>;
} {
  const client = useApiClient();
  const queryOptions = getUserListWithPathNoSuffixQueryOptions(
    Object.assign({ client }, options),
  );

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<
    TData,
    TError
  > & { queryKey: DataTag<QueryKey, TData, TError> };

  query.queryKey = queryOptions.queryKey;

  return query;
}
