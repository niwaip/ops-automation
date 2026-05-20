import React from 'react';
import { Button, Card, Descriptions, Input, Space, Tag } from 'antd';
import { BugOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Template } from '@/api/template';
import { getTemplateStatusColor } from '@/features/browser-templates/lib/templateDetail';

interface TemplateDetailSummaryCardProps {
  template: Template;
  isEditMode: boolean;
  draftName: string;
  draftDescription: string;
  onDraftNameChange: (value: string) => void;
  onDraftDescriptionChange: (value: string) => void;
  onToggleEditMode: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onTest: () => void;
  updateLoading: boolean;
  testLoading: boolean;
}

const TemplateDetailSummaryCard: React.FC<TemplateDetailSummaryCardProps> = ({
  template,
  isEditMode,
  draftName,
  draftDescription,
  onDraftNameChange,
  onDraftDescriptionChange,
  onToggleEditMode,
  onCancelEdit,
  onSave,
  onTest,
  updateLoading,
  testLoading,
}) => {
  const { t } = useTranslation(['common', 'template']);

  return (
    <Card
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>
            {t('template:templateDetail')} - {template.name}
          </span>
          <Space>
            {isEditMode && (
              <Button onClick={onCancelEdit} disabled={updateLoading}>
                取消
              </Button>
            )}
            <Button
              type={isEditMode ? 'primary' : 'default'}
              icon={isEditMode ? <SaveOutlined /> : <EditOutlined />}
              onClick={isEditMode ? onSave : onToggleEditMode}
              loading={updateLoading}
              style={{ borderRadius: 8 }}
            >
              {isEditMode ? '保存' : '编辑'}
            </Button>
            {!isEditMode && (
              <Button
                type="primary"
                icon={<BugOutlined />}
                onClick={onTest}
                loading={testLoading}
                style={{ borderRadius: 8 }}
              >
                测试
              </Button>
            )}
          </Space>
        </Space>
      }
    >
      <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }}>
        <Descriptions.Item label={t('template:templateName')}>
          {isEditMode ? (
            <Input
              value={draftName}
              onChange={(event) => onDraftNameChange(event.target.value)}
              placeholder="模板名称"
            />
          ) : (
            template.name
          )}
        </Descriptions.Item>
        <Descriptions.Item label={t('template:templateVersion')}>
          {template.version}
        </Descriptions.Item>
        <Descriptions.Item label={t('template:templateStatus')}>
          <Tag color={getTemplateStatusColor(template.status)}>
            {t(`template:status${template.status}`)}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('common:description')} span={3}>
          {isEditMode ? (
            <Input.TextArea
              value={draftDescription}
              onChange={(event) => onDraftDescriptionChange(event.target.value)}
              rows={3}
              placeholder="补充情报"
            />
          ) : (
            template.description || '-'
          )}
        </Descriptions.Item>
        <Descriptions.Item label={t('template:createdBy')}>
          {template.created_by}
        </Descriptions.Item>
        <Descriptions.Item label={t('template:reviewedBy')}>
          {template.reviewed_by || '-'}
        </Descriptions.Item>
        <Descriptions.Item label={t('template:publishedAt')}>
          {template.published_at ? new Date(template.published_at).toLocaleString() : '-'}
        </Descriptions.Item>
        <Descriptions.Item label={t('common:createdAt')}>
          {new Date(template.created_at).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label={t('common:updatedAt')}>
          {new Date(template.updated_at).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label={t('template:deprecatedAt')}>
          {template.deprecated_at ? new Date(template.deprecated_at).toLocaleString() : '-'}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

export default TemplateDetailSummaryCard;
