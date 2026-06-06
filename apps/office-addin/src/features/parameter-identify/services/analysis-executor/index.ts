import { ChatAnalysisExecutor } from './chat-analysis-executor';
import { StudioAnalysisExecutor } from './studio-analysis-executor';
import type { ResolveAnalysisExecutorOptions, StructuredAnalysisExecutor } from './types';

export * from './types';
export * from './studio-analysis-executor';
export * from './chat-analysis-executor';

export function resolveAnalysisExecutor(
  options: ResolveAnalysisExecutorOptions
): StructuredAnalysisExecutor {
  const requestedKind = options.requestedKind || 'studio';

  if (requestedKind === 'chat') {
    if (options.aiOrchestratorBaseUrl) {
      return new ChatAnalysisExecutor(requestedKind, options);
    }
    return new StudioAnalysisExecutor(
      requestedKind,
      options,
      'office-addin 未配置 AI Orchestrator 地址，chat 执行器暂时回退到 studio 结构化分析接口'
    );
  }

  return new StudioAnalysisExecutor(requestedKind, options);
}
