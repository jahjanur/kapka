import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Before this existed, a component that threw took the app down to a white
 * screen — and with nothing watching, nobody found out. A donor reading a
 * request on a phone would have seen the page go blank and closed it.
 */

function Throws(): never {
  throw new Error('render exploded');
}

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  // React logs the caught error itself. Silenced so the suite output shows
  // test results rather than a stack trace that is the point of the test.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

const renderIn = (children: React.ReactNode) =>
  render(
    <MemoryRouter>
      <ErrorBoundary>{children}</ErrorBoundary>
    </MemoryRouter>,
  );

describe('ErrorBoundary', () => {
  it('renders its children when nothing is wrong', () => {
    renderIn(<p>The feed</p>);
    expect(screen.getByText('The feed')).toBeInTheDocument();
  });

  it('shows a way forward instead of a blank page when a child throws', () => {
    renderIn(<Throws />);
    expect(
      screen.getByRole('heading', { name: 'This page stopped working' }),
    ).toBeInTheDocument();
    // One action, and it is one the reader can actually take.
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument();
  });

  it('says the failure has been reported, because it has', () => {
    renderIn(<Throws />);
    expect(screen.getByText(/we have been told/i)).toBeInTheDocument();
  });

  it('logs the error, so it is visible where Sentry is deliberately off', () => {
    renderIn(<Throws />);
    const logged = consoleError.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('render exploded');
  });
});
