import { Injectable, Logger, Optional } from '@nestjs/common';
import { RoutingPolicyService } from '../planner/routing/routing-policy.service';
import { hasRoutingSignal, stripSystemContext } from '../planner/routing/routing-policy.matcher';
import { SkillCacheService } from '../planner/skill/skill-cache.service';
import { ControlPlaneClient } from '../../client/control-plane.client';
import type { AvailableSkillDefinition } from '../react-engine/interfaces';
import type { SavedWorkflowCandidate } from './saved-workflow-matcher';

export interface EffectiveCapabilitiesResult {
  builtinSkills: AvailableSkillDefinition[];
  savedWorkflows: SavedWorkflowCandidate[];
}

@Injectable()
export class ChatCapabilityInquiryService {
  private readonly logger = new Logger(ChatCapabilityInquiryService.name);
  private readonly routingPolicy: RoutingPolicyService;

  constructor(
    @Optional() routingPolicy?: RoutingPolicyService,
    @Optional() private readonly skillCacheService?: SkillCacheService,
    @Optional() private readonly controlPlaneClient?: ControlPlaneClient
  ) {
    this.routingPolicy = routingPolicy || new RoutingPolicyService();
  }

  /**
   * Evaluates if the user prompt is asking about platform capabilities or skills.
   * Relies entirely on the versioned RoutingPolicy without hardcoded string lists.
   */
  public isCapabilityInquiry(userRequest: string): boolean {
    if (!userRequest || typeof userRequest !== 'string') {
      return false;
    }

    const trimmed = userRequest.trim();
    if (!trimmed) {
      return false;
    }

    const policy = this.routingPolicy.getSnapshot();
    const cleanUserText = stripSystemContext(trimmed) || trimmed;

    return hasRoutingSignal(cleanUserText, 'capabilityInquiry', policy);
  }

  /**
   * Dynamically loads available builtin capabilities and saved workflows for the current user/tenant.
   * Completely avoids hardcoded skill names or fixed manifests.
   */
  public async loadEffectiveCapabilities(options: {
    authToken?: string;
    traceId?: string;
    userId?: string;
    user?: { userId: string; userRoles?: string[]; organizationId?: string };
  }): Promise<EffectiveCapabilitiesResult> {
    let builtinSkills: AvailableSkillDefinition[] = [];
    let savedWorkflows: SavedWorkflowCandidate[] = [];

    if (this.skillCacheService) {
      try {
        builtinSkills = await this.skillCacheService.loadAvailableSkills(
          options.authToken,
          options.traceId,
          undefined,
          true,
          options.userId,
          true
        );
      } catch (err: any) {
        this.logger.warn(`Failed to dynamically load builtin skills: ${err?.message || err}`);
      }
    }

    if (this.controlPlaneClient) {
      try {
        const response = await this.controlPlaneClient.listSavedSkills({
          authToken: options.authToken,
          user: options.user,
        });
        savedWorkflows = (response?.skills as unknown as SavedWorkflowCandidate[]) || [];
      } catch (err: any) {
        this.logger.warn(`Failed to dynamically load saved workflows: ${err?.message || err}`);
      }
    }

    return {
      builtinSkills: builtinSkills || [],
      savedWorkflows: savedWorkflows || [],
    };
  }

  /**
   * Formats dynamically fetched capabilities into a structured catalog for prompt injection.
   * No hardcoded skill names or static categories.
   */
  public buildSkillsCatalogPrompt(
    builtinSkills: AvailableSkillDefinition[],
    savedWorkflows: SavedWorkflowCandidate[]
  ): string {
    const sections: string[] = [];

    if (builtinSkills && builtinSkills.length > 0) {
      const categoryMap = new Map<string, AvailableSkillDefinition[]>();

      for (const skill of builtinSkills) {
        const cat = ((skill as any).category || skill.executionType || 'general').toString().trim().toLowerCase();
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, []);
        }
        categoryMap.get(cat)!.push(skill);
      }

      sections.push('【平台当前启用的系统内置自动化技能清单】：');

      for (const [category, skills] of categoryMap.entries()) {
        sections.push(`■ 分类: [${category}]`);
        for (const skill of skills) {
          const name = skill.skillName || (skill as any).name || skill.skillId;
          const desc = (skill.description || '').trim();
          sections.push(`  - 【${name}】: ${desc || '提供该领域的自动化任务执行与分析支持'}`);
        }
      }
    } else {
      sections.push('【平台内置技能】：当前未检索到活跃的内置技能，或技能列表正在加载。');
    }

    if (savedWorkflows && savedWorkflows.length > 0) {
      sections.push('\n【当前用户/租户已沉淀的快捷工作流】：');
      for (const wf of savedWorkflows) {
        const name = wf.name || wf.id;
        const desc = (wf.description || '').trim();
        sections.push(`  - 【${name}】: ${desc || '已保存并经过审查的预置工作流'}`);
      }
    }

    return sections.join('\n');
  }

  /**
   * Builds high-context system prompt for answering capability inquiries.
   */
  public buildCapabilityInquirySystemPrompt(catalogText: string): string {
    return [
      '你是一个专业的高级AI助手，当前运行在 ops-automation 平台的受控工作模式（Task/Work Mode）中。',
      '',
      catalogText,
      '',
      '【回答要求】：',
      '1. 当用户询问你的能力、你能做什么、支持哪些功能或有什么技能时，必须优先、全面且结构化地向用户介绍上述当前平台真实启用的系统内置技能与工作流，严禁忽略平台真实能力而仅作空泛通用的AI回答。',
      '2. 请按照分类进行条理清晰的梳理展示，简明扼要地阐述每个核心能力能为用户解决什么实际业务问题。',
      '3. 提供 2-3 个具体且贴近实际场景的用户指令触发样例（例如：针对文档合同、检索分析或消息提醒如何向你发起任务）。',
      '4. 诚实说明：除了上述平台自动化执行技能外，你同时具备基础大语言模型的通用自然语言对话、文本创作、逻辑推理与代码解答能力。',
    ].join('\n');
  }
}
