import {
  CoordinationTaskType,
  WorkflowTemplateDto,
} from './dto/workbench-coordination.dto';

export const BUILT_IN_WORKFLOW_TEMPLATES: WorkflowTemplateDto[] = [
  {
    id: 'legal.contract.review_flow',
    workflowId: 'legal.contract.review_flow',
    name: '标准合同起草与法务审查闭环流',
    description: '普通员工发起合同初稿，流转至法务部门进行智能要件审查与人工批注。通过则归档并通知员工，未通过则回退重修。',
    category: 'legal',
    icon: 'SafetyCertificateOutlined',
    taskType: CoordinationTaskType.approval,
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
  },
  {
    id: 'legal.nda.generation_and_review_flow',
    workflowId: 'legal.nda.generation_and_review_flow',
    name: '保密合同起草与法务审查闭环流',
    description: '专属保密合同生成技能 (ConfidentialityAgreementGenerationWorkflow) 提取要件生成初稿，流转法务部专项审查批注，通过后归档存证，未通过回退重修。',
    category: 'legal',
    icon: 'SafetyCertificateOutlined',
    taskType: CoordinationTaskType.approval,
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
  },
];
