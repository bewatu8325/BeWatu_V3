import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initSentry, ErrorBoundary } from './lib/sentry';

initSentry();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Launch-readiness review: there was no React error boundary anywhere in
// this app — an uncaught render error just white-screened the user with no
// recovery path and (until lib/sentry.ts) no visibility for anyone either.
function ErrorFallback() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: '24px', textAlign: 'center', fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#fafaf9', color: '#1c1917',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
      <p style={{ fontSize: 14, color: '#78716c', marginBottom: 20, maxWidth: 360 }}>
        BeWatu ran into an unexpected error. We&rsquo;ve been notified — refreshing the page usually fixes this.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
          backgroundColor: '#1a4a3a', color: 'white', fontSize: 14, fontWeight: 600,
        }}
      >
        Reload BeWatu
      </button>
    </div>
  );
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary fallback={<ErrorFallback />}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);