import type { OrganizationWorkflowDTO } from '@/api/orgWorkflow';

export interface PresetWorkflowTemplateItem {
  id: string;
  name: string;
  category: string;
  categoryName: string;
  icon: string;
  description: string;
  recommendedScenario: string;
  workflow: Partial<OrganizationWorkflowDTO>;
}

export const PRESET_WORKFLOW_TEMPLATES: PresetWorkflowTemplateItem[] = [
  {
    id: 'legal.nda.generation_and_review_flow',
    name: '保密合同起草与法务审查闭环流',
    category: 'legal',
    categoryName: '法务风控',
    icon: 'SafetyCertificateOutlined',
    description: '通过专属保密合同生成技能 (ConfidentialityAgreementGenerationWorkflow) 提取要件生成初稿，流转法务部审查批注，通过后归档存证，驳回退回重修。',
    recommendedScenario: '商业保密协议(NDA)、项目合作保密承诺、反泄密协议起草与法务把关',
    workflow: {
      workflowId: 'legal.nda.generation_and_review_flow',
      name: '保密合同起草与法务审查闭环流',
      description: '调用专属保密合同生成技能提取双方主体、合作主题、保密年限等要素生成草案，流转法务部门专项审查与批注。通过后自动归档，未通过则回退重修。',
      category: 'legal',
      icon: 'SafetyCertificateOutlined',
      taskType: 'approval',
      status: 'published',
      isPublished: true,
      version: '1.0.0',
      assembledWorkflows: [
        {
          type: 'skill',
          refId: 'ConfidentialityAgreementGenerationWorkflow',
          name: '商业保密协议(NDA)智能生成技能',
          triggerEvent: 'on_submit',
          stageType: 'submission',
          stageId: 'draft_submission',
          description: '根据双方主体、保密期限、商业合作主题等要件生成标准保密合同草案。',
          handlerRule: '员工提报后由专属保密合同生成技能输出标准初稿草案',
        },
        {
          type: 'skill',
          refId: 'platform.document.contract-reviewer',
          name: '合同文档智能审查与合规诊断',
          triggerEvent: 'on_stage_approval',
          stageType: 'automation',
          stageId: 'contract_review_execution',
          description: '担当确认后自动调用 contract-review 规则库排查永久保密陷阱、除外责任及违约条款，输出审查报告。',
          handlerRule: '初稿提报后由 AI 辅助法务提取风险要件并附带保密专项审查批注建议',
        },
        {
          type: 'skill',
          refId: 'platform.document.pdf-create',
          name: '防篡改电子凭证与归档存证',
          triggerEvent: 'on_stage_approval',
          stageType: 'automation',
          stageId: 'auto_archiving',
          description: '法务审核通过后自动生成不可篡改标准 PDF 版本并固化存证。',
          handlerRule: '法务通过后自动渲染防篡改版电子凭据',
        },
        {
          type: 'skill',
          refId: 'platform.notification.internal-message',
          name: '全渠道协同消息与归档通知',
          triggerEvent: 'on_complete',
          stageType: 'archive',
          stageId: 'final_receipt',
          description: '流程闭环后向发起员工与法务专员推送企业微信/邮件办结凭证。',
          handlerRule: '流程全环节结项通知',
        },
      ],
      processDefinition: {
        stages: [
          {
            id: 'draft_submission',
            name: '商务填报与初稿生成',
            type: 'submission',
            description: '调用专属保密合同生成技能 (ConfidentialityAgreementGenerationWorkflow) 提取主体、保密期限等要件输出初稿',
            isLocked: false,
          },
          {
            id: 'initiator_confirm',
            name: '业务担当初稿确认',
            type: 'approval',
            description: '调用专属技能生成初稿后，由业务担当查看并核对生成的内容与条款要素，确认通过后提交合同审查',
            approverRule: 'initiator',
            rollbackStageId: 'draft_submission',
            actions: ['approve', 'reject'],
            isLocked: true,
          },
          {
            id: 'contract_review_execution',
            name: '合同合规智能审查',
            type: 'automation',
            capabilityId: 'platform.document.contract-reviewer',
            config: {
              contractType: 'nda',
              myPosition: 'buyer',
            },
            description: '担当确认后自动调用 contract-review 规则库排查永久保密陷阱、除外责任及违约条款，输出审查报告',
            isLocked: true,
          },
          {
            id: 'legal_review',
            name: '法务合规核准与确认',
            type: 'approval',
            description: '法务专员结合初稿与智能审查报告进行专业把关与批注，通过后归档存证，未通过回退担当重修',
            approverRule: 'department',
            approverDepartment: '法务部',
            rollbackStageId: 'initiator_confirm',
            actions: ['approve', 'reject'],
            isLocked: true,
          },
          {
            id: 'auto_archiving',
            name: '电子归档与版本存证',
            type: 'automation',
            description: '法务确认通过后自动生成不可篡改版本并归档存证入企业合同库',
            isLocked: true,
          },
          {
            id: 'final_receipt',
            name: '回执通知与办结',
            type: 'archive',
            description: '向业务担当与法务专员推送归档结项回执并闭环流转',
            isLocked: false,
          },
        ],
      },
      paramsSchema: {
        properties: {
          counterpartyName: {
            type: 'string',
            description: '接收方/相对方企业全称 (Party B)',
            required: true,
          },
          cooperationSubject: {
            type: 'string',
            description: '保密合作业务主题/范围',
            required: true,
          },
          durationYears: {
            type: 'number',
            description: '保密义务年限（年）',
            required: true,
            default: 3,
          },
          myPosition: {
            type: 'string',
            description: '我方立场策略',
            required: true,
            enum: ['buyer', 'seller', 'neutral'],
            default: 'buyer',
          },
          penaltyAmount: {
            type: 'number',
            description: '违约金约定金额（元）',
            required: false,
          },
          remarks: {
            type: 'string',
            description: '特殊商务诉求或保密说明',
            required: false,
          },
        },
        required: ['counterpartyName', 'cooperationSubject', 'myPosition'],
      },
      grantedRoleIds: ['employee', 'admin', 'legal'],
    },
  },
  {
    id: 'legal.contract.review_flow',
    name: '标准合同起草与法务审查闭环流',
    category: 'legal',
    categoryName: '法务风控',
    icon: 'SafetyCertificateOutlined',
    description: '普通员工在线填报保密协议(NDA)或商业合同初稿，流转至法务部进行审查批注。通过后自动归档存证并通知员工，未通过则退回修改。',
    recommendedScenario: '保密协议(NDA)、软件定制、采购协议、各类日常商业合同审查',
    workflow: {
      workflowId: 'legal.contract.review_flow',
      name: '标准合同起草与法务审查闭环流',
      description: '员工在线填报商务要素生成合同初稿，自动流转至法务部门进行智能要件审查与人工批注。通过后自动归档并通知员工，未通过则回退重修。',
      category: 'legal',
      icon: 'SafetyCertificateOutlined',
      taskType: 'approval',
      status: 'published',
      isPublished: true,
      version: '1.0.0',
      assembledWorkflows: [
        {
          type: 'skill',
          refId: 'platform.document.pdf-create',
          name: '合同标准 PDF 转换与电子印鉴处理',
          triggerEvent: 'on_stage_approval',
          stageType: 'automation',
          description: '自动化将起草表单与条款要素渲染为标准 PDF 格式合同并固化防篡改印章。',
          handlerRule: '合同初审通过后自动渲染防篡改版电子凭据',
        },
        {
          type: 'skill',
          refId: 'platform.document.contract-reviewer',
          name: '合同文档智能审查与合规诊断',
          triggerEvent: 'on_submit',
          stageType: 'approval',
          description: '法务合规要件智能提取，风险排查并生成审查意见草稿供法务复核。',
          handlerRule: '初稿提报后由 AI 辅助法务提取风险要件并附带审查批注建议',
        },
        {
          type: 'skill',
          refId: 'platform.notification.internal-message',
          name: '全渠道协同消息与归档通知',
          triggerEvent: 'on_complete',
          stageType: 'archive',
          description: '合同归档完成后向发起人与法务部门推送企业微信/邮件闭环回执。',
          handlerRule: '流程全环节结项通知',
        },
      ],
      processDefinition: {
        stages: [
          {
            id: 'draft_submission',
            name: '商务填报与初稿生成',
            type: 'submission',
            description: '员工填写对方主体、合同业务类型（如保密协议NDA）、金额及条款要素并生成初稿',
            isLocked: false,
          },
          {
            id: 'legal_review',
            name: '法务合规审查与批注',
            type: 'approval',
            description: '法务部门执行合同要件审查，核验合规风险并在线填写批注建议',
            approverRule: 'department',
            approverDepartment: '法务部',
            rollbackStageId: 'draft_submission',
            actions: ['approve', 'reject'],
            isLocked: true,
          },
          {
            id: 'auto_archiving',
            name: '电子归档与版本存证',
            type: 'automation',
            description: '审查通过后自动写入企业合同库并固化版本凭证',
            isLocked: true,
          },
          {
            id: 'final_receipt',
            name: '回执通知与办结',
            type: 'archive',
            description: '向发起员工推送归档结项回执并闭环流转',
            isLocked: false,
          },
        ],
      },
      paramsSchema: {
        properties: {
          contractTitle: {
            type: 'string',
            description: '合同名称',
            required: true,
          },
          contractType: {
            type: 'string',
            description: '合同业务类型',
            required: true,
            enum: ['nda', 'software_development', 'procurement', 'employment', 'general'],
          },
          counterpartyName: {
            type: 'string',
            description: '相对方企业全称',
            required: true,
          },
          contractAmount: {
            type: 'number',
            description: '合同总金额（元）',
            required: false,
          },
          myPosition: {
            type: 'string',
            description: '我方合同立场',
            required: true,
            enum: ['buyer', 'seller', 'neutral'],
            default: 'buyer',
          },
          remarks: {
            type: 'string',
            description: '特殊商务诉求或审查说明',
            required: false,
          },
        },
        required: ['contractTitle', 'contractType', 'counterpartyName', 'myPosition'],
      },
      grantedRoleIds: ['employee', 'admin', 'legal'],
    },
  },
];
