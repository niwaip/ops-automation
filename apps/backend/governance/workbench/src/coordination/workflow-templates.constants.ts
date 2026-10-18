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
        'partyA.name': {
          type: 'string',
          displayName: '甲方公司法定全称',
          description: '协议首部甲方法律主体名称',
          required: true,
        },
        'partyA.address': {
          type: 'string',
          displayName: '甲方注册或经营地址',
          description: '协议首部甲方注册或联系地址',
          required: true,
        },
        'partyB.name': {
          type: 'string',
          displayName: '乙方（接收方）的公司全称',
          description: '协议落款及首部乙方法律主体名称',
          default: '富士通 ( 中国 ) 信息系統有限公司',
          required: true,
        },
        'partyB.address': {
          type: 'string',
          displayName: '乙方注册或经营地址',
          description: '协议首部乙方注册或联系地址',
          default: '上海浦东新区陆家嘴环路 1000 号',
          required: true,
        },
        'cooperation.subject': {
          type: 'string',
          displayName: '双方合作的具体业务主题或项目内容',
          description: '保密协议所覆盖的合作项目/业务范围主题',
          required: true,
        },
        'confidentiality.durationYears': {
          type: 'number',
          displayName: '保密期限的具体年数',
          description: '保密义务持续年限（数字）',
          default: 3,
          required: true,
        },
        'agreement.signDate.year': {
          type: 'number',
          displayName: '协议签订年份',
          description: '协议签订日期的年份（数字）',
          required: true,
        },
        'agreement.signDate.month': {
          type: 'number',
          displayName: '协议签订月份',
          description: '协议签订日期的月份（数字）',
          required: true,
        },
        'agreement.signDate.day': {
          type: 'number',
          displayName: '协议签订日（日号）',
          description: '协议签订日期的具体日（数字）',
          required: true,
        },
        'attachment.content': {
          type: 'string',
          displayName: '附件一的具体内容或补充说明',
          description: '附件一内容详情（若无额外内容则填写“无”）',
          default: '无',
          required: false,
        },
      },
      required: [
        'partyA.name',
        'partyA.address',
        'partyB.name',
        'partyB.address',
        'cooperation.subject',
        'confidentiality.durationYears',
        'agreement.signDate.year',
        'agreement.signDate.month',
        'agreement.signDate.day',
      ],
    },
  },
];
