import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import { CapabilityReleaseTemporalSchemaService } from './capability-release-temporal-schema.service';
import {
  AnalyzeFailureDTO,
  AnalyzeFailureResultDTO,
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
  CapabilityBuildDTO,
  CapabilityValidationDTO,
  DeploymentRecordDTO,
  SuggestReleaseWizardAssistDTO,
  SuggestReleaseWizardAssistResultDTO,
} from './interfaces';

export interface CapabilityReleaseAssistAccessors {
  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO>;
  getCurrentSnapshotOrThrow(release: CapabilityReleaseDTO): Promise<CapabilitySourceSnapshotDTO>;
  getBuildOrThrow(id: string): Promise<CapabilityBuildDTO>;
  getValidationOrThrow(id: string): Promise<CapabilityValidationDTO>;
  getDeploymentOrThrow(id: string): Promise<DeploymentRecordDTO>;
  insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown>
  ): Promise<void>;
}

@Injectable()
export class CapabilityReleaseAssistService {
  private readonly logger = new Logger(CapabilityReleaseAssistService.name);

  constructor(
    private readonly capabilityReleaseTemporalSchemaService: CapabilityReleaseTemporalSchemaService
  ) {}

  async analyzeFailure(
    id: string,
    dto: AnalyzeFailureDTO,
    userId: string | undefined,
    accessors: CapabilityReleaseAssistAccessors
  ): Promise<AnalyzeFailureResultDTO> {
    const release = await accessors.getReleaseOrThrow(id);
    let logs: string[] = [];
    let errorSummary = '';
    let recordContext = '';

    if (dto.recordType === 'build') {
      const build = await accessors.getBuildOrThrow(dto.recordId);
      logs = build.logs || [];
      errorSummary = build.errorSummary || '';
      recordContext = `Build Type: ${build.buildType}, Model: ${build.modelId}`;
    } else if (dto.recordType === 'validation') {
      const validation = await accessors.getValidationOrThrow(dto.recordId);
      logs = validation.logs || [];
      errorSummary = validation.errorSummary || '';
      recordContext = `Validation Type: ${validation.validationType}`;
    } else if (dto.recordType === 'deployment') {
      const deployment = await accessors.getDeploymentOrThrow(dto.recordId);
      logs = deployment.logs || [];
      errorSummary = logs.find((item) => item.includes('[Error]')) || '';
      recordContext = `Env: ${deployment.environment}, Runtime: ${deployment.runtimeType}`;
    }

    const prompt = `你是一个高级系统调试专家。正在分析一个自动化能力发布过程中的失败。
上下文：
能力名称: ${release.sourceName}
源类型: ${release.sourceType}
记录类型: ${dto.recordType} (${recordContext})
失败摘要: ${errorSummary}
执行日志:
${logs.join('\n')}

任务：
1. 识别失败的根本原因。
2. 判断失败是否是由于测试输入（testInput/input）中缺失或错误的参数导致的。如果是网络超时或SSL错误，请结合日志判断是否是因为输入了非法参数（如 [None]）触发的请求。
3. 如果是参数问题，请生成一个 JSON 对象，代表建议的正确测试参数。
4. 提供一个简明扼要的解释给用户。
5. 给出建议的下一步操作（suggestedAction）。

输出格式 (JSON)：
{
  "analysis": "原因分析文本",
  "explanation": "给用户的简短解释",
  "isParameterIssue": true/false,
  "suggestedParams": { "key": "value" } 或 null,
  "suggestedAction": "建议的操作，如：更新测试参数并重新校验"
}`;

    try {
      const orchestratorUrl = getAiOrchestratorUrl();
      const response = await axios.post<{ result: string }>(
        `${orchestratorUrl}/ai/model/call`,
        {
          modelId: 'default',
          prompt,
        },
        { timeout: 60000 }
      );

      const content = response.data?.result || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          analysis: content,
          explanation: 'AI 未能返回结构化分析结果，请参考分析内容',
          isParameterIssue: false,
        };
      }

      const result = JSON.parse(jsonMatch[0]);
      await accessors.insertAuditEvent(
        id,
        'failure_analyzed',
        userId,
        true,
        `AI 失败分析完成: ${result.explanation}`,
        { recordId: dto.recordId, recordType: dto.recordType }
      );

      return {
        analysis: result.analysis,
        explanation: result.explanation,
        isParameterIssue: !!result.isParameterIssue,
        suggestedParams: result.suggestedParams,
        suggestedAction: result.suggestedAction,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`AI failure analysis failed: ${message}`);
      return {
        analysis: `AI 分析调用失败: ${message}`,
        explanation: '暂时无法提供 AI 自动分析，请手动检查日志',
        isParameterIssue: false,
      };
    }
  }

  async suggestWizardAssist(
    id: string,
    dto: SuggestReleaseWizardAssistDTO,
    userId: string | undefined,
    accessors: CapabilityReleaseAssistAccessors
  ): Promise<SuggestReleaseWizardAssistResultDTO> {
    const release = await accessors.getReleaseOrThrow(id);
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
    const environment = dto.environment || 'test';
    const paramsSchema =
      this.capabilityReleaseTemporalSchemaService.resolveEffectiveTemporalParamsSchema(
        snapshot.sourcePayload
      );
    const fallbackTestInput =
      this.capabilityReleaseTemporalSchemaService.buildSuggestedInputFromSchema(paramsSchema);
    const deployConfig = this.resolveDeploymentProfile(snapshot.sourcePayload, environment);

    const prompt = `你是企业技能发布向导的 AI 助手。请基于以下能力定义，给出“部署配置建议”和“真实校验测试参数建议”。\n\n能力名称: ${
      release.sourceName || release.id
    }\n能力类型: ${release.sourceType}\n目标环境: ${environment}\n参数 Schema: ${JSON.stringify(
      paramsSchema,
      null,
      2
    )}\n源定义快照: ${JSON.stringify(snapshot.sourcePayload, null, 2)}\n\n要求：\n1. 返回一个适合演示和校验的 testInput JSON。\n2. 如果有比较合理的 testUserInput，自然语言给一句。\n3. deployConfig 只返回用户本次需要重点关注或覆盖的字段；没有必要覆盖则返回空对象。\n4. explanation 用中文，告诉用户这些参数为什么这样推荐。\n5. 只返回 JSON，不要 Markdown。\n\n返回格式：\n{\n  "explanation": "中文说明",\n  "deployConfig": {},\n  "testInput": {},\n  "testUserInput": "..." \n}`;

    try {
      const orchestratorUrl = getAiOrchestratorUrl();
      const response = await axios.post<{ result: string }>(
        `${orchestratorUrl}/ai/model/call`,
        { modelId: 'default', prompt },
        { timeout: 60000 }
      );
      const content = response.data?.result || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      const result: SuggestReleaseWizardAssistResultDTO = {
        explanation:
          typeof parsed?.explanation === 'string' && parsed.explanation.trim()
            ? parsed.explanation.trim()
            : '已根据当前能力定义自动生成推荐的部署与测试参数。',
        deployConfig:
          parsed?.deployConfig && typeof parsed.deployConfig === 'object'
            ? parsed.deployConfig
            : deployConfig,
        testInput:
          parsed?.testInput && typeof parsed.testInput === 'object'
            ? parsed.testInput
            : fallbackTestInput,
        testUserInput:
          typeof parsed?.testUserInput === 'string' && parsed.testUserInput.trim()
            ? parsed.testUserInput.trim()
            : null,
      };

      await accessors.insertAuditEvent(
        id,
        'wizard_assist_suggested',
        userId,
        true,
        `已生成向导建议 (${environment})`,
        { environment }
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`Wizard assist fallback due to AI error: ${message}`);
      return {
        explanation: 'AI 暂时不可用，已根据参数 Schema 自动生成建议参数。',
        deployConfig,
        testInput: fallbackTestInput,
        testUserInput:
          Object.keys(fallbackTestInput).length > 0
            ? `请使用这些参数验证 ${release.sourceName || '当前能力'}`
            : null,
      };
    }
  }

  private resolveDeploymentProfile(
    sourcePayload: Record<string, unknown>,
    environment: string
  ): Record<string, unknown> {
    const profiles =
      sourcePayload.deploymentProfiles && typeof sourcePayload.deploymentProfiles === 'object'
        ? (sourcePayload.deploymentProfiles as Record<string, unknown>)
        : {};

    return profiles[environment] && typeof profiles[environment] === 'object'
      ? (profiles[environment] as Record<string, unknown>)
      : {};
  }
}
