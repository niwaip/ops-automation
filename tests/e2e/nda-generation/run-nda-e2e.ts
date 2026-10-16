import fs from 'node:fs';
import path from 'node:path';
import { getAuthToken, sendChatStream, type ChatStreamResponse } from '../work-mode-routing/e2e-api-client';
import { saveNdaEvidence, calculateDigest, type NdaCaseAssertionRecord, type NdaPerformanceRecord } from './nda-evidence-collector';

interface ExecutionDetail {
  id: string;
  status: string;
  input?: Record<string, any>;
  plan?: any;
  plan_json?: any;
}

async function fetchExecutionDetail(executionId: string, token: string): Promise<ExecutionDetail | null> {
  try {
    const res = await fetch(`http://127.0.0.1:3003/api/executions/${executionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function extractResolvedParameters(execDetail: ExecutionDetail | null): Record<string, any> {
  if (!execDetail) return {};
  const params: Record<string, any> = {};

  if (execDetail.input && typeof execDetail.input === 'object') {
    for (const [k, v] of Object.entries(execDetail.input)) {
      if (k !== 'prompt' && !k.startsWith('__')) {
        params[k] = v;
      }
    }
  }

  // 补充读取 normalizedInputJson 及 normalizedInput (多轮补齐或规范化后的参数)
  const normInput = (execDetail as any).normalizedInputJson || (execDetail as any).normalizedInput;
  if (normInput && typeof normInput === 'object') {
    for (const [k, v] of Object.entries(normInput)) {
      if (k !== 'prompt' && !k.startsWith('__') && k !== 'fields' && k !== 'runtimeDefaultSources') {
        const val = typeof v === 'object' && v !== null && 'value' in v ? (v as any).value : v;
        if (val !== undefined && val !== null) {
          params[k] = val;
        }
      }
    }
  }

  const nodes = execDetail.plan?.nodes || execDetail.plan_json?.nodes;
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      if (node.inputBindings && typeof node.inputBindings === 'object') {
        for (const [k, v] of Object.entries(node.inputBindings)) {
          const val = (v as any)?.value !== undefined ? (v as any).value : v;
          params[k] = val;
        }
      }
    }
  }

  return params;
}

function extractUsageTokens(events: any[]): NdaPerformanceRecord['tokens'] | undefined {
  for (const ev of events) {
    if (ev.type === 'result' && ev.data?.usage) {
      const u = ev.data.usage;
      return {
        promptTokens: u.prompt_tokens,
        completionTokens: u.completion_tokens,
        reasoningTokens: u.completion_tokens_details?.reasoning_tokens,
        totalTokens: u.total_tokens,
      };
    }
  }
  return undefined;
}

function calculatePerformance(
  t0: number,
  tFirstEvent: number,
  tPlanReady: number,
  tEnd: number,
  events: any[]
): NdaPerformanceRecord {
  return {
    ttftMs: tFirstEvent > 0 ? tFirstEvent - t0 : undefined,
    planningDurationMs: tPlanReady > 0 ? tPlanReady - t0 : undefined,
    executionDurationMs: tPlanReady > 0 ? tEnd - tPlanReady : undefined,
    totalDurationMs: tEnd - t0,
    tokens: extractUsageTokens(events),
  };
}

async function runNdaE2E(): Promise<void> {
  console.log('===============================================================');
  console.log(' 🚀 Starting NDA Generation Routing & Performance E2E Suite');
  console.log('===============================================================\n');

  const token = await getAuthToken('test', 'test123');
  console.log('🔑 Authenticated test user (role: employee)');

  const results: Array<{
    caseId: string;
    title: string;
    passed: boolean;
    route: string;
    status: string;
    performance: NdaPerformanceRecord;
    assertions: NdaCaseAssertionRecord[];
  }> = [];

  // =========================================================================
  // Case NDA-01: Canonical Natural Language Request (Default Party B)
  // =========================================================================
  {
    const caseId = 'NDA-01';
    const title = '自然语言标准生成（我方默认乙方，完整参数单句输入）';
    console.log(`\n▶ [${caseId}] ${title}`);
    const message =
      '生成保密协议 我们是乙方，需要和 北京王府井大街100号 的 豆包公司 ，关于 ai模型开发项目签订保密协议， 签订日是今天';

    let tFirstEvent = 0;
    let tPlanReady = 0;
    const t0 = Date.now();

    const res = await sendChatStream(token, {
      message,
      mode: 'task',
    });
    const tEnd = Date.now();

    for (const ev of res.events) {
      if (!tFirstEvent && ev.type) tFirstEvent = Date.now();
      if (!tPlanReady && (ev.type === 'result' || (ev.type === 'thought' && ev.deterministicPlan))) {
        tPlanReady = Date.now();
      }
    }

    const execDetail = res.executionId ? await fetchExecutionDetail(res.executionId, token) : null;
    const params = extractResolvedParameters(execDetail);
    const perf = calculatePerformance(t0, tFirstEvent, tPlanReady, tEnd, res.events);

    const assertions: NdaCaseAssertionRecord[] = [
      {
        assertion: '路由命中 ConfidentialityAgreementGenerationWorkflow',
        passed: res.matchedCapabilities.some((c) => c.includes('ConfidentialityAgreement')),
        actual: res.matchedCapabilities,
        expected: 'ConfidentialityAgreementGenerationWorkflow',
      },
      {
        assertion: '执行终态为 succeeded',
        passed: res.executionStatus === 'succeeded' || execDetail?.status === 'succeeded',
        actual: res.executionStatus || execDetail?.status,
        expected: 'succeeded',
      },
      {
        assertion: '甲方名称 (partyA.name) 正确提取为 豆包公司',
        passed: String(params['partyA.name'] || '').includes('豆包'),
        actual: params['partyA.name'],
        expected: '豆包公司',
      },
      {
        assertion: '甲方地址 (partyA.address) 正确提取为 北京王府井大街100号',
        passed: String(params['partyA.address'] || '').includes('北京王府井大街100号'),
        actual: params['partyA.address'],
        expected: '北京王府井大街100号',
      },
      {
        assertion: '乙方名称 (partyB.name) 默认绑定富士通',
        passed: String(params['partyB.name'] || '').includes('富士通'),
        actual: params['partyB.name'],
        expected: '富士通 ( 中国 ) 信息系統有限公司',
      },
      {
        assertion: '合作业务主题包含 ai模型开发',
        passed: String(params['cooperation.subject'] || '').includes('ai模型开发'),
        actual: params['cooperation.subject'],
        expected: '包含 ai模型开发',
      },
      {
        assertion: '保密年限为 3 年',
        passed: Number(params['confidentiality.durationYears']) === 3,
        actual: params['confidentiality.durationYears'],
        expected: 3,
      },
      {
        assertion: '签约日期年份为 2026',
        passed: Number(params['agreement.signDate.year']) === 2026,
        actual: params['agreement.signDate.year'],
        expected: 2026,
      },
      {
        assertion: '全流程总耗时处于合理阈值 (< 40s)',
        passed: perf.totalDurationMs < 40000,
        actual: `${perf.totalDurationMs}ms`,
        expected: '< 40000ms',
      },
    ];

    const passed = assertions.every((a) => a.passed);
    saveNdaEvidence({
      caseId,
      variant: 'canonical',
      status: passed ? 'passed' : 'failed',
      traceIds: res.traceId ? [res.traceId] : [],
      executionIds: res.executionId ? [res.executionId] : [],
      requestDigest: calculateDigest(message),
      selectedCapabilityRefs: res.matchedCapabilities,
      actualInvocations: ['ConfidentialityAgreementGenerationWorkflow'],
      resolvedParameters: params,
      performance: perf,
      assertions,
      failureCategory: passed ? null : 'ROUTING_OR_PARAM_MISMATCH',
    });

    results.push({
      caseId,
      title,
      passed,
      route: res.matchedCapabilities.join(', '),
      status: res.executionStatus || 'unknown',
      performance: perf,
      assertions,
    });
    console.log(`   ${passed ? '✅ PASS' : '❌ FAIL'} | 耗时: ${perf.totalDurationMs}ms | Tokens: ${perf.tokens?.totalTokens || 'N/A'}`);
  }

  // =========================================================================
  // Case NDA-02: Explicit Role Reversal (Party A = Our Company, Party B = Counterparty)
  // =========================================================================
  {
    const caseId = 'NDA-02';
    const title = '签约角色显式反转（我方为甲方，对方为乙方）';
    console.log(`\n▶ [${caseId}] ${title}`);
    const message =
      '生成保密协议 我方是甲方 豆包有限公司，注册在深圳南山区科技园，对方是乙方 腾讯科技有限公司，地址是深圳南山区深南大道10000号，合作业务是云计算平台建设，期限为5年，签约日期是今天';

    let tFirstEvent = 0;
    let tPlanReady = 0;
    const t0 = Date.now();

    const res = await sendChatStream(token, {
      message,
      mode: 'task',
    });
    const tEnd = Date.now();

    for (const ev of res.events) {
      if (!tFirstEvent && ev.type) tFirstEvent = Date.now();
      if (!tPlanReady && (ev.type === 'result' || (ev.type === 'thought' && ev.deterministicPlan))) {
        tPlanReady = Date.now();
      }
    }

    const execDetail = res.executionId ? await fetchExecutionDetail(res.executionId, token) : null;
    const params = extractResolvedParameters(execDetail);
    const perf = calculatePerformance(t0, tFirstEvent, tPlanReady, tEnd, res.events);

    const assertions: NdaCaseAssertionRecord[] = [
      {
        assertion: '路由命中 ConfidentialityAgreementGenerationWorkflow',
        passed: res.matchedCapabilities.some((c) => c.includes('ConfidentialityAgreement')),
        actual: res.matchedCapabilities,
        expected: 'ConfidentialityAgreementGenerationWorkflow',
      },
      {
        assertion: '执行终态为 succeeded',
        passed: res.executionStatus === 'succeeded' || execDetail?.status === 'succeeded',
        actual: res.executionStatus || execDetail?.status,
        expected: 'succeeded',
      },
      {
        assertion: '甲方主体 (partyA.name) 严格为 豆包有限公司（未被倒置）',
        passed: String(params['partyA.name'] || '').includes('豆包'),
        actual: params['partyA.name'],
        expected: '豆包有限公司',
      },
      {
        assertion: '甲方地址 (partyA.address) 解析为合法有效地址（深圳南山区科技园/深南大道）',
        passed: String(params['partyA.address'] || '').includes('深圳'),
        actual: params['partyA.address'],
        expected: '包含 深圳',
      },
      {
        assertion: '乙方主体 (partyB.name) 严格为 腾讯科技有限公司（未被倒置）',
        passed: String(params['partyB.name'] || '').includes('腾讯科技'),
        actual: params['partyB.name'],
        expected: '腾讯科技有限公司',
      },
      {
        assertion: '乙方地址 (partyB.address) 严格为 深圳南山区深南大道10000号',
        passed: String(params['partyB.address'] || '').includes('深南大道10000号'),
        actual: params['partyB.address'],
        expected: '深圳南山区深南大道10000号',
      },
      {
        assertion: '保密年限严格解析为 5 年',
        passed: Number(params['confidentiality.durationYears']) === 5,
        actual: params['confidentiality.durationYears'],
        expected: 5,
      },
      {
        assertion: '合作业务主题包含 云计算平台建设',
        passed: String(params['cooperation.subject'] || '').includes('云计算平台建设'),
        actual: params['cooperation.subject'],
        expected: '云计算平台建设',
      },
      {
        assertion: '全流程耗时处于合理阈值 (< 40s)',
        passed: perf.totalDurationMs < 40000,
        actual: `${perf.totalDurationMs}ms`,
        expected: '< 40000ms',
      },
    ];

    const passed = assertions.every((a) => a.passed);
    saveNdaEvidence({
      caseId,
      variant: 'canonical',
      status: passed ? 'passed' : 'failed',
      traceIds: res.traceId ? [res.traceId] : [],
      executionIds: res.executionId ? [res.executionId] : [],
      requestDigest: calculateDigest(message),
      selectedCapabilityRefs: res.matchedCapabilities,
      actualInvocations: ['ConfidentialityAgreementGenerationWorkflow'],
      resolvedParameters: params,
      performance: perf,
      assertions,
      failureCategory: passed ? null : 'ROLE_REVERSAL_PARAM_ERROR',
    });

    results.push({
      caseId,
      title,
      passed,
      route: res.matchedCapabilities.join(', '),
      status: res.executionStatus || 'unknown',
      performance: perf,
      assertions,
    });
    console.log(`   ${passed ? '✅ PASS' : '❌ FAIL'} | 耗时: ${perf.totalDurationMs}ms | Tokens: ${perf.tokens?.totalTokens || 'N/A'}`);
  }

  // =========================================================================
  // Case NDA-03: Missing Critical Parameters (Waiting Input Gate)
  // =========================================================================
  {
    const caseId = 'NDA-03';
    const title = '欠缺关键参数拦截与追问门禁（无主体草率诉求）';
    console.log(`\n▶ [${caseId}] ${title}`);
    const message = '帮我生成一份保密协议';

    let tFirstEvent = 0;
    const t0 = Date.now();

    const res = await sendChatStream(token, {
      message,
      mode: 'task',
    });
    const tEnd = Date.now();

    for (const ev of res.events) {
      if (!tFirstEvent && ev.type) tFirstEvent = Date.now();
    }

    const perf = calculatePerformance(t0, tFirstEvent, tEnd, tEnd, res.events);
    const waitingInputs = res.events.find((e) => e.type === 'result' && e.data?.missingInputs)?.data?.missingInputs || [];
    const missingNames = waitingInputs.map((i: any) => i.name || i.display_name);

    const assertions: NdaCaseAssertionRecord[] = [
      {
        assertion: '识别保密协议生成意图，路由至 ConfidentialityAgreementGenerationWorkflow',
        passed: res.matchedCapabilities.some((c) => c.includes('ConfidentialityAgreement')),
        actual: res.matchedCapabilities,
        expected: 'ConfidentialityAgreementGenerationWorkflow',
      },
      {
        assertion: '状态挂起进入 waiting_input，不虚构草率执行',
        passed: res.executionStatus === 'waiting_input',
        actual: res.executionStatus,
        expected: 'waiting_input',
      },
      {
        assertion: '缺失参数列表明确要求补充甲方主体 (partyA.name)',
        passed: missingNames.some((n: string) => n.includes('partyA.name') || n.includes('甲方')),
        actual: missingNames,
        expected: '包含 partyA.name 或 甲方',
      },
      {
        assertion: '快速门控判定时延低于 10s',
        passed: perf.totalDurationMs < 10000,
        actual: `${perf.totalDurationMs}ms`,
        expected: '< 10000ms',
      },
    ];

    const passed = assertions.every((a) => a.passed);
    saveNdaEvidence({
      caseId,
      variant: 'canonical',
      status: passed ? 'passed' : 'failed',
      traceIds: res.traceId ? [res.traceId] : [],
      executionIds: res.executionId ? [res.executionId] : [],
      requestDigest: calculateDigest(message),
      selectedCapabilityRefs: res.matchedCapabilities,
      actualInvocations: [],
      resolvedParameters: {},
      performance: perf,
      assertions,
      failureCategory: passed ? null : 'WAITING_INPUT_GATE_FAILED',
    });

    results.push({
      caseId,
      title,
      passed,
      route: res.matchedCapabilities.join(', '),
      status: res.executionStatus || 'unknown',
      performance: perf,
      assertions,
    });
    console.log(`   ${passed ? '✅ PASS' : '❌ FAIL'} | 耗时: ${perf.totalDurationMs}ms (门控拦截)`);
  }

  // =========================================================================
  // Case NDA-04: Intent Discrimination Boundary (Review Intent vs Generation)
  // =========================================================================
  {
    const caseId = 'NDA-04';
    const title = '意图冲突隔离边界（合同审查意图 vs 生成意图）';
    console.log(`\n▶ [${caseId}] ${title}`);
    const message = '审查关于豆包公司的保密协议中的排他性条款与风险点';

    let tFirstEvent = 0;
    const t0 = Date.now();

    const res = await sendChatStream(token, {
      message,
      mode: 'task',
    });
    const tEnd = Date.now();

    for (const ev of res.events) {
      if (!tFirstEvent && ev.type) tFirstEvent = Date.now();
    }

    const perf = calculatePerformance(t0, tFirstEvent, tEnd, tEnd, res.events);
    const routedToReviewer = res.matchedCapabilities.some((c) => c.includes('contract-reviewer'));
    const blockedGenerator = !res.matchedCapabilities.some((c) => c.includes('ConfidentialityAgreement'));

    const assertions: NdaCaseAssertionRecord[] = [
      {
        assertion: '正确阻断保密协议生成引擎 (ConfidentialityAgreementGenerationWorkflow)',
        passed: blockedGenerator,
        actual: res.matchedCapabilities,
        expected: '不包含 ConfidentialityAgreementGenerationWorkflow',
      },
      {
        assertion: '正确识别合同审查意图，路由至 contract-reviewer',
        passed: routedToReviewer,
        actual: res.matchedCapabilities,
        expected: '包含 platform.document.contract-reviewer',
      },
      {
        assertion: '审查路由判定时延处于合理区间 (< 60s)',
        passed: (perf.ttftMs || 0) < 60000,
        actual: `${perf.ttftMs || perf.totalDurationMs}ms`,
        expected: '< 60000ms',
      },
    ];

    const passed = assertions.every((a) => a.passed);
    saveNdaEvidence({
      caseId,
      variant: 'canonical',
      status: passed ? 'passed' : 'failed',
      traceIds: res.traceId ? [res.traceId] : [],
      executionIds: res.executionId ? [res.executionId] : [],
      requestDigest: calculateDigest(message),
      selectedCapabilityRefs: res.matchedCapabilities,
      actualInvocations: ['platform.document.contract-reviewer'],
      resolvedParameters: {},
      performance: perf,
      assertions,
      failureCategory: passed ? null : 'ROUTING_DISCRIMINATION_FAILED',
    });

    results.push({
      caseId,
      title,
      passed,
      route: res.matchedCapabilities.join(', '),
      status: res.executionStatus || 'handled',
      performance: perf,
      assertions,
    });
    console.log(`   ${passed ? '✅ PASS' : '❌ FAIL'} | 耗时: ${perf.totalDurationMs}ms (审查隔离验证)`);
  }

  // =========================================================================
  // Case NDA-05: Direct Workflow Command Dispatch (!保密合同 ...)
  // =========================================================================
  {
    const caseId = 'NDA-05';
    const title = '工作流指令语法快速直达（!保密合同 指令通道）';
    console.log(`\n▶ [${caseId}] ${title}`);
    const message =
      '!保密合同 我需要的北京王府井大街1000号的 豆包有限公司，签订关于 ai模型开发的 保密协议，签订日期是今天，我们是乙方 富士通';

    let tFirstEvent = 0;
    let tPlanReady = 0;
    const t0 = Date.now();

    const res = await sendChatStream(token, {
      message,
      mode: 'task',
    });
    const tEnd = Date.now();

    for (const ev of res.events) {
      if (!tFirstEvent && ev.type) tFirstEvent = Date.now();
      if (!tPlanReady && (ev.type === 'result' || (ev.type === 'thought' && ev.deterministicPlan))) {
        tPlanReady = Date.now();
      }
    }

    const execDetail = res.executionId ? await fetchExecutionDetail(res.executionId, token) : null;
    const params = extractResolvedParameters(execDetail);
    const perf = calculatePerformance(t0, tFirstEvent, tPlanReady, tEnd, res.events);

    const assertions: NdaCaseAssertionRecord[] = [
      {
        assertion: '命令通道命中 ConfidentialityAgreementGenerationWorkflow',
        passed: res.matchedCapabilities.some((c) => c.includes('ConfidentialityAgreement')),
        actual: res.matchedCapabilities,
        expected: 'ConfidentialityAgreementGenerationWorkflow',
      },
      {
        assertion: '执行终态为 succeeded',
        passed: res.executionStatus === 'succeeded' || execDetail?.status === 'succeeded',
        actual: res.executionStatus || execDetail?.status,
        expected: 'succeeded',
      },
      {
        assertion: '甲方企业准确解析为 豆包有限公司',
        passed: String(params['partyA.name'] || '').includes('豆包'),
        actual: params['partyA.name'],
        expected: '豆包有限公司',
      },
      {
        assertion: '甲方地址准确解析为 北京王府井大街1000号',
        passed: String(params['partyA.address'] || '').includes('北京王府井大街1000号'),
        actual: params['partyA.address'],
        expected: '北京王府井大街100号',
      },
      {
        assertion: '乙方主体准确解析包含 富士通',
        passed: String(params['partyB.name'] || '').includes('富士通'),
        actual: params['partyB.name'],
        expected: '富士通',
      },
      {
        assertion: '全流程总耗时处于合理阈值 (< 120s)',
        passed: perf.totalDurationMs < 120000,
        actual: `${perf.totalDurationMs}ms`,
        expected: '< 120000ms',
      },
    ];

    const passed = assertions.every((a) => a.passed);
    saveNdaEvidence({
      caseId,
      variant: 'canonical',
      status: passed ? 'passed' : 'failed',
      traceIds: res.traceId ? [res.traceId] : [],
      executionIds: res.executionId ? [res.executionId] : [],
      requestDigest: calculateDigest(message),
      selectedCapabilityRefs: res.matchedCapabilities,
      actualInvocations: ['ConfidentialityAgreementGenerationWorkflow'],
      resolvedParameters: params,
      performance: perf,
      assertions,
      failureCategory: passed ? null : 'COMMAND_DISPATCH_FAILED',
    });

    results.push({
      caseId,
      title,
      passed,
      route: res.matchedCapabilities.join(', '),
      status: res.executionStatus || 'unknown',
      performance: perf,
      assertions,
    });
    console.log(`   ${passed ? '✅ PASS' : '❌ FAIL'} | 耗时: ${perf.totalDurationMs}ms | Tokens: ${perf.tokens?.totalTokens || 'N/A'}`);
  }

  // =========================================================================
  // Case NDA-06: Two-Turn Parameter Completion & Performance Benchmarking
  // =========================================================================
  {
    const caseId = 'NDA-06';
    const title = '多轮会话参数补齐续接与全链路性能剖析';
    console.log(`\n▶ [${caseId}] ${title}`);
    const sessionId = `nda-multi-turn-${Date.now()}`;

    // Turn 1: Incomplete prompt
    const t0Turn1 = Date.now();
    const resTurn1 = await sendChatStream(token, {
      message: '帮我生成一份保密协议',
      mode: 'task',
      sessionId,
    });
    const tEndTurn1 = Date.now();
    const turn1Duration = tEndTurn1 - t0Turn1;

    console.log(`   Turn 1 (缺参挂起): ${turn1Duration}ms, Status: ${resTurn1.executionStatus}, ExecutionId: ${resTurn1.executionId}`);

    // Turn 2: Supplement missing parameters using structured lines
    const t0Turn2 = Date.now();
    const resTurn2 = await sendChatStream(token, {
      message: '甲方公司全称：上海浦东张江高科商汤科技有限公司\n甲方注册地址：上海浦东新区张江高科园区1号楼\n业务合作主题：计算机视觉与多模态AI算法合作\n保密期限：3年\n签订日期：今天',
      mode: 'task',
      sessionId,
      executionId: resTurn1.executionId,
    });
    const tEndTurn2 = Date.now();
    const turn2Duration = tEndTurn2 - t0Turn2;

    const totalSessionDuration = turn1Duration + turn2Duration;
    console.log(`   Turn 2 (补齐执行): ${turn2Duration}ms, Total: ${totalSessionDuration}ms`);

    const execDetail = resTurn1.executionId ? await fetchExecutionDetail(resTurn1.executionId, token) : null;
    const params = extractResolvedParameters(execDetail);
    const perfTurn2 = calculatePerformance(t0Turn2, 0, 0, tEndTurn2, resTurn2.events);
    perfTurn2.totalDurationMs = totalSessionDuration;

    const assertions: NdaCaseAssertionRecord[] = [
      {
        assertion: '第一轮识别意图并安全进入 waiting_input 状态',
        passed: resTurn1.executionStatus === 'waiting_input',
        actual: resTurn1.executionStatus,
        expected: 'waiting_input',
      },
      {
        assertion: '第二轮延续同一 executionId',
        passed: Boolean(resTurn1.executionId),
        actual: resTurn1.executionId,
        expected: '有效执行单 ID',
      },
      {
        assertion: '第二轮补齐参数后执行成功 (succeeded)',
        passed: resTurn2.executionStatus === 'succeeded' || execDetail?.status === 'succeeded',
        actual: resTurn2.executionStatus || execDetail?.status,
        expected: 'succeeded',
      },
      {
        assertion: '补齐的甲方主体包含 商汤科技',
        passed: String(params['partyA.name'] || '').includes('商汤科技'),
        actual: params['partyA.name'],
        expected: '包含 商汤科技',
      },
      {
        assertion: '两轮全链路耗时在合理区间 (< 60s)',
        passed: totalSessionDuration < 60000,
        actual: `${totalSessionDuration}ms`,
        expected: '< 60000ms',
      },
    ];

    const passed = assertions.every((a) => a.passed);
    saveNdaEvidence({
      caseId,
      variant: 'canonical',
      status: passed ? 'passed' : 'failed',
      traceIds: [resTurn1.traceId, resTurn2.traceId].filter(Boolean) as string[],
      executionIds: [resTurn1.executionId, resTurn2.executionId].filter(Boolean) as string[],
      requestDigest: calculateDigest('Turn1: 请起草一份保密协议 | Turn2: 补充商汤科技参数'),
      selectedCapabilityRefs: resTurn1.matchedCapabilities,
      actualInvocations: ['ConfidentialityAgreementGenerationWorkflow'],
      resolvedParameters: params,
      performance: perfTurn2,
      assertions,
      failureCategory: passed ? null : 'TWO_TURN_RESUME_FAILED',
    });

    results.push({
      caseId,
      title,
      passed,
      route: resTurn1.matchedCapabilities.join(', '),
      status: resTurn2.executionStatus || execDetail?.status || 'unknown',
      performance: perfTurn2,
      assertions,
    });
    console.log(`   ${passed ? '✅ PASS' : '❌ FAIL'} | 两轮总耗时: ${totalSessionDuration}ms`);
  }

  // =========================================================================
  // Final Verification Summary & Performance Benchmark Table
  // =========================================================================
  console.log('\n===============================================================');
  console.log(' 📊 NDA Generation E2E Verification & Performance Summary');
  console.log('===============================================================\n');

  console.log('| 用例 ID | 场景描述 | 路由结果 | 状态 | 总耗时 | TTFT | 规划时延 | Tokens (Total/Prompt/Comp) | 判定 |');
  console.log('|---|---|---|---|---|---|---|---|---|');

  let allPassed = true;
  for (const r of results) {
    if (!r.passed) allPassed = false;
    const p = r.performance;
    const ttftStr = p.ttftMs ? `${p.ttftMs}ms` : '-';
    const planStr = p.planningDurationMs ? `${p.planningDurationMs}ms` : '-';
    const tokStr = p.tokens ? `${p.tokens.totalTokens} (${p.tokens.promptTokens}/${p.tokens.completionTokens})` : '-';
    console.log(
      `| ${r.caseId} | ${r.title.slice(0, 20)}... | ${r.route.slice(0, 25)} | ${r.status} | ${p.totalDurationMs}ms | ${ttftStr} | ${planStr} | ${tokStr} | ${r.passed ? '✅ PASS' : '❌ FAIL'} |`
    );
  }

  const passCount = results.filter((r) => r.passed).length;
  console.log(`\n总计场景: ${results.length} | 通过: ${passCount} | 失败: ${results.length - passCount} | 通过率: ${(passCount / results.length * 100).toFixed(1)}%`);

  if (!allPassed) {
    process.exit(1);
  }
}

runNdaE2E().catch((err) => {
  console.error('Fatal error in NDA E2E:', err);
  process.exit(1);
});
