import React from 'react';
import { LoadingOutlined } from '@ant-design/icons';

export interface StreamingActivityCardProps {
  isStreaming: boolean;
  userQuery?: string;
  currentProgressText?: string;
  realContentLength?: number;
  compact?: boolean;
}

const RESEARCH_PHASES = [
  '🔍 正在并发检索多源社区与全网动态...',
  '🔍 正在连接开发者社区与开源讨论...',
  '🔍 正在比对多源评测观点与社区反馈...',
  '🔍 正在梳理核心事实与关键论据...',
];

const SPREADSHEET_PHASES = [
  '📊 正在定位表格结构与字段映射...',
  '📊 正在执行数据筛选与精确聚合...',
  '📊 正在核算核心指标与勾稽结果...',
];

const SEARCH_PHASES = [
  '🔍 正在检索实时网络与开源社区数据...',
  '🔍 正在筛选与比对相关数据源...',
  '🔍 正在梳理核心事实与关键信息...',
];

const DELIVERABLE_PHASES = [
  '⚙️ 正在组织内容架构与核心模块...',
  '⚙️ 正在渲染视觉样式与排版布局...',
  '⚙️ 正在校验完整性并编译导出...',
];

const GENERAL_PHASES = [
  '⚙️ 正在分析数据与计算...',
  '⚙️ 正在校验结果与执行后续步骤...',
];

const humanizeSingleLine = (rawLine: string): string | undefined => {
  let text = rawLine.trim();
  // 去除 【观察】 或 【行动】 等通用协议前缀
  text = text.replace(/^【(?:观察|行动)】\s*/u, '').trim();

  // 1. Tool Call: ⚡ [Harness Tool Call] 正在调用工具: xxx(...)
  const toolCallMatch = text.match(/⚡\s*\[Harness Tool Call\]\s*正在调用工具:\s*(\w+)\((.*?)\)/iu);
  if (toolCallMatch) {
    const [, toolName, param] = toolCallMatch;
    const lowerTool = toolName.toLowerCase();
    const rawParam = (param || '').trim();

    // 严禁将底层代码、脚本路径或系统命令透传给普通用户
    if (lowerTool === 'bash') {
      const lowerP = rawParam.toLowerCase();
      if (
        lowerP.includes('deep_research') ||
        lowerP.includes('research') ||
        lowerP.includes('hn') ||
        lowerP.includes('github')
      ) {
        return '🔍 正在深度采集全网多源评测与讨论...';
      }
      if (
        lowerP.includes('pdf') ||
        lowerP.includes('generate_report_pdf') ||
        lowerP.includes('carbone') ||
        lowerP.includes('docx') ||
        lowerP.includes('pptx') ||
        lowerP.includes('xlsx')
      ) {
        return '⚙️ 正在排版与编译交付文档...';
      }
      if (lowerP.includes('python') || lowerP.includes('.py') || lowerP.includes('pip')) {
        return '⚙️ 正在处理数据与执行分析任务...';
      }
      return '⚙️ 正在处理数据与执行环境任务...';
    }

    let cleanParam = rawParam.replace(/^[{"'\s]|['"}\s]$/g, '').replace(/\\"/g, '"').trim();
    if (cleanParam.length > 50) {
      cleanParam = cleanParam.slice(0, 48) + '...';
    }

    if (
      lowerTool === 'aggregate_spreadsheet' ||
      lowerTool === 'calculate_spreadsheet_analysis' ||
      lowerTool === 'calculate_column_comparison'
    ) {
      return '📊 正在执行数据筛选与指标核算...';
    }
    if (lowerTool === 'inspect_spreadsheet_structure') {
      return '📋 正在解析表格字段与工作表结构...';
    }
    if (lowerTool === 'compare_spreadsheet_columns') {
      return '⚖️ 正在比对表格列数据差异...';
    }
    if (lowerTool === 'web_search') {
      return cleanParam ? `🔍 正在联网检索: ${cleanParam}` : '🔍 正在联网检索实时信息...';
    }
    if (lowerTool === 'fetch_page') {
      return '🌐 正在查阅公开页面与详细内容...';
    }
    if (lowerTool === 'read_file' || lowerTool === 'read_workspace_file') {
      return '📖 正在分析工作区参考文档...';
    }
    if (lowerTool === 'scan_knowledge') {
      return '📚 正在检索知识库参考资料...';
    }
    return '⚡ 正在执行分析与检索任务...';
  }

  // 2. Pre-search: 🔍 [Harness Web Search] 正在检索实时数据: '...'
  const webSearchMatch = text.match(/🔍\s*\[Harness Web Search\]\s*正在检索实时数据:\s*['"]?(.*?)['"]?\.\.\./iu);
  if (webSearchMatch) {
    const query = webSearchMatch[1].trim();
    return `🔍 正在检索实时数据: ${query.length > 45 ? query.slice(0, 43) + '...' : query}`;
  }

  // 3. Deep Research 子步骤日志 (来自 subprocess 流式透传)
  if (text.includes('[Deep Research]') || text.includes('正在多源并发深度调研')) {
    return '🔍 正在多源并发深度调研相关评价与动态...';
  }
  if (/✓\s*Hacker News 命中/iu.test(text)) {
    return '✓ 已获取开发者社区技术讨论与评价';
  }
  if (/✓\s*GitHub 命中/iu.test(text)) {
    return '✓ 已获取开源社区与项目实践反馈';
  }
  if (/✓\s*Web 实时动态命中/iu.test(text)) {
    return '✓ 已获取全网公开评测与动态资讯';
  }
  if (/✓\s*(?:结构化数据已保存|交互式调研简报已生成)/iu.test(text)) {
    return '✓ 调研简报与数据整理完成';
  }

  // 4. Agent round synthesis: ⏳ [Harness Agent] 正在根据执行结果汇总交付物 (第 2 轮)...
  const agentRoundMatch = text.match(/⏳\s*\[Harness Agent\]\s*正在(?:根据执行结果汇总交付物|进行第\s*(\d+)\s*轮|结合前序采集证据)(.*)/iu);
  if (agentRoundMatch) {
    return `📝 正在结合多源证据进行综合归纳${agentRoundMatch[2] ? ` ${agentRoundMatch[2].trim()}` : ''}`;
  }

  // 5. Planning: 🧠 [Harness Planning Phase]
  if (text.includes('[Harness Planning Phase]') || text.includes('[Harness Planning Search]')) {
    return '🧠 开启任务思考：正在规划实现架构与检索策略...';
  }

  // 6. Tool complete: ✓ 工具 [xxx] 执行完成 / 实时数据检索成功
  const toolDoneMatch = text.match(/✓\s*(?:工具\s*\[?(\w+)\]?\s*执行完成|实时数据检索成功|已抓取高价值页面)/iu);
  if (toolDoneMatch) {
    const name = toolDoneMatch[1]?.toLowerCase();
    if (name === 'bash') {
      return '✓ 阶段数据采集与处理完成，进一步归纳中...';
    }
    if (name === 'web_search') {
      return '✓ 实时网络数据检索完成，进一步归纳中...';
    }
    if (name === 'fetch_page') {
      return '✓ 页面详情解析完成，进一步归纳中...';
    }
    if (name && (name.includes('spreadsheet') || name.includes('aggregate') || name.includes('comparison'))) {
      return '✓ 表格数据处理与核算完成，进一步归纳中...';
    }
    return '✓ 阶段数据获取完成，进一步归纳中...';
  }

  // 7. Artifact compilation: ✨ [Harness Artifact Compiler]
  if (text.includes('[Harness Artifact Compiler]') || text.includes('[Harness Deliverable Compiler]')) {
    return '✨ 交付成果生成完成，正在安全编译落盘...';
  }

  // 8. 过滤内部纯调试标记、冗余垫话与底层命令泄漏
  if (
    text.includes('正在连接个人安全沙箱') ||
    text.includes('DeepSeek Harness') ||
    text.includes('AI 正在分析需求') ||
    text.includes('[Harness Safety Guard]') ||
    text.includes('[Harness Security Guard]') ||
    text.includes('/opt/dsh') ||
    text.includes('/workspace')
  ) {
    return undefined;
  }

  const cleaned = text
    .replace(/\[Harness\s+[^\]]+\]\s*/gu, '')
    .replace(/^⚡\s*/u, '')
    .trim();

  return cleaned.length > 0 ? cleaned : undefined;
};

export const humanizeProgressText = (rawText?: string): string | undefined => {
  if (!rawText) return undefined;
  // If rawText contains multiple lines from accumulated stream events, evaluate latest non-empty lines from bottom up
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const res = humanizeSingleLine(lines[i]);
    if (res) return res;
  }
  return undefined;
};

const resolveTitle = (query?: string): string => {
  const q = (query || '').toLowerCase();
  if (/(?:research|深度调研|全网调研|多源调研|评价|评测|对比|怎么样)/i.test(q)) {
    return '正在进行多源深度调研与事实检索';
  }
  if (/(?:excel|xlsx|表格|表单|算式|报表|工数|工时|明细|金额|合计|汇总|平均|单价|成本中心|wbs)/i.test(q)) {
    return '正在分析表格数据与核算指标';
  }
  if (/(?:搜索|检索|查找|全网|搜一下|最流行|最新|插件|动态|趋势|现状|社区|skill|生态)/i.test(q)) {
    return '正在检索与分析实时信息';
  }
  if (/(?:html|网页|单页|报告|看板|大屏|原型|演示文稿|ppt|slide|五子棋|游戏)/i.test(q)) {
    return '正在构建交付物';
  }
  if (/(?:word|docx|审阅|审查|批注|合同|留痕)/i.test(q)) {
    return '正在处理文档';
  }
  if (/(?:pdf|导出一份pdf|生成pdf)/i.test(q)) {
    return '正在排版与生成 PDF 文档';
  }
  if (/(?:查询)/i.test(q)) {
    return '正在检索与查询数据';
  }
  return 'AI 正在执行任务';
};

export const StreamingActivityCard: React.FC<StreamingActivityCardProps> = ({
  isStreaming,
  userQuery,
  currentProgressText,
  realContentLength = 0,
  compact = false,
}) => {
  const [phaseIndex, setPhaseIndex] = React.useState(0);
  const lastProgressRef = React.useRef(currentProgressText);

  React.useEffect(() => {
    if (currentProgressText !== lastProgressRef.current) {
      lastProgressRef.current = currentProgressText;
      setPhaseIndex(0);
    }
  }, [currentProgressText]);

  React.useEffect(() => {
    if (!isStreaming) return;
    const timer = setInterval(() => {
      setPhaseIndex((prev) => prev + 1);
    }, 4000);
    return () => clearInterval(timer);
  }, [isStreaming, currentProgressText]);

  if (!isStreaming) {
    return null;
  }

  const title = resolveTitle(userQuery);
  const cleanProgressText = humanizeProgressText(currentProgressText);

  const isResearchQuery = title.includes('深度调研');
  const isSpreadsheetQuery = title.includes('表格') || title.includes('核算指标');
  const isSearchQuery = title.includes('检索') || title.includes('分析实时信息') || title.includes('查询数据');
  const isDeliverableQuery =
    title.includes('交付物') ||
    title.includes('文档') ||
    title.includes('PDF');

  // 真实工具执行进度（cleanProgressText）优先于定时轮播预设文案
  let activeProgress = cleanProgressText;
  if (!activeProgress) {
    if (isResearchQuery) {
      activeProgress = RESEARCH_PHASES[Math.min(phaseIndex, RESEARCH_PHASES.length - 1)];
    } else if (isSpreadsheetQuery) {
      activeProgress = SPREADSHEET_PHASES[Math.min(phaseIndex, SPREADSHEET_PHASES.length - 1)];
    } else if (isSearchQuery) {
      activeProgress = SEARCH_PHASES[Math.min(phaseIndex, SEARCH_PHASES.length - 1)];
    } else if (isDeliverableQuery) {
      activeProgress = DELIVERABLE_PHASES[Math.min(phaseIndex, DELIVERABLE_PHASES.length - 1)];
    } else {
      activeProgress = GENERAL_PHASES[Math.min(phaseIndex, GENERAL_PHASES.length - 1)];
    }
  }

  const isRunningTool = Boolean(
    activeProgress ||
      (currentProgressText &&
        (currentProgressText.includes('bash') ||
          currentProgressText.includes('工具') ||
          currentProgressText.includes('✓') ||
          currentProgressText.includes('⚡') ||
          currentProgressText.includes('调用') ||
          currentProgressText.includes('检索') ||
          currentProgressText.includes('执行')))
  );

  // 严格采用真实字符增量，杜绝跑表与虚构 KB 数值
  const hasRealLength = typeof realContentLength === 'number' && realContentLength > 0;
  const compactStatusText = isResearchQuery
    ? '深度调研中'
    : activeProgress?.includes('联网') || activeProgress?.includes('网络')
    ? '联网检索中'
    : isSpreadsheetQuery || activeProgress?.includes('表格') || activeProgress?.includes('核算')
    ? activeProgress?.includes('核算') || activeProgress?.includes('聚合')
      ? '指标核算中'
      : activeProgress?.includes('结构') || activeProgress?.includes('解析')
      ? '结构解析中'
      : '表格分析中'
    : isSearchQuery
    ? '联网检索中'
    : isDeliverableQuery
    ? '排版构建中'
    : activeProgress
    ? activeProgress.includes('检索')
      ? '检索中'
      : activeProgress.includes('抓取')
      ? '抓取正文中'
      : activeProgress.includes('归纳')
      ? '综合归纳中'
      : activeProgress.includes('思考')
      ? '方案规划中'
      : '执行中'
    : isRunningTool
    ? '执行中'
    : '处理中';

  const displayProgress = hasRealLength
    ? `已生成 ${realContentLength} 字`
    : compactStatusText;

  if (compact) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          color: '#1677ff',
          background: 'rgba(22, 119, 255, 0.08)',
          padding: '2px 8px',
          borderRadius: '12px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontWeight: 500,
        }}
      >
        <LoadingOutlined spin style={{ fontSize: '11px' }} />
        <span>{displayProgress}</span>
      </span>
    );
  }

  return (
    <div
      style={{
        margin: '6px 0',
        padding: '8px 12px',
        borderRadius: '8px',
        background: 'linear-gradient(135deg, rgba(22, 119, 255, 0.03) 0%, rgba(22, 119, 255, 0.07) 100%)',
        border: '1px solid rgba(22, 119, 255, 0.16)',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.03)',
        display: 'flex',
        flexDirection: 'column',
        gap: activeProgress ? '6px' : '4px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 顶部行：标题、旋转状态与状态指示 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LoadingOutlined spin style={{ color: '#1677ff', fontSize: '13px' }} />
          <span style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--text-primary, #1e293b)' }}>
            {title}
          </span>
        </div>

        <span
          style={{
            fontSize: '11px',
            fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
            padding: '1.5px 7px',
            borderRadius: '4px',
            background: 'rgba(22, 119, 255, 0.09)',
            color: '#1677ff',
            fontWeight: 500,
            letterSpacing: '0.2px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {displayProgress}
        </span>
      </div>

      {/* 动态步骤反馈：自然流畅的人性化状态行 */}
      {activeProgress ? (
        <div
          style={{
            fontSize: '11.5px',
            color: 'var(--text-secondary, #475569)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            paddingLeft: '2px',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span>{activeProgress}</span>
        </div>
      ) : null}

      {/* 底部微脉冲流光条 (细致灵动的 1.5px 光效) */}
      <div
        style={{
          height: '1.5px',
          width: '100%',
          background: 'rgba(22, 119, 255, 0.12)',
          borderRadius: '1px',
          overflow: 'hidden',
          position: 'relative',
          marginTop: '2px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: '40%',
            background: 'linear-gradient(90deg, transparent, #1677ff, transparent)',
            animation: 'streaming-shimmer 1.8s infinite ease-in-out',
          }}
        />
        <style>{`
          @keyframes streaming-shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
          }
        `}</style>
      </div>
    </div>
  );
};

export default StreamingActivityCard;
