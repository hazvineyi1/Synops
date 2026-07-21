import React from 'react';

/**
 * Top-level error boundary. Without this, any thrown render error (an unexpected data shape, a
 * null deref on a slow/low-end device) produces a blank white screen in production. This catches
 * it and shows a calm, branded recovery state with a reload — critical for the low-end-Android
 * audience where unexpected data shapes are more likely.
 */
interface State { hasError: boolean; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Surfaced to the console (and to Sentry once wired) rather than swallowed silently.
    // eslint-disable-next-line no-console
    console.error('Unhandled render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'hsl(43 30% 97%)' }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'hsl(222 47% 11%)' }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: 'hsl(215 16% 47%)', marginBottom: 20, lineHeight: 1.5 }}>
              The page hit an unexpected error. Reloading usually fixes it. If it keeps happening, please let your coach or admin know.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: 'hsl(222 47% 11%)', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer' }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
