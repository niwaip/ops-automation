import React from 'react';
import type { TFunction } from 'i18next';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  ApartmentOutlined,
  OrderedListOutlined,
  ThunderboltOutlined,
  AppstoreOutlined,
  RocketOutlined,
  BuildOutlined,
  FileTextOutlined,
  FileWordOutlined,
  VideoCameraOutlined,
  TeamOutlined,
  UserOutlined,
  FolderOpenOutlined,
  ReadOutlined,
  SettingOutlined,
  ControlOutlined,
  ToolOutlined,
  CloudServerOutlined,
  GlobalOutlined,
  BugOutlined,
  CloudSyncOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  ChromeOutlined,
  DeploymentUnitOutlined,
} from '@ant-design/icons';
import {
  getDefaultOpenKeys,
  resolveActiveMenuKey,
} from '@/app/router/routeManifest';

export interface NavItemConfig {
  key: string;
  labelKey: string;
  defaultLabel: string;
  icon: React.ReactNode;
  requiresAdmin?: boolean;
}

export interface NavGroupConfig {
  key: string;
  labelKey: string;
  defaultLabel: string;
  icon: React.ReactNode;
  requiresAdmin?: boolean;
  children: NavItemConfig[];
}

export const NAV_STRUCTURE: (NavItemConfig | NavGroupConfig)[] = [
  {
    key: '/dashboard',
    labelKey: 'dashboard',
    defaultLabel: '仪表盘',
    icon: <DashboardOutlined />,
    requiresAdmin: false,
  },
  {
    key: 'sub-workflows',
    labelKey: 'workflowManagement',
    defaultLabel: '工作流管理',
    icon: <ApartmentOutlined />,
    requiresAdmin: false,
    children: [
      {
        key: '/admin/activities',
        labelKey: 'activities',
        defaultLabel: '工作单元',
        icon: <BuildOutlined />,
        requiresAdmin: true,
      },
      {
        key: '/admin/temporal',
        labelKey: 'temporal',
        defaultLabel: '工作流',
        icon: <ThunderboltOutlined />,
        requiresAdmin: true,
      },
      {
        key: '/admin/flows',
        labelKey: 'executionFlows',
        defaultLabel: '工作流组合',
        icon: <OrderedListOutlined />,
        requiresAdmin: true,
      },
      {
        key: '/admin/org-workflows',
        labelKey: 'orgWorkflows',
        defaultLabel: '组织工作流',
        icon: <ApartmentOutlined />,
        requiresAdmin: true,
      },
    ],
  },
  {
    key: 'sub-templates',
    labelKey: 'templatesAndCapabilities',
    defaultLabel: '模版与能力',
    icon: <AppstoreOutlined />,
    requiresAdmin: false,
    children: [
      {
        key: '/carbone-templates',
        labelKey: 'carboneTemplates',
        defaultLabel: '文档模版',
        icon: <FileWordOutlined />,
        requiresAdmin: false,
      },
      {
        key: '/admin/skills',
        labelKey: 'skills',
        defaultLabel: '技能管理',
        icon: <ThunderboltOutlined />,
        requiresAdmin: true,
      },
      {
        key: '/admin/capabilities',
        labelKey: 'capabilities',
        defaultLabel: '流程发布',
        icon: <RocketOutlined />,
        requiresAdmin: true,
      },
    ],
  },
  {
    key: 'sub-browser',
    labelKey: 'browserAutomation',
    defaultLabel: '浏览器自动化',
    icon: <GlobalOutlined />,
    requiresAdmin: false,
    children: [
      {
        key: '/templates',
        labelKey: 'browserTemplates',
        defaultLabel: '执行模版',
        icon: <FileTextOutlined />,
        requiresAdmin: false,
      },
      {
        key: '/recorder',
        labelKey: 'recorder',
        defaultLabel: '动作录制器',
        icon: <VideoCameraOutlined />,
        requiresAdmin: false,
      },
      {
        key: '/admin/browser-semantic-rules',
        labelKey: 'browserSemanticRules',
        defaultLabel: '语义规则',
        icon: <GlobalOutlined />,
        requiresAdmin: true,
      },
    ],
  },
  {
    key: 'sub-model-planning',
    labelKey: 'modelPlanning',
    defaultLabel: '模型规划调用',
    icon: <DeploymentUnitOutlined />,
    requiresAdmin: true,
    children: [
      {
        key: '/admin/tools',
        labelKey: 'systemTools',
        defaultLabel: '模型原子能力',
        icon: <ToolOutlined />,
        requiresAdmin: true,
      },
      {
        key: '/admin/prompt-debug',
        labelKey: 'promptDebug',
        defaultLabel: 'Prompt 测试',
        icon: <BugOutlined />,
        requiresAdmin: true,
      },
      {
        key: '/admin/habit-learning',
        labelKey: 'habitLearning',
        defaultLabel: '习惯学习',
        icon: <ReadOutlined />,
        requiresAdmin: true,
      },
    ],
  },
  {
    key: 'sub-organization',
    labelKey: 'organizationManagement',
    defaultLabel: '组织管理',
    icon: <TeamOutlined />,
    requiresAdmin: true,
    children: [
      {
        key: '/admin/departments',
        labelKey: 'departments',
        defaultLabel: '组织架构',
        icon: <ApartmentOutlined />,
        requiresAdmin: true,
      },
      {
        key: '/admin/users',
        labelKey: 'users',
        defaultLabel: '用户与权限',
        icon: <UserOutlined />,
        requiresAdmin: true,
      },

      {
        key: '/admin/workspaces',
        labelKey: 'workspaces',
        defaultLabel: '企业知识空间',
        icon: <FolderOpenOutlined />,
        requiresAdmin: true,
      },
    ],
  },
  {
    key: 'sub-operations',
    labelKey: 'operationsAndAudit',
    defaultLabel: '运行与审计',
    icon: <HistoryOutlined />,
    requiresAdmin: false,
    children: [
      {
        key: '/executions',
        labelKey: 'executions',
        defaultLabel: '执行历史',
        icon: <PlayCircleOutlined />,
        requiresAdmin: false,
      },
      {
        key: '/sessions',
        labelKey: 'sessions',
        defaultLabel: '浏览器会话',
        icon: <ChromeOutlined />,
        requiresAdmin: false,
      },
    ],
  },
  {
    key: 'sub-system',
    labelKey: 'systemSettings',
    defaultLabel: '系统管理',
    icon: <SettingOutlined />,
    requiresAdmin: true,
    children: [
      {
        key: '/admin/models',
        labelKey: 'models',
        defaultLabel: 'AI 模型配置',
        icon: <ControlOutlined />,
        requiresAdmin: true,
      },
      {
        key: '/admin/sandboxes',
        labelKey: 'sandboxes',
        defaultLabel: '沙箱管理',
        icon: <CloudServerOutlined />,
        requiresAdmin: true,
      },
      {
        key: '/admin/backup',
        labelKey: 'backup',
        defaultLabel: '数据管理',
        icon: <CloudSyncOutlined />,
        requiresAdmin: true,
      },
    ],
  },
];

const isGroup = (item: NavItemConfig | NavGroupConfig): item is NavGroupConfig =>
  'children' in item;

export const buildNavigationMenuItems = (
  t: TFunction<'common'>,
  userRole?: string
): MenuProps['items'] => {
  const isAdmin = userRole === 'admin';
  const menuItems: MenuProps['items'] = [];

  for (const entry of NAV_STRUCTURE) {
    if (isGroup(entry)) {
      if (entry.requiresAdmin && !isAdmin) {
        continue;
      }
      const allowedChildren = entry.children.filter(
        (child) => !child.requiresAdmin || isAdmin
      );
      if (allowedChildren.length === 0) {
        continue;
      }
      menuItems.push({
        key: entry.key,
        icon: entry.icon,
        label: (t as (k: string, def: string) => string)(entry.labelKey, entry.defaultLabel),
        children: allowedChildren.map((child) => ({
          key: child.key,
          icon: child.icon,
          label: (t as (k: string, def: string) => string)(child.labelKey, child.defaultLabel),
        })),
      });
    } else {
      if (entry.requiresAdmin && !isAdmin) {
        continue;
      }
      menuItems.push({
        key: entry.key,
        icon: entry.icon,
        label: (t as (k: string, def: string) => string)(entry.labelKey, entry.defaultLabel),
      });
    }
  }

  return menuItems;
};

export const getSelectedNavigationKey = (pathname: string): string =>
  resolveActiveMenuKey(pathname);

export const getDefaultNavigationOpenKeys = (pathname: string): string[] =>
  getDefaultOpenKeys(pathname);
