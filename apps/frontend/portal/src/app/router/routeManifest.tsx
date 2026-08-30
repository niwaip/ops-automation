import type { ReactElement, ReactNode } from 'react';
import {
  DashboardOutlined,
  BugOutlined,
  FileTextOutlined,
  FileWordOutlined,
  MessageOutlined,
  OrderedListOutlined,
  PlayCircleOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UserOutlined,
  CloudSyncOutlined,
} from '@ant-design/icons';
import { lazy } from 'react';
import UserWebRedirectPage from '@/app/router/UserWebRedirectPage';
import userRoutePolicy from '@/app/router/userRoutePolicy.json';

const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const SessionListPage = lazy(() => import('@/features/sessions/pages/SessionListPage'));
const SessionStartPage = lazy(() => import('@/features/sessions/pages/SessionStartPage'));
const SessionDetailPage = lazy(() => import('@/features/sessions/pages/SessionDetailPage'));
const TemplateListPage = lazy(() => import('@/features/browser-templates/pages/TemplateListPage'));
const TemplateDetailPage = lazy(() => import('@/features/browser-templates/pages/TemplateDetailPage'));
const RecorderPage = lazy(() => import('@/features/recorder/pages/RecorderPage'));
const RecorderDebugDetailPage = lazy(() => import('@/features/recorder/pages/RecorderDebugDetailPage'));
const UserAdminPage = lazy(() => import('@/features/admin/users/pages/UserAdminPage'));
const AIModelAdminPage = lazy(() => import('@/features/admin/models/pages/AIModelAdminPage'));
const SkillAdminPage = lazy(() => import('@/features/admin/skills/pages/SkillAdminPage'));
const BrowserSemanticRuleAdminPage = lazy(() => import('@/features/admin/browser-semantics/pages/BrowserSemanticRuleAdminPage'));
const SystemToolAdminPage = lazy(() => import('@/features/admin/tools/pages/SystemToolAdminPage'));
const SystemBackupAdminPage = lazy(() => import('@/features/admin/backup/pages/SystemBackupAdminPage'));
const PromptDebugPage = lazy(() => import('@/features/admin/prompt-debug/pages/PromptDebugPage'));
const HabitLearningPage = lazy(() => import('@/features/admin/habit-learning/pages/HabitLearningPage'));
const FlowsPage = lazy(() => import('@/features/admin/flows/pages/FlowsPage'));
const TemporalPage = lazy(() => import('@/features/admin/temporal/pages/TemporalPage'));
const ActivityPage = lazy(() => import('@/features/admin/activities/pages/ActivityPage'));
const CapabilitiesPage = lazy(() => import('@/features/admin/capabilities/pages/CapabilitiesPage'));
const CapabilityStudioPage = lazy(() => import('@/features/admin/capabilities/pages/CapabilityStudioPage'));
const CapabilityBuildDetailPage = lazy(() => import('@/features/admin/capabilities/pages/CapabilityBuildDetailPage'));
const CarboneTemplateListPage = lazy(() => import('@/features/carbone-templates/pages/CarboneTemplateListPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const ExecutionCreatePage = lazy(() => import('@/features/executions/pages/ExecutionCreatePage'));
const ExecutionDetailPage = lazy(() => import('@/features/executions/pages/ExecutionDetailPage'));
const ExecutionListPage = lazy(() => import('@/features/executions/pages/ExecutionListPage'));
const ReportDetailPage = lazy(() => import('@/features/reports/pages/ReportDetailPage'));
const ReportListPage = lazy(() => import('@/features/reports/pages/ReportListPage'));

export type NavGroup = 'root' | 'admin';

export interface PortalRouteDefinition {
  path: string;
  element: ReactElement;
  requiresAdmin?: boolean;
  isIndex?: boolean;
  nav?: {
    key: string;
    group: NavGroup;
    labelKey?: string;
    label?: string;
    icon?: ReactNode;
    requiresAdmin?: boolean;
    children?: Array<{
      key: string;
      labelKey?: string;
      label?: string;
      icon?: ReactNode;
      requiresAdmin?: boolean;
    }>;
  };
  activeMenuKey?: string;
}

export interface PortalRedirectDefinition {
  path: string;
  redirectTo: string;
  isIndex?: boolean;
}

export type PortalRouteEntry = PortalRouteDefinition | PortalRedirectDefinition;

const isRouteDefinition = (entry: PortalRouteEntry): entry is PortalRouteDefinition =>
  'element' in entry;

const redirectTargetByPath = new Map(
  userRoutePolicy.portalRedirectRoutes.map((route) => [
    route.path,
    route.targetPath === route.path ? undefined : route.targetPath,
  ])
);

const renderUserWebRedirect = (path: string) => {
  const targetPath = redirectTargetByPath.get(path);
  return targetPath ? <UserWebRedirectPage targetPath={targetPath} /> : <UserWebRedirectPage />;
};

export const portalRouteEntries: PortalRouteEntry[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/', redirectTo: '/dashboard', isIndex: true },
  {
    path: '/dashboard',
    element: <DashboardPage />,
    nav: {
      key: '/dashboard',
      group: 'root',
      labelKey: 'dashboard',
      icon: <DashboardOutlined />,
    },
  },
  { path: '/chat', element: renderUserWebRedirect('/chat') },
  { path: '/notifications', element: renderUserWebRedirect('/notifications') },
  {
    path: '/executions',
    element: <ExecutionListPage />,
    nav: {
      key: '/executions',
      group: 'root',
      labelKey: 'executions',
      icon: <PlayCircleOutlined />,
    },
  },
  { path: '/executions/new', element: <ExecutionCreatePage />, activeMenuKey: '/executions' },
  { path: '/executions/:id', element: <ExecutionDetailPage />, activeMenuKey: '/executions' },
  {
    path: '/admin/activities',
    element: <ActivityPage />,
    requiresAdmin: true,
    nav: {
      key: '/admin/activities',
      group: 'root',
      labelKey: 'activities',
      icon: <ThunderboltOutlined />,
      requiresAdmin: true,
    },
  },
  {
    path: '/admin/temporal',
    element: <TemporalPage />,
    requiresAdmin: true,
    nav: {
      key: '/admin/temporal',
      group: 'root',
      labelKey: 'temporal',
      icon: <ThunderboltOutlined />,
      requiresAdmin: true,
    },
  },
  {
    path: '/admin/capabilities',
    element: <CapabilitiesPage />,
    requiresAdmin: true,
    nav: {
      key: '/admin/capabilities',
      group: 'root',
      labelKey: 'capabilities',
      icon: <ThunderboltOutlined />,
      requiresAdmin: true,
    },
  },
  {
    path: '/admin/capability-studio',
    element: <CapabilityStudioPage />,
    requiresAdmin: true,
    activeMenuKey: '/admin/capabilities',
  },
  {
    path: '/admin/capability-builds/:buildId',
    element: <CapabilityBuildDetailPage />,
    requiresAdmin: true,
    activeMenuKey: '/admin/capabilities',
  },
  {
    path: '/published-skills',
    element: renderUserWebRedirect('/published-skills'),
  },
  {
    path: '/published-skills/:skillId',
    element: renderUserWebRedirect('/published-skills/:skillId'),
  },
  {
    path: '/sessions',
    element: <SessionListPage />,
    nav: {
      key: '/sessions',
      group: 'root',
      labelKey: 'sessions',
      icon: <MessageOutlined />,
    },
  },
  { path: '/sessions/new', element: <SessionStartPage />, activeMenuKey: '/sessions' },
  { path: '/sessions/:id', element: <SessionDetailPage />, activeMenuKey: '/sessions' },
  {
    path: '/carbone-templates',
    element: <CarboneTemplateListPage />,
    nav: {
      key: '/carbone-templates',
      group: 'root',
      labelKey: 'carboneTemplates',
      icon: <FileWordOutlined />,
    },
  },
  {
    path: '/templates',
    element: <TemplateListPage />,
    nav: {
      key: '/templates',
      group: 'root',
      labelKey: 'browserTemplates',
      icon: <FileTextOutlined />,
    },
  },
  { path: '/templates/:id', element: <TemplateDetailPage />, activeMenuKey: '/templates' },
  { path: '/recorder', element: <RecorderPage /> },
  {
    path: '/recorder-debug/:sessionId',
    element: <RecorderDebugDetailPage />,
    activeMenuKey: '/recorder',
  },
  {
    path: '/reports',
    element: <ReportListPage />,
    nav: {
      key: '/reports',
      group: 'root',
      labelKey: 'reports',
      icon: <FileTextOutlined />,
    },
  },
  { path: '/reports/:id', element: <ReportDetailPage />, activeMenuKey: '/reports' },
  {
    path: '/admin/flows',
    element: <FlowsPage />,
    requiresAdmin: true,
    nav: {
      key: '/admin/flows',
      group: 'root',
      labelKey: 'executionFlows',
      icon: <OrderedListOutlined />,
      requiresAdmin: true,
    },
  },
  {
    path: '/admin/users',
    element: <UserAdminPage />,
    requiresAdmin: true,
    nav: {
      key: '/admin',
      group: 'admin',
      labelKey: 'admin',
      icon: <SettingOutlined />,
      requiresAdmin: true,
      children: [
        { key: '/admin/users', labelKey: 'users', icon: <UserOutlined />, requiresAdmin: true },
        {
          key: '/admin/models',
          labelKey: 'models',
          icon: <SettingOutlined />,
          requiresAdmin: true,
        },
        {
          key: '/admin/skills',
          labelKey: 'skills',
          icon: <ThunderboltOutlined />,
          requiresAdmin: true,
        },
        {
          key: '/admin/browser-semantic-rules',
          labelKey: 'browserSemanticRules',
          icon: <OrderedListOutlined />,
          requiresAdmin: true,
        },
        { key: '/admin/tools', labelKey: 'systemTools', icon: <ToolOutlined />, requiresAdmin: true },
        {
          key: '/admin/prompt-debug',
          labelKey: 'promptDebug',
          icon: <BugOutlined />,
          requiresAdmin: true,
        },
        {
          key: '/admin/habit-learning',
          label: '习惯学习',
          icon: <MessageOutlined />,
          requiresAdmin: true,
        },
        {
          key: '/admin/backup',
          labelKey: 'backup',
          icon: <CloudSyncOutlined />,
          requiresAdmin: true,
        },
      ],
    },
  },
  {
    path: '/admin/models',
    element: <AIModelAdminPage />,
    requiresAdmin: true,
    activeMenuKey: '/admin/models',
  },
  {
    path: '/admin/skills',
    element: <SkillAdminPage />,
    requiresAdmin: true,
    activeMenuKey: '/admin/skills',
  },
  {
    path: '/admin/browser-semantic-rules',
    element: <BrowserSemanticRuleAdminPage />,
    requiresAdmin: true,
    activeMenuKey: '/admin/browser-semantic-rules',
  },
  {
    path: '/admin/tools',
    element: <SystemToolAdminPage />,
    requiresAdmin: true,
    activeMenuKey: '/admin/tools',
  },
  {
    path: '/admin/backup',
    element: <SystemBackupAdminPage />,
    requiresAdmin: true,
    activeMenuKey: '/admin/backup',
  },
  {
    path: '/admin/prompt-debug',
    element: <PromptDebugPage />,
    requiresAdmin: true,
    activeMenuKey: '/admin/prompt-debug',
  },
  {
    path: '/admin/habit-learning',
    element: <HabitLearningPage />,
    requiresAdmin: true,
    activeMenuKey: '/admin/habit-learning',
  },
  { path: '/report-templates', redirectTo: '/carbone-templates' },
  { path: '/report-templates/new', redirectTo: '/carbone-templates' },
  { path: '/report-templates/:id', redirectTo: '/carbone-templates' },
  { path: '/report-templates/:id/edit', redirectTo: '/carbone-templates' },
  { path: '/release-center', redirectTo: '/admin/capabilities' },
  { path: '/admin/capability-releases', redirectTo: '/admin/capabilities' },
  { path: '/admin/execution-flows', redirectTo: '/admin/flows' },
  { path: '/admin/temporal-workflows', redirectTo: '/admin/temporal' },
];

export const portalPageRoutes = portalRouteEntries.filter(isRouteDefinition);
export const portalNavigationEntries = portalPageRoutes.filter((entry) => entry.nav);

export const resolveActiveMenuKey = (pathname: string) => {
  const matchedRoute = portalPageRoutes.find((entry) => {
    if (entry.path === pathname) {
      return true;
    }

    if (entry.path.includes('/:')) {
      const basePath = entry.path.split('/:')[0];
      return pathname === basePath || pathname.startsWith(`${basePath}/`);
    }

    return pathname.startsWith(`${entry.path}/`);
  });

  if (!matchedRoute) {
    return pathname;
  }

  return matchedRoute.activeMenuKey || matchedRoute.nav?.key || matchedRoute.path;
};

export const getDefaultOpenKeys = (pathname: string) => {
  const activeKey = resolveActiveMenuKey(pathname);
  return activeKey.startsWith('/admin/') &&
    !['/admin/activities', '/admin/temporal', '/admin/capabilities', '/admin/flows'].includes(
      activeKey
    )
    ? ['/admin']
    : [];
};
