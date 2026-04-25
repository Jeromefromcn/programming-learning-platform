import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/login/LoginPage';
import StudentPage from './pages/student/StudentPage';
import TutorPage from './pages/tutor/TutorPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import UserManagementPage from './pages/admin/UserManagementPage';
import GlobalSettingsPage from './pages/admin/GlobalSettingsPage';

function Unauthorized() {
  return <div style={{ padding: 32 }}><h2>Access Denied</h2><p>You do not have permission to view this page.</p></div>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/student" element={
            <ProtectedRoute requiredRole="STUDENT"><StudentPage /></ProtectedRoute>
          } />
          <Route path="/tutor" element={
            <ProtectedRoute requiredRole="TUTOR"><TutorPage /></ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="SUPER_ADMIN"><AdminDashboardPage /></ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute requiredRole="SUPER_ADMIN"><UserManagementPage /></ProtectedRoute>
          } />
          <Route path="/admin/settings" element={
            <ProtectedRoute requiredRole="SUPER_ADMIN"><GlobalSettingsPage /></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
