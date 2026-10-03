/**
 * Skill Contrastive Compiler Service
 * Compiles distinctive contrastive routing anchors and negative safety boundaries
 * for user/system skill sets at design/publish/change time.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  ContrastiveSkillCompiler,
  CompiledSkillRoutingProfile,
  SkillCompilationInput,
} from '@ops/backend-runtime-capability-contract';
import { SKILL_REGISTRY_PRISMA, SkillRegistryPrismaPort, getAiOrchestratorUrl } from './skill-registry.ports';
import { SkillConfigDto } from './interfaces';

@Injectable()
export class SkillContrastiveCompilerService {
  private readonly logger = new Logger(SkillContrastiveCompilerService.name);

  constructor(
    @Inject(SKILL_REGISTRY_PRISMA)
    private readonly prisma: SkillRegistryPrismaPort
  ) {}

  /**
   * Compiles contrastive routing profiles across the provided skills.
   * If useAi is true, invokes the LLM via AI Orchestrator to refine distinction keywords.
   * Automatically falls back to deterministic compilation.
   */
  async compileSkills(
    skills: SkillConfigDto[],
    options?: { useAi?: boolean; modelId?: string }
  ): Promise<Map<string, CompiledSkillRoutingProfile>> {
    if (!skills || skills.length === 0) {
      return new Map();
    }

    const inputs: SkillCompilationInput[] = skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      triggerKeywords: s.triggerKeywords,
      aliases: (s.apiEndpoints?.runtimeMetadata?.routingAliases as string[]) || [],
      negativeKeywords: (s.apiEndpoints?.runtimeMetadata?.negativeKeywords as string[]) || [],
      runtimeType: s.publishedSourceType || undefined,
    }));

    if (options?.useAi) {
      const aiCaller = async (prompt: string): Promise<string> => {
        const aiUrl = getAiOrchestratorUrl();
        const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
        const response = await axios.post<{ result: string }>(
          `${aiUrl}/ai/model/call`,
          {
            modelId: options.modelId || 'default',
            prompt,
          },
          {
            headers: internalSecret ? { 'x-internal-auth': internalSecret } : {},
            timeout: 30000,
          }
        );
        return response.data?.result || '';
      };

      try {
        return await ContrastiveSkillCompiler.compileWithAi(inputs, aiCaller);
      } catch (err: any) {
        this.logger.warn(
          `AI contrastive compilation failed, falling back to deterministic: ${err.message}`
        );
      }
    }

    return ContrastiveSkillCompiler.compile(inputs);
  }

  /**
   * Persists compiled routing profiles into skill_configs.api_endpoints
   */
  async persistCompiledProfiles(
    profiles: Map<string, CompiledSkillRoutingProfile>
  ): Promise<void> {
    for (const [skillId, profile] of profiles.entries()) {
      try {
        const current = await this.prisma.skillConfig.findUnique({
          where: { id: skillId },
          select: { id: true, apiEndpoints: true },
        });

        if (!current) continue;

        const currentEndpoints =
          (current.apiEndpoints as Record<string, unknown>) || {};
        const currentMetadata =
          (currentEndpoints.runtimeMetadata as Record<string, unknown>) || {};
        const existingAliases =
          (currentMetadata.routingAliases as string[]) || [];
        const existingNegatives =
          (currentMetadata.negativeKeywords as string[]) || [];

        const mergedAliases = Array.from(
          new Set([...existingAliases, ...profile.positiveSignals])
        );
        const mergedNegatives = Array.from(
          new Set([...existingNegatives, ...profile.negativeSignals])
        );

        const updatedEndpoints = {
          ...currentEndpoints,
          runtimeMetadata: {
            ...currentMetadata,
            routingAliases: mergedAliases,
            negativeKeywords: mergedNegatives,
          },
        };

        await this.prisma.skillConfig.update({
          where: { id: skillId },
          data: {
            apiEndpoints: updatedEndpoints as any,
          },
        });
      } catch (err: any) {
        this.logger.error(
          `Failed to persist compiled routing profile for skill ${skillId}: ${err.message}`
        );
      }
    }
  }

  /**
   * Helper that compiles and persists profiles in a single pass.
   */
  async syncCompiledProfilesForSkills(
    skills: SkillConfigDto[],
    options?: { useAi?: boolean; modelId?: string }
  ): Promise<Map<string, CompiledSkillRoutingProfile>> {
    const profiles = await this.compileSkills(skills, options);
    await this.persistCompiledProfiles(profiles);
    return profiles;
  }
}
