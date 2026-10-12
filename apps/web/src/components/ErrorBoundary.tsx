import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  failed: boolean;
}

/** Friendly fallback — never shows stack traces or technical text. */
export class ErrorBoundary extends Component<{ children: ReactNode; inline?: boolean }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(_error: unknown, _info: ErrorInfo) {
    // Deliberately not logging details: they could include family data.
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={this.props.inline ? "py-10" : "flex min-h-dvh items-center justify-center bg-cream p-6"}>
        <div className="mx-auto max-w-md rounded-3xl border border-line bg-card p-8 text-center shadow-card">
          <h1 className="text-2xl font-bold text-ink">Something didn't load properly</h1>
          <p className="mt-3 text-muted">Please try again.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-6 font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
