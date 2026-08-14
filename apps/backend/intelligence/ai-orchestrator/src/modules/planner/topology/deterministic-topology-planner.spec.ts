import { RoutingCapabilityCardProjector } from '../candidate-selection/routing-capability-card.projector';
import { DeterministicTopologyValidatorService } from './deterministic-topology-validator.service';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';

describe('Phase 2 Topology Projector & Validator', () => {
  const projector = new RoutingCapabilityCardProjector();
  const validator = new DeterministicTopologyValidatorService();

  const mockSkillCards: CompactCapabilityCardV1[] = [
    {
      id: 'platform.web_search',
      kind: 'skill',
      displayName: 'Web Search',
      summary: '网页搜索技能',
      goals: ['workflow', 'Web Search'],
      inputs: { query: 'string' },
      outputs: { searchResults: 'news_item_list' },
      category: 'workflow',
      supportsArtifactOutput: false,
      publishedSkillId: 'platform.web_search',
      executableVersion: '1.0.0',
    },
    {
      id: 'platform.markdown_writer',
      kind: 'skill',
      displayName: 'Markdown Writer',
      summary: '生成 Markdown 文件',
      goals: ['artifact', 'Markdown Writer'],
      inputs: { content: 'string', fileName: 'string' },
      outputs: { artifact_ref: 'artifact_ref' },
      category: 'artifact',
      supportsArtifactOutput: true,
      publishedSkillId: 'platform.markdown_writer',
      executableVersion: '1.0.0',
    },
  ];

  const mockLlmOpCards: CompactCapabilityCardV1[] = [
    {
      id: 'summarize_list',
      kind: 'llm_operation',
      displayName: 'Summarize List',
      summary: '列表文本总结',
      goals: ['llm_operation'],
      inputs: { items: 'news_item_list' },
      outputs: { summary: 'markdown_content' },
      executableVersion: '1.0.0',
    },
  ];

  it('projects compact capability cards into routing cards with short keys (s0, o0)', () => {
    const { routingCards, aliasMap } = projector.projectCandidateCards(mockSkillCards, mockLlmOpCards);

    expect(routingCards).toHaveLength(3);
    expect(routingCards[0]?.key).toBe('s0');
    expect(routingCards[0]?.displayName).toBe('Web Search');
    expect(routingCards[0]?.accepts).toEqual(['query']);
    expect(routingCards[0]?.produces).toEqual(['searchResults']);

    expect(routingCards[2]?.key).toBe('o0');
    expect(routingCards[2]?.displayName).toBe('Summarize List');

    expect(aliasMap.has('s0')).toBe(true);
    expect(aliasMap.has('platform.web_search')).toBe(true);
  });

  it('validates correct topology draft', () => {
    const { aliasMap } = projector.projectCandidateCards(mockSkillCards, mockLlmOpCards);

    const validTopology = {
      schemaVersion: 'deterministic-topology/v1',
      objective: '测试总结与文件生成',
      matchDecision: 'matched',
      matchConfidence: 0.95,
      matchReason: '搜索、总结和文件输出能力完整覆盖请求',
      nodes: [
        { ref: 'n1', capabilityKey: 's0', dependsOn: [] },
        { ref: 'n2', capabilityKey: 'o0', dependsOn: ['n1'] },
        { ref: 'n3', capabilityKey: 's1', dependsOn: ['n2'] },
      ],
      finalNodeRef: 'n3',
      finalOutputKind: 'artifact',
    };

    const res = validator.validateTopology(validTopology, aliasMap);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects invalid topology (unknown key, forward dependency, artifact requirement mismatch)', () => {
    const { aliasMap } = projector.projectCandidateCards(mockSkillCards, mockLlmOpCards);

    // 1. Unknown key
    const unknownKeyTopology = {
      schemaVersion: 'deterministic-topology/v1',
      matchDecision: 'matched',
      matchConfidence: 0.95,
      matchReason: 'test',
      nodes: [{ ref: 'n1', capabilityKey: 's999', dependsOn: [] }],
      finalNodeRef: 'n1',
      finalOutputKind: 'value',
    };
    expect(validator.validateTopology(unknownKeyTopology, aliasMap).valid).toBe(false);

    // 2. Forward dependency (n1 depends on n2)
    const forwardDepTopology = {
      schemaVersion: 'deterministic-topology/v1',
      matchDecision: 'matched',
      matchConfidence: 0.95,
      matchReason: 'test',
      nodes: [
        { ref: 'n1', capabilityKey: 's0', dependsOn: ['n2'] },
        { ref: 'n2', capabilityKey: 'o0', dependsOn: [] },
      ],
      finalNodeRef: 'n2',
      finalOutputKind: 'value',
    };
    expect(validator.validateTopology(forwardDepTopology, aliasMap).valid).toBe(false);

    // 3. Artifact output requirement unsatisfied (final node s0 does not support artifact output)
    const artifactMismatchTopology = {
      schemaVersion: 'deterministic-topology/v1',
      matchDecision: 'matched',
      matchConfidence: 0.95,
      matchReason: 'test',
      nodes: [{ ref: 'n1', capabilityKey: 's0', dependsOn: [] }],
      finalNodeRef: 'n1',
      finalOutputKind: 'artifact',
    };
    const res = validator.validateTopology(artifactMismatchTopology, aliasMap);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('does not support artifact output');
  });

  it('accepts an explicit no_match decision without executable nodes', () => {
    const { aliasMap } = projector.projectCandidateCards(mockSkillCards, mockLlmOpCards);
    const result = validator.validateTopology(
      {
        schemaVersion: 'deterministic-topology/v1',
        objective: '查看今天的天气',
        matchDecision: 'no_match',
        matchConfidence: 0.5,
        matchReason: '没有专业天气 Skill，Web Search 只能间接检索天气',
        nodes: [],
        finalNodeRef: null,
        finalOutputKind: 'value',
      },
      aliasMap
    );

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rejects a low-confidence matched topology before parameter binding', () => {
    const { aliasMap } = projector.projectCandidateCards(mockSkillCards, mockLlmOpCards);
    const result = validator.validateTopology(
      {
        schemaVersion: 'deterministic-topology/v1',
        objective: '查看今天的天气',
        matchDecision: 'matched',
        matchConfidence: 0.5,
        matchReason: 'Web Search 是唯一接近的能力',
        nodes: [{ ref: 'n1', capabilityKey: 's0', dependsOn: [] }],
        finalNodeRef: 'n1',
        finalOutputKind: 'value',
      },
      aliasMap
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('matchConfidence 0.5 is below minimum 0.8');
  });
});
