import {
  buildDecisionContextPromptSummary,
  extractLatestDecisionContextFromSummary,
} from './decision-context-summary';

describe('decision-context-summary', () => {
  it('builds prompt summary with the same compact structure used by history trace lines', () => {
    const summary = buildDecisionContextPromptSummary({
      routing: {
        modelId: 'backup-model',
        attemptedModelIds: ['primary-model', 'backup-model'],
        routingReason: 'provider_error',
      },
      promptAssembly: {
        systemPromptSectionKeys: ['system_policy', 'tool_spec'],
        userPromptSectionKeys: ['task_input', 'routing_state', 'execution_request'],
      },
    });

    expect(summary).toEqual({
      routingState:
        'model=backup-model, attempted=primary-model->backup-model, reason=provider_error',
      promptAssemblyState:
        'systemSections=system_policy>tool_spec, userSections=task_input>routing_state>execution_request',
    });
  });

  it('extracts the latest routing and prompt assembly state from context summary', () => {
    const summary = extractLatestDecisionContextFromSummary(
      [
        'assistant@#1',
        'decision.routing: model=primary-model, attempted=primary-model, reason=resolved_default_model',
        'decision.prompt_assembly: systemSections=system_policy>tool_spec, userSections=task_input>execution_request',
        'content: {"thought":"t1"}',
        '',
        'assistant@#2',
        'decision.routing: model=backup-model, attempted=primary-model->backup-model, reason=provider_error',
        'decision.prompt_assembly: systemSections=system_policy>tool_spec, userSections=task_input>routing_state>execution_request',
        'content: {"thought":"t2"}',
      ].join('\n')
    );

    expect(summary).toEqual({
      routingState:
        'model=backup-model, attempted=primary-model->backup-model, reason=provider_error',
      promptAssemblyState:
        'systemSections=system_policy>tool_spec, userSections=task_input>routing_state>execution_request',
    });
  });
});
