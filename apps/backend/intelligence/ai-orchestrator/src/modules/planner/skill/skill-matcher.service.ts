import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  matchDeterministicRoutingCapability,
  isGuideOrInquiryRequest,
} from '@ops/backend-runtime-capability-contract';
import { createBuiltinRoutingPolicySnapshot, hasRoutingSignal } from '../routing/routing-policy.matcher';
import { getAuthServiceUrl } from '../../../config/service-endpoints';
import { TRACE_ID_HEADER } from '../../../common/trace.util';
import { AvailableSkillDefinition, SkillMatchResult } from '../../react-engine/interfaces';
import { SkillCacheService, isWorkspaceSearchSkill } from './skill-cache.service';
import { getSkillMatchMinConfidence, isAcceptedSkillMatch } from './skill-match-policy';

export type SkillMatchAttempt =
  | { status: 'matched'; match: SkillMatchResult }
  | { status: 'not_found'; match: null }
  | {
      status: 'unavailable';
      match: null;
      code: 'SKILL_MATCH_MODEL_UNAVAILABLE' | 'SKILL_MATCH_SERVICE_UNAVAILABLE';
      retryable: true;
      message: string;
    };

@Injectable()
export class SkillMatcherService {
  private readonly logger = new Logger(SkillMatcherService.name);
  private readonly authServiceUrl = getAuthServiceUrl();

  constructor(private readonly skillCacheService: SkillCacheService) {}

  async matchSkill(input: {
    userInput: string;
    userId?: string;
    authToken?: string;
    traceId?: string;
    availableSkills: AvailableSkillDefinition[];
    context?: Record<string, unknown>;
    modelId?: string;
  }): Promise<SkillMatchResult | null> {
    const attempt = await this.matchSkillAttempt(input);
    return attempt.match;
  }

  async matchSkillAttempt(input: {
    userInput: string;
    userId?: string;
    authToken?: string;
    traceId?: string;
    availableSkills: AvailableSkillDefinition[];
    context?: Record<string, unknown>;
    modelId?: string;
  }): Promise<SkillMatchAttempt> {
    const trimmedInput = input.userInput.trim();
    const isExplicitWorkspaceCommand =
      /^(?:\/doc\s*)?(?:探查工作空间|查看工作空间文件|浏览知识库|列出空间文件|工作空间概览)$/i.test(
        trimmedInput
      ) || /^\/doc\b/i.test(trimmedInput);

    const isWorkspaceSearchExplicitlyDisabled =
      input.context?.workspace_search_enabled === false ||
      input.context?.workspaceSearch === false;

    const isWorkspaceSearchEnabled =
      (input.context?.workspace_search_enabled === true ||
        input.context?.workspaceSearch === true ||
        isExplicitWorkspaceCommand) &&
      !isWorkspaceSearchExplicitlyDisabled;

    const availableSkills = input.availableSkills.filter((skill) => {
      if (isWorkspaceSearchSkill(skill) && !isWorkspaceSearchEnabled) {
        return false;
      }
      return true;
    });

    const rawTargetSkillId =
      input.context?.target_skill_id ||
      input.context?.skillId ||
      input.context?.targetSkillId;
    const targetSkillId =
      typeof rawTargetSkillId === 'string' ? rawTargetSkillId.trim() : '';
    if (targetSkillId) {
      const targetedSkill = availableSkills.find((skill) => skill.skillId === targetSkillId);
      if (targetedSkill) {
        return {
          status: 'matched',
          match: {
            skillId: targetedSkill.skillId,
            skillVersion: targetedSkill.executableVersion,
            skillName: targetedSkill.skillName,
            matchedKeywords: targetedSkill.triggerKeywords.filter(
              (keyword) => keyword && input.userInput.toLowerCase().includes(keyword.toLowerCase())
            ),
            confidence: 1,
            collectedParams: {},
            missingParams: targetedSkill.paramsSchema.required || [],
            paramsSchema: targetedSkill.paramsSchema,
            templateId: targetedSkill.templateId,
            carboneSkillId: targetedSkill.carboneSkillId,
            carboneTemplateId: targetedSkill.carboneTemplateId,
            executionFlowTemplateId: targetedSkill.executionFlowTemplateIds?.[0],
            executionFlowTemplateIds: targetedSkill.executionFlowTemplateIds,
            executionFlow: targetedSkill.executionFlow?.length
              ? targetedSkill.executionFlow
              : targetedSkill.apiEndpoints?.runtimeMetadata?.sourceType === 'document'
                ? ['document_render']
                : undefined,
            apiEndpoints: targetedSkill.apiEndpoints,
            matchReason: 'target_skill_context',
            goal: targetedSkill.goal,
            expectedResult: targetedSkill.expectedResult,
            outputParams: targetedSkill.outputParams,
          },
        };
      }
    }

    // Contract-declared and safely-derived routing signals are resolved before
    // model routing. This is the normal fast path for reproducible requests.
    const explicitMatch = this.matchExplicitSkillName(input.userInput, availableSkills);
    if (explicitMatch) {
      return {
        status: 'matched',
        match: this.buildMatchResult(
          explicitMatch.skill,
          explicitMatch.matchedKeywords,
          0.99,
          'deterministic_routing_signal'
        ),
      };
    }

    // Guide / installation / inquiry questions must not be forced into execution skills.
    // If workspace search is requested, it acts as a native RAG data source, not an execution ticket.
    if (isGuideOrInquiryRequest(input.userInput)) {
      this.logger.log(
        `User input '${input.userInput}' classified as guide/inquiry request; skipping model skill matching.`
      );
      if (input.context?.workspace_search_enabled === true || input.context?.workspaceSearch === true) {
        return { status: 'not_found', match: null };
      }
      const fallbackSearch = await this.acceptFallbackMatch(
        input.userInput,
        availableSkills,
        input.context,
        input.authToken,
        input.traceId
      );
      return this.toMatchAttempt(fallbackSearch);
    }

    if (input.userId) {
      try {
        const sanitizedContext = input.context ? { ...input.context } : undefined;
        if (sanitizedContext) {
          if (Array.isArray(sanitizedContext.files)) {
            sanitizedContext.files = (sanitizedContext.files as any[]).map((f) => {
              if (f && typeof f === 'object') {
                const { content: _content, fileBase64: _fileBase64, ...meta } = f;
                return meta;
              }
              return f;
            });
          }
          delete (sanitizedContext as any).fileBase64;
        }

        const rawFiles = Array.isArray(sanitizedContext?.files)
          ? sanitizedContext!.files
          : Array.isArray(sanitizedContext?.uploadedFiles)
            ? sanitizedContext!.uploadedFiles
            : [];
        const fileNames = (rawFiles as Array<{ fileName?: string; mimeType?: string }>)
          .map((f) => f?.fileName)
          .filter(Boolean)
          .join(', ');
        if (sanitizedContext && fileNames && !sanitizedContext.attachmentNames) {
          sanitizedContext.attachmentNames = fileNames;
        }

        const response = await axios.post<{ match: SkillMatchResult | null }>(
          `${this.authServiceUrl}/skills/match`,
          {
            userInput: input.userInput,
            userId: input.userId,
            context: sanitizedContext,
            modelId: input.modelId,
          },
          {
            headers: {
              ...(input.authToken ? { Authorization: input.authToken } : {}),
              ...(input.traceId ? { [TRACE_ID_HEADER]: input.traceId } : {}),
            },
          }
        );

        if (!response.data.match) {
          return this.toMatchAttempt(
            await this.acceptFallbackMatch(
              input.userInput,
              availableSkills,
              sanitizedContext,
              input.authToken,
              input.traceId
            )
          );
        }

        const matchedSkill = this.hydrateMatchedSkill(response.data.match, availableSkills);
        if (matchedSkill && isAcceptedSkillMatch(matchedSkill.confidence)) {
          if (
            matchedSkill.apiEndpoints?.runtimeMetadata?.sourceType === 'document' &&
            (!matchedSkill.executionFlow || matchedSkill.executionFlow.length === 0)
          ) {
            matchedSkill.executionFlow = ['document_render'];
          }
          return { status: 'matched', match: matchedSkill };
        }
        this.logger.log(
          `Rejected low-confidence skill match '${matchedSkill?.skillName || 'unknown'}' (${matchedSkill?.confidence ?? 'missing'}); minimum is ${getSkillMatchMinConfidence()}`
        );
        return this.toMatchAttempt(
          await this.acceptFallbackMatch(
            input.userInput,
            availableSkills,
            sanitizedContext,
            input.authToken,
            input.traceId
          )
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(`Planner skill match API failed: ${message}`);
        const deterministic = await this.acceptFallbackMatch(
          input.userInput,
          availableSkills,
          input.context,
          input.authToken,
          input.traceId
        );
        const unavailableCode = this.resolveUnavailableCode(error);
        return deterministic
          ? { status: 'matched', match: deterministic }
          : {
              status: 'unavailable',
              match: null,
              code: unavailableCode,
              retryable: true,
              message:
                unavailableCode === 'SKILL_MATCH_MODEL_UNAVAILABLE'
                  ? '能力匹配模型暂时不可用，请稍后重试。'
                  : '能力匹配服务暂时不可用，请稍后重试。',
            };
      }
    }

    return this.toMatchAttempt(
      await this.acceptFallbackMatch(
        input.userInput,
        availableSkills,
        input.context,
        input.authToken,
        input.traceId
      )
    );
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  fallbackSkillMatch(
    userInput: string,
    availableSkills: AvailableSkillDefinition[],
    _context?: Record<string, unknown>
  ): SkillMatchResult | null {
    if (isGuideOrInquiryRequest(userInput)) {
      return null;
    }

    const cleanInput = userInput
      .replace(/\n*\[系统上下文：[\s\S]*$/i, '')
      .replace(/\[系统上下文：[^\]]*\]/g, '')
      .replace(/\(附件:[\s\S]*?\)(?=\s|$)/g, '')
      .trim();
    const normalizedInput = (cleanInput || userInput).toLowerCase();

    let bestScore = 0;
    let bestSkill: AvailableSkillDefinition | undefined;
    let bestMatchedKeywords: string[] = [];

    for (const skill of availableSkills) {
      const negativeKeywords =
        (skill.apiEndpoints?.runtimeMetadata?.negativeKeywords as string[]) ||
        (skill as any).negativeKeywords;
      if (Array.isArray(negativeKeywords)) {
        const hasNegativeHit = negativeKeywords.some((neg) => {
          const normNeg = String(neg).toLowerCase().trim();
          return normNeg && normalizedInput.includes(normNeg);
        });
        if (hasNegativeHit) {
          continue;
        }
      }

      const keywordHits = (skill.triggerKeywords || []).filter((keyword) => {
        if (!keyword) return false;
        const normKw = keyword.toLowerCase().trim();
        if (!normKw) return false;
        if (normKw.includes(' ')) {
          const tokens = normKw.split(/\s+/).filter(Boolean);
          return tokens.every((token) => {
            if (/^[a-z0-9_-]+$/i.test(token)) {
              return new RegExp(`(^|[^a-z0-9_-])${this.escapeRegex(token)}($|[^a-z0-9_-])`, 'i').test(
                normalizedInput
              );
            }
            return normalizedInput.includes(token);
          });
        }
        if (/^[a-z0-9_-]+$/i.test(normKw)) {
          return new RegExp(`(^|[^a-z0-9_-])${this.escapeRegex(normKw)}($|[^a-z0-9_-])`, 'i').test(
            normalizedInput
          );
        }
        return normalizedInput.includes(normKw);
      });

      const descriptionHit = skill.description
        ? normalizedInput.includes(skill.description.toLowerCase())
        : false;

      const score =
        keywordHits.reduce((acc, kw) => {
          const trimmed = kw.trim();
          if (trimmed.toLowerCase() === normalizedInput) return acc + 5;
          if (trimmed.includes(' ') || trimmed.length >= 4) return acc + 3;
          if (trimmed.length >= 2) return acc + 1.2;
          return acc + 0.3;
        }, 0) + (descriptionHit ? 0.5 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestSkill = skill;
        bestMatchedKeywords = keywordHits;
      }
    }

    if (!bestSkill || bestScore <= 0) {
      return null;
    }

    const isExactHit = bestMatchedKeywords.some(
      (kw) => kw.toLowerCase().trim() === normalizedInput
    );
    let confidence = 0.65 + bestScore * 0.07;
    if (isExactHit) {
      confidence = Math.max(confidence, 0.95);
    }
    confidence = Math.min(0.99, Number(confidence.toFixed(2)));

    return this.buildMatchResult(
      bestSkill,
      bestMatchedKeywords,
      confidence,
      'keyword_fallback_match'
    );
  }

  private matchExplicitSkillName(
    userInput: string,
    availableSkills: AvailableSkillDefinition[]
  ): { skill: AvailableSkillDefinition; matchedKeywords: string[] } | null {
    const cleanInput = userInput
      .replace(/\n*\[系统上下文：[\s\S]*$/i, '')
      .replace(/\[系统上下文：[^\]]*\]/g, '')
      .replace(/\(附件:[^)]*\)/g, '')
      .trim();
    const trimmedInput = cleanInput || userInput.trim();
    // 1. Generic Slash Command Matcher (data-driven by skill triggers, aliases and IDs)
    const slashMatch = trimmedInput.match(/^[/、]([a-zA-Z0-9_-]+)\b/i);
    if (slashMatch) {
      const command = (slashMatch[1] || '').toLowerCase();
      const matchedSkill = availableSkills.find((s) => {
        const triggers = (s.triggerKeywords || []).map((t) =>
          String(t).toLowerCase().replace(/^[/、]/, '')
        );
        if (triggers.includes(command)) return true;
        const aliases = (
          (s.apiEndpoints?.runtimeMetadata?.routingAliases as string[]) || []
        ).map((a) => String(a).toLowerCase().replace(/^[/、]/, ''));
        if (aliases.includes(command)) return true;
        const idParts = s.skillId.toLowerCase().split('.');
        if (idParts.includes(command)) return true;
        return false;
      });

      if (matchedSkill) {
        return {
          skill: matchedSkill,
          matchedKeywords: [slashMatch[0]],
        };
      }
    }

    const match = matchDeterministicRoutingCapability(
      userInput,
      availableSkills.map((skill) => ({
        id: skill.skillId,
        name: skill.skillName,
        aliases: skill.apiEndpoints?.runtimeMetadata?.routingAliases,
        triggerKeywords: skill.triggerKeywords,
        negativeKeywords:
          (skill.apiEndpoints?.runtimeMetadata?.negativeKeywords as string[]) ||
          (skill as any).negativeKeywords,
        skill,
      }))
    );
    return match ? { skill: match.capability.skill, matchedKeywords: match.matchedSignals } : null;
  }

  private buildMatchResult(
    skill: AvailableSkillDefinition,
    matchedKeywords: string[],
    confidence: number,
    matchReason: string
  ): SkillMatchResult {
    return {
      skillId: skill.skillId,
      skillVersion: skill.executableVersion,
      skillName: skill.skillName,
      matchedKeywords,
      confidence,
      collectedParams: {},
      missingParams: skill.paramsSchema.required || [],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneSkillId: skill.carboneSkillId,
      carboneTemplateId: skill.carboneTemplateId,
      executionFlowTemplateId: skill.executionFlowTemplateIds?.[0],
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
      executionType: skill.executionType,
      executionFlow: skill.executionFlow?.length
        ? skill.executionFlow
        : skill.apiEndpoints?.runtimeMetadata?.sourceType === 'document'
          ? ['document_render']
          : undefined,
      apiEndpoints: skill.apiEndpoints,
      matchReason,
      goal: skill.goal,
      expectedResult: skill.expectedResult,
      outputParams: skill.outputParams,
    };
  }

  private async acceptFallbackMatch(
    userInput: string,
    availableSkills: AvailableSkillDefinition[],
    context?: Record<string, unknown>,
    authToken?: string,
    traceId?: string
  ): Promise<SkillMatchResult | null> {
    const fallback = this.fallbackSkillMatch(userInput, availableSkills, context);
    if (fallback && isAcceptedSkillMatch(fallback.confidence)) {
      return fallback;
    }

    const trimmedInput = userInput.trim();
    const isExplicitExploreSkillCommand =
      /^(?:\/doc\s*)?(?:探查工作空间|查看工作空间文件|浏览知识库|列出空间文件|工作空间概览)$/i.test(
        trimmedInput
      );

    const isWorkspaceSearchAllowed =
      context?.workspace_search_enabled === true ||
      context?.workspaceSearch === true ||
      (/^\/doc\b/i.test(trimmedInput) &&
        context?.workspace_search_enabled !== false &&
        context?.workspaceSearch !== false);

    if (isExplicitExploreSkillCommand && isWorkspaceSearchAllowed) {
      let workspaceSkill = availableSkills.find(
        (s) =>
          ['platform.workspace.explorer', 'workspace_explorer', 'workspace.explorer'].includes(
            s.skillId.toLowerCase()
          ) || (s as any).category === 'workspace'
      );
      if (!workspaceSkill && this.skillCacheService?.loadSkillById) {
        try {
          workspaceSkill =
            (await this.skillCacheService.loadSkillById(
              'platform.workspace.explorer',
              authToken,
              traceId
            )) || undefined;
        } catch {
          // best-effort lookup
        }
      }
      if (workspaceSkill) {
        return this.buildMatchResult(
          workspaceSkill,
          ['workspace_knowledge'],
          0.95,
          'workspace_knowledge_intent'
        );
      }
    }

    const hasLocalAttachmentContext =
      (Array.isArray(context?.files) && (context.files as any[]).length > 0) ||
      (Array.isArray(context?.uploadedFiles) && (context.uploadedFiles as any[]).length > 0) ||
      Boolean(context?.attachmentNames) ||
      /(?:附件|本地|已上传|当前|刚刚|历史文件)/i.test(userInput);

    const isWebSearchExplicitlyRequested =
      !hasLocalAttachmentContext &&
      /(?:^|[^a-zA-Z0-9])(?:请?帮我)?(?:搜索|联网搜索|全网搜索|检索|搜一下|搜搜|网上搜|谷歌搜索|百度搜索|必应搜索|搜一下外网)/i.test(
        userInput
      );

    const isNonSearchActionIntent =
      /(?:提醒|闹钟|待办|日程|remind|邮件|email|收件箱|发信|发邮件)/i.test(userInput);

    const isGuideRequest = isGuideOrInquiryRequest(userInput);

    const hasSearchCues =
      !hasLocalAttachmentContext &&
      (hasRoutingSignal(userInput, 'search', createBuiltinRoutingPolicySnapshot()) ||
        hasRoutingSignal(userInput, 'externalSearch', createBuiltinRoutingPolicySnapshot()) ||
        isGuideRequest);

    const isWebSearchAllowed =
      context?.web_search_enabled !== false && context?.webSearch !== false;

    const isWebSearchEnabled =
      isWebSearchAllowed &&
      !isNonSearchActionIntent &&
      (isWebSearchExplicitlyRequested ||
        ((context?.web_search_enabled === true || context?.webSearch === true) && hasSearchCues));

    if (isWebSearchEnabled) {
      let searchSkill = availableSkills.find(
        (s) =>
          ['platform.search.web', 'platform.web_search', 'web_search', 'tavily_search'].includes(
            s.skillId.toLowerCase()
          ) || (s as any).category === 'search'
      );
      if (!searchSkill && this.skillCacheService?.loadSkillById) {
        try {
          searchSkill =
            (await this.skillCacheService.loadSkillById(
              'platform.search.web',
              authToken,
              traceId
            )) || undefined;
        } catch {
          // best-effort lookup
        }
      }
      if (searchSkill) {
        return this.buildMatchResult(
          searchSkill,
          ['web_search'],
          0.95,
          'web_search_intent'
        );
      }
    }

    return null;
  }

  private toMatchAttempt(match: SkillMatchResult | null): SkillMatchAttempt {
    return match ? { status: 'matched', match } : { status: 'not_found', match: null };
  }

  private resolveUnavailableCode(
    error: unknown
  ): 'SKILL_MATCH_MODEL_UNAVAILABLE' | 'SKILL_MATCH_SERVICE_UNAVAILABLE' {
    const err = error as any;
    const isAxios =
      typeof (axios as any).isAxiosError === 'function'
        ? (axios as any).isAxiosError(error)
        : Boolean(err?.isAxiosError || err?.response);
    if (!isAxios) return 'SKILL_MATCH_SERVICE_UNAVAILABLE';
    const data = err?.response?.data;
    return data &&
      typeof data === 'object' &&
      'code' in data &&
      data.code === 'SKILL_MATCH_MODEL_UNAVAILABLE'
      ? 'SKILL_MATCH_MODEL_UNAVAILABLE'
      : 'SKILL_MATCH_SERVICE_UNAVAILABLE';
  }

  hydrateMatchedSkill(
    matchedSkill: SkillMatchResult | null | undefined,
    availableSkills: AvailableSkillDefinition[]
  ): SkillMatchResult | null {
    if (!matchedSkill) {
      return null;
    }

    const sourceSkill = availableSkills.find((skill) => skill.skillId === matchedSkill.skillId);
    if (!sourceSkill) {
      return matchedSkill;
    }

    const resolvedApiEndpoints = matchedSkill.apiEndpoints || sourceSkill.apiEndpoints;
    const normalizedParamsSchema =
      Object.keys(matchedSkill.paramsSchema?.properties || {}).length > 0
        ? this.skillCacheService.normalizeParamsSchema(matchedSkill.paramsSchema)
        : sourceSkill.paramsSchema;

    return {
      ...matchedSkill,
      skillVersion: matchedSkill.skillVersion || sourceSkill.executableVersion,
      paramsSchema: this.skillCacheService.hydrateParamsSchemaRenderPaths(
        normalizedParamsSchema,
        (resolvedApiEndpoints?.runtimeMetadata || {}) as Record<string, unknown>
      ),
      templateId: matchedSkill.templateId || sourceSkill.templateId,
      carboneSkillId: matchedSkill.carboneSkillId || sourceSkill.carboneSkillId,
      carboneTemplateId: matchedSkill.carboneTemplateId || sourceSkill.carboneTemplateId,
      executionFlowTemplateIds: matchedSkill.executionFlowTemplateIds?.length
        ? matchedSkill.executionFlowTemplateIds
        : sourceSkill.executionFlowTemplateIds,
      executionType: matchedSkill.executionType || sourceSkill.executionType,
      executionFlow: this.skillCacheService.normalizeExecutionFlow(
        matchedSkill.executionFlow?.length ? matchedSkill.executionFlow : sourceSkill.executionFlow,
        matchedSkill.apiEndpoints?.runtimeMetadata?.sourceType ||
          sourceSkill.apiEndpoints?.runtimeMetadata?.sourceType
      ),
      apiEndpoints: resolvedApiEndpoints,
      goal: matchedSkill.goal || sourceSkill.goal,
      expectedResult: matchedSkill.expectedResult || sourceSkill.expectedResult,
      outputParams: matchedSkill.outputParams || sourceSkill.outputParams,
    };
  }
}
