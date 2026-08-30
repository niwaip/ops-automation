import { ExecutionPlanningService } from '../src/modules/execution/step-runner/planning/execution-planning.service';

describe('ExecutionPlanningService recorder composition lookup', () => {
  it('reads composition only from a published browser recording snapshot', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{
        source_type: 'browser_recording',
        release_version: 7,
        source_payload_json: {
          runtimeMetadata: {
            composition: {
              outputDeclarations: [{ name: 'page_content' }],
              postProcessingSteps: [{ id: 'summary' }],
            },
            executionPlan: { outputs: [{ name: 'browserRunOutput' }, { name: 'page_content' }] },
          },
        },
      }]),
    };
    const service = new ExecutionPlanningService(prisma as any, {} as any);

    await expect(service.loadPublishedRecorderComposition('browser-skill', '7')).resolves.toEqual({
      skillVersion: '7',
      outputNames: ['browserRunOutput', 'page_content'],
      composition: expect.objectContaining({ postProcessingSteps: [{ id: 'summary' }] }),
    });
  });

  it('does not infer composition for an ordinary skill', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ source_type: 'workflow', release_version: 1 }]),
    };
    const service = new ExecutionPlanningService(prisma as any, {} as any);
    await expect(service.loadPublishedRecorderComposition('workflow-skill')).resolves.toBeUndefined();
  });

  it('accepts the legacy apiEndpoints metadata location for already published snapshots', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{
        source_type: 'browser_recording',
        release_version: 3,
        source_payload_json: {
          apiEndpoints: {
            runtimeMetadata: {
              composition: { postProcessingSteps: [{ id: 'report' }] },
              executionPlan: { outputs: [{ name: 'browserRunOutput' }] },
            },
          },
        },
      }]),
    };
    const service = new ExecutionPlanningService(prisma as any, {} as any);

    await expect(service.loadPublishedRecorderComposition('legacy-browser-skill')).resolves.toEqual({
      skillVersion: '3',
      outputNames: ['browserRunOutput'],
      composition: expect.objectContaining({ postProcessingSteps: [{ id: 'report' }] }),
    });
  });
});
