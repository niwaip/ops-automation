import { isPersonalSlashCommand } from './chat-slash-command.util';

export const isArtifactGenerationRequest = (message: string): boolean =>
  /(?:生成|制作|创建|开发|做个|做一个|导出)[^，。\n]{0,24}(?:网页|页面|游戏|html|ppt|pdf|word|docx|excel|xlsx|文件|报告)/i.test(
    String(message || '')
  );

export const isArtifactRegenerationRequest = (
  message: string,
  history: Array<{ role?: string; content?: unknown }>
): boolean => {
  if (!/(?:重新生成|重新制作|重做|再次生成|再生成一次|重新导出|retry|regenerate)/i.test(String(message || ''))) {
    return false;
  }
  return history
    .slice(-8)
    .some((item) => item?.role === 'user' && isArtifactGenerationRequest(String(item.content || '')));
};

export const isLiveSearchRequest = (message: string): boolean =>
  /(?:联网|搜索|搜一下|查一下|查询|查看|检索|最新|实时|热点|热搜|榜单|排行榜|微博|知乎热榜|百度热榜|抖音热榜|新闻|动态|插件|安装方法|安装教程|如何安装|怎么安装|安装指南|installation guide|how to install|releases?|天气|气象|气温|温度|下雨|降雨|暴雨|晴天|预报|几度|转晴|多云)/i.test(
    String(message || '')
  );

export const isTransientSandboxModelFailure = (message: string): boolean =>
  /(?:sandbox model execution error|\baborted\b|timeout|timed out|超时|socket hang up|econnreset)/i.test(
    String(message || '')
  );

export const isSandboxModelAuthFailure = (message: string): boolean =>
  /(?:鉴权失败|鉴权异常|invalid token|check your api key|api key|unauthorized|forbidden|\b(?:401|403)\b|authentication_error)/i.test(
    String(message || '')
  );

export const isSandboxModelDnsFailure = (message: string): boolean =>
  /(?:getaddrinfo\s+ENOTFOUND|ENOTFOUND|EAI_AGAIN|name resolution)/i.test(
    String(message || '')
  );

export const isSandboxModelConnectionRefused = (message: string): boolean =>
  /(?:ECONNREFUSED|connect\s+ECONNREFUSED)/i.test(
    String(message || '')
  );

export const isSandboxExecutionError = (message: string): boolean =>
  /(?:\[DeepSeek Harness 异常\]:\s*执行异常:|执行异常:\s*(?:openpyxl|unsupported_source_format|FileNotFoundError|ValueError|KeyError|TypeError|AttributeError|UnboundLocalError|InvalidFileException|Exception))/i.test(
    String(message || '')
  );

export const isSandboxModelUnavailable = (message: string): boolean =>
  /(?:\[DeepSeek Harness (?:鉴权失败|超时)\]|\[DeepSeek Harness 异常\]:\s*大模型代理调用失败|大模型代理调用失败|模型不可用|上游大模型|上游模型|no client initialized for model)/i.test(
    String(message || '')
  );

export interface ClassifiedSandboxError {
  friendlyError: string;
  eventData: Record<string, unknown>;
  executionTrace?: Record<string, unknown>;
}

/**
 * 从沙箱错误日志中提取真实业务异常明细，避免误匹配 Traceback 堆栈源码中的行
 */
export function extractSandboxExecutionDetail(errMsg: string): string {
  if (!errMsg) return '';

  // 1. 优先提取标准 Harness 收尾行：[DeepSeek Harness 异常]: 执行异常: <detail>
  const harnessMatch = errMsg.match(/\[DeepSeek Harness 异常\]:\s*执行异常:\s*([^\n\r]+)/);
  if (harnessMatch?.[1]) {
    return harnessMatch[1].trim();
  }

  // 2. 匹配所有 "执行异常:"，过滤掉包含 Python 源码特征的行，取最后一个真实的异常信息
  const allMatches = Array.from(errMsg.matchAll(/(?:^|\n|\b)执行异常:\s*([^\n\r]+)/g));
  if (allMatches.length > 0) {
    for (let i = allMatches.length - 1; i >= 0; i--) {
      const candidate = allMatches[i][1]?.trim();
      if (
        candidate &&
        !candidate.includes('provenance') &&
        !candidate.startsWith('f"') &&
        !candidate.startsWith("f'") &&
        !candidate.includes('_make_error')
      ) {
        return candidate;
      }
    }
    return allMatches[allMatches.length - 1][1]?.trim() || errMsg;
  }

  return errMsg;
}

/**
 * 将个人沙箱执行期间抛出的异常分类为用户友好的结构化错误描述。
 * 若返回 null，表示属于基础设施未就绪类错误，可由调用方决定是否降级。
 */
export function classifyPersonalSandboxError(options: {
  message: string;
  errMsg: string;
  errStatus?: number;
  recentHistory: Array<{ role?: string; content?: unknown }>;
  sessionAttachedFiles: string[];
}): ClassifiedSandboxError | null {
  const { message, errMsg, errStatus, recentHistory, sessionAttachedFiles } = options;

  // 判断是否为排队/并发超时
  const isConcurrencyConflict =
    errMsg.includes('正在执行其他任务') ||
    errMsg.includes('沙箱当前正在执行') ||
    errMsg.includes('正在执行前序任务') ||
    errMsg.includes('排队等待超时') ||
    errStatus === 409;

  if (isConcurrencyConflict) {
    return {
      friendlyError:
        '⏳ 个人专属安全沙箱当前正在执行前序任务，排队等待超时。请稍候片刻再试，或在前一会话中点击“停止”释放沙箱。',
      eventData: {
        code: 'SANDBOX_QUEUE_TIMEOUT',
        retryable: true,
      },
    };
  }

  // 1. 交付物生成或重新生成时模型超时
  if (
    (isArtifactGenerationRequest(message) ||
      isArtifactRegenerationRequest(message, recentHistory)) &&
    isTransientSandboxModelFailure(errMsg)
  ) {
    return {
      friendlyError:
        '⏱️ 模型在执行文件写入前响应超时或连接中断，本次未生成可用文件。深度思考已关闭，可安全重试本次生成。',
      eventData: {
        code: 'SANDBOX_GENERATION_TIMEOUT',
        retryable: true,
        artifactCreated: false,
      },
    };
  }

  // 2. 联网检索结果整理超时
  if (isLiveSearchRequest(message) && isTransientSandboxModelFailure(errMsg)) {
    return {
      friendlyError:
        '⏱️ 联网检索已经完成，但指定模型在整理检索结果（或气象数据）时超时或连接中断。为避免丢失检索证据后凭记忆作答，系统已停止无依据的普通聊天降级。请直接重试本次查询。',
      eventData: {
        code: 'SANDBOX_SEARCH_SYNTHESIS_TIMEOUT',
        retryable: true,
        searchCompleted: true,
      },
    };
  }

  // 3. 增量交付物迭代（如追加音效、修改代码等），或沙箱内部已调用工具/进入 Harness 任务执行时的超时
  const isIncrementalArtifactTask =
    errMsg.includes('web-prototype') ||
    errMsg.includes('/workspace/') ||
    errMsg.includes('read_file') ||
    errMsg.includes('write_file') ||
    errMsg.includes('Harness Tool Call') ||
    errMsg.includes('❌ [DeepSeek Harness 超时]') ||
    sessionAttachedFiles.length > 0 ||
    /(?:追加|添加|加入|修改|调整|优化|更新|完善|修复|重构)/.test(message);

  if (isIncrementalArtifactTask && isTransientSandboxModelFailure(errMsg)) {
    return {
      friendlyError:
        '⏱️ 模型在分析或生成交付物时响应超时（上游网络连接中断）。当前工作区文件安全保留，您可以直接点击下方重试继续执行。',
      eventData: {
        code: 'SANDBOX_GENERATION_TIMEOUT',
        retryable: true,
        artifactCreated: false,
      },
    };
  }

  // 斜杠指令或专属配置异常
  if (isPersonalSlashCommand(message) || message.trim().startsWith('/')) {
    return {
      friendlyError: `⚠️ 沙箱指令执行异常 (${errMsg})，未能完成指令执行。请重试或检查模型服务连接。`,
      eventData: {
        code: 'SANDBOX_COMMAND_ERROR',
        retryable: true,
      },
    };
  }

  // 4.0. 沙箱代码/工具级执行异常（优先于鉴权，防止日志正文业务字符如 FC34032 误判为鉴权失败）
  if (isSandboxExecutionError(errMsg)) {
    const detail = extractSandboxExecutionDetail(errMsg);
    return {
      friendlyError: `❌ 沙箱工具执行异常：${detail}。本次任务未能完成，请检查输入文件格式与参数要求。`,
      eventData: {
        code: 'SANDBOX_TOOL_EXECUTION_ERROR',
        retryable: false,
      },
      executionTrace: { executed: true, errorType: 'TOOL_EXECUTION_ERROR', rawError: errMsg },
    };
  }

  // 4. 上游大模型鉴权失败 / API Key 错误
  if (isSandboxModelAuthFailure(errMsg)) {
    return {
      friendlyError: `❌ 上游大模型服务鉴权失败 (${errMsg})。请检查 API Key 或模型凭据配置。`,
      eventData: {
        code: 'SANDBOX_MODEL_AUTH_ERROR',
        retryable: false,
      },
      executionTrace: { executed: false, errorType: 'AUTH_ERROR', rawError: errMsg },
    };
  }

  // 4.1. 上游大模型域名解析失败 (DNS ENOTFOUND)
  if (isSandboxModelDnsFailure(errMsg)) {
    const dnsMatch = errMsg.match(/(?:getaddrinfo\s+ENOTFOUND|ENOTFOUND)\s+([^\s,;:\)]+)/i);
    const dnsHost = dnsMatch ? dnsMatch[1] : '';
    const hostTip = dnsHost ? ` (域名: ${dnsHost})` : '';
    return {
      friendlyError: `🌐 上游模型服务地址域名解析失败${hostTip}。请检查模型网关配置地址是否正确，或内网穿透/代理隧道是否已断开 (${errMsg})。`,
      eventData: {
        code: 'SANDBOX_MODEL_DNS_ERROR',
        retryable: true,
      },
      executionTrace: { executed: false, errorType: 'DNS_ERROR', rawError: errMsg },
    };
  }

  // 4.2. 上游大模型服务连接被拒绝 (Connection Refused)
  if (isSandboxModelConnectionRefused(errMsg)) {
    return {
      friendlyError: `🔌 上游模型服务连接被拒绝 (Connection Refused)。请检查模型服务端口或反向代理是否正常运行 (${errMsg})。`,
      eventData: {
        code: 'SANDBOX_MODEL_CONNECTION_REFUSED',
        retryable: true,
      },
      executionTrace: { executed: false, errorType: 'CONNECTION_REFUSED', rawError: errMsg },
    };
  }

  // 5. 大模型超时 / 响应中断 / 上游大模型服务不可用（严禁默认降级为无依据的普通问答）
  if (isSandboxModelUnavailable(errMsg)) {
    return {
      friendlyError: `⏱️ 上游大模型服务暂时不可用或响应超时 (${errMsg})。本次任务未完成，请检查模型服务状态或稍后重试。`,
      eventData: {
        code: 'SANDBOX_MODEL_UNAVAILABLE',
        retryable: true,
      },
      executionTrace: { executed: false, errorType: 'MODEL_UNAVAILABLE', rawError: errMsg },
    };
  }

  return null;
}
