import React, { useState } from 'react';
import { Modal, Button, Space, Typography, Tag, message, theme } from 'antd';
import {
  CodeOutlined,
  CopyOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { temporalWorkflowApi } from '@/api/temporal';
import type { AvailableBaseWorkflowItem } from '@/api/orgWorkflow';

const { Text } = Typography;

interface ProcessStageCodeModalProps {
  visible: boolean;
  workflow: AvailableBaseWorkflowItem | null;
  onClose: () => void;
  onCodeUpdated?: (newCode: string) => void;
}

export const ProcessStageCodeModal: React.FC<ProcessStageCodeModalProps> = ({
  visible,
  workflow,
  onClose,
  onCodeUpdated,
}) => {
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string>(workflow?.generatedCode || '');

  React.useEffect(() => {
    if (workflow) {
      setCode(workflow.generatedCode || '');
    }
  }, [workflow]);

  if (!workflow) return null;

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    message.success('代码已复制到剪贴板');
  };

  const handleRegenerate = async () => {
    if (!workflow.workflowDsl) {
      message.warning('该工作流暂无 DSL 规范，无法重新生成代码');
      return;
    }
    setLoading(true);
    try {
      const res = await temporalWorkflowApi.generateWorkflowCode(
        workflow.workflowDsl,
        workflow.activityDsl || { activities: [] }
      );
      if (res.code) {
        setCode(res.code);
        onCodeUpdated?.(res.code);
        message.success('已重新生成最新的 Python/Temporal 生产代码！');
      } else {
        message.warning(res.error || '代码生成未返回内容');
      }
    } catch (err: any) {
      message.error(`代码生成失败: ${err?.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      width={860}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
          <Space>
            <CodeOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
            <span>【{workflow.name}】生产工作流源码</span>
            <Tag color="cyan">Python / Temporal</Tag>
          </Space>
          <Space>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={handleRegenerate}
            >
              重新生成代码
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<CopyOutlined />}
              disabled={!code}
              onClick={handleCopy}
            >
              复制代码
            </Button>
          </Space>
        </div>
      }
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]}
    >
      <div style={{ margin: '8px 0 12px' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          工作流代号：<code>{workflow.id}</code> | 阶段：<code>{workflow.stageType || '通用'}</code> | 担当规则：{workflow.handlerRule || '后台自动'}
        </Text>
      </div>

      {code ? (
        <pre
          style={{
            margin: 0,
            padding: 16,
            borderRadius: 8,
            backgroundColor: token.colorFillAlter,
            border: `1px solid ${token.colorBorderSecondary}`,
            fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
            fontSize: 12,
            lineHeight: 1.6,
            maxHeight: 520,
            overflowY: 'auto',
            color: token.colorText,
          }}
        >
          <code>{code}</code>
        </pre>
      ) : (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            backgroundColor: token.colorFillAlter,
            borderRadius: 8,
            border: `1px dashed ${token.colorBorderSecondary}`,
          }}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            暂未生成 Python 执行代码
          </Text>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={loading}
            onClick={handleRegenerate}
          >
            立即生成端对端生产代码
          </Button>
        </div>
      )}
    </Modal>
  );
};
