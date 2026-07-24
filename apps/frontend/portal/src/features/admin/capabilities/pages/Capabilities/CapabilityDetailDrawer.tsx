import React, { useState } from 'react';
import { Drawer, Space, Typography, Tag, Descriptions, Tabs } from 'antd';
import { RocketOutlined } from '@ant-design/icons';
import type { CapabilityReleaseDetail } from '@/api/capabilities';
import { CapabilityDetailActionCards } from './components/CapabilityDetailActionCards';
import { CapabilityOpsTabContent } from './components/CapabilityOpsTabContent';
import { CapabilityStudioTabContent } from './components/CapabilityStudioTabContent';

const { Text } = Typography;

export interface CapabilityDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  selectedDetail: CapabilityReleaseDetail | null;
  drawerMode: 'view' | 'edit' | null;
  statusColor: (status: string) => string;
  getSourceTypeLabel: (sourceType: string) => string;
  onValidateStatic?: (id: string) => void;
  validateStaticLoading?: boolean;
  onOpenDeployModal?: (id: string) => void;
  hasExecutableCode?: boolean;
  onPublishSkill?: (release: CapabilityReleaseDetail['release']) => void;
  publishLoading?: boolean;
  onValidateSkill?: (skillId: string) => void;
  validateSkillLoading?: boolean;
  onOpenRealValidate?: (id: string) => void;
}

export const CapabilityDetailDrawer: React.FC<CapabilityDetailDrawerProps> = ({
  open,
  onClose,
  selectedDetail,
  drawerMode,
  statusColor,
  getSourceTypeLabel,
  onValidateStatic = () => {},
  validateStaticLoading = false,
  onOpenDeployModal = () => {},
  hasExecutableCode = true,
  onPublishSkill = () => {},
  publishLoading = false,
  onValidateSkill = () => {},
  validateSkillLoading = false,
  onOpenRealValidate = () => {},
}) => {
  const [activeTab, setActiveTab] = useState<'ops' | 'studio'>('ops');

  if (!selectedDetail) return null;

  return (
    <Drawer
      title={
        <Space>
          <RocketOutlined style={{ color: 'var(--primary-color)' }} />
          <span>{drawerMode === 'view' ? 'Release 详情' : 'Release 操作与编辑'}</span>
          <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 14 }}>
            {selectedDetail.release.sourceName || selectedDetail.release.id}
          </Text>
        </Space>
      }
      width={1200}
      open={open}
      onClose={onClose}
      styles={{ body: { padding: '16px 24px' } }}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Descriptions
          column={4}
          size="small"
          bordered
          items={[
            {
              label: '状态',
              children: (
                <Tag color={statusColor(selectedDetail.release.status)}>
                  {selectedDetail.release.status}
                </Tag>
              ),
            },
            { label: '类型', children: getSourceTypeLabel(selectedDetail.release.sourceType) },
            { label: '审批', children: selectedDetail.release.approvalStatus },
            { label: '部署', children: selectedDetail.release.deploymentStatus || '未部署' },
          ]}
        />

        {drawerMode === 'edit' && (
          <CapabilityDetailActionCards
            selectedDetail={selectedDetail}
            onValidateStatic={onValidateStatic}
            validateStaticLoading={validateStaticLoading}
            onOpenDeployModal={onOpenDeployModal}
            hasExecutableCode={hasExecutableCode}
            onPublishSkill={onPublishSkill}
            publishLoading={publishLoading}
            onValidateSkill={onValidateSkill}
            validateSkillLoading={validateSkillLoading}
            onOpenRealValidate={onOpenRealValidate}
          />
        )}

        <Tabs
          size="small"
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'ops' | 'studio')}
          items={[
            {
              key: 'ops',
              label: '运维详情',
              children: (
                <CapabilityOpsTabContent
                  selectedDetail={selectedDetail}
                  hasExecutableCode={hasExecutableCode}
                  onOpenDeployModal={onOpenDeployModal}
                />
              ),
            },
            {
              key: 'studio',
              label: '设计详情 (Studio)',
              children: <CapabilityStudioTabContent selectedDetail={selectedDetail} />,
            },
          ]}
        />
      </Space>
    </Drawer>
  );
};
