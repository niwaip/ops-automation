import { TaskCommandResolverService } from './task-command-resolver.service';
import type { EffectiveTaskPolicySnapshot } from './task-policy.types';

describe('TaskCommandResolverService', () => {
  const resolver = new TaskCommandResolverService();
  const policy: EffectiveTaskPolicySnapshot = {
    schemaVersion: 'effective-task-policy/v1',
    digest: 'test',
    sourcePolicies: [],
    aliases: [
      { canonicalCommand: 'web_extract', alias: '打开网页', matchType: 'phrase', weight: 100 },
      { canonicalCommand: 'summarize', alias: '总结', matchType: 'phrase', weight: 100 },
    ],
    recipes: [
      {
        recipeKey: 'web_extract_then_summarize',
        version: '1.0.0',
        name: '打开网页并总结',
        requiredCommandsJson: ['web_extract', 'summarize'],
        optionalCommandsJson: [],
        triggerJson: {},
        stepsJson: [
          { ref: 'n1', kind: 'skill', role: 'web_extract', dependsOn: [] },
          { ref: 'n2', kind: 'llm_operation', role: 'summarize', dependsOn: ['n1'] },
        ],
        bindingsJson: [],
        completionClaimsJson: ['webpage_content_extracted', 'summary_generated'],
        riskLevel: 'low',
      },
    ],
    bindings: [],
  };

  it('resolves punctuation and whitespace separated commands as one fixed recipe', () => {
    const recipe = resolver.matchRecipe('打开网页，然后进行总结', policy);

    expect(recipe).toMatchObject({
      source: 'policy',
      recipeName: 'web_extract_then_summarize',
      finalNodeRef: 'n2',
      completionClaims: ['webpage_content_extracted', 'summary_generated'],
      steps: [
        { ref: 'n1', role: 'web_extract' },
        { ref: 'n2', role: 'summarize', dependsOn: ['n1'] },
      ],
    });
  });

  it('does not partially dispatch a recipe when a required command is missing', () => {
    expect(resolver.matchRecipe('打开网页', policy)).toBeNull();
  });
});
