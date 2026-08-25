import { Injectable } from '@nestjs/common';
import type { DeterministicPlanNodeV1 } from '@ops/backend-deterministic-plan';
import type { PlanDraftDTO } from '../../interfaces';
import type { ExecutionContext } from '../react-engine/interfaces';
import { PromptDebugSettingsService } from '../debug-settings/prompt-debug-settings.service';

@Injectable()
export class ChatPlanningPresentationService {
  constructor(private readonly promptDebugSettings: PromptDebugSettingsService) {}

  buildUploadedFileParams(
    files?: Array<{ fileName: string; mimeType: string; content?: string }>
  ): Record<string, unknown> {
    const file = files?.find(
      (candidate) => candidate.mimeType === 'application/pdf' && Boolean(candidate.content)
    );
    return file?.content ? { fileBase64: file.content, fileName: file.fileName } : {};
  }

  buildPlanningRequest(message: string, files?: Array<{ mimeType: string }>): string {
    return files?.some((file) => file.mimeType === 'application/pdf')
      ? `${message}\n[系统上下文：用户已上传 PDF 附件，需要提取 PDF 内容]`
      : message;
  }

  canExposePromptDebug(context: ExecutionContext): boolean {
    return (
      this.promptDebugSettings.isPromptDebugEnabled() &&
      Boolean(context.userRoles?.includes('admin'))
    );
  }

  buildPlannerPromptDebug(message: string, planDraft: PlanDraftDTO): Record<string, unknown> {
    const metadata =
      planDraft.metadata && typeof planDraft.metadata === 'object' ? planDraft.metadata : undefined;
    const debug =
      metadata?.debug && typeof metadata.debug === 'object' && !Array.isArray(metadata.debug)
        ? (metadata.debug as Record<string, unknown>)
        : undefined;
    const llmCalls = Array.isArray(debug?.llmCalls)
      ? debug.llmCalls.filter((item) => item && typeof item === 'object')
      : [];
    const latest = llmCalls.at(-1) as Record<string, unknown> | undefined;
    const notes = Array.isArray(debug?.notes)
      ? debug.notes.filter(
          (item): item is string => typeof item === 'string' && Boolean(item.trim())
        )
      : [];
    const systemLines = [
      'Planner Debug Snapshot',
      `planner_mode: ${planDraft.planner_mode}`,
      `summary: ${planDraft.summary}`,
      `objective: ${planDraft.objective}`,
      `matched_skill: ${planDraft.skill_match?.skill_name || 'none'}`,
      `required_inputs: ${planDraft.required_inputs.map((item) => `${item.name}:${item.missing ? 'missing' : 'ready'}`).join(', ') || 'none'}`,
      `steps: ${planDraft.steps.map((step) => `${step.kind}:${step.title}`).join(' | ') || 'none'}`,
    ];
    return {
      debugSource: 'planner',
      systemPrompt: systemLines.join('\n'),
      userPrompt: message,
      systemPromptSectionKeys: [
        'planner_mode',
        'planner_summary',
        'planner_objective',
        'planner_steps',
      ],
      userPromptSectionKeys: ['user_message'],
      modelId: typeof latest?.modelId === 'string' ? latest.modelId : undefined,
      llmRequestMessages: Array.isArray(latest?.requestMessages)
        ? latest.requestMessages
        : undefined,
      llmResponseText: typeof latest?.responseText === 'string' ? latest.responseText : undefined,
      llmCalls,
      notes,
    };
  }

  buildExecutionPlanDraft(planDraft: PlanDraftDTO): Record<string, unknown> {
    const continuation = planDraft.metadata?.previous_result_continuation;
    return {
      plan_id: planDraft.plan_id,
      planner_mode: planDraft.planner_mode,
      objective: planDraft.objective,
      summary: planDraft.summary,
      skill_match: planDraft.skill_match,
      steps: planDraft.steps,
      required_inputs: planDraft.required_inputs,
      risk_summary: planDraft.risk_summary,
      semantic: planDraft.semantic,
      usage: planDraft.usage,
      ...(continuation ? { metadata: { previous_result_continuation: continuation } } : {}),
    };
  }

  formatDeterministicPlanNodes(nodes: DeterministicPlanNodeV1[]): string {
    if (!Array.isArray(nodes) || nodes.length === 0) return '暂无计划节点详情';
    return [...nodes]
      .sort((left, right) => left.sequence - right.sequence)
      .map((node) =>
        node.kind === 'skill'
          ? `${node.sequence}. ${node.title} - Skill: ${node.skillId}@${node.skillVersion} (${node.runtimeType})`
          : `${node.sequence}. ${node.title} - LLM: ${node.operationId}, template: ${node.promptTemplateId}@${node.promptTemplateVersion}`
      )
      .join('\n');
  }

  buildExecutionPromptDebug(promptDebug?: Record<string, unknown>) {
    if (!promptDebug) return undefined;
    return {
      debugSource: promptDebug.debugSource,
      systemPrompt: promptDebug.systemPrompt,
      userPrompt: promptDebug.userPrompt,
      systemPromptSectionKeys: promptDebug.systemPromptSectionKeys,
      userPromptSectionKeys: promptDebug.userPromptSectionKeys,
      modelId: promptDebug.modelId,
      llmRequestMessages: Array.isArray(promptDebug.llmRequestMessages)
        ? promptDebug.llmRequestMessages
        : undefined,
      llmResponseText:
        typeof promptDebug.llmResponseText === 'string' ? promptDebug.llmResponseText : undefined,
      notes: promptDebug.notes,
      llmCalls: Array.isArray(promptDebug.llmCalls) ? promptDebug.llmCalls : undefined,
    };
  }
}
