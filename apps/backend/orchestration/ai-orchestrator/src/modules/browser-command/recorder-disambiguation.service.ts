import { Injectable } from '@nestjs/common';
import { BrowserCommand, ParseBrowserCommandResponse } from './browser-command.service';

interface RecorderDebugDisambiguationCandidateLike {
  index: number;
  ref: string;
  role?: string;
  text: string;
}

interface RecorderDebugPendingDisambiguationLike {
  command: BrowserCommand;
  targetLabel: string;
  candidates: RecorderDebugDisambiguationCandidateLike[];
}

interface ObservationLike {
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
}

interface BrowserExecuteResponseLike {
  success: boolean;
  results: Array<Record<string, any>>;
  message?: string;
  steps?: Array<Record<string, any>>;
}

@Injectable()
export class RecorderDisambiguationService {
  resolvePendingDisambiguation(
    pending: RecorderDebugPendingDisambiguationLike | undefined,
    message: string
  ): ParseBrowserCommandResponse | null {
    if (!pending?.candidates.length) {
      return null;
    }

    const selectedIndex = this.parseDisambiguationSelection(message);
    if (selectedIndex === null) {
      return null;
    }

    const candidate = pending.candidates.find((item) => item.index === selectedIndex);
    if (!candidate) {
      return null;
    }

    return {
      success: true,
      commands: [
        {
          ...pending.command,
          params: {
            ...pending.command.params,
            target: candidate.ref,
          },
        },
      ],
      explanation: `已根据你的选择，定位到第${selectedIndex}个候选项 ${candidate.text || pending.targetLabel}`,
    };
  }

  buildAmbiguityReply(
    originalCommands: BrowserCommand[],
    execution: BrowserExecuteResponseLike,
    observation: ObservationLike,
    extractExecutionError: (execution: BrowserExecuteResponseLike) => string | undefined
  ): { reply: string; pending: RecorderDebugPendingDisambiguationLike } | null {
    const failedStep = Array.isArray(execution.steps)
      ? execution.steps.find((step) => step?.status === 'error')
      : undefined;
    const errorMessage =
      typeof failedStep?.error?.message === 'string'
        ? failedStep.error.message
        : extractExecutionError(execution) || execution.message || '';
    if (!/strict mode violation/i.test(errorMessage)) {
      return null;
    }

    const failedAction = typeof failedStep?.action === 'string' ? failedStep.action : '';
    if (!['click', 'fill', 'hover'].includes(failedAction)) {
      return null;
    }

    const originalCommand =
      originalCommands.find((command) => command.tool === failedAction) || originalCommands[0];
    if (!originalCommand) {
      return null;
    }

    const targetInfo = this.extractAmbiguousTargetInfo(
      failedStep?.params || originalCommand.params || {}
    );
    if (!targetInfo?.label) {
      return null;
    }

    const candidates = this.findAmbiguousCandidates(targetInfo, failedAction, observation);
    if (candidates.length < 2) {
      return null;
    }

    const lines = [
      `我找到了多个“${targetInfo.label}”候选元素，暂时不能确定要操作哪一个。`,
      '请直接回复 `选1` 或 `选2` 继续。',
      ...candidates.map(
        (candidate) =>
          `${candidate.index}. ${candidate.text}${candidate.role ? `（${candidate.role}，ref=${candidate.ref}）` : `（ref=${candidate.ref}）`}`
      ),
    ];

    return {
      reply: lines.join('\n'),
      pending: {
        command: originalCommand,
        targetLabel: targetInfo.label,
        candidates,
      },
    };
  }

  private parseDisambiguationSelection(message: string): number | null {
    const normalized = message.trim();
    if (!normalized) {
      return null;
    }

    const directMatch = normalized.match(
      /^(?:选|选择|点|点击|用)?\s*(?:第)?([一二三四五六七八九十\d]+)\s*(?:个)?(?:候选项|候选|选项)?$/i
    );
    if (!directMatch?.[1]) {
      return null;
    }

    const raw = directMatch[1].replace(/^第/, '');
    const mapped = new Map<string, number>([
      ['一', 1],
      ['二', 2],
      ['三', 3],
      ['四', 4],
      ['五', 5],
      ['六', 6],
      ['七', 7],
      ['八', 8],
      ['九', 9],
      ['十', 10],
    ]);
    if (mapped.has(raw)) {
      return mapped.get(raw) || null;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private extractAmbiguousTargetInfo(
    params: Record<string, unknown>
  ): { label?: string; role?: string } | null {
    const semanticTarget = typeof params.target === 'string' ? params.target.trim() : '';
    const semanticMatch = semanticTarget.match(/^(?:role=)?([a-z_][\w-]*)\[name=(['"])(.+?)\2\]$/i);
    if (semanticMatch?.[3]) {
      return {
        role: semanticMatch[1]?.trim().toLowerCase(),
        label: semanticMatch[3].trim(),
      };
    }

    const labelCandidates = [params.text, params.selector, params.target];
    for (const candidate of labelCandidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return { label: candidate.trim() };
      }
    }

    return null;
  }

  private findAmbiguousCandidates(
    target: { label?: string; role?: string },
    action: string,
    observation: ObservationLike
  ): RecorderDebugDisambiguationCandidateLike[] {
    const targetLabel = this.normalizeText(target.label);
    if (!targetLabel) {
      return [];
    }

    const source = action === 'fill' ? observation.inputs : observation.buttons;
    const deduped = new Map<string, RecorderDebugDisambiguationCandidateLike>();
    for (const item of source) {
      const ref = typeof item.ref === 'string' ? item.ref.trim() : '';
      if (!ref) {
        continue;
      }
      const role = typeof item.role === 'string' ? item.role.trim().toLowerCase() : undefined;
      if (target.role && role && role !== target.role) {
        continue;
      }
      const text = [item.text, item.label, item.placeholder, item.name].find(
        (value) => typeof value === 'string' && value.trim().length > 0
      );
      if (typeof text !== 'string') {
        continue;
      }
      const normalizedText = this.normalizeText(text);
      if (!normalizedText) {
        continue;
      }
      if (
        normalizedText !== targetLabel &&
        !normalizedText.includes(targetLabel) &&
        !targetLabel.includes(normalizedText)
      ) {
        continue;
      }
      if (!deduped.has(ref)) {
        deduped.set(ref, {
          index: deduped.size + 1,
          ref,
          ...(role ? { role } : {}),
          text: text.trim(),
        });
      }
    }

    return [...deduped.values()];
  }

  private normalizeText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .toLowerCase()
      .replace(/[\s"'`:,.:;|()[\]{}<>【】]/g, '')
      .trim();
  }
}
