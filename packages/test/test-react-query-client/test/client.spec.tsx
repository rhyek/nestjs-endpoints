import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { App } from '../src/App';
import { GreetPage } from '../src/GreetPage';
import { UserPage } from '../src/UserPage';

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
});
