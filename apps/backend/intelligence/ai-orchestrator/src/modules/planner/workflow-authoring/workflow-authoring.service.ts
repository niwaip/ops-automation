import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModelService } from '../../model/model.service';
import { DeterministicPlanGeneratorService } from '../deterministic/deterministic-plan-generator.service';
import { SkillCacheService } from '../skill/skill-cache.service';
import type {
  OptimizeDescriptionRequestDto,
  OptimizeDescriptionResponseDto,
  TestPlannerMatchingRequestDto,
  TestPlannerMatchingResponseDto,
  TestPlannerMatchingResultItem,
  CandidateSkillInputDto,
} from './workflow-authoring.types';

@Injectable()
export class WorkflowAuthoringService {
  private readonly logger = new Logger(WorkflowAuthoringService.name);

  constructor(
    private readonly modelService: ModelService,
    private readonly planGenerator: DeterministicPlanGeneratorService,
    @Optional()
    private readonly skillCacheService?: SkillCacheService,
  ) {}

  public async optimizeDescription(
    dto: OptimizeDescriptionRequestDto
  ): Promise<OptimizeDescriptionResponseDto> {
    const activeModel =
      (dto.modelId ? { id: dto.modelId, name: dto.modelId } : null) ||
      this.modelService.getPreferredDefaultModel({ mode: 'task' });

    if (!activeModel) {
      throw new Error('No active AI model configured for prompt optimization');
    }

    let failureContext = '';
    if (Array.isArray(dto.previousFailures) && dto.previousFailures.length > 0) {
      const failureLines = dto.previousFailures.map(
        (f) =>
          `- 测试指令: "${f.query}" -> 失败原因: ${f.reason || f.executionError || '置信度不足拒答'}`
      );
      failureContext = `\n\n【上一轮测试失败反馈（必须重点针对性修复！）】：
上一轮使用旧描述在规划器中进行仿真测试时，以下指令未能成功匹配：
${failureLines.join('\n')}

请深入分析上述失败原因（例如：是否因为原描述过于狭隘、缺少动态入参说明、未明确声明产出数据格式或动词模糊导致规划器误判拒答），针对性重构并增强描述，确保上述失败指令能被精准识别！`;
    }

    const systemPrompt = `你是一个企业级 AI 任务规划器 (Deterministic Topology Planner) 的技能提示词专家。
用户正在编辑一个工作流/技能，需要生成一段【专供受限任务拓扑规划器进行意图召回与参数绑定的精简描述】。

【规划器匹配规范与要求】：
1. 核心动作明确：使用清晰的动作动词（如“打开指定的网页或 URL 并获取正文”、“从指定平台查询实时榜单”、“通过 Bark 发送推送通知”等）。
2. 动态参数支持明确：如果参数中有 URL、搜索关键词、时间范围等，必须明确说明支持动态传入目标对象（例如“支持传入任意目标网页 URL 地址”），严禁使用“仅支持特定网页/无需参数/写死地址”等会导致规划器拒答的消极词汇。
3. 产出数据结构明确：明确说明执行后产生的数据（如“提取页面正文、标题与结构化文章列表”或“生成文件产物”），以便下游文本总结或推送节点顺畅连接。
4. 语言精炼无歧义：长度严格控制在 50～120 字以内，纯中文，信息密度高，无多余套话。

【输出 JSON 格式要求】：
只输出纯 JSON，严禁附带 Markdown 标记：
{
  "optimizedDescription": "精简、精准的技能描述（50~120字）",
  "keyPoints": ["核心优化点1: 明确动态URL参数输入", "核心优化点2: 明确产出正文与文章列表", "核心优化点3: 消除歧义动词"],
  "suggestedTriggerKeywords": ["打开网页", "获取正文", "网页抓取"],
  "sampleQueries": {
    "singleStep": ["打开网页 https://example.com 获取正文", "抓取指定的网页内容"],
    "multiStep": ["打开网页 https://example.com 获取正文并进行总结", "抓取网页内容并总结，最后通过 Bark 推送"]
  },
  "addressedFailures": ["针对'未支持通用URL'问题，明确增加了支持任意网页URL的说明"]
}`;

    const userContent = JSON.stringify({
      workflowName: dto.name,
      currentDescription: dto.description || '',
      inputParameters: dto.inputParams || {},
      outputParameters: dto.outputParams || {},
      stepsSummary: dto.stepsSummary || [],
    });

    const fullPrompt = `${systemPrompt}\n\n待优化的工作流信息：\n${userContent}${failureContext}`;

    try {
      const response = await this.modelService.callModel(activeModel.id, fullPrompt, 'auxiliary', {
        reasoning: { enabled: false },
      });

      const cleanJson = this.cleanJsonResponse(response.content);
      const parsed = JSON.parse(cleanJson);

      return {
        optimizedDescription:
          parsed.optimizedDescription ||
          `自动执行${dto.name}，支持动态传入参数并提取结构化结果。`,
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        suggestedTriggerKeywords: Array.isArray(parsed.suggestedTriggerKeywords)
          ? parsed.suggestedTriggerKeywords
          : [dto.name],
        sampleQueries: {
          singleStep: Array.isArray(parsed.sampleQueries?.singleStep)
            ? parsed.sampleQueries.singleStep
            : [`执行 ${dto.name}`],
          multiStep: Array.isArray(parsed.sampleQueries?.multiStep)
            ? parsed.sampleQueries.multiStep
            : [`执行 ${dto.name} 并且进行总结`],
        },
        addressedFailures: Array.isArray(parsed.addressedFailures) ? parsed.addressedFailures : [],
      };
    } catch (err: any) {
      this.logger.warn(`Failed to optimize description with LLM: ${err.message}`);
      return {
        optimizedDescription: `自动执行${dto.name}，支持接收动态输入参数并返回结构化执行结果。`,
        keyPoints: ['大模型调用未完成，使用标准规范模板生成'],
        suggestedTriggerKeywords: [dto.name],
        sampleQueries: {
          singleStep: [`执行 ${dto.name}`],
          multiStep: [`执行 ${dto.name} 并且进行总结`],
        },
      };
    }
  }

  public async testPlannerMatching(
    dto: TestPlannerMatchingRequestDto
  ): Promise<TestPlannerMatchingResponseDto> {
    const candidateSkill = dto.candidateSkill;
    const synthesizedSkill = this.buildSynthesizedSkillCard(candidateSkill);

    // 1. Load all published skills so candidate pool is 100% identical to real production DAG execution
    let publicSkills: any[] = [];
    if (this.skillCacheService) {
      try {
        publicSkills = await this.skillCacheService.loadAvailableSkills(dto.authToken);
      } catch (err: any) {
        this.logger.warn(`Failed to load published skills for planner test: ${err.message}`);
      }
    }

    const candidateKey = synthesizedSkill.id || synthesizedSkill.skillName || synthesizedSkill.name;
    const allAvailableSkills = [
      synthesizedSkill,
      ...publicSkills.filter((s: any) => {
        const key = s.id || s.skillId || s.skillName || s.name;
        return (
          key !== candidateKey &&
          s.name !== synthesizedSkill.name &&
          s.skillName !== synthesizedSkill.skillName
        );
      }),
    ];

    // 2. Prepare test queries
    const testQueries: Array<{ query: string; type: 'single_step' | 'multi_step' | 'custom' }> = [];

    if (Array.isArray(dto.testQueries) && dto.testQueries.length > 0) {
      dto.testQueries.forEach((q) => {
        if (q.trim()) testQueries.push({ query: q.trim(), type: 'custom' });
      });
    }

    if (dto.includeDefaultCombos !== false || testQueries.length === 0) {
      const defaultQueries = this.generateDefaultTestQueries(candidateSkill);
      defaultQueries.forEach((item) => {
        if (!testQueries.some((t) => t.query === item.query)) {
          testQueries.push(item);
        }
      });
    }

    // 3. Execute DAG generation simulation concurrently in parallel
    const cappedQueries = testQueries.slice(0, 4);

    const results = await Promise.all(
      cappedQueries.map(async (item) => {
        try {
          const plan = await this.planGenerator.generatePlan({
            userRequest: item.query,
            availableSkills: allAvailableSkills,
          });

          const isMatched = Boolean(plan && plan.nodes && plan.nodes.length > 0);
          const matchConfidence = (plan as any)?.promptDebug?.matchConfidence ?? 0.95;
          const matchReason = (plan as any)?.promptDebug?.matchReason || '规划器成功生成 DAG 节点';

          return {
            query: item.query,
            queryType: item.type,
            decision: isMatched ? ('matched' as const) : ('no_match' as const),
            confidence: matchConfidence,
            reason: matchReason,
            plannedNodes: (plan?.nodes || []).map((node: any) => ({
              ref: node.ref,
              capabilityKey: node.capabilityKey || node.skillId || node.action,
              displayName:
                node.title || node.skillName || node.capabilityKey || node.action || node.ref,
              kind: node.kind || (node.action ? 'llm_operation' : 'skill'),
              dependsOn: node.dependsOn || [],
              boundParams: node.inputBindings || node.params || {},
            })),
          };
        } catch (err: any) {
          return {
            query: item.query,
            queryType: item.type,
            decision: 'no_match' as const,
            confidence: 0,
            reason: err.message || '规划器无法匹配或置信度不足',
            executionError: err.code || err.message,
          };
        }
      })
    );

    const passedCount = results.filter((r) => r.decision === 'matched').length;
    const totalCount = results.length;

    return {
      results,
      summary: {
        total: totalCount,
        passed: passedCount,
        failed: totalCount - passedCount,
        passRate: totalCount > 0 ? Number((passedCount / totalCount).toFixed(2)) : 0,
      },
    };
  }

  private buildSynthesizedSkillCard(skill: CandidateSkillInputDto): any {
    const inputSchema = this.normalizeInputParams(skill.inputParams);
    const outputSchema = this.normalizeOutputParams(skill.outputParams);

    return {
      id: skill.id || 'candidate-test-skill',
      skillId: skill.id || 'candidate-test-skill',
      skillName: skill.name,
      name: skill.name,
      description: skill.description,
      summary: skill.description,
      isPublished: true,
      publishedReleaseStatus: 'published',
      publishedDeploymentStatus: 'deployed',
      executableVersion: '1.0.0',
      version: '1.0.0',
      category: 'workflow',
      executionType: 'flow',
      inputSchema,
      paramsSchema: inputSchema,
      outputSchema,
      outputParams: outputSchema,
      supportsArtifact: false,
    };
  }

  private normalizeInputParams(params: unknown): Record<string, any> {
    if (!params || typeof params !== 'object') {
      return { type: 'object', properties: {} };
    }
    if (Array.isArray(params)) {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      params.forEach((p) => {
        if (p && typeof p === 'object') {
          const key = p.name || p.fieldName || p.key;
          if (key) {
            properties[key] = {
              type: p.type || 'string',
              description: p.description || p.displayName || key,
              default: p.defaultValue ?? p.default,
            };
            if (p.required) required.push(key);
          }
        }
      });
      return { type: 'object', properties, required };
    }
    if ((params as any).properties) {
      return params as Record<string, any>;
    }
    return { type: 'object', properties: params };
  }

  private normalizeOutputParams(params: unknown): Record<string, any> {
    if (!params || typeof params !== 'object' || Object.keys(params).length === 0) {
      return {
        type: 'object',
        properties: {
          text: { type: 'string', description: '执行正文或页面文本' },
          result: { type: 'object', description: '结构化执行详情' },
        },
      };
    }
    if (Array.isArray(params)) {
      const properties: Record<string, any> = {};
      params.forEach((p) => {
        if (p && typeof p === 'object') {
          const key = p.name || p.fieldName || p.key;
          if (key) {
            properties[key] = {
              type: p.type || 'string',
              description: p.description || key,
            };
          }
        }
      });
      return { type: 'object', properties };
    }
    if ((params as any).properties) {
      return params as Record<string, any>;
    }
    return { type: 'object', properties: params };
  }

  private generateDefaultTestQueries(
    skill: CandidateSkillInputDto
  ): Array<{ query: string; type: 'single_step' | 'multi_step' }> {
    const name = skill.name || '工作流';
    const isUrlBased =
      skill.description?.includes('http') ||
      skill.description?.includes('URL') ||
      skill.description?.includes('网页') ||
      JSON.stringify(skill.inputParams || {}).toLowerCase().includes('url');

    const sampleUrl = 'https://zhuanlan.zhihu.com/p/2072698072879125245';

    if (isUrlBased) {
      return [
        {
          query: `打开网页 ${sampleUrl} 获取正文`,
          type: 'single_step',
        },
        {
          query: `打开网页 ${sampleUrl} 并且进行总结`,
          type: 'multi_step',
        },
        {
          query: `打开 ${sampleUrl} 总结内容后通过 Bark 推送`,
          type: 'multi_step',
        },
      ];
    }

    return [
      {
        query: `执行 ${name}`,
        type: 'single_step',
      },
      {
        query: `执行 ${name} 并且对结果进行总结`,
        type: 'multi_step',
      },
      {
        query: `运行 ${name}，总结后导出为 Markdown 文件`,
        type: 'multi_step',
      },
    ];
  }

  private cleanJsonResponse(raw: string): string {
    let clean = raw.trim();
    if (clean.startsWith('```')) {
      clean = clean
        .replace(/^```[a-z]*\n?/i, '')
        .replace(/```$/i, '')
        .trim();
    }
    return clean;
  }
}
