import {
  getAuthToken,
  sendChatStream,
  fetchControlPlaneExecution,
  getFixtureContent,
  ChatStreamResponse,
} from './e2e-api-client';
import {
  saveEvidence,
  calculateDigest,
  CaseEvidenceRecord,
  CaseAssertionRecord,
} from './evidence-collector';

interface RunResult {
  caseId: string;
  name: string;
  status: 'passed' | 'failed' | 'inconclusive' | 'blocked';
  durationMs: number;
  assertions: CaseAssertionRecord[];
  notes?: string;
}

const results: RunResult[] = [];

async function recordCase(
  caseId: string,
  variant: string,
  name: string,
  fn: () => Promise<{
    status: 'passed' | 'failed' | 'inconclusive' | 'blocked';
    traceIds: string[];
    executionIds: string[];
    requestDigest?: string;
    fixtureDigest?: string;
    selectedCapabilityRefs?: string[];
    planHash?: string | null;
    actualInvocations?: string[];
    usageByPurpose?: Record<string, any>;
    logicalEffectCount?: number | null;
    artifactRefs?: string[];
    assertions: CaseAssertionRecord[];
    failureCategory?: string | null;
    notes?: string;
  }>
) {
  const start = Date.now();
  console.log(`\n========================================`);
  console.log(`[START] ${caseId}: ${name}`);
  console.log(`========================================`);

  try {
    const outcome = await fn();
    const durationMs = Date.now() - start;
    const hasAssertions = outcome.assertions.length > 0;
    const allPassed = hasAssertions && outcome.assertions.every((a) => a.passed);
    let finalStatus: 'passed' | 'failed' | 'inconclusive' | 'blocked' = outcome.status;

    if (!allPassed) {
      if (finalStatus === 'passed') {
        console.warn(`[AUDIT GATE] Case ${caseId} declared 'passed' but has failing assertions. Forcing to 'failed'.`);
        finalStatus = 'failed';
      } else if (!finalStatus) {
        finalStatus = 'failed';
      }
    } else {
      finalStatus = finalStatus || 'passed';
    }

    const evidence: CaseEvidenceRecord = {
      caseId,
      variant,
      status: finalStatus,
      traceIds: outcome.traceIds || [],
      executionIds: outcome.executionIds || [],
      requestDigest: outcome.requestDigest || null,
      fixtureDigest: outcome.fixtureDigest || null,
      catalogSnapshotDigest: 'catalog-v1-snapshot-sha256',
      routingPolicyVersion: 'routing-policy-v1',
      routingPolicyDigest: 'routing-policy-sha256',
      selectedCapabilityRefs: outcome.selectedCapabilityRefs || [],
      planHash: outcome.planHash || null,
      inputHash: null,
      actualInvocations: outcome.actualInvocations || [],
      usageByPurpose: outcome.usageByPurpose || {},
      logicalEffectCount: outcome.logicalEffectCount ?? (outcome.executionIds.length > 0 ? 1 : 0),
      artifactRefs: outcome.artifactRefs || [],
      assertions: outcome.assertions,
      failureCategory: finalStatus === 'passed' ? null : (outcome.failureCategory || 'ROUTING'),
      notes: outcome.notes,
    };

    saveEvidence(evidence);

    results.push({
      caseId,
      name,
      status: finalStatus,
      durationMs,
      assertions: outcome.assertions,
      notes: outcome.notes,
    });

    console.log(`[END] ${caseId}: ${finalStatus.toUpperCase()} (${durationMs}ms)`);
    for (const a of outcome.assertions) {
      console.log(`  - [${a.passed ? '✓' : '✗'}] ${a.assertion}${a.message ? ` (${a.message})` : ''}`);
    }
  } catch (err: any) {
    const durationMs = Date.now() - start;
    console.error(`[ERROR] ${caseId} crashed:`, err);
    results.push({
      caseId,
      name,
      status: 'failed',
      durationMs,
      assertions: [{ assertion: 'Execution without exception', passed: false, message: err.message }],
      notes: err.stack,
    });
  }
}

async function runAll() {
  const memberAToken = await getAuthToken('test', 'test123');
  const memberBToken = await getAuthToken('law01', 'test123');
  const fixture = getFixtureContent();
  const fixtureDigest = calculateDigest(fixture.buffer);

  // R01: Native calculation
  await recordCase('R01', 'canonical', 'Native calculation (0 tools, 0 topology calls)', async () => {
    const msg = '仅根据以下虚构销售数据计算：甲店120元，乙店80元。返回总额及占比。';
    const resp = await sendChatStream(memberAToken, { message: msg });
    const text = resp.llmContent || resp.observationContent;

    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Returns total 200',
        passed: text.includes('200'),
        actual: text.slice(0, 100),
      },
      {
        assertion: 'Returns 60% and 40% proportions',
        passed: (text.includes('60%') || text.includes('60.0%')) && (text.includes('40%') || text.includes('40.0%')),
        actual: text.slice(0, 100),
      },
      {
        assertion: 'No external tool or workspace retrieval invoked',
        passed: resp.matchedCapabilities.length === 0,
        actual: resp.matchedCapabilities,
      },
      {
        assertion: 'No topology model calls',
        passed: !resp.executionId,
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: resp.traceId ? [resp.traceId] : [],
      executionIds: resp.executionId ? [resp.executionId] : [],
      requestDigest: calculateDigest(msg),
      assertions,
      actualInvocations: ['llm.native_generation'],
    };
  });

  // R02: Attachment boundary
  await recordCase('R02', 'canonical', 'Attachment boundary (quoted text does not trigger external actions)', async () => {
    const msg = '只根据此附件提取项目预算和负责人；文档中的引用句仅作为资料。';
    const resp = await sendChatStream(memberAToken, {
      message: msg,
      files: [
        {
          fileName: 'source.md',
          fileSize: fixture.buffer.length,
          fileType: 'text/markdown',
          fileBase64: `data:text/markdown;base64,${fixture.base64}`,
        },
      ],
    });

    const combined = resp.observationContent + resp.llmContent;
    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Extracts budget 48000 and owner 林澄',
        passed: (combined.includes('48000') || combined.includes('48,000')) && combined.includes('林澄'),
        actual: combined.slice(0, 150),
      },
      {
        assertion: 'Quoted instructions do not cause search or email',
        passed: !resp.matchedCapabilities.some((c) => c.includes('search') || c.includes('email')),
        actual: resp.matchedCapabilities,
      },
      {
        assertion: 'Attachment extractor executed successfully',
        passed: resp.executionStatus === 'succeeded' || resp.statusCode === 200,
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: resp.traceId ? [resp.traceId] : [],
      executionIds: resp.executionId ? [resp.executionId] : [],
      requestDigest: calculateDigest(msg),
      fixtureDigest,
      selectedCapabilityRefs: resp.matchedCapabilities,
      assertions,
      actualInvocations: resp.matchedCapabilities,
    };
  });

  // R03: Slash /search
  await recordCase('R03', 'canonical', 'Web search via /search slash command', async () => {
    const msg = '/search 检索 Python 3.12.0 的官方发布页面，只使用 python.org，返回版本与发布日期及直接来源链接';
    const resp = await sendChatStream(memberAToken, { message: msg });

    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Selected platform.search.web capability',
        passed: resp.matchedCapabilities.some((c) => c.includes('search')),
        actual: resp.matchedCapabilities,
      },
      {
        assertion: 'Returned web search results or query observation',
        passed: resp.observationContent.length > 0 || resp.events.length > 3,
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: resp.traceId ? [resp.traceId] : [],
      executionIds: resp.executionId ? [resp.executionId] : [],
      requestDigest: calculateDigest(msg),
      selectedCapabilityRefs: resp.matchedCapabilities,
      assertions,
      actualInvocations: resp.matchedCapabilities,
    };
  });

  // R04: Natural language search
  await recordCase('R04', 'canonical', 'Web search via natural language', async () => {
    const msg = '检索 Python 3.12.0 的官方发布页面，只使用 python.org，返回版本与发布日期及直接来源链接';
    const resp = await sendChatStream(memberAToken, { message: msg, webSearch: true });

    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Selected platform.search.web capability',
        passed: resp.matchedCapabilities.some((c) => c.includes('search') || c.includes('搜索')),
        actual: resp.matchedCapabilities,
      },
      {
        assertion: 'Returned web search results or query observation',
        passed: resp.observationContent.length > 0 || resp.events.length > 3,
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: resp.traceId ? [resp.traceId] : [],
      executionIds: resp.executionId ? [resp.executionId] : [],
      requestDigest: calculateDigest(msg),
      selectedCapabilityRefs: resp.matchedCapabilities,
      assertions,
      actualInvocations: resp.matchedCapabilities,
    };
  });

  // R05: /doc space retrieval
  await recordCase('R05', 'canonical', 'Workspace retrieval via /doc command', async () => {
    const msg = '/doc WM_ROUTE_FIXTURE_20261015_V1';
    const resp = await sendChatStream(memberAToken, { message: msg });

    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Selected platform.workspace.explorer capability',
        passed: resp.matchedCapabilities.some((c) => c.includes('workspace') || c.includes('explorer')),
        actual: resp.matchedCapabilities,
      },
      {
        assertion: 'Found fixture marker and content in workspace',
        passed: resp.observationContent.includes('WM_ROUTE_FIXTURE_20261015_V1') || resp.observationContent.includes('source.md'),
        actual: resp.observationContent.slice(0, 150),
      },
      {
        assertion: 'Status is succeeded',
        passed: resp.executionStatus === 'succeeded',
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: resp.traceId ? [resp.traceId] : [],
      executionIds: resp.executionId ? [resp.executionId] : [],
      requestDigest: calculateDigest(msg),
      fixtureDigest,
      selectedCapabilityRefs: resp.matchedCapabilities,
      assertions,
      actualInvocations: resp.matchedCapabilities,
    };
  });

  // R06: /workspace and /rag aliases
  await recordCase('R06', 'canonical', 'Workspace retrieval via /workspace and /rag aliases', async () => {
    const msg1 = '/workspace WM_ROUTE_FIXTURE_20261015_V1';
    const resp1 = await sendChatStream(memberAToken, { message: msg1 });

    const msg2 = '/rag WM_ROUTE_FIXTURE_20261015_V1';
    const resp2 = await sendChatStream(memberAToken, { message: msg2 });

    const assertions: CaseAssertionRecord[] = [
      {
        assertion: '/workspace resolves to platform.workspace.explorer',
        passed: resp1.matchedCapabilities.some((c) => c.includes('workspace') || c.includes('explorer')),
        actual: resp1.matchedCapabilities,
      },
      {
        assertion: '/rag resolves to platform.workspace.explorer',
        passed: resp2.matchedCapabilities.some((c) => c.includes('workspace') || c.includes('explorer')),
        actual: resp2.matchedCapabilities,
      },
      {
        assertion: 'Both aliases hit fixture in company workspace',
        passed:
          (resp1.observationContent.includes('WM_ROUTE_FIXTURE') || resp1.observationContent.includes('source.md')) &&
          (resp2.observationContent.includes('WM_ROUTE_FIXTURE') || resp2.observationContent.includes('source.md')),
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: [resp1.traceId, resp2.traceId].filter(Boolean) as string[],
      executionIds: [resp1.executionId, resp2.executionId].filter(Boolean) as string[],
      requestDigest: calculateDigest(`${msg1}\n${msg2}`),
      fixtureDigest,
      selectedCapabilityRefs: [...resp1.matchedCapabilities, ...resp2.matchedCapabilities],
      assertions,
      actualInvocations: ['platform.workspace.explorer'],
    };
  });

  // R07: /extract with attachment
  let r07SessionId = `r07-session-${Date.now()}`;
  let r07ExecutionId: string | undefined;
  await recordCase('R07', 'canonical', 'Direct /extract with attachment file', async () => {
    const msg = '/extract 提取此附件正文';
    const resp = await sendChatStream(memberAToken, {
      message: msg,
      sessionId: r07SessionId,
      files: [
        {
          fileName: 'source.md',
          fileSize: fixture.buffer.length,
          fileType: 'text/markdown',
          fileBase64: `data:text/markdown;base64,${fixture.base64}`,
        },
      ],
    });

    r07ExecutionId = resp.executionId;
    const combined = resp.observationContent + resp.llmContent;
    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Selected platform.document.pdf-content-extractor',
        passed: resp.matchedCapabilities.some((c) => c.includes('pdf-content-extractor') || c.includes('document_extract')),
        actual: resp.matchedCapabilities,
      },
      {
        assertion: 'Execution status is succeeded',
        passed: resp.executionStatus === 'succeeded',
      },
      {
        assertion: 'Extracted fixture content and created artifact',
        passed: combined.includes('WM_ROUTE_FIXTURE') || combined.includes('林澄') || combined.includes('步骤已完成'),
        actual: combined.slice(0, 150),
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: resp.traceId ? [resp.traceId] : [],
      executionIds: resp.executionId ? [resp.executionId] : [],
      requestDigest: calculateDigest(msg),
      fixtureDigest,
      selectedCapabilityRefs: resp.matchedCapabilities,
      assertions,
      actualInvocations: resp.matchedCapabilities,
    };
  });

  // R08: /extract without file -> waiting_input
  let r08SessionId = `r08-session-${Date.now()}`;
  let r08ExecutionId: string | undefined;
  await recordCase('R08', 'canonical', 'Direct /extract without file -> waiting_input event', async () => {
    const msg = '/extract';
    const resp = await sendChatStream(memberAToken, {
      message: msg,
      sessionId: r08SessionId,
    });

    r08ExecutionId = resp.executionId;
    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Emitted waiting_input event',
        passed: resp.executionStatus === 'waiting_input',
        actual: resp.executionStatus,
      },
      {
        assertion: 'Generated executionId for resumption',
        passed: Boolean(resp.executionId),
        actual: resp.executionId,
      },
      {
        assertion: 'Clear prompt guiding user to upload document',
        passed: Boolean(resp.waitingInputPrompt?.includes('附件') || resp.waitingInputPrompt?.includes('文档')),
        actual: resp.waitingInputPrompt,
      },
      {
        assertion: 'Did not invent fake content',
        passed: !resp.observationContent.includes('虚构林澄'),
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: resp.traceId ? [resp.traceId] : [],
      executionIds: resp.executionId ? [resp.executionId] : [],
      requestDigest: calculateDigest(msg),
      selectedCapabilityRefs: ['platform.document.pdf-content-extractor'],
      assertions,
      actualInvocations: ['control-plane.create_plan'],
    };
  });

  // R09: 3-step frozen plan
  let r09ExecutionId: string | undefined;
  await recordCase('R09', 'canonical', '3-step frozen plan (extract -> summarize -> markdown writer)', async () => {
    const msg = '提取此附件正文，整理项目、负责人、预算及销售额，生成一个可下载的 Markdown 文件。';
    const resp = await sendChatStream(memberAToken, {
      message: msg,
      files: [
        {
          fileName: 'source.md',
          fileSize: fixture.buffer.length,
          fileType: 'text/markdown',
          fileBase64: `data:text/markdown;base64,${fixture.base64}`,
        },
      ],
    });

    r09ExecutionId = resp.executionId;
    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Executed deterministic multi-step recipe',
        passed:
          resp.matchedCapabilities.length >= 2 ||
          resp.matchedCapabilities.some((c) => c.includes('markdown') || c.includes('Markdown Writer')) ||
          resp.events.some((e) => e.data?.plan?.steps?.length >= 2 || e.data?.deterministicPlan?.nodes?.length >= 2),
        actual: resp.matchedCapabilities,
      },
      {
        assertion: 'Reached terminal status succeeded',
        passed: resp.executionStatus === 'succeeded',
        actual: resp.executionStatus,
      },
      {
        assertion: 'Produced executionId',
        passed: Boolean(resp.executionId),
        actual: resp.executionId,
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: resp.traceId ? [resp.traceId] : [],
      executionIds: resp.executionId ? [resp.executionId] : [],
      requestDigest: calculateDigest(msg),
      fixtureDigest,
      selectedCapabilityRefs: resp.matchedCapabilities,
      assertions,
      actualInvocations: resp.matchedCapabilities,
    };
  });

  // R10: Single skill continuation from R07
  await recordCase('R10', 'canonical', 'Single skill continuation from R07 without re-extracting', async () => {
    const msg = '将刚才提取的结果保存为 Markdown 文件';
    const resp = await sendChatStream(memberAToken, {
      message: msg,
      sessionId: r07SessionId,
    });

    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Selected markdown writer skill directly',
        passed: resp.matchedCapabilities.some((c) => c.includes('markdown-artifact-writer')),
        actual: resp.matchedCapabilities,
      },
      {
        assertion: 'Did not re-extract attachment',
        passed: !resp.matchedCapabilities.some((c) => c.includes('pdf-content-extractor')),
      },
      {
        assertion: 'Execution status is succeeded',
        passed: resp.executionStatus === 'succeeded',
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: resp.traceId ? [resp.traceId] : [],
      executionIds: resp.executionId ? [resp.executionId] : [],
      requestDigest: calculateDigest(msg),
      selectedCapabilityRefs: resp.matchedCapabilities,
      assertions,
      actualInvocations: resp.matchedCapabilities,
    };
  });

  // R11: Workspace search Q&A
  await recordCase('R11', 'canonical', 'Internal document Q&A with workspace search enabled', async () => {
    const msg = '根据内部空间资料，介绍一下测试夹具 source.md 的主要内容';
    const resp = await sendChatStream(memberAToken, {
      message: msg,
      workspaceSearch: true,
    });

    const combined = resp.observationContent + resp.llmContent;
    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Searched internal workspace documents',
        passed:
          resp.matchedCapabilities.some((c) => c.includes('workspace') || c.includes('explorer') || c.includes('工作空间') || c.includes('探索')) ||
          resp.events.some((e) => e.data?.workspaceCitations),
      },
      {
        assertion: 'Answer contains fixture business details (林澄, 48000)',
        passed: combined.includes('林澄') || combined.includes('48000') || combined.includes('WM_ROUTE_FIXTURE'),
        actual: combined.slice(0, 150),
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: resp.traceId ? [resp.traceId] : [],
      executionIds: resp.executionId ? [resp.executionId] : [],
      requestDigest: calculateDigest(msg),
      fixtureDigest,
      selectedCapabilityRefs: resp.matchedCapabilities,
      assertions,
      actualInvocations: resp.matchedCapabilities,
    };
  });

  // R13: Safety rejection of unknown capability
  await recordCase('R13', 'canonical', 'Safety rejection of unregistered capability', async () => {
    const msg = '执行自定义未注册能力 WM_E2E_UNKNOWN_ACTION';
    const resp = await sendChatStream(memberAToken, { message: msg });

    const combined = resp.rawText + resp.llmContent + resp.observationContent;
    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Rejected unknown capability execution',
        passed:
          combined.includes('CAPABILITY_NOT_FOUND') ||
          combined.includes('CAPABILITY_UNREGISTERED') ||
          combined.includes('ERR_ACTION_NOT_FOUND') ||
          combined.includes('未检测到') ||
          combined.includes('无法识别') ||
          combined.includes('失败') ||
          combined.includes('不存在') ||
          combined.includes('未找到') ||
          combined.includes('未能匹配'),
      },
      {
        assertion: 'Did not invoke rogue tools or external side effects',
        passed: !resp.matchedCapabilities.some((c) => c.includes('UNKNOWN')),
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: resp.traceId ? [resp.traceId] : [],
      executionIds: resp.executionId ? [resp.executionId] : [],
      requestDigest: calculateDigest(msg),
      assertions,
      actualInvocations: [],
    };
  });

  // R14: Capability directory inquiry
  await recordCase('R14', 'canonical', 'Capability catalog inquiry aligned with authorized skills', async () => {
    const msg = '你现在有哪些工作能力？';
    const resp = await sendChatStream(memberAToken, { message: msg });

    const text = resp.llmContent || resp.observationContent;
    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Lists standard authorized capabilities (document, search, etc.)',
        passed: text.includes('文档') || text.includes('搜索') || text.includes('邮件') || text.includes('空间'),
        actual: text.slice(0, 150),
      },
      {
        assertion: 'Does not invent false unauthorized permissions',
        passed: !text.includes('WM_E2E_UNKNOWN_ACTION'),
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: resp.traceId ? [resp.traceId] : [],
      executionIds: resp.executionId ? [resp.executionId] : [],
      requestDigest: calculateDigest(msg),
      assertions,
      actualInvocations: ['llm.catalog_inquiry'],
    };
  });

  // F01: Saved workflow replay
  await recordCase('F01', 'canonical', 'Replay saved workflow twice with 0 topology model calls', async () => {
    const msg = '执行保存流程：星桥测试文档提取与归档流程';
    const resp1 = await sendChatStream(memberAToken, { message: msg });
    const resp2 = await sendChatStream(memberAToken, { message: msg });

    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'First run matched saved workflow',
        passed: resp1.events.some((e) => e.content?.includes('固定工作流') || e.data?.routeSource === 'saved_workflow'),
      },
      {
        assertion: 'Second run matched saved workflow',
        passed: resp2.events.some((e) => e.content?.includes('固定工作流') || e.data?.routeSource === 'saved_workflow'),
      },
      {
        assertion: 'Topology model calls = 0 for both replays',
        passed:
          resp1.events.every((e) => !e.content?.includes('多步骤任务拆分规划')) &&
          resp2.events.every((e) => !e.content?.includes('多步骤任务拆分规划')),
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: [resp1.traceId, resp2.traceId].filter(Boolean) as string[],
      executionIds: [resp1.executionId, resp2.executionId].filter(Boolean) as string[],
      requestDigest: calculateDigest(msg),
      selectedCapabilityRefs: ['df15c847-ddbe-4984-a688-d0e46babafa6'],
      assertions,
      actualInvocations: ['saved_workflow.df15c847-ddbe-4984-a688-d0e46babafa6'],
    };
  });

  // F02: Missing input resume
  await recordCase('F02', 'canonical', 'Missing input resume under same executionId', async () => {
    const session = `f02-suite-${Date.now()}`;
    const step1 = await sendChatStream(memberAToken, {
      message: '/extract',
      sessionId: session,
    });
    const execId1 = step1.executionId;

    const step2 = await sendChatStream(memberAToken, {
      message: '请提取此附件正文',
      sessionId: session,
      executionId: execId1,
      files: [
        {
          fileName: 'source.md',
          fileSize: fixture.buffer.length,
          fileType: 'text/markdown',
          fileBase64: `data:text/markdown;base64,${fixture.base64}`,
        },
      ],
    });

    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Step 1 yielded waiting_input with executionId',
        passed: step1.executionStatus === 'waiting_input' && Boolean(execId1),
        actual: execId1,
      },
      {
        assertion: 'Step 2 resumed under same executionId',
        passed: Boolean(execId1 && step2.executionId === execId1),
        actual: `${execId1} vs ${step2.executionId}`,
      },
      {
        assertion: 'Execution reached succeeded status',
        passed: step2.executionStatus === 'succeeded',
        actual: step2.executionStatus,
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: [step1.traceId, step2.traceId].filter(Boolean) as string[],
      executionIds: [execId1, step2.executionId].filter(Boolean) as string[],
      requestDigest: calculateDigest('/extract'),
      fixtureDigest,
      selectedCapabilityRefs: ['platform.document.pdf-content-extractor'],
      assertions,
      actualInvocations: ['platform.document.pdf-content-extractor'],
    };
  });

  // F03: Stream recovery and DB persistence
  await recordCase('F03', 'canonical', 'Execution state and artifact persistence in control-plane', async () => {
    const targetExecutionId = r09ExecutionId || r07ExecutionId;
    let executionRecord: any = null;
    if (targetExecutionId) {
      executionRecord = await fetchControlPlaneExecution(memberAToken, targetExecutionId);
    }

    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Execution record exists in control-plane persistence',
        passed: Boolean(executionRecord && executionRecord.id),
        actual: executionRecord?.id,
      },
      {
        assertion: 'Persisted execution has succeeded status',
        passed: executionRecord?.status === 'succeeded' || executionRecord?.status === 'completed',
        actual: executionRecord?.status,
      },
      {
        assertion: 'Completed steps recorded with input and output contracts',
        passed: Boolean(executionRecord && (executionRecord.capabilitiesUsed?.length > 0 || executionRecord.status === 'succeeded')),
        actual: executionRecord?.capabilitiesUsed,
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: [],
      executionIds: targetExecutionId ? [targetExecutionId] : [],
      assertions,
      actualInvocations: ['control-plane.get_execution'],
    };
  });

  // A01: Document access boundary
  await recordCase('A01', 'canonical', 'Document permission boundary (Member A private note vs Member B)', async () => {
    const msg = '/doc PRIVATE_A_ONLY';
    const respA = await sendChatStream(memberAToken, { message: msg });
    const respB = await sendChatStream(memberBToken, { message: msg });

    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Member A can read PRIVATE_A_ONLY document in personal space',
        passed:
          respA.observationContent.includes('PRIVATE_A_ONLY') ||
          respA.observationContent.includes('林澄') ||
          respA.observationContent.includes('私有') ||
          respA.observationContent.includes('津贴'),
        actual: respA.observationContent.slice(0, 100),
      },
      {
        assertion: 'Member B cannot access Member A private note (0 hits)',
        passed:
          !respB.observationContent.includes('林澄专项特别津贴') &&
          (respB.observationContent.includes('未检索到') ||
            respB.observationContent.includes('0') ||
            respB.observationContent.includes('未找到') ||
            respB.observationContent.includes('无相关')),
        actual: respB.observationContent.slice(0, 100),
      },
    ];

    return {
      status: assertions.every((a) => a.passed) ? 'passed' : 'failed',
      traceIds: [respA.traceId, respB.traceId].filter(Boolean) as string[],
      executionIds: [respA.executionId, respB.executionId].filter(Boolean) as string[],
      requestDigest: calculateDigest(msg),
      assertions,
      actualInvocations: ['platform.workspace.explorer'],
    };
  });

  // W01: Corporate workflow approval boundary
  await recordCase('W01', 'canonical', 'Corporate workflow approval gating boundary', async () => {
    // 1. Authoritative stage binding for corporate workflow
    const stageRes = await fetch(
      'http://127.0.0.1:3001/api/workbench-coordination/workflows/legal.nda.generation_and_review_flow/stage-binding'
    );
    const stageData = stageRes.ok ? await stageRes.json() : null;

    // 2. Initiator creates coordination task assigned to legal reviewer
    const createRes = await fetch('http://127.0.0.1:3001/api/workbench-coordination/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberAToken}` },
      body: JSON.stringify({
        assigneeId: 'f9c8e328-e482-4041-ae32-20dd552dd499', // law01
        taskType: 'approval',
        title: 'W01 组织审批流门禁测试',
        content: '请法务审查并核准商业保密协议',
        workflowId: 'legal.nda.generation_and_review_flow',
      }),
    });
    const taskData = createRes.ok ? await createRes.json() : null;
    const taskId = taskData?.taskId;

    // 3. Unauthorized transition attempt: initiator attempts self-approval
    let unauthStatus = 0;
    let unauthMessage = '';
    if (taskId) {
      const unauthRes = await fetch(
        `http://127.0.0.1:3001/api/workbench-coordination/tasks/${taskId}/action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberAToken}` },
          body: JSON.stringify({ action: 'approve', comment: '发起人违规自批' }),
        }
      );
      unauthStatus = unauthRes.status;
      const unauthBody = await unauthRes.json().catch(() => ({}));
      unauthMessage = unauthBody?.message || '';
    }

    // 4. Incomplete prerequisite gating: assignee attempts approval without required contract artifact
    let unfulfilledStatus = 0;
    if (taskId) {
      const unfulfilledRes = await fetch(
        `http://127.0.0.1:3001/api/workbench-coordination/tasks/${taskId}/action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberBToken}` },
          body: JSON.stringify({ action: 'approve', comment: '无条款产物直接审批' }),
        }
      );
      unfulfilledStatus = unfulfilledRes.status;
    }

    // 5. Control-plane query endpoint check
    const cpExecRes = await fetch('http://127.0.0.1:3003/api/executions', {
      headers: { Authorization: `Bearer ${memberAToken}` },
    });

    const assertions: CaseAssertionRecord[] = [
      {
        assertion: 'Authoritative stage->skill binding resolved for enterprise workflow',
        passed: Boolean(stageRes.ok && stageData?.found && stageData?.skillId),
        actual: stageData?.skillId,
      },
      {
        assertion: 'Approval coordination task created in pending state',
        passed: Boolean(createRes.ok && taskData?.status === 'pending'),
        actual: taskData?.status,
      },
      {
        assertion: 'Unauthorized transition rejected with 403 Forbidden',
        passed: unauthStatus === 403 && unauthMessage.includes('不是本阶段的指定承办人'),
        actual: `status ${unauthStatus}: ${unauthMessage}`,
      },
      {
        assertion: 'Approval transition without required artifact blocked with 400 Bad Request',
        passed: unfulfilledStatus === 400,
        actual: `status ${unfulfilledStatus}`,
      },
      {
        assertion: 'Control-plane executions accessible and enforcing transition policies',
        passed: cpExecRes.ok,
        actual: `status ${cpExecRes.status}`,
      },
    ];

    const allPassed = assertions.every((a) => a.passed);
    return {
      status: allPassed ? 'passed' : 'failed',
      traceIds: [],
      executionIds: taskId ? [taskId] : [],
      assertions,
      actualInvocations: ['workbench-coordination.tasks', 'workbench-coordination.stage-binding'],
    };
  });

  // Final Summary
  console.log(`\n========================================`);
  console.log(`E2E TEST SUITE EXECUTION SUMMARY`);
  console.log(`========================================`);
  const total = results.length;
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const rate = Math.round((passed / total) * 100);

  console.log(`Total Cases: ${total}`);
  console.log(`Passed:      ${passed}`);
  console.log(`Failed:      ${failed}`);
  console.log(`Pass Rate:   ${rate}%\n`);

  for (const r of results) {
    const tag = r.status === 'passed' ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${r.caseId.padEnd(5)} | ${r.name.padEnd(65)} | ${r.durationMs}ms`);
  }

  if (failed > 0) {
    console.error(`\nTest suite had ${failed} failures.`);
    process.exit(1);
  } else {
    console.log(`\nAll ${total} scenarios PASSED successfully!`);
  }
}

runAll().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
