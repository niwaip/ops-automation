import { Injectable } from '@nestjs/common';
import {
  BrowserActionRiskLevel,
  BrowserCommand,
  ParseBrowserCommandResponse,
  RecorderDisambiguationService,
} from '../intent';

type RecorderObservationLike = {
  suggestedParameters: Array<{ name: string }>;
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
};

type BrowserExecuteResponseLike = {
  success: boolean;
  results: Array<Record<string, any>>;
  message?: string;
  steps?: Array<Record<string, any>>;
};

type PendingDisambiguationLike = Parameters<
  RecorderDisambiguationService['resolvePendingDisambiguation']
>[0];

type AmbiguityReplyLike = ReturnType<RecorderDisambiguationService['buildAmbiguityReply']>;

@Injectable()
export class RecorderDebugChatSupportService {
  constructor(private readonly recorderDisambiguationService: RecorderDisambiguationService) {}

  buildClarificationReply(observation: RecorderObservationLike): string {
    if (observation.suggestedParameters.length > 0) {
      const suggested = observation.suggestedParameters
        .slice(0, 3)
        .map((param) => `\`${param.name}\``)
        .join('、');
      return `我已经看过当前页面。你可以直接描述操作，也可以先补充参数，例如 ${suggested}。`;
    }
    if (observation.inputs.length > 0) {
      return `我已经看过当前页面。你可以直接告诉我目标，例如“点击登录”“填写账号 admin”“智搜 MCP”。当前页面可见输入项有 ${observation.inputs.length} 个。`;
    }
    return '我已经观察了当前页面。请更具体地告诉我要执行的操作，或者直接问我“页面上有什么”“需要输入哪些参数”。';
  }

  resolvePendingDisambiguation(
    pending: PendingDisambiguationLike,
    message: string
  ): ParseBrowserCommandResponse | null {
    return this.recorderDisambiguationService.resolvePendingDisambiguation(pending, message);
  }

  buildAmbiguityReply(
    originalCommands: BrowserCommand[],
    execution: BrowserExecuteResponseLike,
    observation: RecorderObservationLike
  ): AmbiguityReplyLike {
    return this.recorderDisambiguationService.buildAmbiguityReply(
      originalCommands,
      execution,
      observation,
      (result) => this.extractExecutionError(result)
    );
  }

  isObservationIntent(message: string): boolean {
    return /(页面|结构|表单|参数|输入|按钮|字段|页面上有什么|需要输入什么)/i.test(message);
  }

  isExportIntent(message: string): boolean {
    return /(导出|生成.*脚本|生成.*skill|内部skill|发布成skill|完成任务|结束任务)/i.test(message);
  }

  extractExecutionError(execution: BrowserExecuteResponseLike): string | undefined {
    return execution.results.find((item) => item.status === 'error')?.message || execution.message;
  }

  isRiskConfirmationMessage(message: string): boolean {
    return /^(确认执行|确认|继续执行|继续)$/i.test(message.trim());
  }

  buildActionValidationReason(input: {
    assessments: Array<{ riskLevel: BrowserActionRiskLevel; reason: string }>;
  }): string {
    return (
      Array.from(
        new Set(
          input.assessments
            .filter((item) => item.riskLevel === 'confirm' || item.riskLevel === 'forbidden')
            .map((item) => item.reason)
        )
      ).join('；') || '动作风险未知'
    );
  }
}
