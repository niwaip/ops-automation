import {
  AnalysisExecutorKind,
  ChatAnalysisError,
  ResolveAnalysisExecutorOptions,
  StructuredAnalysisExecutor,
  StructuredAnalyzeRequest,
} from './types';
import {
  resolveChatStreamUrl,
  salvageChatPayload,
  tryParseJSONArray,
} from './chat-analysis-json.helpers';
import {
  extractGlobalUnderstandingText,
  normalizeChatSuggestions,
  normalizeContextAnalysisPayload,
  normalizeTextValue,
} from './chat-analysis-suggestion.helpers';
import { buildChatAnalysisPrompt, buildPromptDebugSummary } from './chat-analysis-prompt.helpers';

export class ChatAnalysisExecutor implements StructuredAnalysisExecutor {
  kind: AnalysisExecutorKind = 'chat';
  supportsThinking = true;

  constructor(
    public readonly requestedKind: AnalysisExecutorKind,
    private readonly options: ResolveAnalysisExecutorOptions
  ) {}

  async analyze(request: StructuredAnalyzeRequest): Promise<any> {
    if (!this.options.aiOrchestratorBaseUrl) {
      throw new ChatAnalysisError('缺少 AI Orchestrator 地址，无法使用 chat 执行器', {
        stage: request.analysisStage,
        pairLabel: request.pairLabel,
        url: this.options.aiOrchestratorBaseUrl,
        reason: 'missing_ai_orchestrator_url',
      });
    }

    const url = resolveChatStreamUrl(this.options.aiOrchestratorBaseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.options.aiOrchestratorAuthToken) {
      headers.Authorization = this.options.aiOrchestratorAuthToken.startsWith('Bearer ')
        ? this.options.aiOrchestratorAuthToken
        : `Bearer ${this.options.aiOrchestratorAuthToken}`;
    }

    const promptRequestText = buildChatAnalysisPrompt(request);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: promptRequestText,
          sessionId: request.chatSessionId || `office-addin-analysis-${Date.now()}`,
          config: {
            mode: 'chat',
            thinking: this.options.thinking !== false,
          },
        }),
      });
    } catch (error) {
      throw new ChatAnalysisError(
        `chat 执行器请求失败: ${error instanceof Error ? error.message : 'unknown error'}`,
        {
          stage: request.analysisStage,
          pairLabel: request.pairLabel,
          url,
          reason: 'network_error',
        }
      );
    }

    if (!response.ok) {
      throw new ChatAnalysisError(`chat 执行器请求失败: HTTP ${response.status}`, {
        stage: request.analysisStage,
        pairLabel: request.pairLabel,
        url,
        status: response.status,
        reason: 'http_error',
      });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ChatAnalysisError('chat 执行器未返回可读取的数据流', {
        stage: request.analysisStage,
        pairLabel: request.pairLabel,
        url,
        reason: 'missing_stream_reader',
      });
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let latestResultContent = '';
    let latestObservationContent = '';
    const resultPayloads: string[] = [];
    const observationPayloads: string[] = [];
    const eventPayloads: Array<{ type: string; content: string }> = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const dataLines = chunk
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s*/, ''));

        for (const line of dataLines) {
          try {
            const event = JSON.parse(line) as { type?: string; content?: string };
            if (
              typeof event.content === 'string' &&
              ['observation', 'result'].includes(String(event.type))
            ) {
              if (String(event.type) === 'result') {
                latestResultContent = event.content;
                resultPayloads.push(event.content);
              } else {
                latestObservationContent = event.content;
                observationPayloads.push(event.content);
              }
              eventPayloads.push({
                type: String(event.type),
                content: event.content,
              });
            }
          } catch {
            // ignore malformed SSE chunks
          }
        }
      }
    }

    const mergedResultPayload = resultPayloads.join('');
    const mergedResultPayloadWithNewlines = resultPayloads.join('\n');
    const payloadCandidates = [
      latestResultContent,
      mergedResultPayload,
      mergedResultPayloadWithNewlines,
      ...resultPayloads.slice().reverse(),
    ].filter(Boolean);
    let parsed: Record<string, unknown> | null = null;
    let salvaged = false;

    if (request.analysisStage === 'excel-global-understanding') {
      const globalUnderstandingText = extractGlobalUnderstandingText(payloadCandidates);
      if (globalUnderstandingText) {
        parsed = {
          suggestions: [],
          contextAnalysis: {
            detectedTemplateType: request.templateType || 'unknown',
            userIntent:
              '理解整份工作簿的业务类型、关键字段、sheet 职责与相互关系，为后续逐对照组参数识别提供上下文',
            globalBusinessSummary: globalUnderstandingText,
            globalUnderstandingText,
            usedAI: true,
            flowType: 'chat',
          },
        };
      } else {
        const jsonPayload = salvageChatPayload(payloadCandidates, request);
        parsed = jsonPayload.parsed;
        salvaged = jsonPayload.salvaged;

        const status = normalizeTextValue(parsed?.status)?.toLowerCase();
        const message = normalizeTextValue(parsed?.message);
        const hasContextAnalysis = Boolean(
          parsed?.contextAnalysis && typeof parsed.contextAnalysis === 'object'
        );
        if (!hasContextAnalysis && (status === 'error' || message)) {
          parsed = null;
        }
      }
    } else if (request.analysisStage === 'excel-pair-analysis') {
      const jsonPayload = salvageChatPayload(payloadCandidates, request);
      parsed = jsonPayload.parsed;
      salvaged = jsonPayload.salvaged;

      if (!parsed) {
        const directSuggestionArray = payloadCandidates
          .map((content) => tryParseJSONArray(content))
          .find((value): value is Array<Record<string, unknown>> => Array.isArray(value));

        if (directSuggestionArray) {
          parsed = {
            suggestions: directSuggestionArray,
          };
        }
      }
    } else {
      const jsonPayload = salvageChatPayload(payloadCandidates, request);
      parsed = jsonPayload.parsed;
      salvaged = jsonPayload.salvaged;
    }

    if (!parsed) {
      throw new ChatAnalysisError('chat 执行器未返回可解析的 JSON 结构', {
        stage: request.analysisStage,
        pairLabel: request.pairLabel,
        url,
        reason:
          latestResultContent ||
          latestObservationContent ||
          resultPayloads.length > 0 ||
          observationPayloads.length > 0
            ? 'invalid_json_response'
            : 'empty_stream_response',
      });
    }

    const normalizedSuggestions = normalizeChatSuggestions(parsed.suggestions, request);
    const normalizedContextAnalysis = normalizeContextAnalysisPayload(parsed, request);
    const rawAiResponse = eventPayloads
      .filter((event) => event.type === 'result')
      .slice(-4)
      .map((event) => `[${event.type}] ${event.content}`)
      .join('\n');
    return {
      suggestions: normalizedSuggestions,
      rawSuggestions: normalizedSuggestions,
      contextAnalysis: {
        ...(normalizedContextAnalysis || {}),
        usedAI: true,
        flowType: 'chat',
        salvagedMalformedJson: salvaged,
        analysisStage: request.analysisStage || 'general',
        aiServiceUrl: this.options.aiOrchestratorBaseUrl,
        promptDebugSummary: buildPromptDebugSummary(request),
        promptRequestText,
        rawAiResponse,
      },
    };
  }
}
