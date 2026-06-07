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
} from '@ant-design/icons';
import LoginPage from '@/features/auth/pages/LoginPage';
import SessionListPage from '@/features/sessions/pages/SessionListPage';
import SessionStartPage from '@/features/sessions/pages/SessionStartPage';
import SessionDetailPage from '@/features/sessions/pages/SessionDetailPage';
import TemplateListPage from '@/features/browser-templates/pages/TemplateListPage';
import TemplateDetailPage from '@/features/browser-templates/pages/TemplateDetailPage';
import RecorderPage from '@/features/recorder/pages/RecorderPage';
import RecorderDebugDetailPage from '@/features/recorder/pages/RecorderDebugDetailPage';
import UserAdminPage from '@/features/admin/users/pages/UserAdminPage';
import AIModelAdminPage from '@/features/admin/models/pages/AIModelAdminPage';
import SkillAdminPage from '@/features/admin/skills/pages/SkillAdminPage';
import SystemToolAdminPage from '@/features/admin/tools/pages/SystemToolAdminPage';
import PromptDebugPage from '@/features/admin/prompt-debug/pages/PromptDebugPage';
import FlowsPage from '@/features/admin/flows/pages/FlowsPage';
import TemporalPage from '@/features/admin/temporal/pages/TemporalPage';
import ActivityPage from '@/features/admin/activities/pages/ActivityPage';
import CapabilitiesPage from '@/features/admin/capabilities/pages/CapabilitiesPage';
import CapabilityStudioPage from '@/features/admin/capabilities/pages/CapabilityStudioPage';
import CapabilityBuildDetailPage from '@/features/admin/capabilities/pages/CapabilityBuildDetailPage';
import CarboneTemplateListPage from '@/features/carbone-templates/pages/CarboneTemplateListPage';
import DashboardPage from '@/features/dashboard/pages/DashboardPage';
import ExecutionCreatePage from '@/features/executions/pages/ExecutionCreatePage';
import ExecutionDetailPage from '@/features/executions/pages/ExecutionDetailPage';
import ExecutionListPage from '@/features/executions/pages/ExecutionListPage';
import ReportDetailPage from '@/features/reports/pages/ReportDetailPage';
import ReportListPage from '@/features/reports/pages/ReportListPage';
import UserWebRedirectPage from '@/app/router/UserWebRedirectPage';
import userRoutePolicy from '@/app/router/userRoutePolicy.json';

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

const isRouteDefinition = (entry: PortalRouteEntry): entry is PortalRouteDefinition => 'element' in entry;

const redirectTargetByPath = new Map(
  userRoutePolicy.portalRedirectRoutes.map((route) => [
    route.path,
    route.targetPath === route.path ? undefined : route.targetPath,
  ]),
);

const renderUserWebRedirect = (path: string) => {
  const targetPath = redirectTargetByPath.get(path);
  return targetPath
    ? <UserWebRedirectPage targetPath={targetPath} />
    : <UserWebRedirectPage />;
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
      label: '工作单元',
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
      label: '工作流',
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
      label: '流程发布',
      icon: <ThunderboltOutlined />,
      requiresAdmin: true,
    },
  },
  { path: '/admin/capability-studio', element: <CapabilityStudioPage />, requiresAdmin: true, activeMenuKey: '/admin/capabilities' },
  { path: '/admin/capability-builds/:buildId', element: <CapabilityBuildDetailPage />, requiresAdmin: true, activeMenuKey: '/admin/capabilities' },
  {
    path: '/published-skills',
    element: renderUserWebRedirect('/published-skills'),
  },
  { path: '/published-skills/:skillId', element: renderUserWebRedirect('/published-skills/:skillId') },
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
      label: '浏览器模版',
      icon: <FileTextOutlined />,
    },
  },
  { path: '/templates/:id', element: <TemplateDetailPage />, activeMenuKey: '/templates' },
  { path: '/recorder', element: <RecorderPage /> },
  { path: '/recorder-debug/:sessionId', element: <RecorderDebugDetailPage />, activeMenuKey: '/recorder' },
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
        { key: '/admin/models', labelKey: 'models', icon: <SettingOutlined />, requiresAdmin: true },
        { key: '/admin/skills', labelKey: 'skills', icon: <ThunderboltOutlined />, requiresAdmin: true },
        { key: '/admin/tools', label: '系统工具', icon: <ToolOutlined />, requiresAdmin: true },
        { key: '/admin/prompt-debug', label: 'Prompt 调试', icon: <BugOutlined />, requiresAdmin: true },
      ],
    },
  },
  { path: '/admin/models', element: <AIModelAdminPage />, requiresAdmin: true, activeMenuKey: '/admin/models' },
  { path: '/admin/skills', element: <SkillAdminPage />, requiresAdmin: true, activeMenuKey: '/admin/skills' },
  { path: '/admin/tools', element: <SystemToolAdminPage />, requiresAdmin: true, activeMenuKey: '/admin/tools' },
  { path: '/admin/prompt-debug', element: <PromptDebugPage />, requiresAdmin: true, activeMenuKey: '/admin/prompt-debug' },
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
  return activeKey.startsWith('/admin/') && !['/admin/activities', '/admin/temporal', '/admin/capabilities', '/admin/flows'].includes(activeKey)
    ? ['/admin']
    : [];
};
