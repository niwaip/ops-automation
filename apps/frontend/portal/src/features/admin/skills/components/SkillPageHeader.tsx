import React from 'react';
import { Space, Typography, Input, Segmented, Button } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  FileTextOutlined,
  OrderedListOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { ListSectionHeader } from '@/components/page/PageScaffold';
import type { SkillAdminTabKey } from './SkillAdminTabs';

const { Text } = Typography;

interface SkillPageHeaderProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  displayedCount: number;
  activeTabKey: SkillAdminTabKey;
  builtinViewMode: 'grouped' | 'flat';
  onBuiltinViewModeChange: (mode: 'grouped' | 'flat') => void;
  onRefresh: () => void;
  onCreate: () => void;
}

export const SkillPageHeader: React.FC<SkillPageHeaderProps> = ({
  searchText,
  onSearchChange,
  displayedCount,
  activeTabKey,
  builtinViewMode,
  onBuiltinViewModeChange,
  onRefresh,
  onCreate,
}) => {
  const { t } = useTranslation(['common', 'admin']);

  return (
    <ListSectionHeader
      title={
        <Space wrap size={12}>
          <Text strong style={{ fontSize: 16 }}>
            技能列表
          </Text>
          <Input
            size="large"
            placeholder={t('common:search')}
            prefix={<SearchOutlined style={{ color: 'var(--text-light)' }} />}
            variant="borderless"
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            allowClear
            style={{
              width: 320,
              background: 'var(--bg-secondary)',
              borderRadius: 12,
            }}
          />
        </Space>
      }
      extra={
        <Space wrap size={12}>
          <Text type="secondary">当前显示 {displayedCount} 条</Text>
          {activeTabKey === 'builtin' && (
            <Segmented
              size="middle"
              value={builtinViewMode}
              onChange={(val) => onBuiltinViewModeChange(val as 'grouped' | 'flat')}
              options={[
                { label: '套件分组', value: 'grouped', icon: <AppstoreOutlined /> },
                { label: '平铺列表', value: 'flat', icon: <UnorderedListOutlined /> },
              ]}
            />
          )}
          <Button
            size="large"
            icon={<FileTextOutlined />}
            onClick={() => (window.location.href = '/carbone-templates')}
            className="btn-pill"
          >
            模板管理
          </Button>
          <Button
            size="large"
            icon={<OrderedListOutlined />}
            onClick={() => (window.location.href = '/admin/flows')}
            className="btn-pill"
          >
            流程模板
          </Button>
          <Button
            size="large"
            icon={<ReloadOutlined />}
            onClick={onRefresh}
            className="btn-pill"
          >
            {t('common:refresh')}
          </Button>
          {activeTabKey !== 'builtin' ? (
            <Button
              size="large"
              type="primary"
              icon={<PlusOutlined />}
              onClick={onCreate}
              className="btn-pill"
            >
              {t('admin:createSkill')}
            </Button>
          ) : null}
        </Space>
      }
    />
  );
};
