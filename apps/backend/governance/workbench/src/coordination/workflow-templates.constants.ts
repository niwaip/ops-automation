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
];
