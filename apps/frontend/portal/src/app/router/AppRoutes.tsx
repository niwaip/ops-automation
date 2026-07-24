import { Suspense } from 'react';
import { Spin } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from '@/app/layouts/MainLayout';
import { AdminRoute, PrivateRoute } from '@/app/router/guards';
import { portalPageRoutes, portalRouteEntries } from '@/app/router/routeManifest';

const renderProtectedElement = (element: React.ReactElement, requiresAdmin?: boolean) => {
  const content = (
    <Suspense fallback={<div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" /></div>}>
      {element}
    </Suspense>
  );

  if (requiresAdmin) {
    return <AdminRoute>{content}</AdminRoute>;
  }

  return content;
};

const AppRoutes: React.FC = () => (
  <Routes>
    {portalPageRoutes
      .filter((entry) => entry.path === '/login')
      .map((entry) => (
        <Route key={entry.path} path={entry.path} element={entry.element} />
      ))}

    <Route
      path="/"
      element={
        <PrivateRoute>
          <MainLayout />
        </PrivateRoute>
      }
    >
      {portalRouteEntries.map((entry) => {
        if ('redirectTo' in entry) {
          const routePath = entry.path === '/' ? undefined : entry.path.replace(/^\//, '');
          return (
            <Route
              key={`${entry.path}-${entry.redirectTo}`}
              index={entry.isIndex}
              path={routePath}
              element={<Navigate to={entry.redirectTo} replace />}
            />
          );
        }

        if (entry.path === '/login') {
          return null;
        }

        const routePath = entry.path === '/' ? undefined : entry.path.replace(/^\//, '');

        return (
          <Route
            key={entry.path}
            index={entry.isIndex}
            path={routePath}
            element={renderProtectedElement(entry.element, entry.requiresAdmin)}
          />
        );
      })}
    </Route>

    <Route path="*" element={<Navigate to="/templates" replace />} />
  </Routes>
);

export default AppRoutes;
