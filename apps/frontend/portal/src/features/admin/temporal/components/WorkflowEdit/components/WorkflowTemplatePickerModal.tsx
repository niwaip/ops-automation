import React from 'react';
import { Modal, Segmented, Space, Input, Button, Card, Tag, Typography, Alert } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { CarboneTemplate } from '@/api/carbone';
import type { Template } from '@/api/template';
import type { TemplateModalMode } from '../hooks/useWorkflowDraftTemplates';

const { Text } = Typography;

export interface WorkflowTemplatePickerModalProps {
  templateModalVisible: boolean;
  onCancel: () => void;
  templateModalMode: TemplateModalMode;
  handleTemplateModeChange: (value: string | number) => void;
  templateSearch: string;
  setTemplateSearch: (val: string) => void;
  loadDocumentTemplates: () => void;
  templatesLoading: boolean;
  generatingTemplateId: string | null;
  templates: CarboneTemplate[];
  handleSelectTemplate: (template: CarboneTemplate) => void;
  browserTemplateSearch: string;
  setBrowserTemplateSearch: (val: string) => void;
  loadBrowserTemplates: () => void;
  browserTemplatesLoading: boolean;
  generatingBrowserTemplateId: string | null;
  browserTemplates: Template[];
  handleSelectBrowserTemplate: (template: Template) => void;
}

export const WorkflowTemplatePickerModal: React.FC<WorkflowTemplatePickerModalProps> = ({
  templateModalVisible,
  onCancel,
  templateModalMode,
  handleTemplateModeChange,
  templateSearch,
  setTemplateSearch,
  loadDocumentTemplates,
  templatesLoading,
  generatingTemplateId,
  templates,
  handleSelectTemplate,
  browserTemplateSearch,
  setBrowserTemplateSearch,
  loadBrowserTemplates,
  browserTemplatesLoading,
  generatingBrowserTemplateId,
  browserTemplates,
  handleSelectBrowserTemplate,
}) => {
  return (
    <Modal
      title="模版工作流"
      open={templateModalVisible}
      onCancel={onCancel}
      footer={null}
      width={900}
    >
      <div style={{ marginBottom: 12 }}>
        <Segmented
          options={[
            { label: '文档模版', value: 'document' },
            { label: '浏览器模版', value: 'browser' },
          ]}
          value={templateModalMode}
          onChange={(value) => {
            void handleTemplateModeChange(value);
          }}
        />
      </div>
      {templateModalMode === 'document' ? (
        <>
          <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
            <Input
              placeholder="搜索模版..."
              prefix={<SearchOutlined />}
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              style={{ width: 240 }}
              allowClear
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void loadDocumentTemplates();
              }}
              loading={templatesLoading}
              disabled={Boolean(generatingTemplateId)}
            >
              刷新
            </Button>
          </Space>
          <div style={{ maxHeight: 520, overflow: 'auto', paddingRight: 4 }}>
            {(templates || [])
              .filter((t) => {
                const kw = templateSearch.trim().toLowerCase();
                if (!kw) return true;
                const name = (t.fileName || '').toLowerCase();
                const id = (t.id || '').toLowerCase();
                return name.includes(kw) || id.includes(kw);
              })
              .map((t) => (
                <Card key={t.id} size="small" style={{ marginBottom: 10 }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                      <Tag
                        color={
                          t.format === 'docx' ? 'blue' : t.format === 'xlsx' ? 'green' : 'purple'
                        }
                      >
                        {t.format?.toUpperCase() || 'DOC'}
                      </Tag>
                      <Text strong>{t.fileName || t.id}</Text>
                      <Text type="secondary">ID: {t.id}</Text>
                      {t.skillId ? (
                        <Tag color="geekblue">Skill: {t.skillId}</Tag>
                      ) : (
                        <Tag>无Skill</Tag>
                      )}
                    </Space>
                    <Space>
                      <Button
                        type="primary"
                        onClick={() => {
                          void handleSelectTemplate(t);
                        }}
                        loading={generatingTemplateId === t.id}
                        disabled={Boolean(generatingTemplateId)}
                      >
                        {generatingTemplateId === t.id ? '生成中...' : '用此模版生成'}
                      </Button>
                    </Space>
                  </Space>
                </Card>
              ))}
            {(!templates || templates.length === 0) && (
              <Alert message="暂无模版，或加载失败" type="warning" showIcon />
            )}
          </div>
        </>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert
            type="info"
            showIcon
            message="请选择已生成的浏览器模版，系统将自动转换为 Browser Activity 工作流草稿"
          />
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Input
              placeholder="搜索已生成浏览器模版..."
              prefix={<SearchOutlined />}
              value={browserTemplateSearch}
              onChange={(e) => setBrowserTemplateSearch(e.target.value)}
              style={{ width: 280 }}
              allowClear
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void loadBrowserTemplates();
              }}
              loading={browserTemplatesLoading}
              disabled={Boolean(generatingBrowserTemplateId)}
            >
              刷新模版
            </Button>
          </Space>
          <div style={{ maxHeight: 280, overflow: 'auto', paddingRight: 4 }}>
            {(browserTemplates || [])
              .filter((item) => {
                const kw = browserTemplateSearch.trim().toLowerCase();
                if (!kw) return true;
                const name = String(item.name || '').toLowerCase();
                const id = String(item.id || '').toLowerCase();
                const desc = String(item.description || '').toLowerCase();
                return name.includes(kw) || id.includes(kw) || desc.includes(kw);
              })
              .map((item) => (
                <Card key={item.id} size="small" style={{ marginBottom: 8 }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                      <Tag
                        color={
                          item.status === 'PUBLISHED'
                            ? 'green'
                            : item.status === 'REVIEW'
                              ? 'gold'
                              : 'blue'
                        }
                      >
                        {item.status}
                      </Tag>
                      <Text strong>{item.name || item.id}</Text>
                      <Text type="secondary">ID: {item.id}</Text>
                      <Tag>步骤: {Array.isArray(item.steps) ? item.steps.length : 0}</Tag>
                    </Space>
                    <Button
                      type="primary"
                      onClick={() => {
                        void handleSelectBrowserTemplate(item);
                      }}
                      loading={generatingBrowserTemplateId === item.id}
                      disabled={Boolean(generatingBrowserTemplateId)}
                    >
                      {generatingBrowserTemplateId === item.id
                        ? '生成中...'
                        : '用此浏览器模版生成'}
                    </Button>
                  </Space>
                </Card>
              ))}
            {(!browserTemplates || browserTemplates.length === 0) && (
              <Alert message="暂无已生成浏览器模版，或加载失败" type="warning" showIcon />
            )}
          </div>
        </Space>
      )}
    </Modal>
  );
};
