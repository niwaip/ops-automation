import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { matchDeterministicRoutingCapability } from '@ops/backend-runtime-capability-contract';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import { AIMatchResponse, LLMUsage, SkillConfigDto, SkillMatchResult } from './interfaces';
import { getSkillMatchMinConfidence, isAcceptedSkillMatch } from './skill-match-policy';

@Injectable()
export class SkillMatcherService {
  private readonly logger = new Logger(SkillMatcherService.name);
  private readonly candidateLimit = 5;
  private readonly candidateSummaryLimit = 240;
  private readonly modelTimeoutMs = this.readModelTimeoutMs();

  async matchSkill(
    userInput: string,
    loadSkills: () => Promise<SkillConfigDto[]>
  ): Promise<SkillMatchResult | null> {
    const skills = await loadSkills();
    const match = this.matchSkillFallback(userInput, skills);
    return match && isAcceptedSkillMatch(match.confidence) ? match : null;
  }

  async matchSkillWithAI(
    userInput: string,
    userId: string,
    loadAvailableSkills: (userId: string) => Promise<SkillConfigDto[]>,
    modelId?: string
  ): Promise<SkillMatchResult | null> {
    const availableSkills = await loadAvailableSkills(userId);

    if (availableSkills.length === 0) {
      this.logger.warn(`User ${userId} has no available skills`);
      return null;
    }

    const explicitMatch = this.matchExplicitSkillName(userInput, availableSkills);
    if (explicitMatch) {
      return this.buildSkillMatchResult(
        explicitMatch.skill,
        userInput,
        explicitMatch.matchedKeywords,
        0.99,
        'deterministic_routing_signal'
      );
    }

    // Progressive disclosure: the model sees only short cards for the most
    // relevant candidates. Full schemas and runtime metadata stay outside the
    // prompt and are hydrated only after a candidate has been selected.
    const candidateSkills = this.selectTopCandidates(userInput, availableSkills);
    const skillsXml = this.buildSkillsPromptXml(candidateSkills);
    const prompt = `你是一个技能匹配助手。根据用户输入，从可用技能中选择最匹配的一个。

可用技能：
${skillsXml}

用户输入：${userInput}

请分析用户意图，返回最匹配的技能信息。如果没有任何技能匹配，返回 null。
只有当技能名称、描述与用户目标明确匹配，且置信度不低于 ${getSkillMatchMinConfidence()} 时才返回技能；否则 matchedSkill 必须返回 null。不要因为某个技能是候选列表中唯一接近的能力就勉强匹配。

请严格按照以下 JSON 格式返回（不要添加任何其他文字）：
{
  "matchedSkill": "技能名称或null",
  "confidence": 0.0到1.0之间的数字,
  "reason": "匹配原因简述"
}`;

    try {
      const aiOrchestratorUrl = getAiOrchestratorUrl();
      const response = await axios.post<{
        result: string;
        usage?: LLMUsage;
        debug?: {
          modelId: string;
          requestMessages: Array<{ role: 'user'; content: string }>;
          responseText: string;
        };
      }>(
        `${aiOrchestratorUrl}/ai/model/call`,
        {
          modelId: modelId || 'default',
          prompt,
          includeDebug: true,
        },
        { timeout: this.modelTimeoutMs }
      );

      const aiResponse = this.parseAiMatchResponse(response.data.result, candidateSkills);

      if (aiResponse && isAcceptedSkillMatch(aiResponse.confidence)) {
        const matchedSkill = candidateSkills.find(
          (skill) => skill.name === aiResponse.matchedSkill
        );
        if (matchedSkill) {
          return {
            ...this.buildSkillMatchResult(
              matchedSkill,
              userInput,
              [],
              aiResponse.confidence,
              aiResponse.reason
            ),
            usage: response.data.usage,
            debug: {
              llmCalls: response.data.debug
                ? [
                    {
                      stage: 'skills-match',
                      label: '技能匹配',
                      modelId: response.data.debug.modelId,
                      requestMessages: response.data.debug.requestMessages,
                      responseText: response.data.debug.responseText,
                    },
                  ]
                : [],
            },
          };
        }
      }

      if (aiResponse?.matchedSkill) {
        this.logger.log(
          `Rejected low-confidence skill match '${aiResponse.matchedSkill}' (${aiResponse.confidence}); minimum is ${getSkillMatchMinConfidence()}`
        );
      }
      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`AI match failed or exceeded ${this.modelTimeoutMs}ms: ${errorMsg}`);
      const fallback = this.matchSkillFallback(userInput, candidateSkills);
      if (fallback && isAcceptedSkillMatch(fallback.confidence)) return fallback;
      throw new ServiceUnavailableException({
        code: 'SKILL_MATCH_MODEL_UNAVAILABLE',
        message: 'Skill matching model is temporarily unavailable',
        retryable: true,
      });
    }
  }

  private buildSkillsPromptXml(skills: SkillConfigDto[]): string {
    const getMatchSummary = (skill: SkillConfigDto): string => {
      const runtimeMetadata = skill.apiEndpoints?.runtimeMetadata as
        | Record<string, unknown>
        | undefined;
      const matchSummary =
        typeof runtimeMetadata?.matchSummary === 'string'
          ? runtimeMetadata.matchSummary.trim()
          : '';
      return matchSummary || skill.description || '';
    };

    const lines = skills
      .map(
        (skill) => `  <skill>
    <name>${this.escapeXml(skill.name)}</name>
    <description>${this.escapeXml(getMatchSummary(skill).slice(0, this.candidateSummaryLimit))}</description>
  </skill>`
      )
      .join('\n');
    return `<available_skills>\n${lines}\n</available_skills>`;
  }

  private selectTopCandidates(userInput: string, skills: SkillConfigDto[]): SkillConfigDto[] {
    const normalizedInput = this.normalizeRouteText(userInput);
    const inputBigrams = this.buildBigrams(normalizedInput);
    return skills
      .map((skill, index) => {
        const runtimeMetadata = skill.apiEndpoints?.runtimeMetadata;
        const searchable = this.normalizeRouteText(
          [
            skill.name,
            skill.description,
            runtimeMetadata?.matchSummary,
            runtimeMetadata?.goal,
            runtimeMetadata?.expectedResult,
            ...skill.triggerKeywords,
          ]
            .filter((value): value is string => typeof value === 'string')
            .join(' ')
        );
        let score = 0;
        const normalizedName = this.normalizeRouteText(skill.name);
        if (normalizedName && normalizedInput.includes(normalizedName)) score += 100;
        for (const keyword of skill.triggerKeywords) {
          const normalizedKeyword = this.normalizeRouteText(keyword);
          if (normalizedKeyword && normalizedInput.includes(normalizedKeyword)) {
            score += 20 + Math.min(normalizedKeyword.length, 12);
          }
        }
        for (const bigram of inputBigrams) {
          if (searchable.includes(bigram)) score += 1;
        }
        return { skill, score, index };
      })
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, this.candidateLimit)
      .map(({ skill }) => skill);
  }

  private matchExplicitSkillName(
    userInput: string,
    skills: SkillConfigDto[]
  ): { skill: SkillConfigDto; matchedKeywords: string[] } | null {
    const match = matchDeterministicRoutingCapability(
      userInput,
      skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        aliases: skill.apiEndpoints?.runtimeMetadata?.routingAliases,
        triggerKeywords: skill.triggerKeywords,
        skill,
      }))
    );
    return match ? { skill: match.capability.skill, matchedKeywords: match.matchedSignals } : null;
  }

  private buildSkillMatchResult(
    skill: SkillConfigDto,
    userInput: string,
    matchedKeywords: string[],
    confidence: number,
    matchReason: string
  ): SkillMatchResult {
    const { collectedParams, missingParams } = this.extractParamsFromUserInput(skill, userInput);
    return {
      skillId: skill.id,
      skillName: skill.name,
      matchedKeywords,
      confidence,
      matchReason,
      collectedParams,
      missingParams,
      paramsSchema: skill.paramsSchema,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
      apiEndpoints: skill.apiEndpoints,
      goal: skill.apiEndpoints?.runtimeMetadata?.goal,
      expectedResult: skill.apiEndpoints?.runtimeMetadata?.expectedResult,
      outputParams: skill.apiEndpoints?.runtimeMetadata?.outputParams,
    };
  }

  private normalizeRouteText(value: string): string {
    return value.toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
  }

  private buildBigrams(value: string): string[] {
    if (value.length < 2) return value ? [value] : [];
    return Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2));
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private readModelTimeoutMs(): number {
    const configured = Number(process.env.SKILL_MATCH_MODEL_TIMEOUT_MS || 45000);
    return Number.isFinite(configured) ? Math.min(Math.max(configured, 1000), 120000) : 45000;
  }

  private parseAiMatchResponse(
    response: string,
    availableSkills: SkillConfigDto[]
  ): AIMatchResponse | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed: unknown = JSON.parse(jsonMatch[0]);
        if (!this.isRecord(parsed)) return null;
        const matchedSkill =
          parsed.matchedSkill === null || parsed.matchedSkill === 'null'
            ? null
            : typeof parsed.matchedSkill === 'string' && parsed.matchedSkill.trim()
              ? parsed.matchedSkill.trim()
              : null;

        if (matchedSkill) {
          const skillExists = availableSkills.some((skill) => skill.name === matchedSkill);
          if (!skillExists) {
            this.logger.warn(`AI matched skill "${matchedSkill}" not in available list`);
            return null;
          }
        }

        return {
          matchedSkill,
          confidence:
            typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
              ? parsed.confidence
              : 0,
          reason: typeof parsed.reason === 'string' ? parsed.reason : '',
        };
      }
    } catch {
      this.logger.error(`Failed to parse AI response: ${response}`);
    }

    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private matchSkillFallback(
    userInput: string,
    availableSkills: SkillConfigDto[]
  ): SkillMatchResult | null {
    let bestMatch: SkillConfigDto | null = null;
    let bestScore = 0;
    const matchedKeywords: string[] = [];

    for (const skill of availableSkills) {
      const keywords = skill.triggerKeywords;
      let score = 0;
      const matched: string[] = [];

      for (const keyword of keywords) {
        if (userInput.toLowerCase().includes(keyword.toLowerCase())) {
          score += 1;
          matched.push(keyword);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = skill;
        matchedKeywords.length = 0;
        matchedKeywords.push(...matched);
      }
    }

    if (!bestMatch) {
      return null;
    }

    const confidence = Math.min(bestScore / bestMatch.triggerKeywords.length, 1);
    const { collectedParams, missingParams } = this.extractParamsFromUserInput(
      bestMatch,
      userInput
    );

    return {
      skillId: bestMatch.id,
      skillName: bestMatch.name,
      matchedKeywords,
      confidence,
      collectedParams,
      missingParams,
      paramsSchema: bestMatch.paramsSchema,
      executionFlowTemplateIds: bestMatch.executionFlowTemplateIds,
      apiEndpoints: bestMatch.apiEndpoints,
      goal: bestMatch.apiEndpoints?.runtimeMetadata?.goal,
      expectedResult: bestMatch.apiEndpoints?.runtimeMetadata?.expectedResult,
      outputParams: bestMatch.apiEndpoints?.runtimeMetadata?.outputParams,
    };
  }

  private extractParamsFromUserInput(
    skill: SkillConfigDto,
    _userInput: string
  ): { collectedParams: Record<string, unknown>; missingParams: string[] } {
    const collectedParams: Record<string, unknown> = {};
    const requiredParams = skill.paramsSchema?.required || [];

    const missingParams = requiredParams.filter((param) => {
      const value = collectedParams[param];
      return value === undefined || value === null || value === '';
    });

    return { collectedParams, missingParams };
  }
}
