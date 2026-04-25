import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const roleRank = { STUDENT: 1, TUTOR: 2, SUPER_ADMIN: 3 };

export default function ProtectedRoute({ children, requiredRole }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && (roleRank[user.role] ?? 0) < (roleRank[requiredRole] ?? 0)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return children;
}
