import { BuiltinActivityRegistry } from '../src/modules/temporal-workflow/builtin-activity.registry';
import { buildDeterministicWorkflowCodeForWorkflow } from '../src/modules/temporal-workflow/temporal-workflow-deterministic-builder';
import { TemporalWorkflowNormalizationService } from '../src/modules/temporal-workflow/temporal-workflow-normalization.service';
import { TemporalWorkflowConfigService } from '../src/workflow-registry/workflow-template/temporal-workflow-config.service';

describe('Activity Plugin deterministic workflow compilation', () => {
  it('compiles HTTP to fixed Transform when instruction is empty and mappings are explicit', () => {
    const builtinRegistry = new BuiltinActivityRegistry();
    const workflowConfigService = new TemporalWorkflowConfigService();
    const workflowNormalizationService = new TemporalWorkflowNormalizationService(
      {} as any,
      builtinRegistry
    );
    const http = builtinRegistry.getByRef('builtin:httpRequest')!;
    const transform = builtinRegistry.getByRef('builtin:structuredTransform')!;

    const code = buildDeterministicWorkflowCodeForWorkflow(
      {
        name: 'NewsSummaryWorkflow',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: { keyword: { required: true, defaultValue: '' } },
        steps: [
          {
            id: 'search',
            type: 'activity',
            activityRef: http.ref,
            activityName: http.fn,
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://news.example.test/search',
                queryTemplate: { q: '{keyword}' },
                timeout: 30,
                responseMode: 'body',
              },
            },
          },
          {
            id: 'project',
            type: 'activity',
            activityRef: transform.ref,
            activityName: transform.fn,
            input: {
              __structuredTransform: {
                contentType: 'json',
                contentTemplate: '{content}',
                instructionTemplate: '',
                outputMode: 'json',
                fieldMappings: { title: 'items.0.title', url: 'items.0.url' },
              },
            },
          },
        ],
      } as any,
      { activities: [http, transform] } as any,
      { builtinActivityRegistry: builtinRegistry, workflowConfigService, workflowNormalizationService }
    );

    expect(code).toBeTruthy();
    expect(code).toContain('class NewsSummaryWorkflowWorkflow:');
    expect(code).toContain('async def httpRequest');
    expect(code).toContain('async def structuredTransform');
    expect(code).toContain('"fieldMappings": {');
  });
});
