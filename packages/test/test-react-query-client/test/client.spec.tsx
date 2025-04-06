import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { App } from '../src/App';

describe('Client', () => {
  test('hello world', () => {
    render(<div>Hello</div>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  test('client works', async () => {
    render(<App />);
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
});
