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
import { UserFindPage } from '../src/UserFindPage';
import { UserPage } from '../src/UserPage';
import { VenuePage } from '../src/VenuePage';

function SpreadGreet() {
  const api = useApiClient();
  const { data } = api.useGreet({ body: { name: 'Spread' } }, { query: { retry: false } });
  return <div data-testid="spread-greeting">{data ?? ''}</div>;
}

// How long a test waits for what the app answers to show: Testing Library's and Vitest's default.
const WAIT = { timeout: 1_000 };

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
    expect(await screen.findByText('Error: User not found', {}, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Create User'));
    await vitest.waitFor(() => {
      expect(screen.getByText('Name: John Doe')).toBeInTheDocument();
      expect(screen.getByText('Email: john.doe@example.com')).toBeInTheDocument();
    }, WAIT);
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

    await vitest.waitFor(() => {
      expect(screen.getByTestId('greeting')).toHaveTextContent('Hello, World!');
    }, WAIT);
  });

  test('optional-params hook works when called with no arguments', async () => {
    render(
      <App>
        <OptionalParamsPage />
      </App>,
    );

    // If the bound client weren't injected (the binding regression), the query
    // would hit the unbound default client and never resolve to this payload.
    await vitest.waitFor(() => {
      expect(screen.getByTestId('optional-result')).toHaveTextContent('"ok":true');
    }, WAIT);
  });

  test('a POST endpoint.query() is a query, keyed by its search params and body', async () => {
    render(
      <App>
        <SearchPage />
      </App>,
    );
    await vitest.waitFor(() => {
      expect(JSON.parse(screen.getByTestId('search-result').textContent)).toEqual({
        term: 'pizza',
        tags: [],
        page: 1,
      });
    }, WAIT);
    // A new search param is a new query key, so the hook fetches again.
    await userEvent.click(screen.getByText('Next page'));
    await vitest.waitFor(() => {
      expect(JSON.parse(screen.getByTestId('search-result').textContent)).toEqual({
        term: 'pizza',
        tags: [],
        page: 2,
      });
    }, WAIT);
  });

  test('a null output is null in the query data', async () => {
    render(
      <App>
        <UserFindPage />
      </App>,
    );
    await vitest.waitFor(() => {
      expect(screen.getByTestId('user-find')).toHaveTextContent('No such user');
    }, WAIT);
  });

  test('a query takes the path params its router declares', async () => {
    render(
      <App>
        <VenuePage venueId="3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e" />
      </App>,
    );
    expect(await screen.findByTestId('venue')).toHaveTextContent('venue 3f2b8c1e');
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
    await vitest.waitFor(() => {
      expect(screen.getByTestId('spread-greeting')).toHaveTextContent('Hello, Spread!');
    }, WAIT);
  });
});
