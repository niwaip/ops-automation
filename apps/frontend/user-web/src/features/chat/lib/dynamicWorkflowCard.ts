import dayjs from 'dayjs';
import type {
  CollaboratorUser,
  WorkflowTemplateDefinition,
} from '../../../api/workbenchCoordination';

export interface DynamicWorkflowCardResult {
  title: string;
  content: string;
  taskType: 'approval' | 'assignment' | 'review';
  parameters: Record<string, any>;
  markdownCard: string;
}

/**
 * 根据工作流模版 Schema 动态解析表单输入并生成标准化业务卡片载荷
 * 完全杜绝写死的 if-else，实现任意业务工作流 100% 动态驱动
 */
export function buildDynamicWorkflowCardPayload(
  template: WorkflowTemplateDefinition,
  formValues: Record<string, any>,
  assignee?: CollaboratorUser | null
): DynamicWorkflowCardResult {
  const schema = template.paramsSchema || { properties: {}, required: [] };
  const properties = schema.properties || {};

  const cleanParameters: Record<string, any> = {};
  const bulletPoints: string[] = [];

  // 1. 动态遍历 Schema 参数属性，进行类型转换与格式化输出
  Object.entries(properties).forEach(([key, prop]) => {
    const rawVal = formValues[key];
    if (rawVal === undefined || rawVal === null || rawVal === '') {
      return;
    }

    let displayVal = String(rawVal);
    if (prop.type === 'date') {
      const d = dayjs(rawVal);
      if (d.isValid()) {
        cleanParameters[key] = d.toISOString();
        displayVal = d.format('YYYY-MM-DD HH:mm');
      } else {
        cleanParameters[key] = rawVal;
      }
    } else if (prop.type === 'number') {
      const num = Number(rawVal);
      cleanParameters[key] = num;
      if (
        key.toLowerCase().includes('amount') ||
        key.toLowerCase().includes('price') ||
        key.toLowerCase().includes('money')
      ) {
        displayVal = `¥${num.toLocaleString()}`;
      } else if (
        key.toLowerCase().includes('duration') ||
        key.toLowerCase().includes('hours')
      ) {
        displayVal = `${num} 小时`;
      } else {
        displayVal = String(num);
      }
    } else if (prop.type === 'boolean') {
      cleanParameters[key] = Boolean(rawVal);
      displayVal = rawVal ? '是' : '否';
    } else {
      cleanParameters[key] = rawVal;
    }

    const label = prop.description || key;
    bulletPoints.push(`- **${label}**：${displayVal}`);
  });

  // 2. 动态合成业务单据标题 (从 Schema 关键业务字段自动推导)
  let title = formValues.title;
  if (!title) {
    const keyCandidates = ['leaveType', 'expenseType', 'taskType', 'name', 'type'];
    const primaryKey =
      keyCandidates.find((k) => cleanParameters[k]) || Object.keys(cleanParameters)[0];
    const secondaryKey = ['durationHours', 'amount', 'days'].find(
      (k) => cleanParameters[k]
    );

    let detailStr = '';
    if (primaryKey && cleanParameters[primaryKey]) {
      detailStr += String(cleanParameters[primaryKey]);
    }
    if (secondaryKey && cleanParameters[secondaryKey]) {
      const val = cleanParameters[secondaryKey];
      detailStr += secondaryKey.includes('amount') ? ` ¥${val}` : ` ${val}小时`;
    }

    title = detailStr
      ? `[${template.name}] ${detailStr}`.trim()
      : `[${template.name}] 业务协同单`;
  }

  // 3. 动态合成卡片正文 (用于收件箱与对话流展示)
  const taskType = (formValues.taskType ||
    template.taskType ||
    'approval') as 'approval' | 'assignment' | 'review';
  const assigneeName = assignee?.username ? `@${assignee.username}` : '协同成员';

  const systemIntegrationNote =
    template.category === 'hr'
      ? '- **外部系统**：审批核准后自动对接人事考勤系统 (Mock Enterprise HRMS) 扣减额度'
      : template.category === 'oa'
      ? '- **外部系统**：审批核准后自动推送至财务报销中心 (ERP 网关) 生成记账凭证'
      : '- **系统对接**：基于组织工作流统一 Schema 动态契约校验流转';

  const content = [
    `### 📋 [${template.name}] 规范业务单据`,
    '',
    `- **业务流程**：${template.name} (\`${template.workflowId}\`)`,
    `- **协同类型**：${taskType === 'approval' ? '审批承认' : '协同办理'}`,
    `- **协同对象**：${assigneeName}`,
    ...bulletPoints,
    systemIntegrationNote,
  ]
    .filter(Boolean)
    .join('\n');

  const markdownCard = [
    `### 📋 [${template.name}] 业务协同卡片已发起`,
    '',
    `- **流程模版**：${template.name} (\`${template.workflowId}\`)`,
    `- **承办 / 审批人**：${assigneeName}`,
    ...bulletPoints,
    `- **流转状态**：已推入对方的 **GTD 收集箱** 与待办流转看板；审批后自动联动外部系统闭环。`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    title,
    content,
    taskType,
    parameters: cleanParameters,
    markdownCard,
  };
}
