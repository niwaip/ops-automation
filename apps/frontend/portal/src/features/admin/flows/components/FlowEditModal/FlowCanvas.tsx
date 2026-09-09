import React from 'react';
import { Button, Tooltip, Tag, theme } from 'antd';
import {
  PlayCircleFilled,
  CheckCircleFilled,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { ExecutionFlowStep } from '@/api/flows';
import { InspectorSelection, ParamFieldItem } from './flowEditorTypes';
import { FlowNodeCard } from './FlowNodeCard';

interface FlowCanvasProps {
  steps: ExecutionFlowStep[];
  paramFields: ParamFieldItem[];
  goal?: string;
  expectedResult?: string;
  selection: InspectorSelection;
  onSelectStep: (index: number, step: ExecutionFlowStep) => void;
  onSelectStart: () => void;
  onSelectEnd: () => void;
  onSelectMeta: () => void;
  onInsertStep: (index: number) => void;
  onMoveStep: (index: number, direction: 'prev' | 'next') => void;
  onDuplicateStep: (index: number) => void;
  onDeleteStep: (index: number) => void;
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  steps,
  paramFields,
  goal,
  expectedResult,
  selection,
  onSelectStep,
  onSelectStart,
  onSelectEnd,
  onSelectMeta,
  onInsertStep,
  onMoveStep,
  onDuplicateStep,
  onDeleteStep,
}) => {
  const { token } = theme.useToken();
  const isStartSelected = selection.type === 'start';
  const isEndSelected = selection.type === 'end';
  const selectedStepIndex = selection.type === 'step' ? selection.stepIndex : -1;

  const renderConnector = (insertIndex: number) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        width: 56,
        height: 60,
        flexShrink: 0,
      }}
    >
      {/* 箭头连接线 */}
      <div
        style={{
          width: '100%',
          height: 2,
          background: `linear-gradient(90deg, ${token.colorBorder}, ${token.colorBorderSecondary})`,
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      />
      <RightOutlined
        style={{
          position: 'absolute',
          right: 2,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 10,
          color: token.colorTextTertiary,
        }}
      />

      {/* 悬停插入手柄 */}
      <Tooltip title="在此处插入新步骤" placement="top">
        <Button
          type="primary"
          shape="circle"
          size="small"
          icon={<PlusOutlined style={{ fontSize: 11 }} />}
          onClick={(e) => {
            e.stopPropagation();
            onInsertStep(insertIndex);
          }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 22,
            height: 22,
            minWidth: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            border: `2px solid ${token.colorBgContainer}`,
            zIndex: 3,
          }}
        />
      </Tooltip>
    </div>
  );

  return (
    <div
      onClick={onSelectMeta}
      style={{
        flex: 1,
        height: '100%',
        overflowX: 'auto',
        overflowY: 'auto',
        backgroundColor: token.colorBgLayout,
        backgroundImage: `radial-gradient(${token.colorBorder} 1px, transparent 1px)`,
        backgroundSize: '20px 20px',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        padding: '60px 48px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'nowrap',
          margin: 'auto 0',
          paddingBottom: 24,
        }}
      >
        {/* 起点节点: 流程输入 */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelectStart();
          }}
          style={{
            width: 190,
            borderRadius: 12,
            background: token.colorBgContainer,
            border: isStartSelected ? '2px solid #52c41a' : `1px solid ${token.colorBorder}`,
            boxShadow: isStartSelected
              ? '0 0 0 3px rgba(82, 196, 26, 0.25), 0 8px 20px rgba(0,0,0,0.12)'
              : '0 2px 8px rgba(0,0,0,0.06)',
            cursor: 'pointer',
            overflow: 'hidden',
            flexShrink: 0,
            transition: 'all 0.2s ease',
            transform: isStartSelected ? 'translateY(-2px)' : 'none',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: 'rgba(82, 196, 26, 0.15)',
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <PlayCircleFilled style={{ color: '#52c41a', fontSize: 16 }} />
            <span style={{ fontWeight: 600, fontSize: 12, color: '#52c41a' }}>流程起点 · 输入</span>
          </div>

          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: token.colorText, marginBottom: 6 }}>
              全局参数定义
            </div>
            {paramFields.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {paramFields.slice(0, 3).map((f) => (
                  <Tag key={f.key} color="green" style={{ fontSize: 10, margin: 0 }}>
                    {f.name}
                  </Tag>
                ))}
                {paramFields.length > 3 && (
                  <Tag style={{ fontSize: 10, margin: 0 }}>+{paramFields.length - 3}</Tag>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: token.colorTextTertiary }}>暂无入参（点击配置）</div>
            )}
          </div>
        </div>

        {/* 连接线到第一步 */}
        {renderConnector(0)}

        {/* 步骤节点流 */}
        {steps.map((step, index) => (
          <React.Fragment key={step.id || `step_${index}`}>
            <FlowNodeCard
              step={step}
              index={index}
              totalSteps={steps.length}
              isSelected={selectedStepIndex === index}
              onSelect={() => onSelectStep(index, step)}
              onMove={(direction) => onMoveStep(index, direction)}
              onDuplicate={() => onDuplicateStep(index)}
              onDelete={() => onDeleteStep(index)}
            />
            {renderConnector(index + 1)}
          </React.Fragment>
        ))}

        {/* 终点节点: 流程交付 */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelectEnd();
          }}
          style={{
            width: 190,
            borderRadius: 12,
            background: token.colorBgContainer,
            border: isEndSelected ? '2px solid #722ed1' : `1px solid ${token.colorBorder}`,
            boxShadow: isEndSelected
              ? '0 0 0 3px rgba(114, 46, 209, 0.25), 0 8px 20px rgba(0,0,0,0.12)'
              : '0 2px 8px rgba(0,0,0,0.06)',
            cursor: 'pointer',
            overflow: 'hidden',
            flexShrink: 0,
            transition: 'all 0.2s ease',
            transform: isEndSelected ? 'translateY(-2px)' : 'none',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: 'rgba(114, 46, 209, 0.15)',
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <CheckCircleFilled style={{ color: '#722ed1', fontSize: 16 }} />
            <span style={{ fontWeight: 600, fontSize: 12, color: '#722ed1' }}>流程终点 · 交付</span>
          </div>

          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: token.colorText, marginBottom: 4 }}>
              预期结果 & 目标
            </div>
            <div
              style={{
                fontSize: 11,
                color: token.colorTextSecondary,
                maxHeight: 34,
                lineHeight: '17px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {expectedResult || goal || '点击配置产出目标与校验标准'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
