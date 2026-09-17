import React, { useState } from 'react';
import { theme } from 'antd';
import type {
  WorkflowStageDefinition,
  AssembledBaseWorkflow,
  AvailableBaseWorkflowItem,
  StageType,
} from '@/api/orgWorkflow';
import { InspectorSelection, STAGE_TYPE_CONFIG } from './orgVisualEditor.types';
import { OrgWorkflowPalette } from './OrgWorkflowPalette';
import { OrgWorkflowCanvas } from './OrgWorkflowCanvas';
import { OrgStageInspector } from './OrgStageInspector';

interface OrgWorkflowVisualEditorProps {
  stages: WorkflowStageDefinition[];
  assembledWorkflows: AssembledBaseWorkflow[];
  availableWorkflows: AvailableBaseWorkflowItem[];
  onChangeStages: (stages: WorkflowStageDefinition[]) => void;
  onChangeAssembledWorkflows: (items: AssembledBaseWorkflow[]) => void;
}

export const OrgWorkflowVisualEditor: React.FC<OrgWorkflowVisualEditorProps> = ({
  stages,
  assembledWorkflows,
  availableWorkflows,
  onChangeStages,
  onChangeAssembledWorkflows,
}) => {
  const { token } = theme.useToken();
  const [selection, setSelection] = useState<InspectorSelection>({
    type: stages.length > 0 ? 'stage' : 'global',
    stageIndex: 0,
    stageId: stages[0]?.id || '',
  } as InspectorSelection);

  const selectedStage =
    selection.type === 'stage'
      ? stages[selection.stageIndex] || stages.find((s) => s.id === selection.stageId) || null
      : null;

  // 添加新阶段（追加到末尾）
  const handleAddStage = (type: StageType) => {
    const id = `stage_${Date.now()}`;
    const cfg = STAGE_TYPE_CONFIG[type];
    const newStage: WorkflowStageDefinition = {
      id,
      name: `${cfg.label}节点`,
      type,
      description: cfg.description,
      approverRule: type === 'approval' ? 'department' : undefined,
      approverDepartment: type === 'approval' ? '法务部' : undefined,
      rollbackStageId: type === 'approval' ? 'draft_submission' : undefined,
      actions: type === 'approval' ? ['approve', 'reject'] : undefined,
    };

    const nextStages = [...stages, newStage];
    onChangeStages(nextStages);
    setSelection({
      type: 'stage',
      stageIndex: nextStages.length - 1,
      stageId: id,
    });
  };

  // 连接线处快捷插入新阶段
  const handleInsertStage = (insertIndex: number) => {
    const id = `stage_${Date.now()}`;
    const newStage: WorkflowStageDefinition = {
      id,
      name: '新增审批协同阶段',
      type: 'approval',
      description: '相关职能部门审查与复核批注',
      approverRule: 'department',
      approverDepartment: '法务部',
      rollbackStageId: 'draft_submission',
      actions: ['approve', 'reject'],
    };

    const nextStages = [...stages];
    nextStages.splice(insertIndex, 0, newStage);
    onChangeStages(nextStages);
    setSelection({
      type: 'stage',
      stageIndex: insertIndex,
      stageId: id,
    });
  };

  // 删除阶段
  const handleDeleteStage = (index: number) => {
    const nextStages = stages.filter((_, idx) => idx !== index);
    onChangeStages(nextStages);

    if (nextStages.length > 0) {
      const nextIdx = Math.max(0, index - 1);
      setSelection({
        type: 'stage',
        stageIndex: nextIdx,
        stageId: nextStages[nextIdx].id,
      });
    } else {
      setSelection({ type: 'global' });
    }
  };

  // 移动阶段位置
  const handleMoveStage = (index: number, direction: 'prev' | 'next') => {
    const targetIdx = direction === 'prev' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= stages.length) return;

    const nextStages = [...stages];
    const current = nextStages[index];
    nextStages[index] = nextStages[targetIdx];
    nextStages[targetIdx] = current;

    onChangeStages(nextStages);
    setSelection({
      type: 'stage',
      stageIndex: targetIdx,
      stageId: current.id,
    });
  };

  // 更新选中阶段属性
  const handleUpdateStage = (patch: Partial<WorkflowStageDefinition>) => {
    if (selection.type !== 'stage') return;
    const nextStages = [...stages];
    const idx = selection.stageIndex;
    if (nextStages[idx]) {
      nextStages[idx] = { ...nextStages[idx], ...patch };
      onChangeStages(nextStages);
    }
  };

  // 将底层基础流投放组装到特定阶段
  const handleDropBaseWorkflow = (stageIndex: number, baseId: string) => {
    const targetStage = stages[stageIndex];
    if (!targetStage) return;

    const base = availableWorkflows.find((w) => w.id === baseId);
    if (!base) return;

    // 检查是否已组装
    if (assembledWorkflows.some((w) => w.refId === base.id)) return;

    const trigger = STAGE_TYPE_CONFIG[targetStage.type]?.defaultTrigger || 'on_approve';
    const newAssembled: AssembledBaseWorkflow = {
      type: base.type,
      refId: base.id,
      name: base.name,
      triggerEvent: trigger,
      description: base.description || '协同流转中自动触发',
      stageType: targetStage.type,
      stageId: targetStage.id,
      handlerRule: base.handlerRule,
      requiredMetadata: base.requiredMetadata,
    };

    onChangeAssembledWorkflows([...assembledWorkflows, newAssembled]);
  };

  // 解绑底层流
  const handleRemoveAssembled = (refId: string) => {
    onChangeAssembledWorkflows(assembledWorkflows.filter((w) => w.refId !== refId));
  };

  // 更新底层流触发时机
  const handleUpdateAssembledTrigger = (
    refId: string,
    trigger: 'on_submit' | 'on_stage_approval' | 'on_approve' | 'on_complete'
  ) => {
    onChangeAssembledWorkflows(
      assembledWorkflows.map((w) => (w.refId === refId ? { ...w, triggerEvent: trigger } : w))
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        height: '100%',
        minHeight: 'calc(100vh - 160px)',
        width: '100%',
        borderRadius: 8,
        border: `1px solid ${token.colorBorderSecondary}`,
        overflow: 'hidden',
        background: token.colorBgContainer,
      }}
    >
      {/* 左侧：物料库 */}
      <OrgWorkflowPalette
        availableWorkflows={availableWorkflows}
        onAddStage={handleAddStage}
      />

      {/* 中间：画布 */}
      <OrgWorkflowCanvas
        stages={stages}
        assembledWorkflows={assembledWorkflows}
        selectedStageId={selectedStage?.id || null}
        onSelectStage={(idx, stage) => {
          setSelection({
            type: 'stage',
            stageIndex: idx,
            stageId: stage.id,
          });
        }}
        onDeselect={() => setSelection({ type: 'global' })}
        onDeleteStage={handleDeleteStage}
        onMoveStage={handleMoveStage}
        onInsertStage={handleInsertStage}
        onDropBaseWorkflow={handleDropBaseWorkflow}
        onRemoveAssembled={handleRemoveAssembled}
      />

      {/* 右侧：检视器 */}
      <OrgStageInspector
        selectedStage={selectedStage}
        allStages={stages}
        assembledWorkflows={assembledWorkflows}
        onUpdateStage={handleUpdateStage}
        onRemoveAssembled={handleRemoveAssembled}
        onUpdateAssembledTrigger={handleUpdateAssembledTrigger}
        onDeselect={() => setSelection({ type: 'global' })}
      />
    </div>
  );
};
