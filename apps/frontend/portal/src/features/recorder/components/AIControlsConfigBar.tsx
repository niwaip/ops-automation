import React from 'react';
import { Collapse, Space, Switch, Radio, InputNumber, Button, Typography } from 'antd';
import { RobotOutlined, VideoCameraOutlined } from '@ant-design/icons';
import type { ExecutionBackend } from './AIControls.types';

const { Text } = Typography;

export interface AIControlsConfigBarProps {
  isAIMode: boolean;
  setIsAIMode: (val: boolean) => void;
  executionBackend: ExecutionBackend;
  handleExecutionBackendChange: (nextBackend: ExecutionBackend) => void | Promise<void>;
  backendButtonLabels: Record<ExecutionBackend, string>;
  isReactChatMode: boolean;
  setIsReactChatMode: (val: boolean) => void;
  waitDuration: number;
  setWaitDuration: (val: number) => void;
  autoAppendScreenshots: boolean;
  setAutoAppendScreenshots: (val: boolean) => void;
}

export const AIControlsConfigBar: React.FC<AIControlsConfigBarProps> = ({
  isAIMode,
  setIsAIMode,
  executionBackend,
  handleExecutionBackendChange,
  backendButtonLabels,
  isReactChatMode,
  setIsReactChatMode,
  waitDuration,
  setWaitDuration,
  autoAppendScreenshots,
  setAutoAppendScreenshots,
}) => {
  return (
    <Collapse
      size="small"
      ghost
      items={[
        {
          key: 'settings',
          label: <Text type="secondary" style={{ fontSize: 12 }}>高级配置</Text>,
          children: (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
                padding: '0 4px',
              }}
            >
              <Space size={6} wrap>
                <Switch
                  size="small"
                  checked={isAIMode}
                  onChange={setIsAIMode}
                  checkedChildren={
                    <>
                      <RobotOutlined /> AI
                    </>
                  }
                  unCheckedChildren={
                    <>
                      <VideoCameraOutlined /> 手动
                    </>
                  }
                />
                <Radio.Group
                  value={executionBackend}
                  onChange={(e) => {
                    void handleExecutionBackendChange(e.target.value as ExecutionBackend);
                  }}
                  size="small"
                  optionType="button"
                  buttonStyle="solid"
                >
                  <Radio.Button value="cli" style={{ fontSize: 12, padding: '0 4px' }}>
                    {backendButtonLabels.cli === 'Playwright CLI' ? 'PW' : backendButtonLabels.cli}
                  </Radio.Button>
                  <Radio.Button value="chrome-devtools" style={{ fontSize: 12, padding: '0 4px' }}>
                    {backendButtonLabels['chrome-devtools'] === 'Chrome DevTools CLI'
                      ? 'CDT'
                      : backendButtonLabels['chrome-devtools']}
                  </Radio.Button>
                </Radio.Group>
                {isAIMode && (
                  <Space size={2}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      模式
                    </Text>
                    <Switch
                      size="small"
                      checked={isReactChatMode}
                      onChange={setIsReactChatMode}
                      checkedChildren="对话"
                      unCheckedChildren="单步"
                    />
                  </Space>
                )}
              </Space>

              <Space size={6} wrap>
                <Space size={2}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    等待
                  </Text>
                  <Space.Compact>
                    <InputNumber
                      size="small"
                      min={0.5}
                      max={120}
                      step={0.5}
                      value={waitDuration}
                      onChange={(val) => setWaitDuration(val ?? 0.5)}
                      style={{ width: 50, fontSize: 12 }}
                    />
                    <Button size="small" disabled style={{ padding: '0 4px' }}>
                      s
                    </Button>
                  </Space.Compact>
                </Space>
                <Space size={2}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    截图
                  </Text>
                  <Switch
                    size="small"
                    checked={autoAppendScreenshots}
                    onChange={setAutoAppendScreenshots}
                  />
                </Space>
              </Space>
            </div>
          ),
        },
      ]}
    />
  );
};
