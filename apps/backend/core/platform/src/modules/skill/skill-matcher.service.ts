import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import { AIMatchResponse, LLMUsage, SkillConfigDto, SkillMatchResult } from './interfaces';

@Injectable()
export class SkillMatcherService {
  private readonly logger = new Logger(SkillMatcherService.name);

  async matchSkill(
    userInput: string,
    loadSkills: () => Promise<SkillConfigDto[]>
  ): Promise<SkillMatchResult | null> {
    const skills = await loadSkills();
    return this.matchSkillFallback(userInput, skills);
  }

  async matchSkillWithAI(
    userInput: string,
    userId: string,
    loadAvailableSkills: (userId: string) => Promise<SkillConfigDto[]>
  ): Promise<SkillMatchResult | null> {
    const availableSkills = await loadAvailableSkills(userId);

    if (availableSkills.length === 0) {
      this.logger.warn(`User ${userId} has no available skills`);
      return null;
    }

    const skillsXml = this.buildSkillsPromptXml(availableSkills);
    const prompt = `你是一个技能匹配助手。根据用户输入，从可用技能中选择最匹配的一个。

可用技能：
${skillsXml}

用户输入：${userInput}

请分析用户意图，返回最匹配的技能信息。如果没有任何技能匹配，返回 null。

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
      }>(`${aiOrchestratorUrl}/ai/model/call`, {
        modelId: 'default',
        prompt,
        includeDebug: true,
      });

      const aiResponse = this.parseAiMatchResponse(response.data.result, availableSkills);

      if (aiResponse) {
        const matchedSkill = availableSkills.find(
          (skill) => skill.name === aiResponse.matchedSkill
        );
        if (matchedSkill) {
          const { collectedParams, missingParams } = this.extractParamsFromUserInput(
            matchedSkill,
            userInput
          );
          return {
            skillId: matchedSkill.id,
            skillName: matchedSkill.name,
            matchedKeywords: [],
            confidence: aiResponse.confidence,
            matchReason: aiResponse.reason,
            collectedParams,
            missingParams,
            paramsSchema: matchedSkill.paramsSchema,
            executionFlowTemplateIds: matchedSkill.executionFlowTemplateIds,
            apiEndpoints: matchedSkill.apiEndpoints,
            goal: matchedSkill.apiEndpoints?.runtimeMetadata?.goal,
            expectedResult: matchedSkill.apiEndpoints?.runtimeMetadata?.expectedResult,
            outputParams: matchedSkill.apiEndpoints?.runtimeMetadata?.outputParams,
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

      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`AI match failed: ${errorMsg}`);
      return this.matchSkillFallback(userInput, availableSkills);
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
    <name>${skill.name}</name>
    <description>${getMatchSummary(skill)}</description>
  </skill>`
      )
      .join('\n');
    return `<available_skills>\n${lines}\n</available_skills>`;
  }

  private parseAiMatchResponse(
    response: string,
    availableSkills: SkillConfigDto[]
  ): AIMatchResponse | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.matchedSkill && parsed.matchedSkill !== 'null') {
          const skillExists = availableSkills.some((skill) => skill.name === parsed.matchedSkill);
          if (!skillExists) {
            this.logger.warn(`AI matched skill "${parsed.matchedSkill}" not in available list`);
            return null;
          }
        }

        return {
          matchedSkill: parsed.matchedSkill === 'null' ? null : parsed.matchedSkill,
          confidence: parsed.confidence || 0,
          reason: parsed.reason || '',
        };
      }
    } catch {
      this.logger.error(`Failed to parse AI response: ${response}`);
    }

    return null;
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
