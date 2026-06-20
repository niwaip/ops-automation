import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ControlPlaneClient } from '../../client/control-plane.client';
import { CONTROL_PLANE_EXECUTION_STATUS } from '../../client/control-plane.contracts';
import { buildDocumentGuideContext } from '../../common/document-guide';
import { resolveFriendlyInputDisplayName } from '../../common/input-label';
import { getAuthServiceUrl } from '../../config/service-endpoints';
import { PlannerService } from '../planner/planner.service';
import { RecognizerService } from '../recognizer/recognizer.service';
import { ModelService } from '../model/model.service';
import type { LLMUsage } from '../react-engine/interfaces';
import type {
  ChatSkillSchema,
  ChatUserContext,
  WaitingInputDetails,
  WaitingInputItem,
  WaitingInputPayload,
  WaitingInputRequiredItem,
  WaitingInputSemantic,
  WaitingInputSemanticGroup,
} from './chat.types';

@Injectable()
export class ChatWaitingInputService {
  private readonly logger = new Logger(ChatWaitingInputService.name);

  constructor(
    private readonly controlPlaneClient: ControlPlaneClient,
    private readonly modelService: ModelService,
    private readonly recognizerService: RecognizerService,
    private readonly plannerService: PlannerService
  ) {}

  buildControlPlaneRequestOptions(authToken?: string, user?: ChatUserContext) {
    return {
      authToken,
      user,
    };
  }

  async loadWaitingInputDetails(
    executionId: string,
    authToken?: string,
    user?: ChatUserContext
  ): Promise<WaitingInputDetails> {
    try {
      const steps = await this.controlPlaneClient.getExecutionSteps<any[]>(
        executionId,
        this.buildControlPlaneRequestOptions(authToken, user)
      );
      const waitingStep = Array.isArray(steps)
        ? steps.find(
            (step: any) =>
              step?.status === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT ||
              step?.type === 'input_collection'
          )
        : undefined;
      const requiredInputs = Array.isArray(waitingStep?.inputJson?.requiredInputs)
        ? waitingStep.inputJson.requiredInputs
        : [];
      const missingInputs = requiredInputs
        .filter(
          (item: any) =>
            item?.missing === true && typeof item?.name === 'string' && item.name.trim()
        )
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
        `Failed to load waiting_input details for ${executionId}: ${error instanceof Error ? error.message : 'unknown'}`
      );
      return {
        waitingStepId: undefined,
        missingInputs: [],
        allRequiredInputs: [],
      };
    }
  }

  extractExecutionSemantic(execution: unknown): WaitingInputSemantic | undefined {
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
      if (
        embeddedSemantic &&
        typeof embeddedSemantic === 'object' &&
        !Array.isArray(embeddedSemantic)
      ) {
        return embeddedSemantic as WaitingInputSemantic;
      }
    }

    return undefined;
  }

  formatWaitingInputMessage(input: {
    executionId?: string;
    intro?: string;
    missingInputs: WaitingInputItem[];
    semantic?: WaitingInputSemantic;
  }): string {
    const lines: string[] = [input.intro || '任务需要你补充信息后才能继续执行。'];
    const groupedMissing = Array.isArray(input.semantic?.groupedMissing)
      ? this.dedupeWaitingInputGroups(input.semantic.groupedMissing)
      : [];
    const groupedInputs = input.missingInputs.reduce<Map<string, WaitingInputItem[]>>(
      (acc, item) => {
        const label = typeof item.group_label === 'string' ? item.group_label.trim() : '';
        if (!label) {
          return acc;
        }
        const existing = acc.get(label) || [];
        existing.push(item);
        acc.set(label, existing);
        return acc;
      },
      new Map()
    );

    if (input.semantic?.summary) {
      lines.push(input.semantic.summary);
    }

    if (groupedMissing.length > 0) {
      lines.push(`缺少业务组：${groupedMissing.map((item) => item.label).join('、')}`);
    }

    if (groupedInputs.size > 0) {
      lines.push('请补充以下信息：');
      groupedInputs.forEach((items, label) => {
        lines.push(`${label}：${this.dedupeWaitingInputLabels(items).join('、')}`);
      });
    } else if (input.missingInputs.length > 0) {
      lines.push(
        `${groupedMissing.length > 0 ? '字段兜底' : '缺少参数'}：${this.dedupeWaitingInputLabels(input.missingInputs).join('、')}`
      );
    } else if (groupedMissing.length === 0) {
      lines.push('请继续补充必要参数。');
    }

    if (input.semantic) {
      lines.push(
        `可预览：${input.semantic.previewReady ? '是' : '否'}；可正式生成：${input.semantic.finalReady ? '是' : '否'}`
      );
    }

    if (input.executionId) {
      lines.push(`执行单 ID: ${input.executionId}`);
    }

    return lines.join('\n\n');
  }

  buildWaitingInputSubmissionFeedback(input: {
    executionId?: string;
    resolvedFieldNames: string[];
    remainingMissingInputs: WaitingInputItem[];
    semantic?: WaitingInputSemantic;
  }): string {
    const lines = ['已提交补充信息。'];
    const resolvedFieldNames = this.formatFieldNameList(
      input.resolvedFieldNames.map((item) => this.normalizeWaitingInputSemanticLabel(item))
    );
    const resolvedCount = Array.from(
      new Set(
        input.resolvedFieldNames
          .map((item) => this.normalizeWaitingInputSemanticLabel(item))
          .filter(Boolean)
      )
    ).length;
    if (resolvedCount > 0) {
      lines.push(`本次识别到 ${resolvedCount} 个字段：${resolvedFieldNames}`);
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
        `仍缺少 ${remainingMissingLabels.length} 个字段：${this.formatFieldNameList(remainingMissingLabels)}`
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

  async buildWaitingInputPayload(
    message: string,
    missingInputs: WaitingInputItem[],
    allRequiredInputs: WaitingInputRequiredItem[] = [],
    semantic?: WaitingInputSemantic,
    skillId?: string,
    authToken?: string,
    originalObjective?: string,
    userId?: string,
    modelId?: string
  ): Promise<WaitingInputPayload> {
    if (missingInputs.length === 0) {
      throw new Error('当前执行单没有可补充的缺失参数。');
    }
    const [firstMissingInput] = missingInputs;

    const skill = skillId ? await this.loadSkillSchema(skillId, authToken) : null;
    const parsedObject = this.parseJsonObjectMessage(message);

    if (parsedObject) {
      const parsedParams =
        parsedObject.params &&
        typeof parsedObject.params === 'object' &&
        !Array.isArray(parsedObject.params)
          ? (parsedObject.params as Record<string, unknown>)
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
          modelId
        );
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
          .map((item) => [item.name, item.value] as const)
      );

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

      const recognizedEntries = Object.entries(recognized?.params || {}).filter(
        ([, value]) =>
          value !== undefined &&
          value !== null &&
          !(typeof value === 'string' && value.trim() === '')
      );

      if (recognizedEntries.length > 0) {
        const expanded = await this.expandWaitingInputBilingualPayload(
          Object.fromEntries(recognizedEntries),
          missingInputs,
          allRequiredInputs,
          skill?.paramsSchema,
          message,
          modelId
        );
        return {
          input: expanded.input,
          usage: this.sumUsage(recognized.usage, expanded.usage),
        };
      }

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
          .filter(
            ([, value]) =>
              value !== undefined &&
              value !== null &&
              !(typeof value === 'string' && value.trim() === '')
          );

        if (plannedResolvedEntries.length > 0) {
          const expanded = await this.expandWaitingInputBilingualPayload(
            Object.fromEntries(plannedResolvedEntries),
            missingInputs,
            allRequiredInputs,
            skill?.paramsSchema,
            message,
            modelId
          );
          return {
            input: expanded.input,
            usage: this.sumUsage(recognized?.usage, planDraft.usage, expanded.usage),
          };
        }
      } catch (error) {
        this.logger.warn(
          `Planner-based waiting_input extraction failed: ${error instanceof Error ? error.message : 'unknown'}`
        );
      }
    }

    const labeledPayload = this.resolveWaitingInputLabeledPayload(message, missingInputs);
    if (Object.keys(labeledPayload).length > 0) {
      const expanded = await this.expandWaitingInputBilingualPayload(
        labeledPayload,
        missingInputs,
        allRequiredInputs,
        skill?.paramsSchema,
        message,
        modelId
      );
      return {
        input: expanded.input,
        usage: expanded.usage,
      };
    }

    if (missingInputs.length === 1) {
      const normalizedType = String(firstMissingInput?.type || 'string').toLowerCase();
      if (!['string', 'text'].includes(normalizedType)) {
        throw new Error(this.buildWaitingInputFollowupHint(missingInputs, semantic));
      }
      return {
        input: {
          [firstMissingInput!.name]: message.trim(),
        },
      };
    }

    throw new Error(this.buildWaitingInputFollowupHint(missingInputs, semantic));
  }

  private resolveWaitingInputLabel(input: {
    name: string;
    description?: string;
    display_name?: string;
  }): string {
    return resolveFriendlyInputDisplayName(input);
  }

  private dedupeWaitingInputLabels(
    inputs: Array<{
      name: string;
      description?: string;
      display_name?: string;
    }>
  ): string[] {
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

  private dedupeWaitingInputGroups(
    groups: WaitingInputSemanticGroup[]
  ): WaitingInputSemanticGroup[] {
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
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
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
    missingInputs: Array<{ name: string; description?: string; display_name?: string }>
  ): Record<string, unknown> {
    const pairs = this.extractWaitingInputKeyValuePairs(message);
    if (pairs.length === 0) {
      return {};
    }

    const missingCandidates = missingInputs.map((item) => {
      const labelCandidates = [item.display_name, item.description, item.name]
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

      const matched = missingCandidates.find(
        (candidate) =>
          !usedNames.has(candidate.name) &&
          candidate.labels.some(
            (label) => label === key || label.includes(key) || key.includes(label)
          )
      );
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
    semantic?: WaitingInputSemantic
  ): string {
    const groupedMissing = Array.isArray(semantic?.groupedMissing)
      ? this.dedupeWaitingInputGroups(semantic.groupedMissing)
      : [];

    if (groupedMissing.length > 0) {
      return `当前仍缺少多个业务组：${groupedMissing.map((item) => item.label).join('、')}。请优先按业务组补充，例如：“补充标的清单：设备A 10台，设备B 5台；补充交付计划：第一批5月30日交付。”`;
    }

    return `当前还缺少多个参数：${this.dedupeWaitingInputLabels(missingInputs).join('、')}。请继续用自然语言逐项补充（例如：甲方签字用公司名称、乙方签字用公司名称、附件填写无）。`;
  }

  private formatFieldNameList(fieldNames: string[], limit = 12): string {
    const normalized = fieldNames.map((item) => String(item || '').trim()).filter(Boolean);
    if (normalized.length === 0) {
      return '无';
    }
    if (normalized.length <= limit) {
      return normalized.join('、');
    }
    return `${normalized.slice(0, limit).join('、')} 等 ${normalized.length} 项`;
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
    authToken?: string
  ): Promise<ChatSkillSchema | null> {
    try {
      const response = await axios.get<{
        name?: string;
        description?: string;
        paramsSchema?: {
          properties?: Record<
            string,
            {
              type: string;
              description?: string;
              extractionPrompt?: string;
              default?: string | number | boolean;
            }
          >;
          required?: string[];
        };
        apiEndpoints?: {
          runtimeMetadata?: import('../react-engine/interfaces').SkillRuntimeMetadata;
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
            response.data.apiEndpoints?.runtimeMetadata?.sourceType === 'document' ||
            response.data.apiEndpoints?.runtimeMetadata?.sourceType === 'execution_flow_template' ||
            Boolean(response.data.apiEndpoints?.runtimeMetadata?.sourceTemplate?.templateId),
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
        `Failed to load skill schema for ${skillId}: ${error instanceof Error ? error.message : 'unknown'}`
      );
      return null;
    }
  }

  private buildSchemaForMissingInputs(
    missingInputs: Array<{ name: string }>,
    skillSchema?: {
      properties?: Record<
        string,
        {
          type: string;
          description?: string;
          extractionPrompt?: string;
          default?: string | number | boolean;
        }
      >;
      required?: string[];
    }
  ) {
    const properties = missingInputs.reduce<
      Record<
        string,
        {
          type: string;
          description?: string;
          extractionPrompt?: string;
          default?: string | number | boolean;
        }
      >
    >((acc, item) => {
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
      return Object.values(value as Record<string, unknown>).some((item) =>
        this.hasMeaningfulWaitingInputValue(item)
      );
    }
    return true;
  }

  private containsJapaneseScript(text: string): boolean {
    return /[\u3040-\u30ff\uff66-\uff9f]/u.test(text);
  }

  private buildWaitingInputBilingualPairs(skillSchema?: {
    properties?: Record<
      string,
      {
        type: string;
        description?: string;
        extractionPrompt?: string;
        default?: string | number | boolean;
      }
    >;
  }): Array<{
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
          type: String(
            properties[key]?.type || properties[rightKey]?.type || 'string'
          ).toLowerCase(),
        });
      }
    });

    return pairs;
  }

  private async translateWaitingInputValues(
    data: Record<string, string>,
    sourceLang: 'zh' | 'ja',
    targetLang: 'zh' | 'ja',
    modelId?: string
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
        'auxiliary'
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
    allRequiredInputs: WaitingInputRequiredItem[] = [],
    skillSchema?: {
      properties?: Record<
        string,
        {
          type: string;
          description?: string;
          extractionPrompt?: string;
          default?: string | number | boolean;
        }
      >;
      required?: string[];
    },
    message?: string,
    modelId?: string
  ): Promise<WaitingInputPayload> {
    const pairs = this.buildWaitingInputBilingualPairs(skillSchema);
    if (pairs.length === 0) {
      return { input };
    }

    const expandedInput: Record<string, unknown> = { ...input };
    const missingKeySet = new Set(missingInputs.map((item) => item.name));
    const existingValueMap = new Map(
      allRequiredInputs
        .filter((item) => this.hasMeaningfulWaitingInputValue(item.value))
        .map((item) => [item.name, item.value] as const)
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
      const targetRightMissing =
        missingKeySet.has(pair.rightKey) &&
        !this.hasMeaningfulWaitingInputValue(existingValueMap.get(pair.rightKey));
      const targetLeftMissing =
        missingKeySet.has(pair.leftKey) &&
        !this.hasMeaningfulWaitingInputValue(existingValueMap.get(pair.leftKey));

      if (
        pair.type !== 'number' &&
        pair.type !== 'integer' &&
        pair.type !== 'boolean' &&
        pair.type !== 'date' &&
        typeof normalizedLeftValue === 'string' &&
        typeof normalizedRightValue === 'string' &&
        normalizedLeftValue &&
        normalizedLeftValue === normalizedRightValue &&
        targetLeftMissing &&
        targetRightMissing
      ) {
        if (preferZhAsSource) {
          zhToJa[pair.rightKey] = normalizedLeftValue;
        } else {
          jaToZh[pair.leftKey] = normalizedRightValue;
        }
        return;
      }

      if (hasLeftValue && !hasRightValue && targetRightMissing) {
        if (
          pair.type === 'number' ||
          pair.type === 'integer' ||
          pair.type === 'boolean' ||
          pair.type === 'date'
        ) {
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
        if (
          pair.type === 'number' ||
          pair.type === 'integer' ||
          pair.type === 'boolean' ||
          pair.type === 'date'
        ) {
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
          (total.completion_tokens_details.reasoning_tokens || 0) +
          usage.completion_tokens_details.reasoning_tokens;
      }
    }

    return total;
  }
}
