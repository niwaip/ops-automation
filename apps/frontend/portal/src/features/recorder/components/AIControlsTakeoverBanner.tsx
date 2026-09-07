import React from 'react';
import { Button, Collapse, Space, Tag, Typography } from 'antd';
import type { TakeoverUiState } from './AIControls.types';
import { describePatchStep, describeTakeoverCommand } from './AIControls.utils';

const { Text } = Typography;

export interface AIControlsTakeoverBannerProps {
  takeoverState: TakeoverUiState;
  isDarkTheme: boolean;
  onStartTakeover: () => void | Promise<void>;
  onStopTakeover: () => void | Promise<void>;
  onResumeAfterTakeover: () => void | Promise<void>;
  onResetTakeover: () => void;
}

export const AIControlsTakeoverBanner: React.FC<AIControlsTakeoverBannerProps> = ({
  takeoverState,
  isDarkTheme,
  onStartTakeover,
  onStopTakeover,
  onResumeAfterTakeover,
  onResetTakeover,
}) => {
  return (
    <div
      style={{
        marginBottom: 8,
        padding: '10px 12px',
        borderRadius: 10,
        background: isDarkTheme ? '#111827' : '#fff7e6',
        border: isDarkTheme ? '1px solid #374151' : '1px solid #ffe7ba',
      }}
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space wrap>
          <Tag
            color={
              takeoverState.mode === 'required'
                ? 'warning'
                : takeoverState.mode === 'recording'
                  ? 'processing'
                  : takeoverState.mode === 'reconciling'
                    ? 'blue'
                    : takeoverState.mode === 'ready_to_resume'
                      ? 'success'
                      : 'purple'
            }
          >
            {({
              idle: '空闲',
              required: '等待人工接管',
              recording: '人工接管中',
              reconciling: '生成恢复方案中',
              ready_to_resume: '可继续执行',
              resuming: '恢复执行中',
            } as Record<string, string>)[takeoverState.mode] || '接管处理中'}
          </Tag>
          {takeoverState.strategy ? (
            <Tag color="processing">{takeoverState.strategy}</Tag>
          ) : null}
          {takeoverState.patchSteps.length > 0 ? (
            <Tag>{`patchSteps: ${takeoverState.patchSteps.length}`}</Tag>
          ) : null}
        </Space>
        <Text style={{ whiteSpace: 'pre-wrap' }}>
          {takeoverState.explanation ||
            takeoverState.reason ||
            '检测到执行失败，建议进入人工接管完成补录后再恢复执行。'}
        </Text>
        {takeoverState.observation?.currentPageUrl ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            当前页面: {takeoverState.observation.currentPageUrl}
          </Text>
        ) : null}
        {takeoverState.patchSteps.length > 0 ||
        takeoverState.resumeCommands.length > 0 ? (
          <Collapse
            size="small"
            ghost
            items={[
              ...(takeoverState.patchSteps.length > 0
                ? [
                    {
                      key: 'patch-steps',
                      label: `补录步骤 (${takeoverState.patchSteps.length})`,
                      children: (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {takeoverState.patchSteps.map((step, index) => (
                            <div
                              key={`${step.id || step.action}-${index}`}
                              style={{
                                padding: '6px 8px',
                                borderRadius: 8,
                                background: isDarkTheme ? '#0b1220' : '#fff',
                                border: isDarkTheme
                                  ? '1px solid #374151'
                                  : '1px solid #f0f0f0',
                                fontSize: 12,
                              }}
                            >
                              {describePatchStep(step)}
                            </div>
                          ))}
                        </div>
                      ),
                    },
                  ]
                : []),
              ...(takeoverState.resumeCommands.length > 0
                ? [
                    {
                      key: 'resume-commands',
                      label: `恢复命令 (${takeoverState.resumeCommands.length})`,
                      children: (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {takeoverState.resumeCommands.map((command, index) => (
                            <div
                              key={`${command.tool}-${index}`}
                              style={{
                                padding: '6px 8px',
                                borderRadius: 8,
                                background: isDarkTheme ? '#0b1220' : '#fff',
                                border: isDarkTheme
                                  ? '1px solid #374151'
                                  : '1px solid #f0f0f0',
                                fontSize: 12,
                              }}
                            >
                              {describeTakeoverCommand(command)}
                            </div>
                          ))}
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        ) : null}
        <Space wrap>
          {takeoverState.mode === 'required' ? (
            <Button
              type="primary"
              onClick={() => {
                void onStartTakeover();
              }}
            >
              人工接管
            </Button>
          ) : null}
          {takeoverState.mode === 'recording' ? (
            <Button
              type="primary"
              onClick={() => {
                void onStopTakeover();
              }}
            >
              结束接管
            </Button>
          ) : null}
          {takeoverState.mode === 'ready_to_resume' ? (
            <Button
              type="primary"
              disabled={takeoverState.resumeCommands.length === 0}
              onClick={() => {
                void onResumeAfterTakeover();
              }}
            >
              继续执行
            </Button>
          ) : null}
          {takeoverState.mode !== 'recording' &&
          takeoverState.mode !== 'reconciling' &&
          takeoverState.mode !== 'resuming' ? (
            <Button onClick={onResetTakeover}>关闭</Button>
          ) : null}
        </Space>
      </Space>
    </div>
  );
};
