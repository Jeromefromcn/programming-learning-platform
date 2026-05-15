import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Component } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/login/LoginPage';
import AppShell from './components/AppShell';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace' }}>
          <h2 style={{ color: '#c62828' }}>App Error (Debug)</h2>
          <pre style={{ background: '#fdecea', padding: 16, borderRadius: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {String(this.state.error)}
            {'\n'}
            {this.state.error?.stack}
          </pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 12 }}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Unauthorized() {
  return (
    <div style={{ padding: 32 }}>
      <h2>Access Denied</h2>
      <p>You do not have permission to view this page.</p>
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute requiredRole="STUDENT">
                <AppShell />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </AppErrorBoundary>
  );
}
