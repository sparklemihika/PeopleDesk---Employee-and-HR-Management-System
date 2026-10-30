import { Component } from "react";

// Catches rendering errors so a bug in one screen shows a recovery message
// instead of a blank white page.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled interface error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="loading-screen" role="alert">
        <div className="text-center">
          <h1 className="h4 mb-2">Something went wrong</h1>
          <p className="text-secondary mb-3">The page hit an unexpected problem. Your data is safe.</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.assign("/")}>
            Reload PeopleDesk
          </button>
        </div>
      </div>
    );
  }
}
