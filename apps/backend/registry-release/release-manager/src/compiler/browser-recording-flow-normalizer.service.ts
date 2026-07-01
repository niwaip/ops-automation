import { Injectable } from '@nestjs/common';

const normalizeBrowserRecordingToolName = (toolName: unknown): string | undefined => {
  if (typeof toolName !== 'string' || !toolName.trim()) {
    return undefined;
  }
  const normalized = toolName.trim();
  return normalized === 'browser_execute' ? 'browser_step' : normalized;
};

@Injectable()
export class BrowserRecordingFlowNormalizerService {
  normalizeExecutionFlow(flow: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(flow)) {
      return [];
    }
    return flow
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      )
      .map((step) => {
        const tool = step.tool;
        if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
          return step;
        }
        const normalizedToolName = normalizeBrowserRecordingToolName(
          (tool as Record<string, unknown>).name
        );
        if (!normalizedToolName) {
          return step;
        }
        return {
          ...step,
          tool: {
            ...(tool as Record<string, unknown>),
            name: normalizedToolName,
          },
        };
      });
  }

  normalizeToolNames(tools: unknown): string[] {
    if (!Array.isArray(tools)) {
      return [];
    }
    return tools
      .map((item) => normalizeBrowserRecordingToolName(item))
      .filter((item): item is string => typeof item === 'string');
  }

  collectExecutionFlowToolNames(flow: unknown): string[] {
    return this.normalizeExecutionFlow(flow)
      .map((step) => {
        const tool = step.tool;
        if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
          return undefined;
        }
        return normalizeBrowserRecordingToolName((tool as Record<string, unknown>).name);
      })
      .filter((item): item is string => typeof item === 'string');
  }

  mergeToolsWithExecutionFlow(
    declaredTools: unknown,
    executionFlow: unknown,
    options?: { includeSkillMatch?: boolean }
  ): string[] {
    const normalizedDeclaredTools = this.normalizeToolNames(declaredTools);
    const flowTools = this.collectExecutionFlowToolNames(executionFlow);
    const prefix = options?.includeSkillMatch === false ? [] : ['skill_match'];
    return Array.from(new Set([...prefix, ...normalizedDeclaredTools, ...flowTools]));
  }
}
