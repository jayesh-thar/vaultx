import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'var(--bg-base)' }}
      >
        <div className="text-center max-w-sm">
          <p style={{ fontSize: 32 }}>⚠️</p>
          <p
            className="text-sm font-medium mt-2"
            style={{ color: 'var(--text-primary)' }}
          >
            Something went wrong
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg text-sm vx-btn-accent"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
