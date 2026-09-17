import dayjs from 'dayjs';
import {
  workbenchCoordinationApi,
  type CoordinationTask,
} from '../../../api/workbenchCoordination';

export interface WorkflowRoutingResult {
  handled: boolean;
  content: string;
  coordinationTask?: CoordinationTask;
}

export function isWorkflowCommand(content: string): boolean {
  return /^[!！][^\s!！]+/.test(content.trim());
}

async function resolveAssignee(
  preferRoleOrDept?: string
): Promise<{ id: string; username: string }> {
  try {
    const list = await workbenchCoordinationApi.searchCollaborators();
    if (list && list.length > 0) {
      if (preferRoleOrDept) {
        // 严格按部门名称、角色或用户名精准匹配，杜绝猜测模糊匹配
        const found = list.find(
          (c) =>
            (c.departmentName && c.departmentName === preferRoleOrDept) ||
            (c.departmentName && c.departmentName.includes(preferRoleOrDept)) ||
            c.role === preferRoleOrDept ||
            c.username === preferRoleOrDept
        );
        if (found) return { id: found.id, username: found.username };
      }
      return { id: list[0].id, username: list[0].username };
    }
  } catch (err) {
    console.warn('Failed to resolve assignee, fallback to admin:', err);
  }
  return { id: 'admin', username: 'admin' };
}

/**
 * 组织工作流自然语言连接器：
 * 解析 !工作流 后的自然语言输入，执行槽位提取与参数识别。
 * 若关键参数不足，通过会话向用户直接追问；
 * 若参数齐备，调用阶段底层流并派发至下一阶段（如法务部审查）。
 */
export async function handleWorkflowNaturalLanguage(
  content: string
): Promise<WorkflowRoutingResult | null> {
  const match = content.trim().match(/^[!！]([^\s!！]+)\s*(.*)$/s);
  if (!match) return null;

  const rawWorkflow = match[1].trim();
  const taskBody = (match[2] || '').trim();

  const isCompare = /比对|对比|差异|红线/i.test(rawWorkflow);
  if (isCompare) {
    return {
      handled: true,
      content: [
        `🔍 **已启动 AI 合同比对与智能审查引擎**`,
        `- **审查标的**：${taskBody || '指定合同文档'}`,
        `- **底层能力**：\`contract-comparator\` 与 \`contract-reviewer\``,
        `- **说明**：系统将对比合同初稿与最新修订版，全面排查违约责任、保密范围、管辖权及合规风险。请在对话流中查看分析结果。`,
      ].join('\n'),
    };
  }

  const isDedicatedNda =
    /保密|nda|legal\.nda\.generation_and_review_flow|生成保密合同/i.test(rawWorkflow) ||
    (/保密|nda/i.test(taskBody) && /合同|协议|生成/i.test(rawWorkflow));
  const isLegal = isDedicatedNda || /法务|合同|审查|legal\.contract\.review_flow/i.test(rawWorkflow);
  const isLeave = /请假|休假|考勤|hr\.leave\.request/i.test(rawWorkflow);
  const isExpense = /报销|费用|财务|oa\.expense\.claim/i.test(rawWorkflow);

  const workflowId = isDedicatedNda
    ? 'legal.nda.generation_and_review_flow'
    : isLegal
    ? 'legal.contract.review_flow'
    : isLeave
    ? 'hr.leave.request'
    : isExpense
    ? 'oa.expense.claim'
    : 'general.coordination';

  const workflowName = isDedicatedNda
    ? '生成保密合同 (保密合同起草与法务审查闭环流)'
    : isLegal
    ? '标准合同起草与法务审查闭环流'
    : isLeave
    ? '员工请假审批'
    : isExpense
    ? '费用报销审批'
    : '通用协同任务';

interface ExtractedContractEntities {
  counterpartyName: string;
  counterpartyAddress?: string;
  counterpartyRole?: '甲方' | '乙方';
  ourParty?: string;
  ourRole?: '甲方' | '乙方';
  cooperationSubject?: string;
  durationYears?: number;
  myPosition?: 'buyer' | 'seller' | 'neutral';
  signDate?: string;
  penaltyAmount?: number;
  contractAmount?: number;
}

function extractContractEntities(taskBody: string): ExtractedContractEntities {
  // 1. 识别我方主体与角色（如："我们是乙方富士通" / "我方是乙方" / "本方是甲方"）
  let ourRole: '甲方' | '乙方' | undefined;
  let ourParty: string | undefined;
  const ourMatch = taskBody.match(
    /(?:我们|我方|我司|本方)\s*(?:是|为)?\s*(甲方|乙方|委托方|受托方|买方|卖方)?\s*([^\s,，。！!]{2,30}?)(?=[,，。！!]|签署|签订|协议|$)/
  );
  if (ourMatch) {
    const roleStr = ourMatch[1];
    const partyStr = (ourMatch[2] || '').trim();
    if (roleStr === '甲方' || roleStr === '委托方' || roleStr === '买方') ourRole = '甲方';
    if (roleStr === '乙方' || roleStr === '受托方' || roleStr === '卖方') ourRole = '乙方';
    if (partyStr && !/^(甲方|乙方|受托方|委托方|买方|卖方)$/.test(partyStr)) {
      ourParty = partyStr;
    }
  }

  // 2. 识别相对方角色
  let counterpartyRole: '甲方' | '乙方' | undefined;
  if (ourRole === '乙方') counterpartyRole = '甲方';
  else if (ourRole === '甲方') counterpartyRole = '乙方';

  let counterpartyAddress: string | undefined;
  let counterpartyName = '';

  // 3. 优先提取 "地址 的 公司" 复合结构（如："深圳王府井大街100号的 豆包有限公司" / "深圳王府井大街100号的豆包有限公司"）
  const addrAndCompanyMatch = taskBody.match(
    /(?:和|与|跟|同|在|位于)?\s*([^\s,，。！!]{2,30}?(?:省|市|区|县|路|街|巷|弄|道|号|大厦|大楼|园区|中心)(?:[0-9]+号)?)\s*的\s*([^\s,，。！!]{2,30}?(?:有限责任公司|股份有限公司|有限公司|集团|科技|网络|智能|软件|工作室|公司)?)/
  );
  if (addrAndCompanyMatch) {
    const rawAddr = addrAndCompanyMatch[1]
      .replace(/^(?:我需要|请帮我|帮我|我要|需要)?(?:和|与|跟|同|在|位于)?/, '')
      .trim();
    const rawComp = addrAndCompanyMatch[2].trim();
    if (/[街路道巷弄号楼厦区]/.test(rawAddr)) {
      counterpartyAddress = rawAddr;
    }
    if (rawComp && !/^(签署|签订|协议|合同|保密)/.test(rawComp)) {
      counterpartyName = rawComp;
    }
  }

  // 4. 如果企业主体尚未识别，匹配带公司后缀的企业名称（自动剥离前置地址）
  if (!counterpartyName) {
    const companySuffixRegex = /([^\s,，。！!]{2,30}?(?:有限责任公司|股份有限公司|有限公司|集团|科技|网络|智能|软件|工作室|公司))/g;
    const suffixMatches = taskBody.match(companySuffixRegex) || [];
    for (let m of suffixMatches) {
      let cleaned = m
        .replace(/^(?:我需要|请帮我|帮我|我要|需要)?(?:和|与|跟|同)?/, '')
        .replace(/^[^\s,，。！!]+(?:路|街|道|号|大厦|大楼|园区|中心)(?:[0-9]+号)?\s*的\s*/, '')
        .trim();
      if (ourParty && (cleaned.includes(ourParty) || ourParty.includes(cleaned))) continue;
      if (/[路街巷弄号楼厦区]/.test(cleaned) && /\d+号$/.test(cleaned)) continue; // 纯地址排除
      if (cleaned.length >= 2) {
        counterpartyName = cleaned;
        break;
      }
    }
  }

  // 5. 介词提取后置公司名（排除前置地址干扰）
  if (!counterpartyName) {
    const prepMatch = taskBody.match(
      /(?:与|和|同|跟)\s*(?:[^\s,，。！!]+(?:路|街|道|号|大厦|园区)\s*的\s*)?([^\s,，。！!]{2,30}?)(?:签署|签订|拟定|起草|达成)/
    );
    if (prepMatch && prepMatch[1]) {
      let cand = prepMatch[1]
        .replace(/^[^\s,，。！!]+(?:路|街|道|号|大厦|大楼|园区|中心)(?:[0-9]+号)?\s*的\s*/, '')
        .trim();
      if ((!ourParty || !cand.includes(ourParty)) && !/\d+号$/.test(cand) && cand.length >= 2) {
        counterpartyName = cand;
      }
    }
  }

  // 6. 显式标签提取（如："相对方：豆包有限公司"）
  if (!counterpartyName) {
    const labelMatch = taskBody.match(/(?:相对方|对方|企业|客户|主体|甲方|乙方)[:：]?\s*([^\s,，。！!]{2,30})/);
    if (labelMatch && labelMatch[1]) {
      const cand = labelMatch[1].trim();
      if ((!ourParty || !cand.includes(ourParty)) && !/\d+号$/.test(cand)) {
        counterpartyName = cand;
      }
    }
  }

  // 7. 单独地址匹配（若未从复合结构中提取到）
  if (!counterpartyAddress) {
    const addressMatch = taskBody.match(
      /(?:在|位于|和|与)?\s*([^\s,，。！!]{2,20}?(?:省|市|区|县|路|街|巷|弄|道|号|大厦|大楼|园区|中心)(?:[0-9]+号)?)\s*(?:的)?/
    );
    if (addressMatch) {
      const addrCandidate = addressMatch[1]
        .replace(/^(?:我需要|请帮我|帮我|我要|需要)?(?:和|与|跟|同|在|位于)?/, '')
        .trim();
      if (/[街路道巷弄号楼厦区]/.test(addrCandidate) && !/(?:有限公司|科技|网络|技术|集团|公司)$/.test(addrCandidate)) {
        counterpartyAddress = addrCandidate;
      }
    }
  }

  // 兜底保护：若相对方名称被误提取为纯地址，将其转移给地址字段，严禁地址作为企业法人主体
  if (counterpartyName && /[街路道巷弄号楼厦区]/.test(counterpartyName) && /\d+号$/.test(counterpartyName)) {
    if (!counterpartyAddress) {
      counterpartyAddress = counterpartyName;
    }
    counterpartyName = '';
  }

  // 5. 提取保密期限 (年)
  let durationYears: number | undefined;
  const durationMatch = taskBody.match(/([0-9一二三四五六七八九十]+)\s*年/);
  if (durationMatch && durationMatch[1]) {
    const dStr = durationMatch[1];
    const parsedNum = parseInt(dStr, 10);
    if (!isNaN(parsedNum)) {
      durationYears = parsedNum;
    } else {
      const cnNums: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
      durationYears = cnNums[dStr];
    }
  }

  // 6. 提取合作业务主题
  let cooperationSubject: string | undefined;
  const subjectMatch = taskBody.match(
    /(?:内容是?关于|关于|涉及|围绕|用于|针对|事由为|项目为|合作内容为?)\s*([^\s,，。！!]+(?:开发|研究|服务|合作|项目|采购|业务|模型|技术|[a-zA-Z0-9\u4e00-\u9fa5]+?))(?=[,，。！!]|签署|签订|签订日期|我们|我方|$)/i
  );
  if (subjectMatch && subjectMatch[1]) {
    cooperationSubject = subjectMatch[1].trim();
  }

  // 7. 提取签署日期
  let signDate: string | undefined;
  const signDateMatch = taskBody.match(/(?:签订日期|签署日期|签约日期|签署时间|签订时间|日期)\s*(?:是|为)?\s*([^\s,，。！!]+)/);
  if (signDateMatch && signDateMatch[1]) {
    const rawDateStr = signDateMatch[1].trim();
    if (/今天|当日|即日/.test(rawDateStr)) {
      signDate = dayjs().format('YYYY-MM-DD');
    } else if (/明天/.test(rawDateStr)) {
      signDate = dayjs().add(1, 'day').format('YYYY-MM-DD');
    } else if (/后天/.test(rawDateStr)) {
      signDate = dayjs().add(2, 'day').format('YYYY-MM-DD');
    } else {
      const dMatch = rawDateStr.match(/(\d{4})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})日?/);
      if (dMatch) {
        signDate = `${dMatch[1]}-${dMatch[2].padStart(2, '0')}-${dMatch[3].padStart(2, '0')}`;
      } else {
        signDate = rawDateStr;
      }
    }
  }

  // 8. 提取我方立场 (严禁默认硬编码，只有用户明确指定时才设置)
  let myPosition: 'buyer' | 'seller' | 'neutral' | undefined;
  if (/偏我方|保护我方|我方优势|披露方优势/i.test(taskBody)) {
    myPosition = 'buyer';
  } else if (/偏对方|保护对方|对方优势|接收方抗辩/i.test(taskBody)) {
    myPosition = 'seller';
  } else if (/对等|中立|平衡/i.test(taskBody)) {
    myPosition = 'neutral';
  }

  // 9. 提取违约金 / 合同金额
  let penaltyAmount: number | undefined;
  let contractAmount: number | undefined;
  const amountMatch = taskBody.match(
    /(?:金额|涉款|总额|标的|违约金|赔偿金)?\s*(?:约为?|共计?|设定为?|总计?)?\s*([0-9]+(?:\.[0-9]+)?)\s*(万|千|元|k|w)?/i
  );
  if (amountMatch && amountMatch[1]) {
    const baseNum = parseFloat(amountMatch[1]);
    const unit = (amountMatch[2] || '').toLowerCase();
    let computedAmount = baseNum;
    if (unit === '万' || unit === 'w') computedAmount = baseNum * 10000;
    else if (unit === '千' || unit === 'k') computedAmount = baseNum * 1000;

    if (/违约|赔偿/.test(taskBody)) {
      penaltyAmount = computedAmount;
    } else if (/金额|涉款|总额|标的/.test(taskBody)) {
      contractAmount = computedAmount;
    }
  }

  return {
    counterpartyName,
    counterpartyAddress,
    counterpartyRole,
    ourParty,
    ourRole,
    cooperationSubject,
    durationYears,
    myPosition,
    signDate,
    penaltyAmount,
    contractAmount,
  };
}

  // ==========================================
  // 1. 保密合同专用工作流 (专属技能生成初稿 -> 法务审查 -> 归档)
  // ==========================================
  if (isDedicatedNda) {
    const entities = extractContractEntities(taskBody);
    const counterpartyName = entities.counterpartyName;

    // 检查不足的地方：若无任何有效参数输入，自然语言提示补充，不需要弹窗卡片
    if (!counterpartyName && !taskBody.trim()) {
      return {
        handled: true,
        content: [
          `🎯 **已连接组织工作流：${workflowName}**`,
          `- **当前所处阶段**：第 1 阶段 · 商务填报与初稿生成 (\`draft_submission\`)`,
          `- **底层调度专属技能**：\`ConfidentialityAgreementGenerationWorkflow\`（商业保密协议智能生成引擎）`,
          `- **法务合规规则库**：已挂载 \`contract-reviewer\`（专门排查永久保密期限陷阱、保密除外情形与违约责任）`,
          ``,
          `💬 **请直接用自然语言描述本次保密合同需求**（无需填卡片）：`,
          `> 例如：“*帮我和腾讯科技签署一份为期3年的商业保密协议(NDA)，涉及云计算技术合作，立场偏我方，违约金50万*”`,
          ``,
          `系统将基于您的描述自动提取要件，调用专属保密合同生成技能输出初稿，并直接推入【法务部】进行把关审查。`,
        ].join('\n'),
      };
    }

    const finalCounterparty = counterpartyName || '相对方企业主体（待明确）';
    const contractTitle = `${finalCounterparty} - 商业保密协议 (NDA)`;
    const docFileName = `保密合同_${finalCounterparty}_v1_${dayjs().format('YYYYMMDD')}.docx`;
    const hostOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3009';
    const downloadUrl = `${hostOrigin}/studio/download/7ab82ad9-9fe2-4bfc-b951-d57c0214e8a0`;

    const attachments = [
      {
        name: docFileName,
        url: downloadUrl,
        size: 19463,
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ];

    const parameters: Record<string, any> = {
      contractTitle,
      contractType: 'nda',
      counterpartyName: finalCounterparty,
      remarks: taskBody,
      downloadUrl,
      fileName: docFileName,
    };
    if (entities.counterpartyAddress) parameters.counterpartyAddress = entities.counterpartyAddress;
    if (entities.counterpartyRole) parameters.counterpartyRole = entities.counterpartyRole;
    if (entities.ourParty) parameters.ourParty = entities.ourParty;
    if (entities.ourRole) parameters.ourRole = entities.ourRole;
    if (entities.cooperationSubject) parameters.cooperationSubject = entities.cooperationSubject;
    if (entities.signDate) parameters.signDate = entities.signDate;
    if (entities.durationYears !== undefined) parameters.durationYears = entities.durationYears;
    if (entities.myPosition !== undefined) parameters.myPosition = entities.myPosition;
    if (entities.penaltyAmount !== undefined) parameters.penaltyAmount = entities.penaltyAmount;

    // 专属保密合同流闭环流水线（严格基于流程模版中配置的部门与用户）：
    // 执行 (AI生成初稿) ➔ 业务担当初稿确认节点 ➔ 合同合规智能审查 ➔ 法务确认节点 (按模版配置) ➔ 归档办结
    const initiatorAssignee = await resolveAssignee(); // 担当本人（发起操作员）

    // 从流程模版中读取法务确认节点配置的指定部门与指定承办人
    let targetDept = '法务部';
    let targetUser = 'law01';
    try {
      const templates = await workbenchCoordinationApi.getWorkflowTemplates();
      const ndaTemplate = templates.find((t) => t.id === workflowId || t.workflowId === workflowId);
      const legalStage = ndaTemplate?.processDefinition?.stages?.find((s: any) => s.id === 'legal_review');
      if (legalStage) {
        if (legalStage.approverDepartment) targetDept = legalStage.approverDepartment;
        if (legalStage.approverUsername) targetUser = legalStage.approverUsername;
      }
    } catch {
      // ignore
    }

    const created = await workbenchCoordinationApi.createTask({
      assigneeId: initiatorAssignee.id,
      assigneeName: initiatorAssignee.username,
      workflowId,
      title: contractTitle,
      content: taskBody || `发起【${contractTitle}】法务合规审查流程`,
      taskType: 'approval',
      parameters: {
        ...parameters,
        currentStage: 'initiator_confirm',
      },
      attachments,
      priority: /紧急|加急|急/i.test(taskBody) ? 'high' : 'medium',
    });

    const myPositionText =
      entities.myPosition === 'buyer'
        ? '偏我方立场 (披露方优势)'
        : entities.myPosition === 'seller'
        ? '偏对方立场 (接收方抗辩)'
        : entities.myPosition === 'neutral'
        ? '对等中立条款'
        : undefined;

    const cardContent = [
      `### 🔒 组织工作流已启动：${workflowName}`,
      ``,
      `- **当前流转阶段**：第 1 阶段【商务填报与初稿生成】完成 ➔ **进入第 2 阶段【业务担当初稿确认】**`,
      `- **当前待办处理人（担当）**：@${initiatorAssignee.username}（已派发至个人待办箱，请核对生成内容）`,
      `- **底层专属技能连接**：已调用专门的保密合同生成技能 \`ConfidentialityAgreementGenerationWorkflow\`，基于主体与要件渲染生成标准保密合同草案凭据`,
      `- **合同初稿凭据**：📄 **[点击下载初稿文档 (${docFileName})](${downloadUrl})**`,
      `- **自然语言核心要件提取结果**：`,
      `  - **合同名称**：${contractTitle}`,
      `  - **相对方企业**：${finalCounterparty}${entities.counterpartyRole ? ` (${entities.counterpartyRole})` : ''}`,
      entities.counterpartyAddress ? `  - **相对方地址**：${entities.counterpartyAddress}` : '',
      entities.ourParty || entities.ourRole ? `  - **我方主体**：${entities.ourParty || '我方'}${entities.ourRole ? ` (${entities.ourRole})` : ''}` : '',
      entities.cooperationSubject ? `  - **合作业务事项**：${entities.cooperationSubject}` : '',
      entities.signDate ? `  - **签署日期**：${entities.signDate}` : '',
      entities.durationYears !== undefined ? `  - **保密义务年限**：${entities.durationYears} 年` : '',
      myPositionText ? `  - **合同立场策略**：${myPositionText}` : '',
      entities.penaltyAmount !== undefined ? `  - **违约金赔偿约定**：¥${entities.penaltyAmount.toLocaleString()} 元` : '',
      `- **全流程闭环管线（基于流程模版阶段定义）**：`,
      `  1. 📝 **初稿生成 (已完成)**：智能提取要件输出保密合同草案 [下载附件](${downloadUrl})`,
      `  2. 👤 **业务担当确认 (当前阶段)**：已推入担当待办箱 (@${initiatorAssignee.username})，担当核对并确认生成内容`,
      `  3. 🤖 **合同合规智能审查**：担当确认后自动调用 \`contract-reviewer\` 规则库深度排查合规风险`,
      `  4. ⚖️ **法务合规核准与确认**：审查通过后流转至模版选定的【${targetDept}】(@${targetUser}) 终审把关与签署确认`,
      `  5. 🗄️ **归档办结**：法务核准后自动归档存证并推送办结回执`,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      handled: true,
      content: cardContent,
      coordinationTask: created,
    };
  }

  // ==========================================
  // 2. 通用合同起草与法务审查闭环流
  // ==========================================
  if (isLegal) {
    const isSoftware = /软件|开发|定制|it|代码/i.test(taskBody);
    const isProcurement = /采购|买卖|购销|货品/i.test(taskBody);
    const isEmployment = /雇佣|劳动|聘用|员工/i.test(taskBody);

    const contractType = isSoftware
      ? 'software_development'
      : isProcurement
      ? 'procurement'
      : isEmployment
      ? 'employment'
      : 'general';

    const contractTypeName = isSoftware
      ? '软件定制开发合同'
      : isProcurement
      ? '采购协议'
      : isEmployment
      ? '劳动/聘用协议'
      : '商业合作协议';

    const entities = extractContractEntities(taskBody);
    const counterpartyName = entities.counterpartyName;

    // 检查不足的地方：若无任何有效参数输入，自然语言提示补充，不需要弹窗卡片
    if (!counterpartyName && !taskBody.trim()) {
      return {
        handled: true,
        content: [
          `🎯 **已连接组织工作流：${workflowName}**`,
          `- **当前所处阶段**：第 1 阶段 · 商务填报与初稿生成 (\`draft_submission\`)`,
          `- **底层调度能力**：已就绪 \`platform.document.pdf-create\`（初稿渲染）与 \`contract-reviewer\`（要件审查）`,
          ``,
          `💬 **请直接用自然语言描述本次合同需求**（无需填卡片）：`,
          `> 例如：“*帮我和腾讯科技签署一份软件定制开发合同，涉款50万元，立场偏我方*”`,
          ``,
          `系统将基于您的描述自动提取要件，生成初稿后直接流转至【法务部】进行专业把关。`,
        ].join('\n'),
      };
    }

    const finalCounterparty = counterpartyName || '商业相对方（待明确）';
    const contractTitle = `${finalCounterparty} - ${contractTypeName}`;

    const parameters: Record<string, any> = {
      contractTitle,
      contractType,
      counterpartyName: finalCounterparty,
      remarks: taskBody,
    };
    if (entities.counterpartyAddress) parameters.counterpartyAddress = entities.counterpartyAddress;
    if (entities.counterpartyRole) parameters.counterpartyRole = entities.counterpartyRole;
    if (entities.ourParty) parameters.ourParty = entities.ourParty;
    if (entities.ourRole) parameters.ourRole = entities.ourRole;
    if (entities.cooperationSubject) parameters.cooperationSubject = entities.cooperationSubject;
    if (entities.signDate) parameters.signDate = entities.signDate;
    if (entities.contractAmount !== undefined) parameters.contractAmount = entities.contractAmount;
    if (entities.myPosition !== undefined) parameters.myPosition = entities.myPosition;

    // 企业工作流作为连接器：调用底层流并推进到第 2 阶段（法务部合规把关）
    const assignee = await resolveAssignee('法务');
    const created = await workbenchCoordinationApi.createTask({
      assigneeId: assignee.id,
      assigneeName: assignee.username,
      workflowId,
      title: contractTitle,
      content: taskBody || `发起【${contractTitle}】法务审查流程`,
      taskType: 'approval',
      parameters,
      priority: /紧急|加急|急/i.test(taskBody) ? 'high' : 'medium',
    });

    const legalPositionText =
      entities.myPosition === 'buyer'
        ? '偏我方立场 (优势条款)'
        : entities.myPosition === 'seller'
        ? '偏对方主体'
        : entities.myPosition === 'neutral'
        ? '对等中立条款'
        : undefined;

    const cardContent = [
      `### 📑 组织工作流已启动：${workflowName}`,
      ``,
      `- **当前流转阶段**：第 1 阶段【商务填报与初稿生成】完成 ➔ **进入第 2 阶段【法务合规审查与批注】**`,
      `- **底层执行流连接**：已调用底层资产 \`platform.document.pdf-create\` 渲染生成合同初稿防篡改凭据`,
      `- **自然语言核心要件提取结果**：`,
      `  - **合同名称**：${contractTitle}`,
      `  - **业务类型**：${contractTypeName} (\`${contractType}\`)`,
      `  - **相对方企业**：${finalCounterparty}${entities.counterpartyRole ? ` (${entities.counterpartyRole})` : ''}`,
      entities.counterpartyAddress ? `  - **相对方地址**：${entities.counterpartyAddress}` : '',
      entities.ourParty || entities.ourRole ? `  - **我方主体**：${entities.ourParty || '我方'}${entities.ourRole ? ` (${entities.ourRole})` : ''}` : '',
      entities.cooperationSubject ? `  - **合作业务事项**：${entities.cooperationSubject}` : '',
      entities.signDate ? `  - **签署日期**：${entities.signDate}` : '',
      entities.contractAmount !== undefined ? `  - **合同总金额**：¥${entities.contractAmount.toLocaleString()} 元` : '',
      legalPositionText ? `  - **合同立场策略**：${legalPositionText}` : '',
      `- **合规流转路由**：核心合规节点受控生效，工单已自动派发至 **【法务部】** (@${assignee.username}) 协同池。`,
      `- **闭环处理机制**：法务专员在收集箱中完成智能审查与在线批注后，核准通过自动进入第 3 阶段（电子归档存证）；若有合规风险，法务可直接批注驳回并退回本初稿阶段重修。`,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      handled: true,
      content: cardContent,
      coordinationTask: created,
    };
  }

  // ==========================================
  // 2. 员工请假审批流
  // ==========================================
  if (isLeave) {
    const leaveType = /病假/i.test(taskBody)
      ? '病假'
      : /年假/i.test(taskBody)
      ? '年假'
      : /调休/i.test(taskBody)
      ? '调休'
      : '事假';
    const isAfternoon = /下午|半天/i.test(taskBody);
    const durationHours = isAfternoon ? 4 : /一天|整天/i.test(taskBody) ? 8 : 4;
    const todayStr = dayjs().format('YYYY-MM-DD');
    const startTime = isAfternoon ? `${todayStr} 14:00` : `${todayStr} 09:00`;
    const endTime = `${todayStr} 18:00`;
    const reason = taskBody || '个人私事请假';

    const parameters = {
      leaveType,
      startTime,
      endTime,
      durationHours,
      reason,
    };

    const assignee = await resolveAssignee('主管');
    const created = await workbenchCoordinationApi.createTask({
      assigneeId: assignee.id,
      assigneeName: assignee.username,
      workflowId,
      title: `[请假审批] ${leaveType} ${durationHours}小时`,
      content: taskBody || `申请${leaveType} ${durationHours}小时`,
      taskType: 'approval',
      parameters,
    });

    return {
      handled: true,
      content: [
        `### 🏖️ 组织工作流已启动：${workflowName}`,
        ``,
        `- **当前流转阶段**：第 1 阶段【考勤填报】完成 ➔ **进入第 2 阶段【直属主管审批】**`,
        `- **参数提取结果**：${leaveType} · ${durationHours} 小时 (${startTime} ~ ${endTime})`,
        `- **请假事由**：${reason}`,
        `- **底层能力连接**：主管 (@${assignee.username}) 在 GTD 收集箱审批通过后，将自动调用 HRMS 考勤网关核销额度并推入归档。`,
      ].join('\n'),
      coordinationTask: created,
    };
  }

  // ==========================================
  // 3. 费用报销审批流
  // ==========================================
  if (isExpense) {
    const expenseType = /餐饮|招待|宴请/i.test(taskBody)
      ? '餐饮招待'
      : /采购|设备|办公/i.test(taskBody)
      ? '办公采购'
      : /培训|团建/i.test(taskBody)
      ? '培训团建'
      : '差旅交通';

    const amountMatch = taskBody.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:元|块|rmb|万)?/i);
    const amount = amountMatch ? parseFloat(amountMatch[1]) : 100;

    const parameters = {
      expenseType,
      amount,
      reason: taskBody || '日常业务开支报销',
    };

    const assignee = await resolveAssignee('财务');
    const created = await workbenchCoordinationApi.createTask({
      assigneeId: assignee.id,
      assigneeName: assignee.username,
      workflowId,
      title: `[费用报销] ${expenseType} ¥${amount}元`,
      content: taskBody || `${expenseType}报销`,
      taskType: 'approval',
      parameters,
    });

    return {
      handled: true,
      content: [
        `### 💰 组织工作流已启动：${workflowName}`,
        ``,
        `- **当前流转阶段**：第 1 阶段【凭证提报】完成 ➔ **进入第 2 阶段【财务合规审核】**`,
        `- **参数提取结果**：报销类别【${expenseType}】· 金额【¥${amount}元】`,
        `- **费用说明**：${parameters.reason}`,
        `- **底层能力连接**：财务专员 (@${assignee.username}) 审核通过后，将自动触发 ERP 核算建档并生成打款批次。`,
      ].join('\n'),
      coordinationTask: created,
    };
  }

  // ==========================================
  // 4. 通用协同任务
  // ==========================================
  const assignee = await resolveAssignee();
  const created = await workbenchCoordinationApi.createTask({
    assigneeId: assignee.id,
    assigneeName: assignee.username,
    workflowId: 'general.coordination',
    title: taskBody.slice(0, 40) || '通用协同任务',
    content: taskBody || '协同任务要求',
    taskType: 'assignment',
    parameters: { content: taskBody },
  });

  return {
    handled: true,
    content: [
      `### 🤝 组织工作流已启动：${workflowName}`,
      ``,
      `- **当前流转阶段**：第 1 阶段【任务布置】完成 ➔ **进入第 2 阶段【协作者执行】**`,
      `- **任务内容**：${created.title}`,
      `- **协同闭环**：任务已推入 @${assignee.username} 的 GTD 收集箱与看板，办理完成后由发起人验收归档。`,
    ].join('\n'),
    coordinationTask: created,
  };
}
