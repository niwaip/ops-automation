import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TaskProgressCard, { humanizeTaskProgressText } from '@chat-web/components/TaskProgressCard';
import TaskOutcomeCard from '@chat-web/components/TaskOutcomeCard';

describe('TaskProgressCard - Single Running Indicator', () => {
  it('renders exactly one "执行中" running indicator in the header', () => {
    const html = renderToStaticMarkup(
      <TaskProgressCard
        currentProgressLog={{
          stage: 'thought',
          text: '已识别到技能: 登录并且调用ai，正在识别参数...',
        }}
        isRunning={true}
      />
    );

    // Header has 执行中 and 当前步骤
    expect(html).toContain('当前步骤');
    expect(html).toContain('已识别到技能: 登录并且调用ai，正在识别参数...');

    // Matches of "执行中" in the rendered markup should be exactly 1
    const occurrences = (html.match(/执行中/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('renders "执行异常" when progress indicates error, and does not duplicate', () => {
    const html = renderToStaticMarkup(
      <TaskProgressCard
        currentProgressLog={{
          stage: 'action',
          text: '调用接口失败，状态码 500',
        }}
        isRunning={true}
      />
    );

    expect(html).toContain('执行异常');
    expect(html).not.toContain('执行中');
  });

  it('returns null when isRunning is false', () => {
    const html = renderToStaticMarkup(
      <TaskProgressCard
        currentProgressLog={{
          stage: 'thought',
          text: '已识别到技能',
        }}
        isRunning={false}
      />
    );

    expect(html).toBe('');
  });
});

describe('StreamingActivityCard - Progress Humanization & Status Passthrough', () => {
  it('correctly humanizes internal tool call and search progress logs', async () => {
    const { humanizeProgressText, StreamingActivityCard } = await import('@chat-web/components/StreamingActivityCard');

    // 1. Tool call
    const toolCallText = '【观察】⚡ [Harness Tool Call] 正在调用工具: web_search("DeepSeek harness desktop 评价 评测 体验")...';
    expect(humanizeProgressText(toolCallText)).toBe('🔍 正在联网检索: DeepSeek harness desktop 评价 评测 体验');

    // 2. Page fetch (Scrubbed)
    const fetchPageText = '⚡ [Harness Tool Call] 正在调用工具: fetch_page("https://reddit.com/r/deepseek")...';
    expect(humanizeProgressText(fetchPageText)).toBe('🌐 正在查阅公开页面与详细内容...');

    // 3. Pre-search
    const preSearchText = '🔍 [Harness Web Search] 正在检索实时数据: "Qwen 3.8 27B"...';
    expect(humanizeProgressText(preSearchText)).toBe('🔍 正在检索实时数据: Qwen 3.8 27B');

    // 4. Agent synthesis round
    const agentRoundText = '⏳ [Harness Agent] 正在根据执行结果汇总交付物 (第 2 轮)...';
    expect(humanizeProgressText(agentRoundText)).toBe('📝 正在结合多源证据进行综合归纳 (第 2 轮)...');

    // 5. Planning
    const planText = '🧠 [Harness Planning Phase] 开启思考模式：正在规划任务方案与实现架构...';
    expect(humanizeProgressText(planText)).toBe('🧠 开启任务思考：正在规划实现架构与检索策略...');

    // 6. Tool completion (No tool name leaked)
    const completeText = '✓ 工具 [web_search] 执行完成';
    expect(humanizeProgressText(completeText)).toBe('✓ 实时网络数据检索完成，进一步归纳中...');

    // 7. Bash Deep Research tool call (Zero Leak of internal command/script/path)
    const bashResearchText = '⚡ [Harness Tool Call] 正在调用工具: bash(python3 /opt/dsh/skills/research/scripts/deep_research.py "deepseek harness desktop")...';
    expect(humanizeProgressText(bashResearchText)).toBe('🔍 正在深度采集全网多源评测与讨论...');
    expect(humanizeProgressText(bashResearchText)).not.toContain('/opt/dsh');
    expect(humanizeProgressText(bashResearchText)).not.toContain('python3');
    expect(humanizeProgressText(bashResearchText)).not.toContain('bash');

    // 8. Deep research sub-step logs
    const hnSubStep = '  ✓ Hacker News 命中: 6 条技术争鸣与点赞讨论';
    expect(humanizeProgressText(hnSubStep)).toBe('✓ 已获取开发者社区技术讨论与评价');
    const ghSubStep = '✓ GitHub 命中: 5 个相关项目与工程实践';
    expect(humanizeProgressText(ghSubStep)).toBe('✓ 已获取开源社区与项目实践反馈');

    // 9. Full Card Rendering (Non-compact)
    const cardHtml = renderToStaticMarkup(
      <StreamingActivityCard
        isStreaming={true}
        userQuery="查看deepseek harness desktop的评价"
        currentProgressText={toolCallText}
        realContentLength={0}
      />
    );
    expect(cardHtml).toContain('正在进行多源深度调研与事实检索');
    expect(cardHtml).toContain('🔍 正在联网检索: DeepSeek harness desktop 评价 评测 体验');
    expect(cardHtml).toContain('深度调研中');
    expect(cardHtml).toContain('streaming-shimmer');

    // 10. Compact Card Rendering
    const compactHtml = renderToStaticMarkup(
      <StreamingActivityCard
        isStreaming={true}
        userQuery="查看deepseek harness desktop的评价"
        currentProgressText={toolCallText}
        realContentLength={120}
        compact={true}
      />
    );
    expect(compactHtml).toContain('已生成 120 字');

    // 11. Normal Search / Popular Skill Query (Does NOT falsely show "深度调研中")
    const searchCardHtml = renderToStaticMarkup(
      <StreamingActivityCard
        isStreaming={true}
        userQuery="查看现在github最流行的skill"
        currentProgressText={preSearchText}
        realContentLength={0}
      />
    );
    expect(searchCardHtml).toContain('正在检索与分析实时信息');
    expect(searchCardHtml).toContain('联网检索中');
    expect(searchCardHtml).not.toContain('深度调研中');
  });
});

describe('TaskOutcomeCard & Progress Humanization for End Users', () => {
  it('humanizes technical workflow names into natural user-friendly text', () => {
    const rawProgress = '已识别到技能: ConfidentialityAgreementGenerationWorkflow，正在识别参数...';
    const humanized = humanizeTaskProgressText(rawProgress);
    expect(humanized).toBe('已识别到保密协议生成需求，正在识别参数...');
    expect(humanized).not.toContain('ConfidentialityAgreementGenerationWorkflow');

    const genericWorkflow = '已识别到技能: PurchaseContractReviewWorkflow，正在识别参数...';
    const humanizedGeneric = humanizeTaskProgressText(genericWorkflow);
    expect(humanizedGeneric).toBe('已识别对应业务流程，正在识别参数...');
  });

  it('hides executionId and technical workflow skill name when showTechnicalMeta is false (user-facing)', () => {
    const html = renderToStaticMarkup(
      <TaskOutcomeCard
        executionStatus="已完成"
        executionId="b8a52827-ea97-4a38-b9e3-85c94b4a75d3"
        skillName="ConfidentialityAgreementGenerationWorkflow"
        hasBusinessResult={true}
        showTechnicalMeta={false}
        finalResult="保密协议已成功生成，具体信息如下："
        browserExecutionMode={false}
        shouldShowTakeoverCard={false}
        shouldShowErrorCard={false}
        shouldShowStructuredResult={false}
        isWaitingInput={false}
        isPendingApproval={false}
        showRunningState={false}
        waitingInputGroups={[]}
        waitingInputItems={[]}
        approvalAction={null}
        onApproveExecution={() => {}}
        onRejectExecution={() => {}}
      />
    );

    expect(html).toContain('任务结果');
    expect(html).toContain('状态：已完成');
    // 普通用户视角下，技术 executionId 和英文工作流类名被隐藏
    expect(html).not.toContain('b8a52827-ea97-4a38-b9e3-85c94b4a75d3');
    expect(html).not.toContain('ConfidentialityAgreementGenerationWorkflow');
    expect(html).toContain('保密协议已成功生成');
  });

  it('retains executionId and technical workflow skill name when showTechnicalMeta is true (admin/portal)', () => {
    const html = renderToStaticMarkup(
      <TaskOutcomeCard
        executionStatus="已完成"
        executionId="b8a52827-ea97-4a38-b9e3-85c94b4a75d3"
        skillName="ConfidentialityAgreementGenerationWorkflow"
        hasBusinessResult={true}
        showTechnicalMeta={true}
        finalResult="保密协议已成功生成"
        browserExecutionMode={false}
        shouldShowTakeoverCard={false}
        shouldShowErrorCard={false}
        shouldShowStructuredResult={false}
        isWaitingInput={false}
        isPendingApproval={false}
        showRunningState={false}
        waitingInputGroups={[]}
        waitingInputItems={[]}
        approvalAction={null}
        onApproveExecution={() => {}}
        onRejectExecution={() => {}}
      />
    );

    expect(html).toContain('执行单 ID：b8a52827-ea97-4a38-b9e3-85c94b4a75d3');
    expect(html).toContain('ConfidentialityAgreementGenerationWorkflow');
  });
});

