import React from 'react';
import { Button, Space, Switch, Tooltip, Typography } from 'antd';
import {
  PlayCircleOutlined,
  CodeOutlined,
  RobotOutlined,
  ExperimentOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

export interface WorkflowModalFooterProps {
  forceAiGeneration: boolean;
  setForceAiGeneration: (val: boolean) => void;
  isStreamingCode: boolean;
  handleValidate: () => void;
  handleGenerateCode: () => void;
  handleOpenRealValidation: () => void;
  isStreamingRealValidation: boolean;
  generatedCode: string | null;
  setCodeModalVisible: (visible: boolean) => void;
  onCancel: (saved?: boolean) => void;
  loading?: boolean;
  saveSubmitting: boolean;
  handleSave: () => void;
}

export const WorkflowModalFooter: React.FC<WorkflowModalFooterProps> = ({
  forceAiGeneration,
  setForceAiGeneration,
  isStreamingCode,
  handleValidate,
  handleGenerateCode,
  handleOpenRealValidation,
  isStreamingRealValidation,
  generatedCode,
  setCodeModalVisible,
  onCancel,
  loading,
  saveSubmitting,
  handleSave,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'flex-end',
        alignItems: 'center',
      }}
    >
      <Space size={6} style={{ marginRight: 'auto' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          强制 AI 生成
        </Text>
        <Switch
          size="small"
          checked={forceAiGeneration}
          onChange={setForceAiGeneration}
          disabled={isStreamingCode}
        />
        <Tooltip title="开启后会跳过固定模版编译路径，即使当前 DSL 命中确定性模式，也会直接走 AI artifact 生成。">
          <InfoCircleOutlined style={{ color: 'var(--text-secondary)' }} />
        </Tooltip>
      </Space>
      <Button
        size="small"
        key="validate"
        icon={<PlayCircleOutlined />}
        onClick={handleValidate}
      >
        验证DSL
      </Button>
      <Button
        size="small"
        key="generate"
        icon={<RobotOutlined />}
        onClick={() => {
          void handleGenerateCode();
        }}
        loading={isStreamingCode}
      >
        生成并保存代码
      </Button>
      <Button
        size="small"
        key="realValidation"
        icon={<ExperimentOutlined />}
        onClick={handleOpenRealValidation}
        loading={isStreamingRealValidation}
        disabled={!generatedCode}
      >
        端到端验证
      </Button>
      <Button
        size="small"
        key="viewCode"
        icon={<CodeOutlined />}
        onClick={() => setCodeModalVisible(true)}
        disabled={!generatedCode}
      >
        查看代码
      </Button>
      <Button size="small" key="cancel" onClick={() => onCancel(false)}>
        取消
      </Button>
      <Button
        size="small"
        key="save"
        type="primary"
        loading={loading || saveSubmitting}
        disabled={loading || saveSubmitting}
        onClick={handleSave}
      >
        保存
      </Button>
    </div>
  );
};
