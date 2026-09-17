import React from 'react';
import { Button, Tooltip, Tag, theme } from 'antd';
import {
  PlayCircleFilled,
  CheckCircleFilled,
  PlusOutlined,
  RightOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import type {
  WorkflowStageDefinition,
  AssembledBaseWorkflow,
} from '@/api/orgWorkflow';
import { OrgStageNodeCard } from './OrgStageNodeCard';

interface OrgWorkflowCanvasProps {
  stages: WorkflowStageDefinition[];
  assembledWorkflows: AssembledBaseWorkflow[];
  selectedStageId: string | null;
  onSelectStage: (index: number, stage: WorkflowStageDefinition) => void;
  onDeselect: () => void;
  onDeleteStage: (index: number) => void;
  onMoveStage: (index: number, direction: 'prev' | 'next') => void;
  onInsertStage: (index: number) => void;
  onDropBaseWorkflow: (stageIndex: number, baseId: string) => void;
  onRemoveAssembled: (refId: string) => void;
}

export const OrgWorkflowCanvas: React.FC<OrgWorkflowCanvasProps> = ({
  stages,
  assembledWorkflows,
  selectedStageId,
  onSelectStage,
  onDeselect,
  onDeleteStage,
  onMoveStage,
  onInsertStage,
  onDropBaseWorkflow,
  onRemoveAssembled,
}) => {
  const { token } = theme.useToken();

  const renderConnector = (insertIndex: number, precedingStage?: WorkflowStageDefinition) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        width: 72,
        height: 120,
        flexShrink: 0,
      }}
    >
      {/* 箭头连接主线 */}
      <div
        style={{
          width: '100%',
          height: 2,
          background: `linear-gradient(90deg, ${token.colorBorder}, ${token.colorPrimary})`,
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
          fontSize: 11,
          color: token.colorPrimary,
        }}
      />

      {/* 审批阶段通过说明 */}
      {precedingStage?.type === 'approval' && (
        <span
          style={{
            position: 'absolute',
            top: '25%',
            fontSize: 10,
            color: token.colorSuccess,
            background: token.colorBgContainer,
            padding: '1px 4px',
            borderRadius: 4,
            border: `1px solid ${token.colorSuccessBorder}`,
            whiteSpace: 'nowrap',
          }}
        >
          通过核准
        </span>
      )}

      {/* 悬停插入手柄 */}
      <Tooltip title="在此处插入新阶段节点" placement="top">
        <Button
          type="primary"
          shape="circle"
          size="small"
          icon={<PlusOutlined style={{ fontSize: 11 }} />}
          onClick={(e) => {
            e.stopPropagation();
            onInsertStage(insertIndex);
          }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 24,
            height: 24,
            minWidth: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            border: `2px solid ${token.colorBgContainer}`,
            zIndex: 4,
          }}
        />
      </Tooltip>
    </div>
  );

  // 检查是否有驳回回退连线需要可视化
  const rollbackStages = stages.filter(
    (s) => s.type === 'approval' && s.rollbackStageId
  );

  return (
    <div
      onClick={onDeselect}
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
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px 48px',
        minWidth: 0,
      }}
    >
      {/* 顶部驳回回退指示横幅 */}
      {rollbackStages.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 48,
            right: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '6px 14px',
            borderRadius: 8,
            background: 'rgba(255, 77, 79, 0.08)',
            border: '1px dashed #ffa39e',
            fontSize: 12,
            color: '#cf1322',
          }}
        >
          <RollbackOutlined style={{ fontSize: 14 }} />
          <span>
            <strong>智能逆向回退环路已激活：</strong>
            {rollbackStages.map((s) => (
              <Tag key={s.id} color="volcano" style={{ marginLeft: 6 }}>
                [{s.name}] 审核不通过 ↩ 原路退回发起员工修改继续流转
              </Tag>
            ))}
          </span>
        </div>
      )}

      {/* 阶段卡片横向主轴 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'nowrap',
          margin: 'auto 0',
          paddingBottom: 24,
        }}
      >
        {/* 起点节点 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: 88,
            height: 88,
            borderRadius: '50%',
            background: token.colorBgContainer,
            border: `2px solid ${token.colorSuccess}`,
            boxShadow: '0 4px 12px rgba(82, 196, 26, 0.15)',
            flexShrink: 0,
            textAlign: 'center',
          }}
        >
          <PlayCircleFilled style={{ fontSize: 24, color: token.colorSuccess, marginBottom: 2 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: token.colorText }}>流程发起</span>
        </div>

        {/* 初始连接线 */}
        {renderConnector(0)}

        {/* 阶段节点列表 */}
        {stages.map((stage, idx) => {
          const isSelected = selectedStageId === stage.id;
          const stageAssembled = assembledWorkflows.filter((w) => {
            if (w.stageId) {
              return w.stageId === stage.id;
            }
            return w.stageType === stage.type || (!w.stageType && stage.type === 'automation');
          });

          return (
            <React.Fragment key={stage.id || idx}>
              <OrgStageNodeCard
                stage={stage}
                index={idx}
                totalCount={stages.length}
                isSelected={isSelected}
                assembledItems={stageAssembled}
                onSelect={() => onSelectStage(idx, stage)}
                onDelete={() => onDeleteStage(idx)}
                onMove={(dir) => onMoveStage(idx, dir)}
                onDropBaseWorkflow={(baseId) => onDropBaseWorkflow(idx, baseId)}
                onRemoveAssembled={onRemoveAssembled}
              />

              {/* 连接线 */}
              {renderConnector(idx + 1, stage)}
            </React.Fragment>
          );
        })}

        {/* 终点节点 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: 88,
            height: 88,
            borderRadius: '50%',
            background: token.colorBgContainer,
            border: `2px solid ${token.colorTextSecondary}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            flexShrink: 0,
            textAlign: 'center',
          }}
        >
          <CheckCircleFilled style={{ fontSize: 24, color: token.colorTextSecondary, marginBottom: 2 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: token.colorText }}>办结归档</span>
        </div>
      </div>
    </div>
  );
};
