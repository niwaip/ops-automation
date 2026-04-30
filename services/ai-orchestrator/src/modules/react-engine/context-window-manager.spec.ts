import { ContextWindowManager } from './context-window-manager';
import { buildUserPrompt } from './prompt-builder';
import { ChatMessage, ReActState } from './interfaces';

describe('ContextWindowManager', () => {
  it('clips long observations before they are written into ReAct history', () => {
    const manager = new ContextWindowManager();
    const longObservation = `result:${'x'.repeat(3000)}`;

    const record = manager.buildObservationRecord(longObservation);

    expect(record.content.startsWith('Observation:')).toBe(true);
    expect(record.content.length).toBeLessThan(longObservation.length);
    expect(record.meta.truncated).toBe(true);
  });

  it('compacts overflowing ReAct history into context summary', () => {
    const manager = new ContextWindowManager();
    const state: ReActState = {
      thought: '',
      action: '',
      actionInput: {},
      observation: '',
      iteration: 8,
      maxIterations: 10,
      isFinished: false,
    };

    const history: ChatMessage[] = Array.from({ length: 16 }, (_, index) => ({
      role: index % 2 === 0 ? 'assistant' : 'user',
      content: index % 2 === 0
        ? JSON.stringify({ thought: `t${index}`, action: `a${index}`, actionInput: {} })
        : `Observation: obs-${index}`,
      timestamp: new Date(),
      metadata: {
        isReAct: true,
        iteration: index + 1,
        routing: {
          modelId: index < 8 ? 'primary-model' : 'backup-model',
          attemptedModelIds: index < 8 ? ['primary-model'] : ['primary-model', 'backup-model'],
          routingReason: index < 8 ? 'resolved_default_model' : 'provider_error',
        },
        decisionContext: {
          routing: {
            modelId: index < 8 ? 'primary-model' : 'backup-model',
            attemptedModelIds: index < 8 ? ['primary-model'] : ['primary-model', 'backup-model'],
            routingReason: index < 8 ? 'resolved_default_model' : 'provider_error',
          },
          promptAssembly: {
            systemPromptSectionKeys: ['system_policy', 'tool_spec'],
            userPromptSectionKeys: ['task_input', 'routing_state', 'prompt_assembly_state', 'execution_request'],
          },
        },
      },
    }));

    const compacted = manager.compactReActHistory(state, history);

    expect(compacted.length).toBeLessThan(history.length);
    expect(state.contextSummary).toContain('assistant');
    expect(state.contextSummary).toContain('user');
    expect(state.contextSummary).toContain('decision.routing: model=primary-model');
    expect(state.contextSummary).toContain('decision.prompt_assembly: systemSections=system_policy>tool_spec');
    expect(state.contextSummary).toContain('content:');
  });

  it('injects task summary and routing summary into user prompt', () => {
    const prompt = buildUserPrompt(
      '继续执行',
      [],
      undefined,
      'assistant@#1: 已完成模板选择',
      {
        routingState: 'model=backup-model, attempted=primary-model->backup-model, reason=provider_error',
        promptAssemblyState: 'systemSections=system_policy>tool_spec',
      },
    );

    expect(prompt).toContain('## Task Summary');
    expect(prompt).toContain('已完成模板选择');
    expect(prompt).toContain('## Routing State');
    expect(prompt).toContain('backup-model');
    expect(prompt).toContain('## Prompt Assembly State');
    expect(prompt).toContain('tool_spec');
  });
});
