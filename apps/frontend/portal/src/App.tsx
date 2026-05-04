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
import SystemToolAdminPage from './pages/admin/SystemToolAdminPage';
import PromptDebugPage from './pages/admin/PromptDebugPage';
import FlowsPage from './pages/admin/FlowsPage';
import TemporalPage from './pages/admin/TemporalPage';
import ActivityPage from './pages/admin/ActivityPage';
import CapabilitiesPage from './pages/admin/CapabilitiesPage';
import CapabilityStudioPage from './pages/admin/CapabilityStudioPage';
import CapabilityBuildDetailPage from './pages/admin/CapabilityBuildDetailPage';
import ReportListPage from './pages/ReportListPage';
import ReportDetailPage from './pages/ReportDetailPage';
import CarboneTemplateListPage from './pages/CarboneTemplateListPage';
import ExecutionListPage from './pages/ExecutionListPage';
import ExecutionCreatePage from './pages/ExecutionCreatePage';
import ExecutionDetailPage from './pages/ExecutionDetailPage';
import TakeoverWorkbenchPage from './pages/TakeoverWorkbenchPage';
import PublishedSkillDetailPage from './pages/PublishedSkillDetailPage';

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
    return <Navigate to="/executions" replace />;
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
          <Route index element={<Navigate to="/executions" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="sessions" element={<SessionListPage />} />
          <Route path="sessions/new" element={<SessionStartPage />} />
          <Route path="sessions/:id" element={<SessionDetailPage />} />
          <Route path="templates" element={<TemplateListPage />} />
          <Route path="templates/:id" element={<TemplateDetailPage />} />
          <Route path="recorder" element={<RecorderPage />} />
          <Route path="report-templates" element={<Navigate to="/carbone-templates" replace />} />
          <Route path="report-templates/new" element={<Navigate to="/carbone-templates" replace />} />
          <Route path="report-templates/:id" element={<Navigate to="/carbone-templates" replace />} />
          <Route path="report-templates/:id/edit" element={<Navigate to="/carbone-templates" replace />} />
          <Route path="reports" element={<ReportListPage />} />
          <Route path="reports/:id" element={<ReportDetailPage />} />
          <Route path="carbone-templates" element={<CarboneTemplateListPage />} />
          <Route path="executions" element={<ExecutionListPage />} />
          <Route path="executions/new" element={<ExecutionCreatePage />} />
          <Route path="executions/:id" element={<ExecutionDetailPage />} />
          <Route path="executions/:id/takeover" element={<TakeoverWorkbenchPage />} />
          <Route path="release-center" element={<Navigate to="/admin/capabilities" replace />} />
          <Route path="admin/capability-releases" element={<Navigate to="/admin/capabilities" replace />} />
          <Route path="admin/execution-flows" element={<Navigate to="/admin/flows" replace />} />
          <Route path="admin/temporal-workflows" element={<Navigate to="/admin/temporal" replace />} />
          <Route path="published-skills" element={<PublishedSkillDetailPage />} />
          <Route path="published-skills/:skillId" element={<PublishedSkillDetailPage />} />
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
            path="admin/capabilities"
            element={
              <AdminRoute>
                <CapabilitiesPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/capability-studio"
            element={
              <AdminRoute>
                <CapabilityStudioPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/capability-builds/:buildId"
            element={
              <AdminRoute>
                <CapabilityBuildDetailPage />
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
            path="admin/tools"
            element={
              <AdminRoute>
                <SystemToolAdminPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/prompt-debug"
            element={
              <AdminRoute>
                <PromptDebugPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/flows"
            element={
              <AdminRoute>
                <FlowsPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/temporal"
            element={
              <AdminRoute>
                <TemporalPage />
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
        <Route path="*" element={<Navigate to="/executions" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
