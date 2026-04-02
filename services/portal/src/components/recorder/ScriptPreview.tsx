import React, { useState, useMemo } from 'react';
import { Card, Button, Input, Space, Typography, Empty, message, Tooltip, Alert, Modal, Form } from 'antd';
import { CopyOutlined, FileTextOutlined, EditOutlined, CheckOutlined, SwapOutlined, BulbOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;
const { TextArea } = Input;

interface CompileOptions {
  script: string;
  intent?: string;
}

interface ScriptPreviewProps {
  script: string;
  onCompile: (options: CompileOptions) => void;
  disabled?: boolean;
  status?: string;
  compiling?: boolean;
}

const ScriptPreview: React.FC<ScriptPreviewProps> = ({
  script,
  onCompile,
  disabled = false,
  status,
  compiling = false,
}) => {
  const { t } = useTranslation(['common', 'recorder']);
  const [isEditing, setIsEditing] = useState(false);
  const [editedScript, setEditedScript] = useState(script);
  const [templateName, setTemplateName] = useState('');
  const [intentModalVisible, setIntentModalVisible] = useState(false);
  const [compileIntent, setCompileIntent] = useState('');
  const [form] = Form.useForm();

  // Parse script to highlight actions
  const highlightedScript = useMemo(() => {
    if (!script) return null;

    const lines = script.split('\n');
    return lines.map((line, index) => {
      const trimmedLine = line.trim();
      let color = 'inherit';

      if (trimmedLine.startsWith('page.goto')) {
        color = '#1890ff';
      } else if (trimmedLine.startsWith('page.click') || trimmedLine.includes('.click()')) {
        color = '#52c41a';
      } else if (trimmedLine.startsWith('page.fill') || trimmedLine.includes('.fill(')) {
        color = '#faad14';
      } else if (trimmedLine.startsWith('page.waitFor') || trimmedLine.includes('waitFor')) {
        color = '#722ed1';
      } else if (trimmedLine.startsWith('page.check') || trimmedLine.includes('.check()')) {
        color = '#13c2c2';
      } else if (trimmedLine.startsWith('page.selectOption')) {
        color = '#eb2f96';
      } else if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
        color = '#8c8c8c';
      }

      return (
        <div key={index} style={{ color }}>
          <Text>{line}</Text>
        </div>
      );
    });
  }, [script]);

  const handleCopy = () => {
    navigator.clipboard.writeText(script);
    message.success(t('common:copied'));
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
    message.success(t('recorder:scriptEdited'));
  };

  const handleOpenIntentModal = () => {
    if (!script.trim()) {
      message.warning(t('recorder:noScript'));
      return;
    }
    setIntentModalVisible(true);
  };

  const handleCompileConfirm = () => {
    setIntentModalVisible(false);
    onCompile({
      script: isEditing ? editedScript : script,
      intent: compileIntent.trim() || undefined,
    });
    setCompileIntent('');
  };

  const handleCompileCancel = () => {
    setIntentModalVisible(false);
    setCompileIntent('');
  };

  const actionCount = useMemo(() => {
    if (!script) return 0;
    const actionPatterns = [
      /page\.goto/,
      /page\.click/,
      /page\.fill/,
      /\.click\(\)/,
      /\.fill\(/,
      /page\.waitFor/,
      /page\.check/,
      /page\.selectOption/,
      /getByRole/,
      /getByText/,
      /getByTestId/,
    ];
    return actionPatterns.reduce((count, pattern) => {
      const matches = script.match(pattern);
      return count + (matches?.length || 0);
    }, 0);
  }, [script]);

  return (
    <Card
      title={
        <Space>
          <FileTextOutlined />
          {t('recorder:scriptPreview')}
        </Space>
      }
      extra={
        <Space>
          <Tooltip title={t('recorder:copyScript')}>
            <Button icon={<CopyOutlined />} onClick={handleCopy} disabled={!script} />
          </Tooltip>
          {!isEditing ? (
            <Tooltip title={t('recorder:editScript')}>
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  setIsEditing(true);
                  setEditedScript(script);
                }}
                disabled={!script}
              />
            </Tooltip>
          ) : (
            <Button icon={<CheckOutlined />} onClick={handleSaveEdit} type="primary" />
          )}
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Status Info */}
        {script && (
          <Alert
            type="info"
            showIcon
            message={`${t('recorder:actionCount')}: ${actionCount}`}
          />
        )}

        {/* Template Name Input */}
        {status === 'stopped' && script && (
          <Input
            placeholder={t('recorder:templateNamePlaceholder')}
            prefix={<FileTextOutlined />}
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
        )}

        {/* Script Display */}
        {!isEditing ? (
          <div
            style={{
              background: '#f5f5f5',
              borderRadius: 4,
              padding: 12,
              maxHeight: 300,
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: 12,
            }}
          >
            {script ? (
              highlightedScript
            ) : (
              <Empty
                description={t('recorder:noScriptYet')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
          </div>
        ) : (
          <Input.TextArea
            value={editedScript}
            onChange={(e) => setEditedScript(e.target.value)}
            rows={12}
            style={{ fontFamily: 'monospace' }}
          />
        )}

        {/* Compile Button */}
        <Tooltip title={disabled ? t('recorder:compileDisabledHint') : ''}>
          <Button
            type="primary"
            size="large"
            block
            icon={<SwapOutlined />}
            onClick={handleOpenIntentModal}
            disabled={disabled || !script.trim() || compiling}
            loading={compiling}
          >
            {compiling ? t('recorder:compiling') : t('recorder:compile')}
          </Button>
        </Tooltip>
      </Space>

      {/* Intent Input Modal */}
      <Modal
        title={
          <Space>
            <BulbOutlined />
            {t('recorder:intentModal.title')}
          </Space>
        }
        open={intentModalVisible}
        onOk={handleCompileConfirm}
        onCancel={handleCompileCancel}
        okText={t('recorder:intentModal.confirm')}
        cancelText={t('recorder:intentModal.cancel')}
        confirmLoading={compiling}
      >
        <Form form={form} layout="vertical">
          <Form.Item label={t('recorder:intentModal.label')}>
            <TextArea
              rows={4}
              value={compileIntent}
              onChange={(e) => setCompileIntent(e.target.value)}
              placeholder={t('recorder:intentModal.placeholder')}
              showCount
              maxLength={500}
            />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            message={t('recorder:intentModal.hint')}
            style={{ marginTop: 8 }}
          />
        </Form>
      </Modal>
    </Card>
  );
};

export default ScriptPreview;