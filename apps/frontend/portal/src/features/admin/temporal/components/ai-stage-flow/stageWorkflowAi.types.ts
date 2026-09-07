import type { StageWorkflowDraft, StageFlowMode, StageType } from '@/api/orgWorkflow';

export interface StageAiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  draft?: StageWorkflowDraft;
  timestamp: number;
}

export interface QuickPreset {
  label: string;
  mode: StageFlowMode;
  stageType: StageType;
  prompt: string;
  desc: string;
}

export const QUICK_STAGE_FLOW_PRESETS: QuickPreset[] = [
  {
    label: 'HRMS 考勤额度扣减 API',
    mode: 'api',
    stageType: 'automation',
    prompt: '请假审批通过后，调用人事系统 API 接口扣减假期额度，需要认证 HRMS_KEY 并写入考勤流水',
    desc: '方式一：Step 1 认证 Key Activity + Step 2 HTTP POST 扣减接口',
  },
  {
    label: 'ERP 费用凭证自动写入 API',
    mode: 'api',
    stageType: 'automation',
    prompt: '报销审批通过后，调用 ERP 凭证接口生成记账凭证，需要 Bearer Token 验签并提交报销明细',
    desc: '方式一：Step 1 获取 Bearer 凭证 + Step 2 HTTP PUT/POST 凭证接口',
  },
  {
    label: '浏览器 OA 自动登入与填单',
    mode: 'browser_template',
    stageType: 'automation',
    prompt: '通过已录制好的企业 OA 浏览器模版填报请假申请单，登录密码通过保存的保险箱秘钥自动代填',
    desc: '方式二：调用浏览器录制模版 + 映射表单字段 + 秘钥安全代填口令',
  },
  {
    label: '员工请假提单与经办流',
    mode: 'api',
    stageType: 'submission',
    prompt: '创建请假申请提单工作流，必须包含申请人、经办承办担当 (@handler)、假期类型和起止时限',
    desc: '方式一：规范提单经办责任，前置校验配额并锁定审批链路',
  },
];
