import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query';
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useMemo } from 'react';
import {
  createApiClient,
  type InputSchema,
} from '../../test-app-express/generated/react-query-client';
import { App } from '../src/App';
import { loadGreeting } from '../src/loaders';
import { ProfilePage } from '../src/ProfilePage';

const api = createApiClient({
  baseURL: `http://localhost:${import.meta.env.VITE_WEB_API_PORT}`,
});
// Nothing listens on port 1: a call through this instance fails before any
// HTTP response, so a call that succeeds went through `api`.
const unreachable = createApiClient({ baseURL: 'http://127.0.0.1:1' });

const networkError = { isAxiosError: true, code: 'ERR_NETWORK' };

function withQueryClient({ children }: { children: React.ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('the operation tree', () => {
  test('queryOptions calls through its own client instance', async () => {
    const queryClient = new QueryClient();
    await expect(loadGreeting(queryClient, api, 'Ana')).resolves.toBe(
      'Hello, Ana!',
    );
    expect(
      queryClient.getQueryData(
        api.greet.queryKey({ query: { name: 'Ana' } }),
      ),
    ).toBe('Hello, Ana!');

    await expect(
      new QueryClient().fetchQuery({
        ...unreachable.greet.queryOptions({ query: { name: 'Ana' } }),
        retry: false,
      }),
    ).rejects.toMatchObject(networkError);
  });

  test('mutationOptions calls through its own client instance', async () => {
    render(
      <App>
        <ProfilePage />
      </App>,
    );
    await userEvent.click(screen.getByText('Save'));
    const saved = await screen.findByTestId('saved');
    expect(JSON.parse(saved.textContent)).toEqual({
      name: 'Ana',
      address: null,
      theme: 'system',
      tags: [],
    });

    const { result } = renderHook(
      () => useMutation(unreachable.profileUpdate.mutationOptions()),
      { wrapper: withQueryClient },
    );
    await expect(
      result.current.mutateAsync({ body: { name: 'Ana', address: null } }),
    ).rejects.toMatchObject(networkError);
  });

  test('schemas.input describes the input side', () => {
    const input = api.profileUpdate.schemas.input as {
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    };
    expect(input.required).toEqual(
      expect.arrayContaining(['name', 'address']),
    );
    for (const optional of ['nickname', 'theme', 'tags']) {
      expect(input.required).not.toContain(optional);
    }
    expect(input.properties.theme.default).toBe('system');
    expect(input.properties.theme.enum).toEqual([
      'light',
      'dark',
      'system',
    ]);
    expect(JSON.stringify(input.properties.nickname)).toContain(
      '{"type":"null"}',
    );
    // Self-contained: nothing points back into the OpenAPI document.
    expect(JSON.stringify(input)).not.toContain('"$ref"');
    expect(JSON.stringify(input)).not.toContain('#/components/');
  });

  test('an operation without input has no schemas', () => {
    expect('schemas' in api.articles.latest).toBe(false);
    expect('schemas' in api.greet).toBe(true);
  });

  test('the request type is the input side', () => {
    type Body = NonNullable<
      Parameters<typeof api.profileUpdate>[0]
    >['body'];
    // Defaulted and nullish fields may be left out of what a form sends.
    expectTypeOf<{ name: string; address: null }>().toExtend<Body>();
    expectTypeOf(api.profileUpdate.schemas.input).toEqualTypeOf<
      InputSchema<Body>
    >();
    // The call keeps its own generic signature beside the tree.
    expectTypeOf(api.greet).toBeCallableWith({
      query: { name: 'Ana' },
      throwOnError: false,
    });
  });
});
