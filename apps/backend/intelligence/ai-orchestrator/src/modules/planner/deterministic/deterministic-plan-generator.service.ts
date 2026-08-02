import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ERROR_CODES } from '@ops/backend-error-codes';
import { ModelService } from '../../model/model.service';
import { CapabilityCandidateSelectorService } from '../candidate-selection/capability-candidate-selector.service';
import { LLM_OPERATION_TEMPLATES } from '../../llm-operation/llm-operation.registry';
import type {
  DeterministicPlanDraftV1,
  CompactCapabilityCardV1,
} from '@ops/backend-deterministic-plan';

export interface GenerateDeterministicPlanRequestDto {
  userRequest: string;
  availableSkills?: any[];
}

@Injectable()
export class DeterministicPlanGeneratorService {
  private readonly logger = new Logger(DeterministicPlanGeneratorService.name);

  constructor(
    private readonly modelService: ModelService,
    private readonly candidateSelector: CapabilityCandidateSelectorService,
  ) {}

  public async generatePlan(dto: GenerateDeterministicPlanRequestDto): Promise<DeterministicPlanDraftV1> {
    const { skillCards, llmOperationCards } = this.candidateSelector.selectCandidates(
      dto.userRequest,
      dto.availableSkills || [],
    );

    if (!skillCards || skillCards.length === 0) {
      const err: any = new Error('No published executable skills available for planning');
      err.code = 'CAPABILITY_NOT_FOUND';
      throw err;
    }

    const requiresArtifactOutput = this.requiresArtifactOutput(dto.userRequest);
    if (requiresArtifactOutput && !skillCards.some((card) => card.supportsArtifactOutput)) {
      const err: any = new Error('用户要求生成文件，但当前可用能力中没有已发布且可执行的文件/产物输出 Skill');
      err.code = 'CAPABILITY_NOT_FOUND';
      throw err;
    }

    const systemPrompt = this.buildSystemPrompt(skillCards, llmOperationCards);
    const userPrompt = `用户请求: "${dto.userRequest}"`;

    const activeModel = this.modelService.getPreferredDefaultModel({ mode: 'task' });
    if (!activeModel) {
      throw new Error('No active AI model configured for planning');
    }

    this.logger.log(`Generating deterministic plan using model '${activeModel.name}' for request: "${dto.userRequest}"`);

    let response = await this.modelService.callModel(
      activeModel.id,
      `${systemPrompt}\n\n${userPrompt}`,
      'reasoning',
    );

    try {
      return this.parseAndValidatePlanJson(
        response.content,
        dto.userRequest,
        skillCards,
        requiresArtifactOutput,
      );
    } catch (firstErr) {
      this.logger.warn(`Failed to parse initial plan JSON output, attempting format repair...`);
      const repairReason = firstErr instanceof Error ? firstErr.message : String(firstErr);
      const repairPrompt = `${systemPrompt}\n\n${userPrompt}\n\n你的上次输出未通过校验：${repairReason}\n上次输出：\n${response.content}\n\n请保留用户的完整目标并重新输出符合 Schema 的纯 JSON。若用户要求生成文件，必须包含 supportsArtifactOutput=true 的最终 Skill 节点，并声明 artifact_ref finalOutput。`;
      response = await this.modelService.callModel(activeModel.id, repairPrompt, 'reasoning');
      return this.parseAndValidatePlanJson(
        response.content,
        dto.userRequest,
        skillCards,
        requiresArtifactOutput,
      );
    }
  }

  private buildSystemPrompt(
    skillCards: CompactCapabilityCardV1[],
    llmOperationCards: CompactCapabilityCardV1[],
  ): string {
    return `你是一个企业级 AI 系统的确定性任务拆分规划器 (Deterministic Task Decomposition Planner)。
你的唯一职责是将用户复合请求分解为一个受约束的顺序执行计划 (DeterministicPlanDraftV1)。

【约束规则】：
1. 只能选择下方提供的候选能力 ID (publishedSkillId) 与版本 (executableVersion)，绝对禁止假造或虚构未知能力或版本。技能节点的 skillVersion 必须准确匹配候选 Skill 的 executableVersion。
2. 节点类型只能是 "skill" 或 "llm_operation"。
3. 节点 sequence 从 1 开始连续递增，dependsOn 只能引用更低 sequence 的节点 ID。
4. 如果用户显式要求生成文件（如 md 文件），计划中必须选择 supportsArtifactOutput=true 的 Skill 作为最终产物节点，finalOutputs.expectedType 必须是 "artifact_ref"，且 isArtifact=true。
5. 每个节点的输入必须来自显式绑定:
   - "literal": 固定字面量
   - "node_output": 依赖上游节点的输出路径
6. 禁止把 apiKey、token、secret、password、authorization 等凭据字段写入 inputBindings；这些字段由 Skill 发布配置或运行时默认值处理。
7. 只输出纯 JSON 格式，严禁附带 Markdown 解释。
8. 【关键】禁止在节点 JSON 中声明 outputContract 字段——它由规划器根据可信来源自动派生：skill 节点取自候选卡片声明的 outputs（搜索类 Skill 通常为 "searchResults"/"results"），llm_operation 节点恒为 { markdown_content: "markdown_content" }。LLM 声明的 outputContract 一律被丢弃，无法影响最终计划。
9. 【关键】finalOutputs[i].expectedType 必须与上游节点实际输出字段的系统类型标签一致。合法取值为：
   - "artifact_ref"：文件产物节点（supportsArtifactOutput=true 的 skill）
   - "markdown_content"：llm_operation 汇总节点
   - "news_item_list"：搜索节点的列表类结果
   严禁使用 "text"、"string"、"content"、"data" 等非系统定义类型标签。

【候选 Skill 能力卡片】:
${JSON.stringify(skillCards, null, 2)}

【候选 LLM 操作卡片】:
${JSON.stringify(llmOperationCards, null, 2)}

【目标输出 JSON Schema 示例 A：搜索 + 汇总（纯文本摘要，不生成文件）】:
{
  "schemaVersion": "deterministic-plan/v1",
  "plannerVersion": "v1",
  "catalogVersion": "v1",
  "planType": "sequential",
  "objective": "搜索最新股票情报并汇总",
  "originalRequest": "查询最新的股票情报然后进行总结",
  "status": "draft",
  "nodes": [
    {
      "nodeId": "search_stock_step",
      "sequence": 1,
      "title": "搜索股票情报",
      "kind": "skill",
      "skillId": "<PUBLISHED_SKILL_ID_FROM_CARDS>",
      "skillVersion": "<EXECUTABLE_VERSION_FROM_CARDS>",
      "runtimeType": "workflow",
      "dependsOn": [],
      "inputBindings": {
        "query": { "source": "literal", "value": "最新股票行情情报" }
      },
      "failurePolicy": "abort"
    },
    {
      "nodeId": "summarize_stocks",
      "sequence": 2,
      "title": "汇总股票情报",
      "kind": "llm_operation",
      "operationId": "summarize_list",
      "promptTemplateId": "news-summary",
      "promptTemplateVersion": "1",
      "modelPolicyId": "task-default",
      "temperature": 0,
      "maxInputTokens": 4000,
      "maxOutputTokens": 2000,
      "dependsOn": ["search_stock_step"],
      "inputBindings": {
        "items": { "source": "node_output", "nodeId": "search_stock_step", "path": "results" }
      },
      "failurePolicy": "abort"
    }
  ],
  "finalOutputs": [
    {
      "targetField": "markdown_content",
      "fromNodeId": "summarize_stocks",
      "fromNodeOutput": "markdown_content",
      "expectedType": "markdown_content"
    }
  ]
}

【目标输出 JSON Schema 示例 B：搜索 + 汇总 + 生成文件】:
{
  "schemaVersion": "deterministic-plan/v1",
  "plannerVersion": "v1",
  "catalogVersion": "v1",
  "planType": "sequential",
  "objective": "简短目标说明",
  "originalRequest": "原始请求",
  "status": "draft",
  "nodes": [
    {
      "nodeId": "search_step",
      "sequence": 1,
      "title": "搜索内容",
      "kind": "skill",
      "skillId": "<PUBLISHED_SKILL_ID_FROM_CARDS>",
      "skillVersion": "<EXECUTABLE_VERSION_FROM_CARDS>",
      "runtimeType": "workflow",
      "dependsOn": [],
      "inputBindings": {
        "query": { "source": "literal", "value": "..." }
      },
      "failurePolicy": "abort"
    },
    {
      "nodeId": "summarize_step",
      "sequence": 2,
      "title": "总结内容",
      "kind": "llm_operation",
      "operationId": "summarize_list",
      "promptTemplateId": "news-summary",
      "promptTemplateVersion": "1",
      "modelPolicyId": "task-default",
      "temperature": 0,
      "maxInputTokens": 4000,
      "maxOutputTokens": 2000,
      "dependsOn": ["search_step"],
      "inputBindings": {
        "items": { "source": "node_output", "nodeId": "search_step", "path": "results" }
      },
      "failurePolicy": "abort"
    },
    {
      "nodeId": "write_artifact_step",
      "sequence": 3,
      "title": "生成文件产物",
      "kind": "skill",
      "skillId": "<ARTIFACT_SKILL_PUBLISHED_ID_FROM_CARDS>",
      "skillVersion": "<ARTIFACT_SKILL_EXECUTABLE_VERSION_FROM_CARDS>",
      "runtimeType": "artifact",
      "dependsOn": ["summarize_step"],
      "inputBindings": {
        "content": { "source": "node_output", "nodeId": "summarize_step", "path": "markdown_content" },
        "fileName": { "source": "literal", "value": "result.md" }
      },
      "failurePolicy": "abort"
    }
  ],
  "finalOutputs": [
    {
      "targetField": "artifact",
      "fromNodeId": "write_artifact_step",
      "fromNodeOutput": "artifact",
      "expectedType": "artifact_ref",
      "mimeType": "text/markdown",
      "isArtifact": true
    }
  ]
}`;
  }

  private parseAndValidatePlanJson(
    rawText: string,
    originalRequest: string,
    skillCards: CompactCapabilityCardV1[],
    requiresArtifactOutput: boolean,
  ): DeterministicPlanDraftV1 {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json/i, '').replace(/```$/i, '').trim();
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```/i, '').replace(/```$/i, '').trim();
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error('Failed to parse JSON structure from LLM plan response');
      }
    }

    if (parsed.schemaVersion !== 'deterministic-plan/v1') {
      this.logger.warn(`Plan schemaVersion '${parsed.schemaVersion}' invalid, setting to 'deterministic-plan/v1'`);
      parsed.schemaVersion = 'deterministic-plan/v1';
    }
    parsed.originalRequest = originalRequest;
    parsed.status = 'draft';

    // Strictly validate Skill nodes against available candidate cards
    if (Array.isArray(parsed.nodes)) {
      for (const node of parsed.nodes) {
        if (node.kind === 'skill') {
          const card = skillCards.find(
            (c) =>
              c.publishedSkillId === node.skillId ||
              c.id === node.skillId ||
              c.displayName === node.skillId ||
              c.displayName === (node as any).capabilityKey ||
              c.id === (node as any).capabilityKey,
          );

          if (!card) {
            const err: any = new Error(`Planner generated unknown skillId '${node.skillId}' not present in candidate skill cards`);
            err.code = 'CAPABILITY_NOT_FOUND';
            throw err;
          }

          if (card.executableVersion && node.skillVersion !== card.executableVersion) {
            this.logger.log(`Aligning skillVersion for '${node.skillId}' from '${node.skillVersion}' to published executableVersion '${card.executableVersion}'`);
            node.skillVersion = card.executableVersion;
          }
          if (card.publishedSkillId) {
            node.skillId = card.publishedSkillId;
          } else if (card.id) {
            node.skillId = card.id;
          }
          if (card.displayName) {
            (node as any).capabilityKey = card.displayName;
          }
          if (card.category) {
            node.runtimeType = card.category;
          }
          if (card.executionRuntimeType) {
            (node as any).executionRuntimeType = card.executionRuntimeType;
          }
          if (card.supportsArtifactOutput) {
            (node as any).supportsArtifact = true;
          }
          this.normalizeSkillOutputContract(node, card);
          this.removeSensitiveInputBindings(node.inputBindings);
          this.validateAndNormalizeInputBindingEnums(node.inputBindings, card);
        } else if (node.kind === 'llm_operation') {
          const tmpl = LLM_OPERATION_TEMPLATES[node.operationId as keyof typeof LLM_OPERATION_TEMPLATES];
          if (tmpl) {
            // Enforce canonical promptTemplateId/version/modelPolicyId from the registry,
            // ignoring whatever the LLM hallucinated.
            node.promptTemplateId = tmpl.promptTemplateId;
            node.promptTemplateVersion = tmpl.version;
            node.modelPolicyId = tmpl.modelPolicyId;
            node.temperature = tmpl.temperature;
            node.maxInputTokens = tmpl.maxInputTokens;
            node.maxOutputTokens = tmpl.maxOutputTokens;
          }
          // Normalize llm_operation outputContract: only allow well-known output field names.
          // LLMs frequently hallucinate field names like "summary", "content", "text" for
          // what should always be "markdown_content".
          this.normalizeLlmOperationOutputContract(node);
        }
      }
    }

    // After normalizing all node outputContracts, align finalOutputs.expectedType so that
    // it always matches the actual declared type in the producer node's outputContract.
    // This prevents the FINAL_OUTPUT_UNSATISFIED type-mismatch error at validation time.
    this.alignFinalOutputsExpectedType(parsed);

    // Align node_output inputBinding paths to the actual key present in the upstream
    // node's (already-normalized) outputContract.
    // Background: different search Skills register their output field under different names
    // ("results", "searchResults", "news_item_list"). The LLM learns from the example in
    // the system prompt that the path is "results", but after normalizeSkillOutputContract()
    // the actual key may be "searchResults". Without this alignment the static validator
    // raises INPUT_TYPE_MISMATCH because binding.path doesn't exist in outputContract.
    this.alignInputBindingPaths(parsed);

    if (requiresArtifactOutput) {
      this.assertPlanProducesArtifact(parsed, skillCards);
    }

    return parsed as DeterministicPlanDraftV1;
  }

  /**
   * Derive a Skill node's outputContract from the trusted candidate card's
   * declared `outputs` (fix ⑤). The LLM's own outputContract declaration is
   * DISCARDED — it can only hallucinate field names (e.g. `{"data": "string"}`
   * for a search skill that actually declares `{searchResults,
   * responseMetadata}`), which then fail runtime contract validation as
   * `missing expected output field '<hallucinated>'` even though the workflow
   * returned valid data under its real field names. The card is the only
   * trusted source for both field names and type tags.
   */
  private normalizeSkillOutputContract(node: any, card: any): void {
    if (!card?.outputs || typeof card.outputs !== 'object') {
      // Fail closed: the candidate card does not declare any authoritative
      // outputs, so any LLM-declared `outputContract` (e.g. `{data: "string"}`)
      // is unverifiable and would almost certainly fail the runtime contract
      // validator. Reject the plan with a clear error instead of silently
      // accepting a hallucinated contract.
      const llmFields =
        node.outputContract && typeof node.outputContract === 'object'
          ? Object.keys(node.outputContract)
          : [];
      if (llmFields.length > 0) {
        const err: any = new Error(
          `Planner generated outputContract ${JSON.stringify(node.outputContract)} for skill '${node.skillId || node.nodeId}' but the candidate card declares no outputs. ` +
            `Either the skill is missing outputSchema in the registry or the LLM hallucinated fields. ` +
            `Refusing to freeze the plan so the runtime does not silently fail on a phantom contract.`,
        );
        err.code = 'PLANNER_OUTPUT_INVALID';
        throw err;
      }
      return;
    }

    // Derived exclusively from the card — the LLM's type tags are untrusted.
    const canonical: Record<string, string> = {};
    for (const [fieldName, declaredType] of Object.entries(card.outputs)) {
      canonical[fieldName] = typeof declaredType === 'string' ? declaredType : 'string';
    }

    // Backward-compat: the search-alias type tag is what downstream consumers
    // (e.g. the scheduler's alias map) key off, so keep normalizing it.
    for (const fieldName of Object.keys(canonical)) {
      if (['searchResults', 'results', 'news_item_list'].includes(fieldName)) {
        canonical[fieldName] = 'news_item_list';
      }
    }

    node.outputContract = canonical;
  }

  /**
   * Derive an llm_operation node's outputContract (fix ⑤). The LLM's own
   * declaration is DISCARDED — an llm_operation node always exposes exactly
   * `{ markdown_content: "markdown_content" }` in this system. LLMs commonly
   * hallucinate field names like "summary", "content", "text", "result"; any
   * such declaration would fail FINAL_OUTPUT_UNSATISFIED validation later.
   */
  private normalizeLlmOperationOutputContract(node: any): void {
    const contract = node.outputContract;
    if (contract && typeof contract === 'object') {
      const unexpected = Object.keys(contract).filter((key) => key !== 'markdown_content');
      if (unexpected.length > 0) {
        this.logger.warn(
          `llm_operation node '${node.nodeId}' declared outputContract field(s) ${unexpected.join(', ')} — ` +
            `ignoring LLM-declared outputContract (fix ⑤, derived contract used instead)`,
        );
      }
    }
    node.outputContract = { markdown_content: 'markdown_content' };
  }

  /**
   * Align node_output inputBinding paths to the actual key present in the upstream
   * node's (already-normalized) outputContract.
   *
   * Problem: Different search Skills register their result field under different names
   * ("searchResults", "results", "news_item_list"). After normalizeSkillOutputContract()
   * the outputContract key reflects the real field name from the Skill's outputParams.
   * The LLM, however, always writes binding.path = "results" (from the system-prompt
   * example). When the real key is "searchResults", the static validator raises
   * INPUT_TYPE_MISMATCH because outputContract["results"] is undefined.
   *
   * Strategy: after all outputContracts are finalized, walk every node_output binding.
   * If its path is not found in the upstream outputContract but belongs to the
   * well-known search-alias set, replace it with the alias key that actually exists.
   */
  private alignInputBindingPaths(parsed: any): void {
    if (!Array.isArray(parsed.nodes)) return;
    const nodeById = new Map<string, any>(parsed.nodes.map((n: any) => [n.nodeId, n]));
    const SEARCH_ALIASES = new Set(['results', 'searchResults', 'news_item_list']);

    for (const node of parsed.nodes) {
      if (!node.inputBindings || typeof node.inputBindings !== 'object') continue;

      for (const [fieldName, binding] of Object.entries(node.inputBindings) as [string, any][]) {
        if (!binding || binding.source !== 'node_output') continue;

        const upstreamId = binding.nodeId || binding.fromNodeId || '';
        const upstreamNode = nodeById.get(upstreamId);
        if (!upstreamNode?.outputContract || typeof upstreamNode.outputContract !== 'object') continue;

        const outPath: string = binding.path || binding.outputPath || '';
        // Path is already correct — nothing to do.
        if (upstreamNode.outputContract[outPath] !== undefined) continue;

        // Path is a known search-result alias but the upstream contract uses a different one.
        if (SEARCH_ALIASES.has(outPath)) {
          const realKey = Object.keys(upstreamNode.outputContract).find((k) => SEARCH_ALIASES.has(k));
          if (realKey) {
            this.logger.warn(
              `Aligning inputBinding path '${outPath}' → '${realKey}' ` +
              `for field '${fieldName}' in node '${node.nodeId}' ` +
              `(upstream node '${upstreamId}' declares '${realKey}', not '${outPath}')`,
            );
            binding.path = realKey;
          }
        }
      }
    }
  }

  private alignFinalOutputsExpectedType(parsed: any): void {
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.finalOutputs)) {
      return;
    }

    const nodeById = new Map<string, any>(parsed.nodes.map((n: any) => [n.nodeId, n]));

    for (const output of parsed.finalOutputs) {
      if (!output || typeof output !== 'object') continue;

      const producerNode = nodeById.get(output.fromNodeId);
      if (!producerNode || !producerNode.outputContract) continue;

      const declaredType = producerNode.outputContract[output.fromNodeOutput];
      if (typeof declaredType !== 'string') continue;

      if (output.expectedType !== declaredType) {
        this.logger.warn(
          `finalOutput '${output.targetField}' expectedType '${output.expectedType}' ` +
          `mismatches node '${output.fromNodeId}' declared type '${declaredType}' — auto-aligning`,
        );
        output.expectedType = declaredType;
      }
    }
  }

  private requiresArtifactOutput(userRequest: string): boolean {
    const normalized = (userRequest || '').replace(/\s+/g, '').toLowerCase();
    return (
      normalized.includes('输出md') ||
      normalized.includes('生成md') ||
      normalized.includes('md文件') ||
      normalized.includes('markdown文件') ||
      normalized.includes('输出文件') ||
      normalized.includes('生成文件') ||
      normalized.includes('保存为') ||
      normalized.includes('导出')
    );
  }

  private removeSensitiveInputBindings(inputBindings?: Record<string, any>): void {
    if (!inputBindings || typeof inputBindings !== 'object') {
      return;
    }

    for (const fieldName of Object.keys(inputBindings)) {
      if (/token|secret|password|credential|authorization/i.test(fieldName)) {
        const binding = inputBindings[fieldName];
        if (binding?.source !== 'literal' || !binding?.value) {
          delete inputBindings[fieldName];
        }
      }
    }
  }

  /**
   * 校验 skill 节点 inputBindings 中的 enum literal 值。
   *
   * 背景：LLM 生成 plan JSON 时，常对带 enum 约束的参数输出截断/幻觉值
   * （例如把 topic='general' 输出成 'gene'），后处理若不校验，非法值会
   * 一路传到生成的 workflow activity，触发 "HTTP 400" 或
   * "Runtime output contract violation" 类运行时错误。
   *
   * 校验逻辑（对齐 ai-orchestrator param-enum-constraint 的语义）：
   * - 仅校验 source='literal' 且 value 为 string/number 的 binding
   * - 若 value 不在 enum 内：
   *   - enum 内有 defaultValue → 用 default 顶上（保留 binding，source 仍为 literal）
   *   - 无 defaultValue → 丢弃该 binding（参数走 missing/required 流程，比传非法值安全）
   *   - 非 enum 参数、无 enum 信息 → 放行
   */
  private validateAndNormalizeInputBindingEnums(
    inputBindings: Record<string, any> | undefined,
    card: CompactCapabilityCardV1,
  ): void {
    if (!inputBindings || typeof inputBindings !== 'object') {
      return;
    }
    const cardInputs = card.inputs;
    if (!cardInputs || typeof cardInputs !== 'object') {
      return;
    }

    for (const fieldName of Object.keys(inputBindings)) {
      const binding = inputBindings[fieldName];
      if (!binding || binding.source !== 'literal') {
        continue;
      }
      const rawValue = binding.value;
      if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
        continue;
      }

      const schemaSummary = cardInputs[fieldName];
      if (typeof schemaSummary !== 'string' || schemaSummary.length === 0) {
        continue;
      }
      const decoded = CapabilityCandidateSelectorService.decodeSchemaSummaryEnum(schemaSummary);
      const enumValues = decoded.enumValues;
      if (!enumValues || enumValues.length === 0) {
        continue;
      }

      const isAllowed =
        (typeof rawValue === 'string' || typeof rawValue === 'number') &&
        enumValues.some((candidate) => candidate === rawValue);
      if (isAllowed) {
        continue;
      }

      // LLM 输出了非法 enum literal。按设计规范 §9.2 决策树：优先用 defaultValue 顶上；无 default 则拒绝冻结并抛出 INVALID_ENUM_LITERAL。
      const defaultValue = decoded.defaultValue;
      if (defaultValue !== undefined && enumValues.includes(defaultValue)) {
        this.logger.warn(
          `Plan inputBindings.${fieldName} literal '${rawValue}' not in enum [${enumValues.join(',')}], replaced with defaultValue '${defaultValue}' (skill ${card.id})`,
        );
        binding.value = defaultValue;
      } else {
        const msg = `Plan inputBindings.${fieldName} literal '${rawValue}' is invalid for enum [${enumValues.join(',')}] and has no default value`;
        this.logger.error(msg);
        throw new BadRequestException({
          code: ERROR_CODES.INVALID_ENUM_LITERAL,
          message: msg,
          nodeId: card.id,
          field: fieldName,
        });
      }
    }
  }

  private assertPlanProducesArtifact(
    parsed: any,
    skillCards: CompactCapabilityCardV1[],
  ): void {
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const finalOutputs = Array.isArray(parsed.finalOutputs) ? parsed.finalOutputs : [];
    const nodeById = new Map(nodes.map((node: any) => [node.nodeId, node]));

    const artifactOutput = finalOutputs.find(
      (output: any) => output?.isArtifact === true || output?.expectedType === 'artifact_ref',
    );

    if (!artifactOutput) {
      const err: any = new Error('用户要求生成文件，但 planner 未声明 artifact_ref 类型的最终产物');
      err.code = 'FINAL_OUTPUT_UNSATISFIED';
      throw err;
    }

    const producerNode: any = nodeById.get(artifactOutput.fromNodeId);
    if (!producerNode || producerNode.kind !== 'skill') {
      const err: any = new Error('用户要求生成文件，但最终产物不是由 artifact Skill 节点生成');
      err.code = 'FINAL_OUTPUT_UNSATISFIED';
      throw err;
    }

    const producerCard = skillCards.find(
      (card) =>
        card.publishedSkillId === producerNode.skillId ||
        card.id === producerNode.skillId ||
        card.displayName === producerNode.capabilityKey ||
        card.displayName === producerNode.skillId ||
        card.id === producerNode.capabilityKey,
    );
    const isArtifactProducerNode =
      producerCard?.supportsArtifactOutput ||
      producerNode.capabilityKey === 'markdown_artifact_writer' ||
      producerNode.skillId === 'markdown_artifact_writer' ||
      producerNode.capabilityKey === 'platform.document.markdown-artifact-writer' ||
      producerNode.skillId === 'platform.document.markdown-artifact-writer' ||
      (typeof producerNode.skillId === 'string' && producerNode.skillId.startsWith('platform.'));

    if (!isArtifactProducerNode) {
      const err: any = new Error(`最终节点 '${producerNode.nodeId}' 不是可生成文件产物的 Skill`);
      err.code = 'FINAL_OUTPUT_UNSATISFIED';
      throw err;
    }
  }
}
