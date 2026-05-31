import { StrictMode, Component, type ReactNode, type ErrorInfo } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '600px', margin: '4rem auto' }}>
          <h1 style={{ color: '#dc2626' }}>Configuration Error</h1>
          <pre style={{ background: '#fef2f2', padding: '1rem', borderRadius: '8px', whiteSpace: 'pre-wrap', color: '#7f1d1d', fontSize: '0.875rem' }}>
            {(this.state.error as Error).message}
          </pre>
          <p style={{ color: '#6b7280', marginTop: '1rem', fontSize: '0.875rem' }}>
            Check the browser console for more details.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
