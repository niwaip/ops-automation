import type { StageType } from '@/api/orgWorkflow';

export type InspectorSelection =
  | { type: 'stage'; stageIndex: number; stageId: string }
  | { type: 'global' };

export type EditorViewMode = 'canvas' | 'list';

export interface StagePaletteItem {
  type: StageType;
  name: string;
  description: string;
  color: string;
  defaultApproverRule?: 'leader' | 'role' | 'assignee' | 'specific_user' | 'department';
}

export const STAGE_TYPE_CONFIG: Record<
  StageType,
  {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    description: string;
    defaultTrigger: 'on_submit' | 'on_stage_approval' | 'on_approve' | 'on_complete';
  }
> = {
  submission: {
    label: '提单申请',
    color: '#1677ff',
    bgColor: 'rgba(22, 119, 255, 0.08)',
    borderColor: '#91caff',
    description: '申请人填写业务参数或上传草案',
    defaultTrigger: 'on_submit',
  },
  approval: {
    label: '人工审批',
    color: '#fa8c16',
    bgColor: 'rgba(250, 140, 22, 0.08)',
    borderColor: '#ffd591',
    description: '主管、法务或指定专员核准与批注',
    defaultTrigger: 'on_stage_approval',
  },
  automation: {
    label: '自动执行',
    color: '#722ed1',
    bgColor: 'rgba(114, 46, 209, 0.08)',
    borderColor: '#d3adf7',
    description: '审批通过后自动触发底层流或系统对接',
    defaultTrigger: 'on_approve',
  },
  archive: {
    label: '凭证归档',
    color: '#52c41a',
    bgColor: 'rgba(82, 196, 26, 0.08)',
    borderColor: '#b7eb8f',
    description: '电子归档并向发起人推送流转结项回执',
    defaultTrigger: 'on_complete',
  },
};
