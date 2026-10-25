import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {
  ApiClientProvider,
  createApiClient,
  useApiClient,
} from '../../test-app-express/generated/react-query-client';
import { App } from '../src/App';
import { GreetPage } from '../src/GreetPage';
import { OptionalParamsPage } from '../src/OptionalParamsPage';
import { SearchPage } from '../src/SearchPage';
import { UserPage } from '../src/UserPage';

function SpreadGreet() {
  const api = useApiClient();
  const { data } = api.useGreet(
    { body: { name: 'Spread' } },
    { query: { retry: false } },
  );
  return <div data-testid="spread-greeting">{data ?? ''}</div>;
}

describe('Client', () => {
  test('hello world', () => {
    render(<div>Hello</div>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  test('client works', async () => {
    render(
      <App>
        <UserPage />
      </App>,
    );
    expect(await screen.findByText('Loading...')).toBeInTheDocument();
    await vitest.waitFor(async () => {
      expect(
        await screen.findByText('Error: User not found'),
      ).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText('Create User'));
    await vitest.waitFor(async () => {
      expect(
        await screen.findByText('Name: John Doe'),
      ).toBeInTheDocument();
      expect(
        await screen.findByText('Email: john.doe@example.com'),
      ).toBeInTheDocument();
    });
  });

  test('greet functionality works', async () => {
    render(
      <App>
        <GreetPage />
      </App>,
    );

    const input = screen.getByPlaceholderText('Enter your name');
    const button = screen.getByText('Greet');

    await userEvent.type(input, 'World');
    await userEvent.click(button);

    await vitest.waitFor(async () => {
      expect(await screen.findByTestId('greeting')).toHaveTextContent(
        'Hello, World!',
      );
    });
  });

  test('optional-params hook works when called with no arguments', async () => {
    render(
      <App>
        <OptionalParamsPage />
      </App>,
    );

    // If the bound client weren't injected (the binding regression), the query
    // would hit the unbound default client and never resolve to this payload.
    await vitest.waitFor(async () => {
      expect(
        await screen.findByTestId('optional-result'),
      ).toHaveTextContent('"ok":true');
    });
  });

  test('a POST endpoint.query() is a query, keyed by its search params and body', async () => {
    render(
      <App>
        <SearchPage />
      </App>,
    );
    await vitest.waitFor(async () => {
      expect(
        JSON.parse(
          (await screen.findByTestId('search-result')).textContent,
        ),
      ).toEqual({ term: 'pizza', tags: [], page: 1 });
    });
    // A new search param is a new query key, so the hook fetches again.
    await userEvent.click(screen.getByText('Next page'));
    await vitest.waitFor(async () => {
      expect(
        JSON.parse(
          (await screen.findByTestId('search-result')).textContent,
        ),
      ).toEqual({ term: 'pizza', tags: [], page: 2 });
    });
  });

  test('a spread client still carries its context through ApiClientProvider', async () => {
    const apiClient = createApiClient({
      baseURL: `http://localhost:${import.meta.env.VITE_WEB_API_PORT}`,
    });
    // Spreading copies enumerable own properties, including the hidden context
    // symbol. A regression to a non-enumerable symbol would drop it here, and
    // every hook would throw "must be used within an <ApiClientProvider>".
    const spread = { ...apiClient };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ApiClientProvider client={spread}>
          <SpreadGreet />
        </ApiClientProvider>
      </QueryClientProvider>,
    );
    await vitest.waitFor(async () => {
      expect(
        await screen.findByTestId('spread-greeting'),
      ).toHaveTextContent('Hello, Spread!');
    });
  });
});
