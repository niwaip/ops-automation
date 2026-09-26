import { attachCompletionClaims } from './completion-claim-plan';
import type { DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';
import type { MatchedRecipe } from '../topology/deterministic-recipe-matcher.service';

describe('attachCompletionClaims', () => {
  it('correctly maps claims when plan nodes align 1:1 with recipe steps', () => {
    const plan: DeterministicPlanDraftV1 = {
      schemaVersion: 'deterministic-plan/v1',
      catalogVersion: '1.0.0',
      plannerVersion: '2.1.0',
      planType: 'sequential',
      objective: '搜索并总结输出 md',
      status: 'draft',
      originalRequest: '搜索并总结输出 md',
      nodes: [
        {
          nodeId: 'n1_search',
          title: '搜索',
          sequence: 1,
          kind: 'skill',
          skillId: 'platform.search.web',
          skillVersion: '1.0.0',
          runtimeType: 'workflow',
          dependsOn: [],
          inputBindings: {},
          outputContract: {},
          failurePolicy: 'abort',
        },
        {
          nodeId: 'n2_summarize',
          title: '总结',
          sequence: 2,
          kind: 'llm_operation',
          operationId: 'summarize_list',
          operationVersion: '1.0.0',
          operationDigest: 'd1',
          contractDigest: 'c1',
          dependsOn: ['n1_search'],
          inputBindings: {},
          outputContract: {},
          failurePolicy: 'abort',
        },
        {
          nodeId: 'n3_markdown',
          title: '输出 Markdown',
          sequence: 3,
          kind: 'skill',
          skillId: 'platform.document.markdown-artifact-writer',
          skillVersion: '1.0.0',
          runtimeType: 'artifact',
          dependsOn: ['n2_summarize'],
          inputBindings: {},
          outputContract: {},
          failurePolicy: 'abort',
        },
      ],
      finalOutputs: [
        {
          targetField: 'result',
          expectedType: 'artifact_ref',
          fromNodeId: 'n3_markdown',
          fromNodeOutput: 'artifact',
          isArtifact: true,
        },
      ],
      requirements: { externalData: true },
    };

    const recipe: MatchedRecipe = {
      recipeName: 'search_summarize_write_markdown',
      objective: '搜索并总结输出 md',
      steps: [
        { ref: 'n1', kind: 'skill', role: 'search', dependsOn: [] },
        { ref: 'n2', kind: 'llm_operation', role: 'summarize', dependsOn: ['n1'] },
        { ref: 'n3', kind: 'skill', role: 'markdown_writer', dependsOn: ['n2'] },
      ],
      finalNodeRef: 'n3',
      requiresExternalData: true,
    };

    attachCompletionClaims(plan, recipe);

    const claims = (plan as any).completionClaims;
    expect(claims).toHaveLength(3);
    expect(claims).toEqual([
      {
        claim: 'search_results_produced',
        producerNodeId: 'n1_search',
        evidenceType: 'schema',
      },
      {
        claim: 'summary_generated',
        producerNodeId: 'n2_summarize',
        evidenceType: 'schema',
      },
      {
        claim: 'markdown_artifact_created',
        producerNodeId: 'n3_markdown',
        evidenceType: 'artifact',
      },
    ]);
  });

  it('correctly maps terminal artifact claim to final output node when adapter is auto-inserted', () => {
    const plan: DeterministicPlanDraftV1 = {
      schemaVersion: 'deterministic-plan/v1',
      catalogVersion: '1.0.0',
      plannerVersion: '2.1.0',
      planType: 'sequential',
      objective: '搜索并生成文件',
      status: 'draft',
      originalRequest: '搜索并生成文件',
      nodes: [
        {
          nodeId: 'n1_search',
          title: '搜索',
          sequence: 1,
          kind: 'skill',
          skillId: 'platform.search.web',
          skillVersion: '1.0.0',
          runtimeType: 'workflow',
          dependsOn: [],
          inputBindings: {},
          outputContract: {},
          failurePolicy: 'abort',
        },
        {
          nodeId: 'n2_summarize',
          title: '总结',
          sequence: 2,
          kind: 'llm_operation',
          operationId: 'summarize_list',
          operationVersion: '1.0.0',
          operationDigest: 'd1',
          contractDigest: 'c1',
          dependsOn: ['n1_search'],
          inputBindings: {},
          outputContract: {},
          failurePolicy: 'abort',
        },
        {
          nodeId: 'n3_format_blocks',
          title: '文档排版',
          sequence: 3,
          kind: 'llm_operation',
          operationId: 'format_document_blocks',
          operationVersion: '1.0.0',
          operationDigest: 'd2',
          contractDigest: 'c2',
          dependsOn: ['n2_summarize'],
          inputBindings: {},
          outputContract: {},
          failurePolicy: 'abort',
        },
        {
          nodeId: 'n4_terminal_writer',
          title: '生成产物',
          sequence: 4,
          kind: 'skill',
          skillId: 'platform.document.markdown-artifact-writer',
          skillVersion: '1.0.0',
          runtimeType: 'artifact',
          dependsOn: ['n3_format_blocks'],
          inputBindings: {},
          outputContract: {},
          failurePolicy: 'abort',
        },
      ],
      finalOutputs: [
        {
          targetField: 'result',
          expectedType: 'artifact_ref',
          fromNodeId: 'n4_terminal_writer',
          fromNodeOutput: 'artifact',
          isArtifact: true,
        },
      ],
      requirements: { externalData: true },
    };

    const recipe: MatchedRecipe = {
      recipeName: 'search_summarize_write_markdown',
      objective: '搜索并生成文件',
      steps: [
        { ref: 'n1', kind: 'skill', role: 'search', dependsOn: [] },
        { ref: 'n2', kind: 'llm_operation', role: 'summarize', dependsOn: ['n1'] },
        { ref: 'n3', kind: 'skill', role: 'markdown_writer', dependsOn: ['n2'] },
      ],
      finalNodeRef: 'n3',
      requiresExternalData: true,
    };

    attachCompletionClaims(plan, recipe);

    const claims = (plan as any).completionClaims;
    expect(claims).toHaveLength(3);
    expect(claims[0]).toMatchObject({
      claim: 'search_results_produced',
      producerNodeId: 'n1_search',
    });
    expect(claims[1]).toMatchObject({
      claim: 'summary_generated',
      producerNodeId: 'n2_summarize',
    });
    // Crucially: terminal claim must map to n4_terminal_writer, NOT n3_format_blocks!
    expect(claims[2]).toMatchObject({
      claim: 'markdown_artifact_created',
      producerNodeId: 'n4_terminal_writer',
      evidenceType: 'artifact',
    });
  });
});
