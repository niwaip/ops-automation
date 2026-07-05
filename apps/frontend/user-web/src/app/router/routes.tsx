import { lazy, Suspense, type ReactNode } from 'react';
import { Spin } from 'antd';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useStore } from 'zustand';
import { authStore } from '../../adapters/auth/authStore';
import { UserLayout } from '../layouts/UserLayout';

const LoginPage = lazy(() =>
  import('../../features/auth/pages/LoginPage').then((module) => ({ default: module.LoginPage }))
);
const DashboardPage = lazy(() =>
  import('../../features/dashboard/pages/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  }))
);
const ChatPage = lazy(() =>
  import('../../features/chat/pages/ChatPage').then((module) => ({ default: module.ChatPage }))
);
const ExecutionListPage = lazy(() => import('../../features/executions/pages/ExecutionListPage'));
const ExecutionCreatePage = lazy(() => import('../../features/executions/pages/ExecutionCreatePage'));
const ExecutionDetailPage = lazy(() => import('../../features/executions/pages/ExecutionDetailPage'));
const NotificationsPage = lazy(() =>
  import('../../features/notifications/pages/NotificationsPage').then((module) => ({
    default: module.NotificationsPage,
  }))
);
const ReportListPage = lazy(() =>
  import('../../features/reports/pages/ReportListPage').then((module) => ({
    default: module.ReportListPage,
  }))
);
const ReportDetailPage = lazy(() =>
  import('../../features/reports/pages/ReportDetailPage').then((module) => ({
    default: module.ReportDetailPage,
  }))
);
const PublishedSkillListPage = lazy(() =>
  import('../../features/skills/pages/PublishedSkillListPage').then((module) => ({
    default: module.PublishedSkillListPage,
  }))
);

interface PrivateRouteProps {
  children: ReactNode;
}

function PrivateRoute({ children }: PrivateRouteProps) {
  const isAuthenticated = useStore(authStore, (state) => state.isAuthenticated);
  const accessToken = useStore(authStore, (state) => state.accessToken);
  const refreshToken = useStore(authStore, (state) => state.refreshToken);

  return isAuthenticated && Boolean(accessToken || refreshToken) ? (
    <>{children}</>
  ) : (
    <Navigate to="/login" replace />
  );
}

function ProtectedOutlet() {
  return (
    <PrivateRoute>
      <Outlet />
    </PrivateRoute>
  );
}

function RouteFallback() {
  return (
    <div style={{ minHeight: '40vh', display: 'grid', placeItems: 'center' }}>
      <Spin size="large" />
    </div>
  );
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedOutlet />}>
            <Route element={<UserLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/executions" element={<ExecutionListPage />} />
              <Route path="/executions/new" element={<ExecutionCreatePage />} />
              <Route path="/executions/:id" element={<ExecutionDetailPage />} />
              <Route path="/published-skills" element={<PublishedSkillListPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/reports" element={<ReportListPage />} />
              <Route path="/reports/:id" element={<ReportDetailPage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
