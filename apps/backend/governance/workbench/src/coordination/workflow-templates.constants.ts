import {
  CoordinationTaskType,
  WorkflowTemplateDto,
} from './dto/workbench-coordination.dto';

export const BUILT_IN_WORKFLOW_TEMPLATES: WorkflowTemplateDto[] = [
  {
    id: 'hr.leave.request',
    workflowId: 'hr.leave.request',
    name: '员工请假审批',
    description: '支持事假、年假、病假等考勤申请，审批通过后自动同步至外部人事考勤系统。',
    category: 'hr',
    icon: 'CalendarOutlined',
    taskType: CoordinationTaskType.approval,
    paramsSchema: {
      properties: {
        leaveType: {
          type: 'string',
          description: '请假类型',
          required: true,
          enum: ['事假', '年假', '病假', '调休', '婚假', '产假'],
        },
        startTime: {
          type: 'date',
          description: '开始时间',
          required: true,
        },
        endTime: {
          type: 'date',
          description: '结束时间',
          required: true,
        },
        durationHours: {
          type: 'number',
          description: '请假时长（小时）',
          default: 4,
          required: true,
        },
        reason: {
          type: 'string',
          description: '请假事由',
          required: true,
        },
        handoverPerson: {
          type: 'string',
          description: '工作交接人',
          required: false,
        },
        emergencyContact: {
          type: 'string',
          description: '紧急联系电话',
          required: false,
        },
      },
      required: ['leaveType', 'startTime', 'endTime', 'durationHours', 'reason'],
    },
  },
  {
    id: 'oa.expense.claim',
    workflowId: 'oa.expense.claim',
    name: '费用报销审批',
    description: '日常差旅、办公及招待费用报销审批，审批后自动写入财务系统。',
    category: 'oa',
    icon: 'DollarOutlined',
    taskType: CoordinationTaskType.approval,
    paramsSchema: {
      properties: {
        expenseType: {
          type: 'string',
          description: '报销类别',
          required: true,
          enum: ['差旅交通', '餐饮招待', '办公采购', '培训团建'],
        },
        amount: {
          type: 'number',
          description: '报销金额（元）',
          required: true,
        },
        reason: {
          type: 'string',
          description: '费用说明',
          required: true,
        },
      },
      required: ['expenseType', 'amount', 'reason'],
    },
  },
  {
    id: 'general.coordination',
    workflowId: 'general.coordination',
    name: '通用协同任务',
    description: '日常工作指派、审阅或备忘协同任务。',
    category: 'general',
    icon: 'FileDoneOutlined',
    taskType: CoordinationTaskType.assignment,
    paramsSchema: {
      properties: {
        title: {
          type: 'string',
          description: '任务标题',
          required: true,
        },
        content: {
          type: 'string',
          description: '具体要求与说明',
          required: true,
        },
      },
      required: ['title', 'content'],
    },
  },
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
