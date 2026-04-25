import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SessionListPage from './pages/SessionListPage';
import SessionStartPage from './pages/SessionStartPage';
import SessionDetailPage from './pages/SessionDetailPage';
import TemplateListPage from './pages/TemplateListPage';
import TemplateDetailPage from './pages/TemplateDetailPage';
import RecorderPage from './pages/RecorderPage';
import UserAdminPage from './pages/admin/UserAdminPage';
import AIModelAdminPage from './pages/admin/AIModelAdminPage';
import SkillAdminPage from './pages/admin/SkillAdminPage';
import ExecutionFlowTemplatePage from './pages/admin/ExecutionFlowTemplatePage';
import TemporalWorkflowPage from './pages/admin/TemporalWorkflowPage';
import ActivityPage from './pages/admin/ActivityPage';
import CapabilityReleasePage from './pages/admin/CapabilityReleasePage';
import ReportTemplateListPage from './pages/ReportTemplateListPage';
import ReportTemplateDetailPage from './pages/ReportTemplateDetailPage';
import ReportTemplateCreatePage from './pages/ReportTemplateCreatePage';
import ReportListPage from './pages/ReportListPage';
import ReportDetailPage from './pages/ReportDetailPage';
import CarboneTemplateListPage from './pages/CarboneTemplateListPage';
import ExecutionListPage from './pages/ExecutionListPage';
import ExecutionDetailPage from './pages/ExecutionDetailPage';
import TakeoverWorkbenchPage from './pages/TakeoverWorkbenchPage';
import ReleaseCenterPage from './pages/ReleaseCenterPage';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

function App() {
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
          path="/"
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="sessions" element={<SessionListPage />} />
          <Route path="sessions/new" element={<SessionStartPage />} />
          <Route path="sessions/:id" element={<SessionDetailPage />} />
          <Route path="templates" element={<TemplateListPage />} />
          <Route path="templates/:id" element={<TemplateDetailPage />} />
          <Route path="recorder" element={<RecorderPage />} />
          <Route path="report-templates" element={<ReportTemplateListPage />} />
          <Route path="report-templates/new" element={<ReportTemplateCreatePage />} />
          <Route path="report-templates/:id" element={<ReportTemplateDetailPage />} />
          <Route path="report-templates/:id/edit" element={<ReportTemplateCreatePage />} />
          <Route path="reports" element={<ReportListPage />} />
          <Route path="reports/:id" element={<ReportDetailPage />} />
          <Route path="carbone-templates" element={<CarboneTemplateListPage />} />
          <Route path="executions" element={<ExecutionListPage />} />
          <Route path="executions/:id" element={<ExecutionDetailPage />} />
          <Route path="executions/:id/takeover" element={<TakeoverWorkbenchPage />} />
          <Route path="release-center" element={<ReleaseCenterPage />} />
          <Route
            path="admin/users"
            element={
              <AdminRoute>
                <UserAdminPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/models"
            element={
              <AdminRoute>
                <AIModelAdminPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/capability-releases"
            element={
              <AdminRoute>
                <CapabilityReleasePage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/skills"
            element={
              <AdminRoute>
                <SkillAdminPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/execution-flows"
            element={
              <AdminRoute>
                <ExecutionFlowTemplatePage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/temporal-workflows"
            element={
              <AdminRoute>
                <TemporalWorkflowPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/activities"
            element={
              <AdminRoute>
                <ActivityPage />
              </AdminRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
