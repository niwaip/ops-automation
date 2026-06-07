import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/store/authStore';

export const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, accessToken, refreshToken } = useAuthStore();
  const hasSession = Boolean(accessToken || refreshToken);
  return isAuthenticated && hasSession ? <>{children}</> : <Navigate to="/login" replace />;
};

export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, accessToken, refreshToken, user } = useAuthStore();
  const hasSession = Boolean(accessToken || refreshToken);

  if (!isAuthenticated || !hasSession) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/templates" replace />;
  }

  return <>{children}</>;
};
