import React from 'react';
import {
  Button,
  Divider,
  Input,
  List,
  Modal,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import {
  CopyOutlined,
  DownloadOutlined,
  SaveOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { TemplateStep } from './AIControls.types';
import { extractParameters } from './AIControls.template';

const { Text } = Typography;

export interface TemplateSaveModalProps {
  open: boolean;
  templateName: string;
  setTemplateName: (name: string) => void;
  templateSteps: TemplateStep[];
  paramEnabled: Record<string, boolean>;
  setParamEnabled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  paramNames: Record<string, string>;
  setParamNames: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onOk: () => void | Promise<void>;
  onCancel: () => void;
}

export const TemplateSaveModal: React.FC<TemplateSaveModalProps> = ({
  open,
  templateName,
  setTemplateName,
  templateSteps,
  paramEnabled,
  setParamEnabled,
  paramNames,
  setParamNames,
  onOk,
  onCancel,
}) => {
  const extracted = extractParameters(templateSteps);
  const hasParams = Object.keys(extracted).length > 0;

  return (
    <Modal
      title="保存模版"
      open={open}
      onOk={() => {
        void onOk();
      }}
      onCancel={onCancel}
      okText="保存"
      cancelText="取消"
      width={600}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text>模版名称：</Text>
        <Input
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder={`模版 ${new Date().toLocaleString()}`}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          包含 {templateSteps.length} 个步骤
        </Text>

        {hasParams && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <Text strong>可替换参数：</Text>
            <Text
              type="secondary"
              style={{ fontSize: 11, display: 'block', marginBottom: 8 }}
            >
              修改参数名称使其更具语义化（如将 step2_value 改为 query），取消勾选可排除不需要替换的参数
            </Text>
            <List
              size="small"
              bordered
              dataSource={Object.entries(extracted)}
              renderItem={([originalName, schema]) => (
                <List.Item style={{ padding: '8px 12px' }}>
                  <Space direction="vertical" style={{ width: '100%' }} size={4}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Switch
                        size="small"
                        checked={paramEnabled[originalName] !== false}
                        onChange={(checked) => {
                          setParamEnabled((prev) => ({ ...prev, [originalName]: checked }));
                        }}
                      />
                      <Text code style={{ fontSize: 11 }}>
                        {originalName}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        →
                      </Text>
                      <Input
                        size="small"
                        value={paramNames[originalName] || originalName}
                        onChange={(e) => {
                          setParamNames((prev) => ({
                            ...prev,
                            [originalName]: e.target.value,
                          }));
                        }}
                        style={{ width: 120 }}
                        placeholder="参数名"
                      />
                    </Space>
                    <Space>
                      <Tag color="blue">{schema.type}</Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        默认值: {String(schema.default || '-')}
                      </Text>
                    </Space>
                  </Space>
                </List.Item>
              )}
            />
          </>
        )}
      </Space>
    </Modal>
  );
};

export interface CompiledScriptModalProps {
  open: boolean;
  templateName: string;
  setTemplateName: (name: string) => void;
  templateSteps: TemplateStep[];
  compiledScript: string;
  onCopyScript: () => void;
  onDownloadScript: () => void;
  onSaveTemplate: () => void | Promise<void>;
  onCancel: () => void;
}

export const CompiledScriptModal: React.FC<CompiledScriptModalProps> = ({
  open,
  templateName,
  setTemplateName,
  templateSteps,
  compiledScript,
  onCopyScript,
  onDownloadScript,
  onSaveTemplate,
  onCancel,
}) => {
  return (
    <Modal
      title="编译后的脚本"
      open={open}
      onCancel={onCancel}
      width={700}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={onCopyScript}>
          复制
        </Button>,
        <Button key="download" icon={<DownloadOutlined />} onClick={onDownloadScript}>
          下载
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          onClick={() => {
            void onSaveTemplate();
          }}
        >
          保存模版
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
        <Text>模版名称：</Text>
        <Input
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder={`编译模版 ${new Date().toLocaleString()}`}
          style={{ marginBottom: 8 }}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          包含 {templateSteps.length} 个步骤，可修改参数后保存
        </Text>
      </Space>
      <pre
        style={{
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-color)',
          padding: 16,
          borderRadius: 8,
          maxHeight: 400,
          overflow: 'auto',
          fontSize: 12,
        }}
      >
        {compiledScript}
      </pre>
    </Modal>
  );
};

export interface RollbackConfirmationModalProps {
  rollbackConfirmation: {
    message: string;
    sideEffects: Array<{
      executionIndex: number;
      description: string;
      classifiedLevel: string;
    }>;
  } | null;
  rollbackLoading: boolean;
  isDarkTheme: boolean;
  t: (key: string) => string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const RollbackConfirmationModal: React.FC<RollbackConfirmationModalProps> = ({
  rollbackConfirmation,
  rollbackLoading,
  isDarkTheme,
  t,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      open={rollbackConfirmation !== null}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <WarningOutlined style={{ color: '#faad14' }} />
          {t('recorder:ai.rollbackConfirmTitle') || '撤销确认'}
        </span>
      }
      okText={t('recorder:ai.rollbackConfirmOk') || '确认撤销'}
      cancelText={t('recorder:ai.rollbackConfirmCancel') || '取消'}
      okButtonProps={{ danger: true, loading: rollbackLoading }}
      onCancel={onCancel}
      onOk={() => {
        void onConfirm();
      }}
    >
      {rollbackConfirmation && (
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 12px' }}>{rollbackConfirmation.message}</p>
          <div
            style={{
              background: isDarkTheme ? '#1e293b' : '#fff7e6',
              border: `1px solid ${isDarkTheme ? '#475569' : '#ffe58f'}`,
              borderRadius: 6,
              padding: '8px 12px',
              marginBottom: 12,
            }}
          >
            <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
              {t('recorder:ai.rollbackSideEffects') || '受影响的后端持久化操作：'}
            </Typography.Text>
            {rollbackConfirmation.sideEffects.map((se, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '2px 0',
                }}
              >
                <span>
                  <Tag color="red" style={{ marginRight: 6 }}>
                    #{se.executionIndex}
                  </Tag>
                  {se.description}
                </span>
                <Tag color="orange">{se.classifiedLevel}</Tag>
              </div>
            ))}
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('recorder:ai.rollbackWarningNote') ||
              '浏览器回退不会撤销这些后端操作。如需撤销，请手动处理后端状态或联系管理员。'}
          </Typography.Text>
        </div>
      )}
    </Modal>
  );
};
