import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useStore } from "zustand";
import { authStore } from "../../adapters/auth/authStore";
import { UserLayout } from "../layouts/UserLayout";
import { LoginPage } from "../../features/auth/pages/LoginPage";
import { DashboardPage } from "../../features/dashboard/pages/DashboardPage";
import { ExecutionListPage } from "../../features/executions/pages/ExecutionListPage";
import { ExecutionDetailPage } from "../../features/executions/pages/ExecutionDetailPage";

interface PrivateRouteProps {
  children: ReactNode;
}

function PrivateRoute({ children }: PrivateRouteProps) {
  const isAuthenticated = useStore(authStore, (state) => state.isAuthenticated);
  const accessToken = useStore(authStore, (state) => state.accessToken);
  const refreshToken = useStore(authStore, (state) => state.refreshToken);

  return isAuthenticated && Boolean(accessToken || refreshToken)
    ? <>{children}</>
    : <Navigate to="/login" replace />;
}

export function AppRoutes() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={(
            <PrivateRoute>
              <UserLayout>
                <Routes>
                  <Route index element={<Navigate to="/executions" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/executions" element={<ExecutionListPage />} />
                  <Route path="/executions/:id" element={<ExecutionDetailPage />} />
                </Routes>
              </UserLayout>
            </PrivateRoute>
          )}
        />
      </Routes>
    </BrowserRouter>
  );
}
