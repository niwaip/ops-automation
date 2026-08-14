import { Injectable, Logger } from '@nestjs/common';
import { ModelService } from '../../model/model.service';
import type { RoutingCapabilityCardV1 } from '../candidate-selection/routing-capability-card.projector';
import type { DeterministicTopologyDraftV1 } from './deterministic-topology.types';
import { getSkillMatchMinConfidence } from '../skill/skill-match-policy';

@Injectable()
export class DeterministicTopologyPlannerService {
  private readonly logger = new Logger(DeterministicTopologyPlannerService.name);

  constructor(private readonly modelService: ModelService) {}

  public async planTopology(
    userRequest: string,
    routingCards: RoutingCapabilityCardV1[],
  ): Promise<DeterministicTopologyDraftV1 | null> {
    const activeModel = this.modelService.getPreferredDefaultModel({ mode: 'task' });
    if (!activeModel) {
      this.logger.warn('No active AI model configured for task operations');
      return null;
    }

    const systemPrompt = `你是一个企业级 AI 系统的受限任务拓扑规划器 (Deterministic Topology Planner)。
你的唯一职责是将用户请求拆分为一个最小的 DAG 节点拓扑 JSON。

【约束规则】：
1. 必须且只能从下方 capabilities 中选择 capabilityKey (如 s0, s1, o0)。严禁虚构未知能力 key。
2. 节点的 sequence 为数组顺序，ref 必须为 n1, n2, n3...
3. dependsOn 只能引用排在前面的节点 ref。
4. 节点数量在 1～6 之间。
5. 根据用户语义识别最终输出是普通值还是文件产物，分别输出 finalOutputKind=value 或 artifact。
6. 意图判断必须综合 capability 的 name、description、goals 与输入输出语义，不得依赖单一关键词。
7. 必须输出 matchDecision、matchConfidence 和 matchReason。只有存在明确支持用户目标的 Skill，且整体匹配置信度不低于 ${getSkillMatchMinConfidence()}，才能输出 matchDecision=matched。
8. 如果没有相应 Skill 或置信度低于 ${getSkillMatchMinConfidence()}，必须输出 matchDecision=no_match、nodes=[]、finalNodeRef=null；不得因为某个能力最接近或是唯一候选就勉强规划。
9. LLM Operation 只能处理 Skill 已产生的数据，不能替代缺失的外部业务 Skill，也不能单独构成可执行计划。
10. 只输出符合 deterministic-topology/v1 Schema 的纯 JSON。严禁附带 Markdown 标记或解释。

【输出 Schema】：
{
  "schemaVersion": "deterministic-topology/v1",
  "objective": "用户目标简述",
  "matchDecision": "matched",
  "matchConfidence": 0.95,
  "matchReason": "所选 Skill 的名称、描述及输入输出能够覆盖用户目标",
  "nodes": [
    { "ref": "n1", "capabilityKey": "s0", "dependsOn": [] },
    { "ref": "n2", "capabilityKey": "o0", "dependsOn": ["n1"] }
  ],
  "finalNodeRef": "n2",
  "finalOutputKind": "value"
}`;

    const userPrompt = JSON.stringify({
      request: userRequest,
      capabilities: routingCards.map((c) => ({
        key: c.key,
        kind: c.capabilityKind,
        name: c.displayName,
        description: c.description,
        goals: c.goals,
        accepts: c.accepts,
        produces: c.produces,
        artifact: c.supportsArtifactOutput,
      })),
    });

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    this.logger.log(
      `Planning multi-step topology using model '${activeModel.name}' for request: "${userRequest}" (${routingCards.length} cards)`,
    );

    try {
      const response = await this.modelService.callModel(
        activeModel.id,
        fullPrompt,
        'reasoning',
      );

      const jsonStr = this.cleanJsonResponse(response.content);
      const parsed = JSON.parse(jsonStr) as DeterministicTopologyDraftV1;
      return parsed;
    } catch (err: any) {
      this.logger.warn(`Failed to generate topology draft: ${err.message}`);
      return null;
    }
  }

  private cleanJsonResponse(raw: string): string {
    let clean = raw.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
    }
    return clean;
  }
}
