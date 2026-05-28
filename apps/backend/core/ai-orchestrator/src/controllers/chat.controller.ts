import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import axios from 'axios';
import { ControlPlaneClient } from '../client/control-plane.client';
import {
  CONTROL_PLANE_APPROVAL_STATUS,
  CONTROL_PLANE_EVENT_TYPE,
  CONTROL_PLANE_EXECUTION_STATUS,
  LEGACY_CONTROL_PLANE_EVENT_TYPE,
  isTerminalControlPlaneExecutionStatus,
} from '../client/control-plane.contracts';
import { ModelService } from '../modules/model/model.service';
import { RecognizerService } from '../modules/recognizer/recognizer.service';
import { ReActEngineService } from '../modules/react-engine/react-engine.service';
import { PlannerService } from '../modules/planner/planner.service';
import { getOrCreateTraceId } from '../common/trace.util';
import { ContentBlock, ChatMessage as MultimodalChatMessage } from '../interfaces';
import { StreamEventType } from '../modules/react-engine/interfaces';
import type {
  ChatRequestDTO,
  ExecutionContext,
  LLMUsage,
  StreamEvent,
} from '../modules/react-engine/interfaces';
import { SessionService } from '../modules/redis/session.service';
import { PlanDraftDTO } from '../interfaces';
import { PromptDebugSettingsService } from '../modules/debug-settings/prompt-debug-settings.service';
import { getAuthServiceUrl } from '../config/service-endpoints';
import { buildDocumentGuideContext } from '../common/document-guide';
import { resolveFriendlyInputDisplayName } from '../common/input-label';

const fileStore = new Map<string, { fileName: string; mimeType: string; size: number; content: string }>();

type WaitingInputSemanticGroup = {
  key: string;
  label: string;
  kind: 'field' | 'array_group';
  blocking: boolean;
  required: boolean;
  fieldNames?: string[];
  missingFieldNames?: string[];
  description?: string;
};

type WaitingInputSemantic = {
  mode?: 'field_level' | 'complex_document';
  previewReady?: boolean;
  finalReady?: boolean;
  summary?: string;
  groupedMissing?: WaitingInputSemanticGroup[];
};

const tryParseJsonString = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
};

const extractDownloadUrl = (value: unknown): string | undefined => {
  const queue: unknown[] = [value];
  const visited = new Set<unknown>();
  let inspected = 0;

  while (queue.length > 0 && inspected < 50) {
    const current = queue.shift();
    inspected += 1;

    const parsed = tryParseJsonString(current);
    if (parsed !== undefined) {
      queue.push(parsed);
      continue;
    }

    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    const record = current as Record<string, unknown>;
    const directUrl = [record.downloadUrl, record.download_url, record.url]
      .find((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (directUrl) {
      return directUrl;
    }

    Object.values(record).forEach((item) => {
      if (item && typeof item === 'object') {
        queue.push(item);
      }
    });
  }

  return undefined;
};

const extractTemporalLink = (value: unknown): string | undefined => {
  const queue: unknown[] = [value];
  const visited = new Set<unknown>();
  let inspected = 0;

  while (queue.length > 0 && inspected < 50) {
    const current = queue.shift();
    inspected += 1;

    const parsed = tryParseJsonString(current);
    if (parsed !== undefined) {
      queue.push(parsed);
      continue;
    }

    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    const record = current as Record<string, unknown>;
    const directUrl = [record.temporalLink, record.temporal_link]
      .find((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (directUrl) {
      return directUrl;
    }

    Object.values(record).forEach((item) => {
      if (item && typeof item === 'object') {
        queue.push(item);
      }
    });
  }

  return undefined;
};

@ApiTags('AI-Chat')
@Controller('ai')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly controlPlaneClient: ControlPlaneClient,
    private readonly modelService: ModelService,
    private readonly recognizerService: RecognizerService,
    private readonly reactEngineService: ReActEngineService,
    private readonly sessionService: SessionService,
    private readonly plannerService: PlannerService,
    private readonly promptDebugSettingsService: PromptDebugSettingsService,
  ) {}

  private canExposePromptDebug(context: ExecutionContext): boolean {
    return this.promptDebugSettingsService.isPromptDebugEnabled()
      && Boolean(context.userRoles?.includes('admin'));
  }

  private writeSse(res: Response, payload: Record<string, unknown>): void {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  private buildControlPlaneRequestOptions(
    authToken?: string,
    user?: { userId?: string; userRoles?: string[] },
  ) {
    return {
      authToken,
      user,
    };
  }

  private async loadWaitingInputDetails(
    executionId: string,
    authToken?: string,
    user?: { userId?: string; userRoles?: string[] },
  ): Promise<{
    waitingStepId?: string;
    missingInputs: Array<{
      name: string;
      type?: string;
      description?: string;
      group_label?: string;
      display_name?: string;
      missing?: boolean;
      needs_confirmation?: boolean;
    }>;
    allRequiredInputs: Array<{
      name: string;
      value?: unknown;
      missing?: boolean;
    }>;
  }> {
    try {
      const steps = await this.controlPlaneClient.getExecutionSteps<any[]>(
        executionId,
        this.buildControlPlaneRequestOptions(authToken, user),
      );
      const waitingStep = Array.isArray(steps)
        ? steps.find(
          (step: any) =>
            step?.status === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT
            || step?.type === 'input_collection',
        )
        : undefined;
      const requiredInputs = Array.isArray(waitingStep?.inputJson?.requiredInputs)
        ? waitingStep.inputJson.requiredInputs
        : [];
      const missingInputs = requiredInputs
        .filter((item: any) => item?.missing === true && typeof item?.name === 'string' && item.name.trim())
        .map((item: any) => ({
          name: String(item.name).trim(),
          type: typeof item.type === 'string' ? item.type : undefined,
          description: typeof item.description === 'string' ? item.description : undefined,
          group_label: typeof item.group_label === 'string' ? item.group_label : undefined,
          display_name: typeof item.display_name === 'string' ? item.display_name : undefined,
          missing: item.missing === true,
          needs_confirmation: item.needs_confirmation === true,
        }));
      const allRequiredInputs = requiredInputs
        .filter((item: any) => typeof item?.name === 'string' && item.name.trim())
        .map((item: any) => ({
          name: String(item.name).trim(),
          value: item.value,
          missing: item.missing === true,
        }));
      return {
        waitingStepId: waitingStep?.id,
        missingInputs,
        allRequiredInputs,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to load waiting_input details for ${executionId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return {
        waitingStepId: undefined,
        missingInputs: [],
        allRequiredInputs: [],
      };
    }
  }

  private extractExecutionSemantic(execution: unknown): WaitingInputSemantic | undefined {
    if (!execution || typeof execution !== 'object') {
      return undefined;
    }

    const record = execution as Record<string, unknown>;
    const directSemantic = record.semantic;
    if (directSemantic && typeof directSemantic === 'object' && !Array.isArray(directSemantic)) {
      return directSemantic as WaitingInputSemantic;
    }

    const normalizedInput = record.normalizedInput;
    if (normalizedInput && typeof normalizedInput === 'object' && !Array.isArray(normalizedInput)) {
      const embeddedSemantic = (normalizedInput as Record<string, unknown>).semantic;
      if (embeddedSemantic && typeof embeddedSemantic === 'object' && !Array.isArray(embeddedSemantic)) {
        return embeddedSemantic as WaitingInputSemantic;
      }
    }

    return undefined;
  }

  private formatWaitingInputMessage(input: {
    executionId?: string;
    intro?: string;
    missingInputs: Array<{
      name: string;
      description?: string;
      group_label?: string;
      display_name?: string;
      missing?: boolean;
      needs_confirmation?: boolean;
    }>;
    semantic?: WaitingInputSemantic;
  }): string {
    const lines: string[] = [input.intro || '任务需要你补充信息后才能继续执行。'];
    const groupedMissing = Array.isArray(input.semantic?.groupedMissing)
      ? this.dedupeWaitingInputGroups(input.semantic!.groupedMissing)
      : [];
    const groupedInputs = input.missingInputs.reduce<Map<string, typeof input.missingInputs>>((acc, item) => {
      const label = typeof item.group_label === 'string' ? item.group_label.trim() : '';
      if (!label) {
        return acc;
      }
      const existing = acc.get(label) || [];
      existing.push(item);
      acc.set(label, existing);
      return acc;
    }, new Map());

    if (input.semantic?.summary) {
      lines.push(input.semantic.summary);
    }

    if (groupedMissing.length > 0) {
      lines.push(`缺少业务组：${groupedMissing.map((item) => item.label).join('、')}`);
    }

    if (groupedInputs.size > 0) {
      lines.push('请补充以下信息：');
      groupedInputs.forEach((items, label) => {
        lines.push(
          `${label}：${this.dedupeWaitingInputLabels(items).join('、')}`,
        );
      });
    } else if (input.missingInputs.length > 0) {
      lines.push(
        `${groupedMissing.length > 0 ? '字段兜底' : '缺少参数'}：${this.dedupeWaitingInputLabels(input.missingInputs).join('、')}`,
      );
    } else if (groupedMissing.length === 0) {
      lines.push('请继续补充必要参数。');
    }

    if (input.semantic) {
      lines.push(
        `可预览：${input.semantic.previewReady ? '是' : '否'}；可正式生成：${input.semantic.finalReady ? '是' : '否'}`,
      );
    }

    if (input.executionId) {
      lines.push(`执行单 ID: ${input.executionId}`);
    }

    return lines.join('\n\n');
  }

  private resolveWaitingInputLabel(input: {
    name: string;
    description?: string;
    display_name?: string;
  }): string {
    return resolveFriendlyInputDisplayName(input);
  }

  private dedupeWaitingInputLabels(inputs: Array<{
    name: string;
    description?: string;
    display_name?: string;
  }>): string[] {
    const labels: string[] = [];
    const seen = new Set<string>();

    inputs.forEach((item) => {
      const resolvedLabel = this.resolveWaitingInputLabel(item);
      const semanticLabel = this.normalizeWaitingInputSemanticLabel(resolvedLabel || item.name);
      if (!semanticLabel || seen.has(semanticLabel)) {
        return;
      }
      seen.add(semanticLabel);
      labels.push(semanticLabel);
    });

    return labels;
  }

  private dedupeWaitingInputGroups(groups: WaitingInputSemanticGroup[]): WaitingInputSemanticGroup[] {
    const deduped: WaitingInputSemanticGroup[] = [];
    const seen = new Set<string>();

    groups.forEach((group) => {
      if (!group?.label) {
        return;
      }
      const semanticLabel = this.normalizeWaitingInputSemanticLabel(group.label);
      if (!semanticLabel || seen.has(semanticLabel)) {
        return;
      }
      seen.add(semanticLabel);
      deduped.push({
        ...group,
        label: semanticLabel,
      });
    });

    return deduped;
  }

  private normalizeWaitingInputSemanticLabel(label: string): string {
    const normalized = String(label || '').trim();
    if (!normalized) {
      return '';
    }

    return normalized
      .replace(/\s*[（(](?:中文|日文|日语|zh|ja|cn|jp)[）)]\s*$/iu, '')
      .replace(/[_-](?:zh|ja|cn|jp)$/iu, '')
      .trim();
  }

  private normalizeWaitingInputMatchKey(value: string): string {
    const normalized = this.normalizeWaitingInputSemanticLabel(value);
    if (!normalized) {
      return '';
    }
    return normalized
      .replace(/[：:，,。．.；;、]/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  private extractWaitingInputKeyValuePairs(message: string): Array<{ key: string; value: string }> {
    const text = String(message || '').trim();
    if (!text) {
      return [];
    }
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const pairs: Array<{ key: string; value: string }> = [];

    for (const line of lines) {
      const match = line.match(/^(.{1,40}?)[：:]\s*(.+)$/);
      if (!match) {
        continue;
      }
      const key = String(match[1] || '').trim();
      const value = String(match[2] || '').trim();
      if (!key || !value) {
        continue;
      }
      pairs.push({ key, value });
    }

    return pairs;
  }

  private resolveWaitingInputLabeledPayload(
    message: string,
    missingInputs: Array<{ name: string; description?: string; display_name?: string }>,
  ): Record<string, unknown> {
    const pairs = this.extractWaitingInputKeyValuePairs(message);
    if (pairs.length === 0) {
      return {};
    }

    const missingCandidates = missingInputs.map((item) => {
      const labelCandidates = [
        item.display_name,
        item.description,
        item.name,
      ]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => this.normalizeWaitingInputMatchKey(value))
        .filter(Boolean);
      return {
        name: item.name,
        labels: Array.from(new Set(labelCandidates)),
      };
    });

    const resolved: Record<string, unknown> = {};
    const usedNames = new Set<string>();

    for (const pair of pairs) {
      const key = this.normalizeWaitingInputMatchKey(pair.key);
      if (!key) {
        continue;
      }
      const value = pair.value.trim();
      if (!value) {
        continue;
      }

      const matched = missingCandidates.find((candidate) => (
        !usedNames.has(candidate.name)
        && candidate.labels.some((label) => label === key || label.includes(key) || key.includes(label))
      ));
      if (!matched) {
        continue;
      }

      usedNames.add(matched.name);
      resolved[matched.name] = value;
    }

    return resolved;
  }

  private buildWaitingInputFollowupHint(
    missingInputs: Array<{ name: string; description?: string; display_name?: string }>,
    semantic?: WaitingInputSemantic,
  ): string {
    const groupedMissing = Array.isArray(semantic?.groupedMissing)
      ? this.dedupeWaitingInputGroups(semantic!.groupedMissing)
      : [];

    if (groupedMissing.length > 0) {
      return `当前仍缺少多个业务组：${groupedMissing.map((item) => item.label).join('、')}。请优先按业务组补充，例如：“补充标的清单：设备A 10台，设备B 5台；补充交付计划：第一批5月30日交付。”`;
    }

    return `当前还缺少多个参数：${this.dedupeWaitingInputLabels(missingInputs).join('、')}。请继续用自然语言逐项补充（例如：甲方签字用公司名称、乙方签字用公司名称、附件填写无）。`;
  }

  private formatFieldNameList(fieldNames: string[], limit = 12): string {
    const normalized = fieldNames
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    if (normalized.length === 0) {
      return '无';
    }
    if (normalized.length <= limit) {
      return normalized.join('、');
    }
    return `${normalized.slice(0, limit).join('、')} 等 ${normalized.length} 项`;
  }

  private buildWaitingInputSubmissionFeedback(input: {
    executionId?: string;
    resolvedFieldNames: string[];
    remainingMissingInputs: Array<{ name: string; description?: string; display_name?: string }>;
    semantic?: WaitingInputSemantic;
  }): string {
    const lines = ['已提交补充信息。'];
    const resolvedFieldNames = this.formatFieldNameList(
      input.resolvedFieldNames.map((item) => this.normalizeWaitingInputSemanticLabel(item)),
    );
    const resolvedCount = Array.from(new Set(
      input.resolvedFieldNames
        .map((item) => this.normalizeWaitingInputSemanticLabel(item))
        .filter(Boolean),
    )).length;
    if (resolvedCount > 0) {
      lines.push(
        `本次识别到 ${resolvedCount} 个字段：${resolvedFieldNames}`,
      );
    }

    const groupedMissing = Array.isArray(input.semantic?.groupedMissing)
      ? input.semantic.groupedMissing.filter((item) => item?.label)
      : [];
    if (groupedMissing.length > 0) {
      lines.push(`仍缺少业务组：${groupedMissing.map((item) => item.label).join('、')}`);
    }

    if (input.remainingMissingInputs.length > 0) {
      const remainingMissingLabels = this.dedupeWaitingInputLabels(input.remainingMissingInputs);
      lines.push(
        `仍缺少 ${remainingMissingLabels.length} 个字段：${this.formatFieldNameList(remainingMissingLabels)}`,
      );
      lines.push('已保留当前执行单，请继续补充剩余信息。');
    } else {
      lines.push('当前缺失字段已补齐，任务将继续执行。');
    }

    if (input.executionId) {
      lines.push(`执行单 ID: ${input.executionId}`);
    }

    return lines.join('\n\n');
  }

  private normalizeContentToText(content: string | ContentBlock[]): string {
    if (typeof content === 'string') return content;
    return content
      .map((block) => {
        if (block.type === 'text') {
          return block.text || '';
        }
        if (block.type === 'image_url') {
          return '[用户上传了图片]';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  private isThinkingEnabled(body: ChatRequestDTO): boolean {
    return body.config?.thinking !== false;
  }

  private resolvePreferredChatModelId(body: ChatRequestDTO): string {
    if (body.modelId && body.modelId !== 'default') {
      return body.modelId;
    }

    const preferredModel = this.modelService.getPreferredDefaultModel({
      mode: 'chat',
      userRoles: body.userRoles,
    });
    return preferredModel?.id || 'default';
  }

  private buildChatSystemMessage(thinkingEnabled: boolean, includeFiles: boolean): string {
    const basePrompt = includeFiles
      ? '你是一个智能助手，请用中文友好地回答用户的问题。如果用户上传了文件，请分析文件内容并给出相关回答。'
      : '你是一个智能助手，请用中文友好地回答用户的问题。';

    if (thinkingEnabled) {
      return `${basePrompt} 如模型支持推理或 think 模式，请先充分思考，再给出清晰结论。`;
    }

    return `${basePrompt} 直接输出结论，不要输出思考过程、推理细节或 <think> 标签。`;
  }

  private getVisibleChatContent(content: string, thinkingEnabled: boolean): string {
    return thinkingEnabled ? content : this.modelService.stripThinkingTags(content);
  }

  private parseJsonObjectMessage(message?: string): Record<string, unknown> | null {
    if (!message) {
      return null;
    }

    const trimmed = message.trim();
    const tryParseObject = (value: string): Record<string, unknown> | null => {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    };

    const directParsed = tryParseObject(trimmed);
    if (directParsed) {
      return directParsed;
    }

    const fencedBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedBlockMatch?.[1]) {
      const fencedParsed = tryParseObject(fencedBlockMatch[1].trim());
      if (fencedParsed) {
        return fencedParsed;
      }
    }

    for (let start = 0; start < trimmed.length; start += 1) {
      if (trimmed[start] !== '{') {
        continue;
      }

      let depth = 0;
      let inString = false;
      let isEscaped = false;

      for (let end = start; end < trimmed.length; end += 1) {
        const char = trimmed[end];

        if (inString) {
          if (isEscaped) {
            isEscaped = false;
          } else if (char === '\\') {
            isEscaped = true;
          } else if (char === '"') {
            inString = false;
          }
          continue;
        }

        if (char === '"') {
          inString = true;
          continue;
        }

        if (char === '{') {
          depth += 1;
        } else if (char === '}') {
          depth -= 1;

          if (depth === 0) {
            const candidate = trimmed.slice(start, end + 1);
            const parsed = tryParseObject(candidate);
            if (parsed) {
              return parsed;
            }
            break;
          }
        }
      }
    }

    return null;
  }

  private async loadSkillSchema(
    skillId: string,
    authToken?: string,
  ): Promise<{
    name?: string;
    description?: string;
    paramsSchema?: {
      properties?: Record<string, {
        type: string;
        description?: string;
        extractionPrompt?: string;
        default?: string | number | boolean;
      }>;
      required?: string[];
    };
    guideContext?: import('../interfaces').DocumentGuideContext;
  } | null> {
    try {
      const response = await axios.get<{
        name?: string;
        description?: string;
        paramsSchema?: {
          properties?: Record<string, {
            type: string;
            description?: string;
            extractionPrompt?: string;
            default?: string | number | boolean;
          }>;
          required?: string[];
        };
        apiEndpoints?: {
          runtimeMetadata?: import('../modules/react-engine/interfaces').SkillRuntimeMetadata;
        };
        goal?: string;
        expectedResult?: string;
        outputParams?: Record<string, unknown>;
      }>(`${getAuthServiceUrl()}/skills/${skillId}`, {
        headers: authToken ? { Authorization: authToken } : {},
      });
      return {
        ...response.data,
        guideContext: buildDocumentGuideContext({
          enabled:
            response.data.apiEndpoints?.runtimeMetadata?.sourceType === 'document'
            || response.data.apiEndpoints?.runtimeMetadata?.sourceType === 'execution_flow_template'
            || Boolean(response.data.apiEndpoints?.runtimeMetadata?.sourceTemplate?.templateId),
          skillName: response.data.name,
          description: response.data.description,
          goal: response.data.goal,
          expectedResult: response.data.expectedResult,
          outputParams: response.data.outputParams,
          paramsSchema: response.data.paramsSchema as any,
          runtimeMetadata: response.data.apiEndpoints?.runtimeMetadata,
        }),
      };
    } catch (error) {
      this.logger.warn(
        `Failed to load skill schema for ${skillId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  private buildSchemaForMissingInputs(
    missingInputs: Array<{ name: string }>,
    skillSchema?: {
      properties?: Record<string, {
        type: string;
        description?: string;
        extractionPrompt?: string;
        default?: string | number | boolean;
      }>;
      required?: string[];
    },
  ): {
    properties: Record<string, {
      type: string;
      description?: string;
      extractionPrompt?: string;
      default?: string | number | boolean;
    }>;
    required: string[];
  } {
    const properties = missingInputs.reduce<Record<string, {
      type: string;
      description?: string;
      extractionPrompt?: string;
      default?: string | number | boolean;
    }>>((acc, item) => {
      const schema = skillSchema?.properties?.[item.name];
      acc[item.name] = schema || {
        type: 'string',
        description: item.name,
      };
      return acc;
    }, {});

    return {
      properties,
      required: missingInputs.map((item) => item.name),
    };
  }

  private resolvePreferredTaskModelId(modelId?: string): string {
    if (modelId && modelId !== 'default') {
      return modelId;
    }

    const preferredModel = this.modelService.getPreferredDefaultModel({ mode: 'chat' });
    return preferredModel?.id || 'default';
  }

  private hasMeaningfulWaitingInputValue(value: unknown): boolean {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.some((item) => this.hasMeaningfulWaitingInputValue(item));
    }
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>)
        .some((item) => this.hasMeaningfulWaitingInputValue(item));
    }
    return true;
  }

  private containsJapaneseScript(text: string): boolean {
    return /[\u3040-\u30ff\uff66-\uff9f]/u.test(text);
  }

  private buildWaitingInputBilingualPairs(
    skillSchema?: {
      properties?: Record<string, {
        type: string;
        description?: string;
        extractionPrompt?: string;
        default?: string | number | boolean;
      }>;
    },
  ): Array<{
    leftKey: string;
    rightKey: string;
    leftLang: 'zh' | 'ja';
    rightLang: 'zh' | 'ja';
    type: string;
  }> {
    const properties = skillSchema?.properties || {};
    const keys = Object.keys(properties);
    const pairs: Array<{
      leftKey: string;
      rightKey: string;
      leftLang: 'zh' | 'ja';
      rightLang: 'zh' | 'ja';
      type: string;
    }> = [];

    keys.forEach((key) => {
      for (const [leftSuffix, rightSuffix, leftLang, rightLang] of [
        ['_cn', '_jp', 'zh', 'ja'],
        ['_zh', '_ja', 'zh', 'ja'],
      ] as const) {
        if (!key.endsWith(leftSuffix)) {
          continue;
        }
        const rightKey = `${key.slice(0, -leftSuffix.length)}${rightSuffix}`;
        if (!properties[rightKey]) {
          continue;
        }
        pairs.push({
          leftKey: key,
          rightKey,
          leftLang,
          rightLang,
          type: String(properties[key]?.type || properties[rightKey]?.type || 'string').toLowerCase(),
        });
      }
    });

    return pairs;
  }

  private async translateWaitingInputValues(
    data: Record<string, string>,
    sourceLang: 'zh' | 'ja',
    targetLang: 'zh' | 'ja',
    modelId?: string,
  ): Promise<{ values: Record<string, string>; usage?: LLMUsage }> {
    if (Object.keys(data).length === 0) {
      return { values: {} };
    }

    const sourceName = sourceLang === 'zh' ? '中文' : '日语';
    const targetName = targetLang === 'ja' ? '日语' : '中文';
    const prompt = `你是一个专业的合同翻译助手。请将以下 JSON 对象中的值从${sourceName}翻译成${targetName}。
要求：
1. 保持 JSON 结构与 key 不变，只翻译 value。
2. 翻译需符合法律/商务合同语境。
3. 对公司名、专有名词优先采用常见正式译法；若无法确定，再保留原文。
4. 直接返回 JSON，不要附加解释或 Markdown 代码块。
待翻译内容：
${JSON.stringify(data, null, 2)}`;

    try {
      const response = await this.modelService.callModel(
        this.resolvePreferredTaskModelId(modelId),
        prompt,
        'auxiliary',
      );
      const cleaned = response.content.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { values: { ...data }, usage: response.usage };
      }
      return { values: parsed as Record<string, string>, usage: response.usage };
    } catch {
      return { values: { ...data } };
    }
  }

  private async expandWaitingInputBilingualPayload(
    input: Record<string, unknown>,
    missingInputs: Array<{ name: string; type?: string }>,
    allRequiredInputs: Array<{ name: string; value?: unknown; missing?: boolean }> = [],
    skillSchema?: {
      properties?: Record<string, {
        type: string;
        description?: string;
        extractionPrompt?: string;
        default?: string | number | boolean;
      }>;
      required?: string[];
    },
    message?: string,
    modelId?: string,
  ): Promise<{ input: Record<string, unknown>; usage?: LLMUsage }> {
    const pairs = this.buildWaitingInputBilingualPairs(skillSchema);
    if (pairs.length === 0) {
      return { input };
    }

    const expandedInput: Record<string, unknown> = { ...input };
    const missingKeySet = new Set(missingInputs.map((item) => item.name));
    const existingValueMap = new Map(
      allRequiredInputs
        .filter((item) => this.hasMeaningfulWaitingInputValue(item.value))
        .map((item) => [item.name, item.value] as const),
    );
    const preferZhAsSource = !this.containsJapaneseScript(String(message || ''));
    const zhToJa: Record<string, string> = {};
    const jaToZh: Record<string, string> = {};

    pairs.forEach((pair) => {
      const leftValue = expandedInput[pair.leftKey];
      const rightValue = expandedInput[pair.rightKey];
      const hasLeftValue = this.hasMeaningfulWaitingInputValue(leftValue);
      const hasRightValue = this.hasMeaningfulWaitingInputValue(rightValue);
      const normalizedLeftValue = typeof leftValue === 'string' ? leftValue.trim() : leftValue;
      const normalizedRightValue = typeof rightValue === 'string' ? rightValue.trim() : rightValue;
      const targetRightMissing = missingKeySet.has(pair.rightKey)
        && !this.hasMeaningfulWaitingInputValue(existingValueMap.get(pair.rightKey));
      const targetLeftMissing = missingKeySet.has(pair.leftKey)
        && !this.hasMeaningfulWaitingInputValue(existingValueMap.get(pair.leftKey));

      if (
        pair.type !== 'number'
        && pair.type !== 'integer'
        && pair.type !== 'boolean'
        && pair.type !== 'date'
        && typeof normalizedLeftValue === 'string'
        && typeof normalizedRightValue === 'string'
        && normalizedLeftValue
        && normalizedLeftValue === normalizedRightValue
        && targetLeftMissing
        && targetRightMissing
      ) {
        if (preferZhAsSource) {
          zhToJa[pair.rightKey] = normalizedLeftValue;
        } else {
          jaToZh[pair.leftKey] = normalizedRightValue;
        }
        return;
      }

      if (hasLeftValue && !hasRightValue && targetRightMissing) {
        if (pair.type === 'number' || pair.type === 'integer' || pair.type === 'boolean' || pair.type === 'date') {
          expandedInput[pair.rightKey] = leftValue;
        } else if (typeof leftValue === 'string' && leftValue.trim()) {
          if (pair.leftLang === 'zh' && pair.rightLang === 'ja') {
            zhToJa[pair.rightKey] = leftValue.trim();
          } else if (pair.leftLang === 'ja' && pair.rightLang === 'zh') {
            jaToZh[pair.rightKey] = leftValue.trim();
          }
        }
      }

      if (hasRightValue && !hasLeftValue && targetLeftMissing) {
        if (pair.type === 'number' || pair.type === 'integer' || pair.type === 'boolean' || pair.type === 'date') {
          expandedInput[pair.leftKey] = rightValue;
        } else if (typeof rightValue === 'string' && rightValue.trim()) {
          if (pair.rightLang === 'zh' && pair.leftLang === 'ja') {
            zhToJa[pair.leftKey] = rightValue.trim();
          } else if (pair.rightLang === 'ja' && pair.leftLang === 'zh') {
            jaToZh[pair.leftKey] = rightValue.trim();
          }
        }
      }
    });

    const zhToJaResult = await this.translateWaitingInputValues(zhToJa, 'zh', 'ja', modelId);
    Object.assign(expandedInput, zhToJaResult.values);
    const jaToZhResult = await this.translateWaitingInputValues(jaToZh, 'ja', 'zh', modelId);
    Object.assign(expandedInput, jaToZhResult.values);

    return {
      input: expandedInput,
      usage: this.sumUsage(zhToJaResult.usage, jaToZhResult.usage),
    };
  }

  private async buildWaitingInputPayload(
    message: string,
    missingInputs: Array<{ name: string; type?: string }>,
    allRequiredInputs: Array<{ name: string; value?: unknown; missing?: boolean }> = [],
    semantic?: WaitingInputSemantic,
    skillId?: string,
    authToken?: string,
    originalObjective?: string,
    userId?: string,
    modelId?: string,
  ): Promise<{ input: Record<string, unknown>; usage?: LLMUsage }> {
    if (missingInputs.length === 0) {
      throw new Error('当前执行单没有可补充的缺失参数。');
    }
    const [firstMissingInput] = missingInputs;

    const skill = skillId ? await this.loadSkillSchema(skillId, authToken) : null;
    const parsedObject = this.parseJsonObjectMessage(message);
    // #region debug-point B:waiting-input-entry
    (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='contract-param-recognition';try{const e=fs.readFileSync('.dbg/contract-param-recognition.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'B',location:'chat.controller.ts:958',msg:'[DEBUG] waiting_input payload start',data:{skillId,missingInputs:missingInputs.map((item)=>({name:item.name,type:item.type})),allRequiredInputs:allRequiredInputs.map((item)=>({name:item.name,missing:item.missing,value:item.value})),message,parsedObjectKeys:parsedObject&&typeof parsedObject==='object'?Object.keys((parsedObject.params&&typeof parsedObject.params==='object'&&!Array.isArray(parsedObject.params)?parsedObject.params:parsedObject) as Record<string, unknown>):[]},ts:Date.now()})}).catch(()=>{});})();
    // #endregion

    if (parsedObject) {
      const parsedParams =
        parsedObject.params && typeof parsedObject.params === 'object' && !Array.isArray(parsedObject.params)
          ? parsedObject.params as Record<string, unknown>
          : parsedObject;
      const allowedKeys = new Set(missingInputs.map((item) => item.name));
      const filteredEntries = Object.entries(parsedParams).filter(([key]) => allowedKeys.has(key));
      if (filteredEntries.length > 0) {
        const expanded = await this.expandWaitingInputBilingualPayload(
          Object.fromEntries(filteredEntries),
          missingInputs,
          allRequiredInputs,
          skill?.paramsSchema,
          message,
          modelId,
        );
        // #region debug-point B:waiting-input-json-hit
        (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='contract-param-recognition';try{const e=fs.readFileSync('.dbg/contract-param-recognition.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'B',location:'chat.controller.ts:969',msg:'[DEBUG] waiting_input accepted json payload',data:{allowedKeys:Array.from(allowedKeys),filteredEntries:Object.fromEntries(filteredEntries),expandedInput:expanded.input},ts:Date.now()})}).catch(()=>{});})();
        // #endregion
        return {
          input: expanded.input,
          usage: expanded.usage,
        };
      }
    }

    const plannerStylePrompt = [
      originalObjective?.trim(),
      '以下是用户针对缺失参数的补充说明：',
      message.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');

    if (skillId) {
      const paramsSchema = this.buildSchemaForMissingInputs(missingInputs, skill?.paramsSchema);
      const alreadyCollected = Object.fromEntries(
        allRequiredInputs
          .filter((item) => item.missing !== true)
          .filter((item) => item.value !== undefined && item.value !== null)
          .map((item) => [item.name, item.value] as const),
      );

      // Prefer planner-style re-understanding over rigid JSON-only fallback:
      // combine the original objective and the user's follow-up clarification,
      // then ask the recognizer to extract only the still-missing fields.
      const recognized = await this.recognizerService.recognizeParams({
        template_id: skillId,
        user_input: plannerStylePrompt,
        modelId,
        params_schema: paramsSchema,
        guide_context: skill?.guideContext,
        context: {
          mode: 'waiting_input_resume',
          original_objective: originalObjective,
          missing_inputs: missingInputs.map((item) => item.name),
          already_collected: alreadyCollected,
          skill_name: skill?.name,
        },
      });

      const recognizedEntries = Object.entries(recognized?.params || {}).filter(([, value]) => (
        value !== undefined &&
        value !== null &&
        !(typeof value === 'string' && value.trim() === '')
      ));
      // #region debug-point C:waiting-input-recognizer
      (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='contract-param-recognition';try{const e=fs.readFileSync('.dbg/contract-param-recognition.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'C',location:'chat.controller.ts:1019',msg:'[DEBUG] waiting_input recognizer result',data:{skillId,recognizedParams:recognized?.params||{},recognizedEntries:Object.fromEntries(recognizedEntries),missingInputs:missingInputs.map((item)=>item.name),alreadyCollected},ts:Date.now()})}).catch(()=>{});})();
      // #endregion

      if (recognizedEntries.length > 0) {
        const expanded = await this.expandWaitingInputBilingualPayload(
          Object.fromEntries(recognizedEntries),
          missingInputs,
          allRequiredInputs,
          skill?.paramsSchema,
          message,
          modelId,
        );
        // #region debug-point C:waiting-input-recognizer-expanded
        (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='contract-param-recognition';try{const e=fs.readFileSync('.dbg/contract-param-recognition.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'C',location:'chat.controller.ts:1026',msg:'[DEBUG] waiting_input recognizer expanded payload',data:{expandedInput:expanded.input},ts:Date.now()})}).catch(()=>{});})();
        // #endregion
        return {
          input: expanded.input,
          usage: this.sumUsage(recognized.usage, expanded.usage),
        };
      }

      // If recognizer cannot confidently map free-form follow-up text,
      // re-run AI planner with the full context and collect resolved fields.
      try {
        const planDraft = await this.plannerService.generatePlan({
          request: {
            user_input: plannerStylePrompt,
            user_id: userId,
            modelId,
            context: {
              mode: 'waiting_input_resume',
              target_skill_id: skillId,
              missing_inputs: missingInputs.map((item) => item.name),
              already_collected: alreadyCollected,
              original_objective: originalObjective,
              skill_name: skill?.name,
            },
          },
          userId,
          authToken,
        });

        const allowedKeys = new Set(missingInputs.map((item) => item.name));
        const plannedResolvedEntries = (planDraft.required_inputs || [])
          .filter((item) => allowedKeys.has(item.name))
          .filter((item) => !item.missing)
          .map((item) => [item.name, item.value] as const)
          .filter(([, value]) => (
            value !== undefined &&
            value !== null &&
            !(typeof value === 'string' && value.trim() === '')
          ));
        // #region debug-point D:waiting-input-planner-fallback
        (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='contract-param-recognition';try{const e=fs.readFileSync('.dbg/contract-param-recognition.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'D',location:'chat.controller.ts:1061',msg:'[DEBUG] waiting_input planner fallback result',data:{allowedKeys:Array.from(allowedKeys),plannedRequiredInputs:(planDraft.required_inputs||[]).map((item)=>({name:item.name,missing:item.missing,value:item.value})),plannedResolvedEntries:Object.fromEntries(plannedResolvedEntries)},ts:Date.now()})}).catch(()=>{});})();
        // #endregion

        if (plannedResolvedEntries.length > 0) {
          const expanded = await this.expandWaitingInputBilingualPayload(
            Object.fromEntries(plannedResolvedEntries),
            missingInputs,
            allRequiredInputs,
            skill?.paramsSchema,
            message,
            modelId,
          );
          return {
            input: expanded.input,
            usage: this.sumUsage(recognized?.usage, planDraft.usage, expanded.usage),
          };
        }
      } catch (error) {
        this.logger.warn(
          `Planner-based waiting_input extraction failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    const labeledPayload = this.resolveWaitingInputLabeledPayload(
      message,
      missingInputs as Array<{ name: string; description?: string; display_name?: string }>,
    );
    if (Object.keys(labeledPayload).length > 0) {
      const expanded = await this.expandWaitingInputBilingualPayload(
        labeledPayload,
        missingInputs,
        allRequiredInputs,
        skill?.paramsSchema,
        message,
        modelId,
      );
      return {
        input: expanded.input,
        usage: expanded.usage,
      };
    }

    if (missingInputs.length === 1) {
      const normalizedType = String(firstMissingInput?.type || 'string').toLowerCase();
      if (!['string', 'text'].includes(normalizedType)) {
        throw new Error(
          this.buildWaitingInputFollowupHint(missingInputs, semantic),
        );
      }
      return {
        input: {
          [firstMissingInput!.name]: message.trim(),
        },
      };
    }

    throw new Error(
      this.buildWaitingInputFollowupHint(missingInputs, semantic),
    );
  }

  private sumUsage(...usages: Array<LLMUsage | undefined>): LLMUsage | undefined {
    const validUsages = usages.filter((usage): usage is LLMUsage => !!usage);
    if (validUsages.length === 0) {
      return undefined;
    }

    const total: LLMUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    for (const usage of validUsages) {
      total.prompt_tokens += usage.prompt_tokens || 0;
      total.completion_tokens += usage.completion_tokens || 0;
      total.total_tokens += usage.total_tokens || 0;
      if (usage.completion_tokens_details?.reasoning_tokens) {
        if (!total.completion_tokens_details) {
          total.completion_tokens_details = { reasoning_tokens: 0 };
        }
        total.completion_tokens_details.reasoning_tokens =
          (total.completion_tokens_details.reasoning_tokens || 0)
          + usage.completion_tokens_details.reasoning_tokens;
      }
    }

    return total;
  }

  private buildPlannerPromptDebug(
    message: string,
    planDraft: PlanDraftDTO,
  ): Record<string, unknown> {
    const metadata = (planDraft.metadata && typeof planDraft.metadata === 'object')
      ? planDraft.metadata as Record<string, unknown>
      : undefined;
    const debug = (metadata?.debug && typeof metadata.debug === 'object' && !Array.isArray(metadata.debug))
      ? metadata.debug as Record<string, unknown>
      : undefined;
    const llmCalls = Array.isArray(debug?.llmCalls)
      ? debug.llmCalls.filter((item) => item && typeof item === 'object')
      : [];
    const latestLlmCall = llmCalls.length > 0
      ? llmCalls[llmCalls.length - 1] as Record<string, unknown>
      : undefined;
    const notes = Array.isArray(debug?.notes)
      ? debug.notes.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
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
      systemPromptSectionKeys: ['planner_mode', 'planner_summary', 'planner_objective', 'planner_steps'],
      userPromptSectionKeys: ['user_message'],
      modelId: typeof latestLlmCall?.modelId === 'string' ? latestLlmCall.modelId : undefined,
      llmRequestMessages: Array.isArray(latestLlmCall?.requestMessages)
        ? latestLlmCall.requestMessages
        : undefined,
      llmResponseText: typeof latestLlmCall?.responseText === 'string'
        ? latestLlmCall.responseText
        : undefined,
      llmCalls,
      notes,
    };
  }

  private buildExecutionPlanDraft(planDraft: PlanDraftDTO): Record<string, unknown> {
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
    };
  }

  private buildExecutionPromptDebug(promptDebug?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!promptDebug) {
      return undefined;
    }

    return {
      debugSource: promptDebug.debugSource,
      systemPrompt: promptDebug.systemPrompt,
      userPrompt: promptDebug.userPrompt,
      systemPromptSectionKeys: promptDebug.systemPromptSectionKeys,
      userPromptSectionKeys: promptDebug.userPromptSectionKeys,
      modelId: promptDebug.modelId,
      notes: promptDebug.notes,
    };
  }

  private async resolveAuthenticatedUser(
    authorization?: string,
  ): Promise<{ userId?: string; userRoles?: string[] }> {
    if (!authorization) {
      return {};
    }

    try {
      const response = await fetch(`${getAuthServiceUrl()}/auth/me`, {
        headers: {
          Authorization: authorization,
        },
      });

      if (!response.ok) {
        return {};
      }

      const payload = await response.json() as {
        user?: { id?: string; role?: string };
        roles?: Array<{ name?: string }>;
      };

      const roleSet = new Set<string>();
      if (payload.user?.role) {
        roleSet.add(payload.user.role);
      }
      for (const role of payload.roles || []) {
        if (role?.name) {
          roleSet.add(role.name);
        }
      }

      return {
        userId: payload.user?.id,
        userRoles: Array.from(roleSet),
      };
    } catch {
      return {};
    }
  }

  private buildTaskModeAuthRequiredEvent(): StreamEvent {
    return {
      type: StreamEventType.ERROR,
      content: '任务模式需要登录后使用，请重新登录后重试。',
      data: {
        errorCode: 'AUTH_LOGIN_REQUIRED',
        statusCode: 401,
      },
    };
  }

  private async buildTaskModeContext(
    body: ChatRequestDTO,
    authorization: string | undefined,
    traceId: string,
    history: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp: Date;
    }>,
  ): Promise<{ context?: ExecutionContext; authError?: StreamEvent }> {
    const resolvedUser = await this.resolveAuthenticatedUser(authorization);

    if (!resolvedUser.userId) {
      this.logger.warn(`Rejecting anonymous task-mode request for session ${body.sessionId || 'default'}`);
      return {
        authError: this.buildTaskModeAuthRequiredEvent(),
      };
    }

    return {
      context: {
        sessionId: body.sessionId || 'default',
        userId: resolvedUser.userId,
        userRoles: resolvedUser.userRoles?.length ? resolvedUser.userRoles : body.userRoles,
        authToken: authorization,
        traceId,
        history,
        uploadedFiles: body.files || [],
      },
    };
  }

  @Post('chat/stream')
  @ApiOperation({ summary: 'AI chat with ReAct engine or simple mode (SSE stream)' })
  async chatStream(
    @Body() body: ChatRequestDTO,
    @Req() req: Request & { traceId?: string },
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const traceId = getOrCreateTraceId(body.traceId || req.traceId);
    const mode: 'chat' | 'task' = body.config?.mode || 'chat';

    try {
      if (mode === 'chat') {
        const modelId = this.resolvePreferredChatModelId(body);
        const sessionId = body.sessionId || 'default';
        const thinkingEnabled = this.isThinkingEnabled(body);
        const client = this.modelService.getClient(modelId);

        if (!client) {
          this.writeSse(res, {
            type: StreamEventType.ERROR,
            content: `模型 ${modelId} 未初始化`,
            traceId,
          });
          res.end();
          return;
        }

        this.writeSse(res, {
          type: StreamEventType.THOUGHT,
          content: '正在思考...',
          traceId,
        });

        let messageContent: string | ContentBlock[];
        const systemMessage = this.buildChatSystemMessage(
          thinkingEnabled,
          Boolean(body.files && body.files.length > 0),
        );

        if (body.files && body.files.length > 0) {
          const contentBlocks: ContentBlock[] = [{ type: 'text', text: body.message }];

          for (const file of body.files) {
            const storedFile = fileStore.get(file.fileId);
            if (!storedFile?.content) {
              contentBlocks.push({
                type: 'text',
                text: `\n【文件: ${file.fileName}】\n(文件内容未找到，可能已过期)`,
              });
              continue;
            }

            const isImage = storedFile.mimeType.startsWith('image/');
            if (isImage) {
              contentBlocks.push({
                type: 'image_url',
                image_url: {
                  url: `data:${storedFile.mimeType};base64,${storedFile.content}`,
                  detail: 'auto',
                },
              });
              continue;
            }

            try {
              const decodedContent = Buffer.from(storedFile.content, 'base64').toString('utf-8');
              contentBlocks.push({
                type: 'text',
                text: `\n【文件: ${storedFile.fileName}】\n${decodedContent}`,
              });
            } catch {
              contentBlocks.push({
                type: 'text',
                text: `\n【文件: ${storedFile.fileName} (${storedFile.mimeType}, ${storedFile.size}字节)】\n(二进制文件，无法直接显示内容)`,
              });
            }
          }

          messageContent = contentBlocks;
        } else {
          messageContent = body.message;
        }

        const messages: MultimodalChatMessage[] = [
          { role: 'system', content: systemMessage },
        ];
        const chatSession = await this.sessionService.getChatSession(sessionId);
        const historyMessages: MultimodalChatMessage[] = (chatSession?.history || []).map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));
        messages.push(...historyMessages);
        messages.push({ role: 'user', content: messageContent });

        const userMessageForHistory = this.normalizeContentToText(messageContent);
        let fullContent = '';
        const response = await this.modelService.callModelStreamWithMessages(modelId, messages, (chunk: string) => {
          fullContent += chunk;
          const visibleContent = this.getVisibleChatContent(fullContent, thinkingEnabled);
          this.writeSse(res, {
            type: StreamEventType.OBSERVATION,
            content: visibleContent,
            data: {
              mode: 'chat',
              thinking: thinkingEnabled,
            },
            traceId,
          });
        });

        const visibleContent = this.getVisibleChatContent(fullContent || '处理完成', thinkingEnabled);
        const historyAssistantContent = this.modelService.stripThinkingTags(fullContent || '处理完成');

        // P2: Log usage if needed
        if (response.usage) {
          this.logger.debug(`Chat completion usage: ${JSON.stringify(response.usage)}`);
        }

        this.writeSse(res, {
          type: StreamEventType.RESULT,
          content: visibleContent,
          data: {
            mode: 'chat',
            thinking: thinkingEnabled,
            usage: response.usage,
            rateLimit: response.rateLimit,
          },
          traceId,
        });

        await this.sessionService.appendChatMessages(sessionId, [
          {
            role: 'user',
            content: userMessageForHistory,
            timestamp: new Date().toISOString(),
          },
          {
            role: 'assistant',
            content: historyAssistantContent,
            timestamp: new Date().toISOString(),
          },
        ]);

        this.writeSse(res, {
          type: 'done',
          content: 'Stream completed',
          traceId,
        });
        res.end();
        return;
      }

      const chatSession = await this.sessionService.getChatSession(body.sessionId || 'default');
      const history = (chatSession?.history || []).map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
      }));
      const taskModeContext = await this.buildTaskModeContext(
        body,
        req.headers.authorization,
        traceId,
        history,
      );

      if (!taskModeContext.context) {
        this.writeSse(res, {
          ...taskModeContext.authError,
          traceId,
          data: {
            ...(taskModeContext.authError?.data || {}),
            traceId,
          },
        });
        res.end();
        return;
      }

      for await (const event of this.handleTaskMode(body, taskModeContext.context, req.headers.authorization)) {
        this.writeSse(res, { ...event, traceId });
      }
      this.writeSse(res, { type: 'done', content: 'Stream completed', traceId });
      res.end();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.writeSse(res, {
        type: StreamEventType.ERROR,
        content: errorMsg,
        traceId,
      });
      res.end();
    }
  }

  private async *handleTaskMode(
    body: ChatRequestDTO,
    context: ExecutionContext,
    authToken?: string,
  ): AsyncGenerator<StreamEvent> {
    const traceId = context.traceId;

    // 如果请求中带了 executionId，或者 session 中存了 executionId，尝试恢复执行上下文
    const executionId = body.executionId || context.executionId;

    if (executionId) {
      try {
        // 查询执行单状态
        const execution = await this.controlPlaneClient.getExecution<{
          skillId?: string;
          status: string;
          semantic?: WaitingInputSemantic;
          normalizedInput?: {
            objective?: string;
            semantic?: WaitingInputSemantic;
          };
        }>(
          executionId,
          this.buildControlPlaneRequestOptions(authToken, {
            userId: context.userId,
            userRoles: context.userRoles,
          }),
        );

        // 如果执行单在等待输入，且用户提供了消息，则提交输入
        if (execution.status === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT && body.message) {
          yield {
            type: StreamEventType.THOUGHT,
            content: '正在提交您补充的信息...',
          };

          const waitingInputDetails = await this.loadWaitingInputDetails(
            executionId,
            authToken,
            {
              userId: context.userId,
              userRoles: context.userRoles,
            },
          );
          if (waitingInputDetails.waitingStepId) {
            try {
              const waitingInputPayload = await this.buildWaitingInputPayload(
                body.message,
                waitingInputDetails.missingInputs,
                waitingInputDetails.allRequiredInputs,
                this.extractExecutionSemantic(execution),
                execution.skillId,
                authToken,
                typeof execution.normalizedInput?.objective === 'string'
                  ? execution.normalizedInput.objective
                  : undefined,
                context.userId,
                body.modelId,
              );

              await this.controlPlaneClient.submitExecutionInput(
                executionId,
                {
                  stepId: waitingInputDetails.waitingStepId,
                  input: waitingInputPayload.input,
                  usage: waitingInputPayload.usage,
                },
                this.buildControlPlaneRequestOptions(authToken, {
                  userId: context.userId,
                  userRoles: context.userRoles,
                }),
              );

              const latestStateEvent = await this.buildLatestExecutionStateEvent(
                executionId,
                authToken,
                {
                  userId: context.userId,
                  userRoles: context.userRoles,
                },
              );

              if (latestStateEvent?.type === StreamEventType.WAITING_INPUT) {
                const waitingPayload =
                  latestStateEvent.data
                  && typeof latestStateEvent.data === 'object'
                  && !Array.isArray(latestStateEvent.data)
                    ? latestStateEvent.data as {
                        missingInputs?: Array<{
                          name: string;
                          group_label?: string;
                          display_name?: string;
                          needs_confirmation?: boolean;
                        }>;
                        semantic?: WaitingInputSemantic;
                      }
                    : {};
                const remainingMissingInputs = Array.isArray(waitingPayload.missingInputs)
                  ? waitingPayload.missingInputs
                  : [];
                const semantic = waitingPayload.semantic;

                yield {
                  type: StreamEventType.THOUGHT,
                  content: this.buildWaitingInputSubmissionFeedback({
                    executionId,
                    resolvedFieldNames: Object.keys(waitingInputPayload.input || {}),
                    remainingMissingInputs,
                    semantic,
                  }),
                };

                yield latestStateEvent;
                return;
              }

              yield {
                type: StreamEventType.THOUGHT,
                content: '信息已提交，任务继续执行。',
              };

              for await (const event of this.observeExecution(executionId, authToken, {
                userId: context.userId,
                userRoles: context.userRoles,
              })) {
                yield event;
              }
              return;
            } catch (err: any) {
              yield {
                type: StreamEventType.ERROR,
                content: `提交信息失败: ${err.response?.data?.message || err.message}`,
              };
              return;
            }
          }
        }

        // 如果执行单还在运行中，返回状态并开始观察
        if (
          execution.status === CONTROL_PLANE_EXECUTION_STATUS.QUEUED
          || execution.status === CONTROL_PLANE_EXECUTION_STATUS.RUNNING
          || execution.status === CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL
          || execution.status === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT
        ) {
          yield {
            type: StreamEventType.THOUGHT,
            content: `任务正在执行中 (状态: ${execution.status})，正在为您实时观察进度...`,
          };
          
          for await (const event of this.observeExecution(executionId, authToken, {
            userId: context.userId,
            userRoles: context.userRoles,
          })) {
            yield event;
          }
          return;
        }
      } catch (error: any) {
        const isAuthError = error.response?.status === 401 || error.response?.status === 403;
        const isNotFoundError = error.response?.status === 404;

        if (isAuthError) {
          this.logger.error(`Authentication failed for execution ${executionId}: ${error.message}`);
          yield {
            type: StreamEventType.ERROR,
            content: '您的登录会话已过期或无效，请重新登录后再试。',
          };
          return;
        }

        if (!isNotFoundError) {
          this.logger.error(`Failed to fetch execution ${executionId}: ${error.message}`);
          yield {
            type: StreamEventType.ERROR,
            content: `无法恢复执行进度: ${error.response?.data?.message || error.message}`,
          };
          return;
        }

        this.logger.warn(`Execution ${executionId} not found, falling back to new plan.`);
      }
    }

    // 1. 生成计划
    yield {
      type: StreamEventType.THOUGHT,
      content: '正在规划任务...',
    };

    const autoFillMissingRequired = Boolean(
      (body.config && typeof (body.config as any).autoFillMissingRequired === 'boolean'
        ? (body.config as any).autoFillMissingRequired
        : false)
      || (typeof body.message === 'string'
        && body.message.includes('端对端')
        && body.message.includes('技术服务合同')),
    );

    const plannerInput = {
      request: {
        user_input: body.message,
        user_id: context.userId,
        modelId: body.modelId,
        context: {
          sessionId: body.sessionId,
          uploadedFiles: body.files,
          history: context.history,
          ...(autoFillMissingRequired ? { auto_fill_missing_required: true } : {}),
        },
      },
      userId: context.userId,
      authToken,
      traceId,
    };
    const matchPhase = await this.plannerService.matchSkillPhase(plannerInput);

    if (matchPhase.matchedSkill) {
      yield {
        type: StreamEventType.THOUGHT,
        content: `已识别到技能: ${matchPhase.matchedSkill.skillName}，正在识别参数...`,
      };
    }

    const planDraft = await this.plannerService.completePlanFromMatchPhase({
      ...plannerInput,
      matchPhase,
    });

    // 2. 如果匹配到技能，则在 control-plane 创建执行
    if (planDraft && planDraft.planner_mode === 'skill' && planDraft.skill_match) {
      const plannerPromptDebug = this.canExposePromptDebug(context)
        ? this.buildPlannerPromptDebug(body.message, planDraft)
        : undefined;
      const executionPromptDebug = this.buildExecutionPromptDebug(plannerPromptDebug);
      const executionPlanDraft = this.buildExecutionPlanDraft(planDraft);
      const missingInputs = planDraft.required_inputs.filter((input) => input.missing);
      if (missingInputs.length > 0) {
        const waitingInputSemantic = planDraft.semantic;
        yield {
          type: StreamEventType.THOUGHT,
          content: `已识别到技能: ${planDraft.skill_match.skill_name}，正在创建可恢复的执行单...`,
        };

        try {
          const execution = await this.controlPlaneClient.createExecution<{
            id: string;
            status?: string;
            approvalStatus?: string;
            usage?: Record<string, unknown>;
            semantic?: WaitingInputSemantic;
            normalizedInput?: Record<string, unknown>;
          }>(
            {
              skillId: planDraft.skill_match.skill_id,
              ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
              input: {
                prompt: body.message,
                ...(executionPromptDebug ? { __promptDebug: executionPromptDebug } : {}),
                ...Object.fromEntries(
                  planDraft.required_inputs
                    .filter((input) => !input.missing)
                    .map((input) => [input.name, input.value]),
                ),
              },
              usage: planDraft.usage,
              planDraft: executionPlanDraft,
            },
            this.buildControlPlaneRequestOptions(authToken, {
              userId: context.userId,
              userRoles: context.userRoles,
            }),
          );
          const executionStatus = execution.status || CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT;

          if (executionStatus === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT) {
            yield {
              type: StreamEventType.RESULT,
              content: this.formatWaitingInputMessage({
                executionId: execution.id,
                intro: '已创建等待补充信息的执行单。',
                missingInputs,
                semantic: this.extractExecutionSemantic(execution) || waitingInputSemantic,
              }),
              data: {
                executionId: execution.id,
                status: CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT,
                hasBusinessResult: false,
                missingInputs,
                semantic: this.extractExecutionSemantic(execution) || waitingInputSemantic,
                plan: planDraft,
                usage: execution.usage || planDraft.usage,
                ...(plannerPromptDebug ? { promptDebug: plannerPromptDebug } : {}),
              },
            };
            return;
          } else if (executionStatus === CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL) {
            const approvalIntro = missingInputs.length > 0
              ? `任务已创建，已应用部分默认参数，但仍需审批。\n\n当前审批状态: ${execution.approvalStatus || CONTROL_PLANE_APPROVAL_STATUS.PENDING}\n执行单 ID: ${execution.id}`
              : `任务已创建，等待审批。\n\n当前审批状态: ${execution.approvalStatus || CONTROL_PLANE_APPROVAL_STATUS.PENDING}\n执行单 ID: ${execution.id}`;
            yield {
              type: StreamEventType.RESULT,
              content: approvalIntro,
              data: {
                executionId: execution.id,
                status: CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL,
                approvalStatus: execution.approvalStatus || CONTROL_PLANE_APPROVAL_STATUS.PENDING,
                hasBusinessResult: false,
                plan: planDraft,
                usage: execution.usage || planDraft.usage,
                ...(plannerPromptDebug ? { promptDebug: plannerPromptDebug } : {}),
              },
            };
          } else {
            const startSummary = missingInputs.length > 0
              ? '已应用默认参数补齐可兜底项，并开始执行。'
              : planDraft.summary;
            yield {
              type: StreamEventType.RESULT,
              content: `任务已启动。执行单 ID: ${execution.id}\n\n${startSummary}`,
              data: {
                executionId: execution.id,
                status: executionStatus,
                hasBusinessResult: false,
                plan: planDraft,
                usage: execution.usage || planDraft.usage,
                ...(plannerPromptDebug ? { promptDebug: plannerPromptDebug } : {}),
              },
            };
          }

          for await (const event of this.observeExecution(execution.id, authToken, {
            userId: context.userId,
            userRoles: context.userRoles,
          })) {
            yield event;
          }
          return;
        } catch (error: any) {
          const errorMsg = error.response?.data?.message || error.message;
          yield {
            type: StreamEventType.ERROR,
            content: `创建等待输入执行单失败: ${errorMsg}`,
          };
        }

        yield {
          type: StreamEventType.WAITING_INPUT,
          content: this.formatWaitingInputMessage({
            intro: `已识别到技能 ${planDraft.skill_match.skill_name}，但还缺少必要信息。`,
            missingInputs,
            semantic: waitingInputSemantic,
          }),
          data: {
            status: CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT,
            hasBusinessResult: false,
            missingInputs,
            semantic: waitingInputSemantic,
            plan: planDraft,
            ...(plannerPromptDebug ? { promptDebug: plannerPromptDebug } : {}),
          },
        };
        return;
      }

      yield {
        type: StreamEventType.THOUGHT,
        content: `已匹配到技能: ${planDraft.skill_match.skill_name}，正在创建执行单...`,
      };

      try {
        const execution = await this.controlPlaneClient.createExecution<{ id: string }>(
          {
            skillId: planDraft.skill_match.skill_id,
            ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
            input: {
              prompt: body.message,
              ...(executionPromptDebug ? { __promptDebug: executionPromptDebug } : {}),
              ...Object.fromEntries(
                planDraft.required_inputs
                  .filter((i) => !i.missing)
                  .map((i) => [i.name, i.value]),
              ),
            },
            usage: planDraft.usage,
            planDraft: executionPlanDraft,
          },
          this.buildControlPlaneRequestOptions(authToken, {
            userId: context.userId,
            userRoles: context.userRoles,
          }),
        );

        yield {
          type: StreamEventType.RESULT,
          content: `任务已启动。执行单 ID: ${execution.id}\n\n${planDraft.summary}`,
          data: {
            executionId: execution.id,
            status: CONTROL_PLANE_EXECUTION_STATUS.QUEUED,
            hasBusinessResult: false,
            plan: planDraft,
            usage: planDraft.usage,
            ...(plannerPromptDebug ? { promptDebug: plannerPromptDebug } : {}),
          },
        };

        // 启动后立即开始观察进度
        for await (const event of this.observeExecution(execution.id, authToken, {
          userId: context.userId,
          userRoles: context.userRoles,
        })) {
          yield event;
        }
        return;
      } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.message;
        yield {
          type: StreamEventType.ERROR,
          content: `创建执行单失败: ${errorMsg}`,
        };
        // 失败后回退到 ReAct 引擎
        yield {
          type: StreamEventType.THOUGHT,
          content: '创建执行单失败，尝试使用 ReAct 引擎直接处理...',
        };
      }
    }

    // 3. 回退到 ReAct 引擎 (如果是 fallback 模式或者创建执行失败)
    for await (const event of this.reactEngineService.execute({ ...body, traceId }, context)) {
      yield event;
    }
  }

  private async *observeExecution(
    executionId: string,
    authToken?: string,
    user?: { userId?: string; userRoles?: string[] },
  ): AsyncGenerator<StreamEvent> {
    this.logger.log(`Starting to observe execution ${executionId} via control-plane stream`);

    try {
      const immediateStateEvent = await this.buildLatestExecutionStateEvent(executionId, authToken, user);
      if (immediateStateEvent) {
        yield immediateStateEvent;
        return;
      }

      const stream = await this.controlPlaneClient.streamExecutionEvents(
        executionId,
        this.buildControlPlaneRequestOptions(authToken, user),
      );
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const rawData = line.substring(6);
              const event = JSON.parse(rawData);
              this.logger.debug(`Received execution event: ${event.eventType} for ${executionId}`);

              // 如果执行结束，停止观察
              if (
                event.eventType === CONTROL_PLANE_EVENT_TYPE.EXECUTION_STATUS_CHANGED &&
                isTerminalControlPlaneExecutionStatus(event.payload.newStatus)
              ) {
                const terminalEvent = await this.buildTerminalExecutionEvent(
                  executionId,
                  event.payload.newStatus,
                  authToken,
                  user,
                );
                if (terminalEvent) {
                  yield terminalEvent;
                }
                this.logger.log(`Execution ${executionId} reached terminal state: ${event.payload.newStatus}`);
                return;
              }

              // 将 Control Plane 事件转换为 Chat Stream 事件
              const streamEvent = this.mapExecutionEventToStreamEvent(event);
              if (streamEvent) {
                yield streamEvent;
              }
            } catch (e) {
              this.logger.error(`Failed to parse execution event: ${line}`, e);
            }
          }
        }
      }

      const latestEvent = await this.buildLatestExecutionStateEvent(executionId, authToken, user);
      if (latestEvent) {
        yield latestEvent;
      }
    } catch (error: any) {
      this.logger.error(`Error observing execution ${executionId}`, error);
      yield {
        type: StreamEventType.ERROR,
        content: `观察执行进度时出错: ${error.message}`,
      };
    }
  }

  private async buildLatestExecutionStateEvent(
    executionId: string,
    authToken?: string,
    user?: { userId?: string; userRoles?: string[] },
  ): Promise<StreamEvent | null> {
    try {
      const execution = await this.controlPlaneClient.getExecution<{
        id: string;
        status: string;
        approvalStatus?: string;
        usage?: LLMUsage;
        normalizedInput?: {
          requiredInputs?: Array<{
            name?: string;
            description?: string;
            group_label?: string;
            display_name?: string;
            missing?: boolean;
            needs_confirmation?: boolean;
          }>;
          };
      }>(executionId, this.buildControlPlaneRequestOptions(authToken, user));

      const status = execution.status;
      const usage = execution.usage;

      if (isTerminalControlPlaneExecutionStatus(status)) {
        return this.buildTerminalExecutionEvent(
          executionId,
          status,
          authToken,
          user,
        );
      }

      if (status === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT) {
        const waitingInputDetails = await this.loadWaitingInputDetails(executionId, authToken, user);
        const missingInputs = waitingInputDetails.missingInputs;
        const semantic = this.extractExecutionSemantic(execution);
        return {
          type: StreamEventType.WAITING_INPUT,
          content: this.formatWaitingInputMessage({
            executionId,
            missingInputs,
            semantic,
          }),
          data: {
            executionId,
            status,
            hasBusinessResult: false,
            missingInputs,
            semantic,
            usage,
          },
        };
      }

      if (status === CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL) {
        return {
          type: StreamEventType.RESULT,
            content: `任务需要审批后才能继续执行。\n\n当前审批状态: ${execution.approvalStatus || CONTROL_PLANE_APPROVAL_STATUS.PENDING}\n执行单 ID: ${executionId}`,
          data: {
            executionId,
            status,
            approvalStatus: execution.approvalStatus || CONTROL_PLANE_APPROVAL_STATUS.PENDING,
            hasBusinessResult: false,
            usage,
          },
        };
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Failed to load latest execution state for ${executionId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  private async buildTerminalExecutionEvent(
    executionId: string,
    status:
      | typeof CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED
      | typeof CONTROL_PLANE_EXECUTION_STATUS.FAILED
      | typeof CONTROL_PLANE_EXECUTION_STATUS.CANCELLED,
    authToken?: string,
    user?: { userId?: string; userRoles?: string[] },
  ): Promise<StreamEvent | null> {
    try {
      const execution = await this.controlPlaneClient.getExecution<{
        id: string;
        status: string;
        result?: unknown;
        resultJson?: unknown;
        failureReason?: string;
        usage?: LLMUsage;
      }>(executionId, this.buildControlPlaneRequestOptions(authToken, user));
      const rawResult = execution.resultJson ?? execution.result;

      if (status === CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED) {
        if (rawResult !== null && rawResult !== undefined) {
          const downloadUrl = extractDownloadUrl(rawResult);
          const temporalLink = extractTemporalLink(rawResult);
          return {
            type: StreamEventType.RESULT,
            content: this.formatExecutionResult(rawResult, executionId),
            data: {
              executionId,
              status,
              result: rawResult,
              downloadUrl,
              temporalLink,
              hasBusinessResult: true,
              usage: execution.usage,
            },
          };
        }

        return {
          type: StreamEventType.RESULT,
          content: `任务已完成，但该任务没有可直接展示的返回结果。\n\n执行单 ID: ${executionId}`,
          data: {
            executionId,
            status,
            hasBusinessResult: false,
            usage: execution.usage,
          },
        };
      }

      if (status === CONTROL_PLANE_EXECUTION_STATUS.FAILED) {
        return {
          type: StreamEventType.ERROR,
          content: `任务执行失败。\n\n原因: ${execution.failureReason || '未知原因'}\n执行单 ID: ${executionId}`,
          data: {
            executionId,
            status,
            usage: execution.usage,
          },
        };
      }

      return {
        type: StreamEventType.RESULT,
        content: `任务已取消。\n\n执行单 ID: ${executionId}`,
        data: {
          executionId,
          status,
          hasBusinessResult: false,
          usage: execution.usage,
        },
      };
    } catch (error) {
      this.logger.warn(
        `Failed to load execution detail for terminal event ${executionId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return this.fallbackTerminalExecutionEvent(executionId, status);
    }
  }

  private fallbackTerminalExecutionEvent(
    executionId: string,
    status:
      | typeof CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED
      | typeof CONTROL_PLANE_EXECUTION_STATUS.FAILED
      | typeof CONTROL_PLANE_EXECUTION_STATUS.CANCELLED,
  ): StreamEvent {
    if (status === CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED) {
      return {
        type: StreamEventType.RESULT,
        content: `任务已完成。\n\n执行单 ID: ${executionId}`,
        data: { executionId, status, hasBusinessResult: false },
      };
    }

    if (status === CONTROL_PLANE_EXECUTION_STATUS.FAILED) {
      return {
        type: StreamEventType.ERROR,
        content: `任务执行失败。\n\n执行单 ID: ${executionId}`,
        data: { executionId, status },
      };
    }

    return {
      type: StreamEventType.RESULT,
      content: `任务已取消。\n\n执行单 ID: ${executionId}`,
      data: { executionId, status, hasBusinessResult: false },
    };
  }

  private formatExecutionResult(result: unknown, executionId: string): string {
    if (typeof result === 'string') {
      return result;
    }

    if (result && typeof result === 'object') {
      const record = result as Record<string, unknown>;
      const preferredFields = ['finalAnswer', 'formatted_output', 'summary', 'message', 'text', 'content', 'output', 'result'];

      for (const field of preferredFields) {
        const value = record[field];
        if (typeof value === 'string' && value.trim()) {
          return value;
        }
      }

      // 如果没有找到首选文本字段，但包含 temporalLink，也要确保不只是返回 JSON
      if (record.temporalLink && Object.keys(record).length <= 2) {
        return '任务执行成功。';
      }

      return `任务已完成，返回结果如下：\n\n${JSON.stringify(result, null, 2)}\n\n执行单 ID: ${executionId}`;
    }

    return `任务已完成，返回结果如下：\n\n${String(result)}\n\n执行单 ID: ${executionId}`;
  }

  private mapExecutionEventToStreamEvent(event: any): StreamEvent | null {
    const { eventType, payload } = event;

    switch (eventType) {
      case CONTROL_PLANE_EVENT_TYPE.EXECUTION_STATUS_CHANGED:
        if (payload.newStatus === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT) {
          const missingInputs = Array.isArray(payload.requiredInputs)
            ? payload.requiredInputs.filter((item: any) => item?.missing)
            : [];
          const semantic = payload.semantic && typeof payload.semantic === 'object' && !Array.isArray(payload.semantic)
            ? payload.semantic as WaitingInputSemantic
            : undefined;
          return {
            type: StreamEventType.WAITING_INPUT,
            content: this.formatWaitingInputMessage({
              executionId: event.executionId,
              intro: '已识别到任务仍需补充信息，请继续输入后再执行。',
              missingInputs,
              semantic,
            }),
            data: {
              executionId: event.executionId,
              status: payload.newStatus,
              hasBusinessResult: false,
              missingInputs,
              semantic,
            },
          };
        }

        if (payload.newStatus === CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL) {
          return {
            type: StreamEventType.RESULT,
            content: `任务需要审批后才能继续执行。\n\n当前审批状态: ${CONTROL_PLANE_APPROVAL_STATUS.PENDING}\n执行单 ID: ${event.executionId}`,
            data: {
              executionId: event.executionId,
              status: payload.newStatus,
              approvalStatus: CONTROL_PLANE_APPROVAL_STATUS.PENDING,
              hasBusinessResult: false,
            },
          };
        }

        return {
          type: StreamEventType.THOUGHT,
          content: `任务状态变更为: ${payload.newStatus}`,
          data: { executionId: event.executionId, status: payload.newStatus },
        };
      case CONTROL_PLANE_EVENT_TYPE.STEP_STARTED:
        return {
          type: StreamEventType.ACTION,
          content: `正在执行: ${payload.stepName || payload.action || '系统步骤'}`,
          data: { stepId: payload.stepId },
        };
      case CONTROL_PLANE_EVENT_TYPE.STEP_SUCCEEDED:
        let observationContent = '步骤执行成功。';
        const downloadUrl = extractDownloadUrl(payload.result);
        if (payload.result) {
          const resultStr = typeof payload.result === 'string' ? payload.result : JSON.stringify(payload.result, null, 2);
          observationContent = `步骤执行成功，返回结果:\n${resultStr}`;
        }
        return {
          type: StreamEventType.OBSERVATION,
          content: observationContent,
          data: { stepId: payload.stepId, result: payload.result, downloadUrl },
        };
      case CONTROL_PLANE_EVENT_TYPE.STEP_FAILED:
        return {
          type: StreamEventType.ERROR,
          content: `步骤执行失败: ${payload.error || '未知错误'}`,
          data: { stepId: payload.stepId, error: payload.error },
        };
      case CONTROL_PLANE_EVENT_TYPE.RUNTIME_ALLOCATED:
        return {
          type: StreamEventType.THOUGHT,
          content: `🚀 已分配运行环境，准备开始执行...`,
        };
      case CONTROL_PLANE_EVENT_TYPE.EXECUTION_INPUT_SUBMITTED:
        return {
          type: StreamEventType.THOUGHT,
          content: `📥 已接收到您补充的信息，正在继续执行...`,
        };
      case LEGACY_CONTROL_PLANE_EVENT_TYPE.EXECUTION_WAITING_INPUT:
      case CONTROL_PLANE_EVENT_TYPE.STEP_WAITING_INPUT: {
        const missingInputs = Array.isArray(payload.requiredInputs)
          ? payload.requiredInputs.filter((item: any) => item?.missing)
          : [];
        const semantic = payload.semantic && typeof payload.semantic === 'object' && !Array.isArray(payload.semantic)
          ? payload.semantic as WaitingInputSemantic
          : undefined;
        return {
          type: StreamEventType.WAITING_INPUT,
          content: this.formatWaitingInputMessage({
            intro: '⏳ 任务需要您的进一步操作或提供信息以继续执行。',
            missingInputs,
            semantic,
            executionId: event.executionId,
          }),
          data: {
            executionId: event.executionId,
            missingInputs,
            semantic,
          },
        };
      }
      default:
        return null;
    }
  }

  @Post('chat')
  @ApiOperation({ summary: 'Simple AI chat (non-streaming)' })
  async chat(
    @Body() body: ChatRequestDTO,
    @Req() req: Request & { traceId?: string },
  ): Promise<{ response: string; events: StreamEvent[] }> {
    const traceId = getOrCreateTraceId(body.traceId || req.traceId);
    const mode: 'chat' | 'task' = body.config?.mode || 'task';

    if (mode === 'chat') {
      const modelId = this.resolvePreferredChatModelId(body);
      const sessionId = body.sessionId || 'default';
      const thinkingEnabled = this.isThinkingEnabled(body);
      const client = this.modelService.getClient(modelId);
      if (!client) {
        return {
          response: `模型 ${modelId} 未初始化`,
          events: [{ type: StreamEventType.ERROR, content: `模型 ${modelId} 未初始化` }],
        };
      }

      const systemMessage = this.buildChatSystemMessage(thinkingEnabled, false);
      const chatSession = await this.sessionService.getChatSession(sessionId);
      const historyMessages: MultimodalChatMessage[] = (chatSession?.history || []).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
      const userContent = body.message;
      const messages: MultimodalChatMessage[] = [
        { role: 'system', content: systemMessage },
        ...historyMessages,
        { role: 'user', content: userContent },
      ];
      const response = await client.chatCompletion(messages);
      const visibleContent = this.getVisibleChatContent(response.content, thinkingEnabled);
      const historyAssistantContent = this.modelService.stripThinkingTags(response.content);

      await this.sessionService.appendChatMessages(sessionId, [
        {
          role: 'user',
          content: this.normalizeContentToText(userContent),
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: historyAssistantContent,
          timestamp: new Date().toISOString(),
        },
      ]);

      return {
        response: visibleContent,
        events: [{
          type: StreamEventType.RESULT,
          content: visibleContent,
          data: {
            traceId,
            sessionId,
            mode: 'chat',
            thinking: thinkingEnabled,
            usage: response.usage,
            rateLimit: response.rateLimit,
          },
        }],
      };
    }

    const taskModeContext = await this.buildTaskModeContext(
      body,
      req.headers.authorization,
      traceId,
      [],
    );

    if (!taskModeContext.context) {
      const authError = taskModeContext.authError || this.buildTaskModeAuthRequiredEvent();
      return {
        response: authError.content,
        events: [{
          ...authError,
          data: {
            ...(authError.data || {}),
            traceId,
          },
        }],
      };
    }

    const events: StreamEvent[] = [];
    let finalResponse = '';

    for await (const event of this.handleTaskMode(body, taskModeContext.context, req.headers.authorization)) {
      const eventWithTrace = {
        ...event,
        data: {
          ...(event.data || {}),
          traceId,
        },
      };
      events.push(eventWithTrace);
      if (
        event.type === StreamEventType.RESULT
        || event.type === StreamEventType.WAITING_INPUT
        || event.type === StreamEventType.ERROR
      ) {
        finalResponse = event.content;
      }
    }

    return { response: finalResponse, events };
  }

  @Post('chat/upload')
  @ApiOperation({ summary: 'Upload file for chat' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'File uploaded successfully' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadChatFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ fileId: string; fileName: string; mimeType: string; size: number }> {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    fileStore.set(fileId, {
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      content: file.buffer.toString('base64'),
    });

    if (fileStore.size > 100) {
      const keys = Array.from(fileStore.keys());
      keys.slice(0, keys.length - 100).forEach((key) => fileStore.delete(key));
    }

    return {
      fileId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  @Post('chat/audio/transcriptions')
  @ApiOperation({ summary: 'Transcribe audio file using the selected model' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Audio transcribed successfully' })
  @UseInterceptors(FileInterceptor('file'))
  async transcribeAudio(
    @UploadedFile() file: Express.Multer.File,
    @Body('modelId') modelId: string,
  ): Promise<{ text: string }> {
    this.logger.log(`transcribeAudio called with modelId: ${modelId}`);
    if (!file) {
      throw new HttpException('No audio file uploaded', HttpStatus.BAD_REQUEST);
    }
    
    let actualModelId = modelId;
    if (!actualModelId || actualModelId === 'default' || actualModelId === 'undefined') {
      const preferredModel = this.modelService.getPreferredDefaultModel({
        mode: 'audio_transcription',
      });
      if (preferredModel) {
        actualModelId = preferredModel.id;
        this.logger.log(`Resolved actualModelId to preferred model: ${actualModelId}`);
      } else {
        throw new HttpException('No default audio transcription model found', HttpStatus.BAD_REQUEST);
      }
    }

    this.logger.log(`Fetching model with actualModelId: ${actualModelId}`);
    const model = await this.modelService.getModel(actualModelId);
    if (!model) {
      this.logger.error(`Model not found for actualModelId: ${actualModelId}`);
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }

    const client = this.modelService.getClient(actualModelId);
    if (!client) {
      throw new HttpException('Model client not initialized', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const config = client.getConfig();
    let baseURL = config.baseURL.replace(/\/chat\/completions$/, '').replace(/\/$/, '');
    
    // For SiliconFlow, if the base URL ends with /v1, we keep it and append /audio/transcriptions
    // The API is POST https://api.siliconflow.cn/v1/audio/transcriptions

    const formData = new FormData();
    const blob = new Blob([file.buffer], { type: file.mimetype });
    formData.append('file', blob, file.originalname);
    formData.append('model', model.name);

    this.logger.log(`Transcribing audio with URL: ${baseURL}/audio/transcriptions and model: ${model.name}`);
    try {
      const response = await axios.post(`${baseURL}/audio/transcriptions`, formData, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      
      let text = '';
      if (typeof response.data === 'string') {
        text = response.data;
      } else if (response.data && typeof response.data.text === 'string') {
        text = response.data.text;
      } else if (response.data && typeof response.data.result === 'string') {
        text = response.data.result;
      } else if (response.data?.data && typeof response.data.data.text === 'string') {
        text = response.data.data.text;
      } else {
        this.logger.warn(`Unexpected transcription response format: ${JSON.stringify(response.data)}`);
        text = JSON.stringify(response.data);
      }
      
      return { text };
    } catch (error: any) {
      this.logger.error(`Audio transcription failed: ${error.message}`, error.response?.data);
      throw new HttpException(
        error.response?.data?.error?.message || error.response?.data?.message || 'Audio transcription failed',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
