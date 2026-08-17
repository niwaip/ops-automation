import { TemporalWorkflowArtifactValidationService } from '../src/workflow-registry/validation/temporal-workflow-artifact-validation.service';
import { TemporalWorkflowArtifactService } from '../src/workflow-registry/workflow-template/temporal-workflow-artifact.service';

describe('TemporalWorkflowArtifactValidationService', () => {
  it('persists validation evidence bound to the exact artifact', async () => {
    const existing = {
      id: 'workflow-1',
      name: 'WebSearchWorkflow',
      description: null,
      taskQueue: 'web-search-task-queue',
      workflowDsl: {
        name: 'WebSearchWorkflow',
        workflowClassName: 'WebSearchWorkflow',
        taskQueue: 'web-search-task-queue',
        steps: [],
      },
      activityDsl: { activities: [] },
      generatedCode: 'class WebSearchWorkflow: pass',
      artifactVersion: 3,
      artifactHash: 'sha256:artifact',
      validationStatus: 'generated',
      validationScore: 0,
      validationResultJson: null,
      validatedAt: null,
      isActive: false,
      deployedAt: null,
      createdAt: new Date('2026-08-06T00:00:00.000Z'),
      updatedAt: new Date('2026-08-06T00:00:00.000Z'),
    };
    let stored = existing as any;
    const prisma = {
      temporalWorkflow: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
        updateMany: jest.fn().mockImplementation(({ data }) => {
          stored = { ...stored, ...data };
          return Promise.resolve({ count: 1 });
        }),
      },
    };
    const validationFacade = {
      validateWorkflowReal: jest.fn().mockResolvedValue({
        success: true,
        logs: ['workflow completed'],
        result: { searchResults: [{ title: 'Temporal' }] },
        score: 100,
      }),
    };
    const artifactService = {
      repairWorkflowArtifactMetadataIfNeeded: jest.fn().mockResolvedValue(existing),
      computeArtifactHash: jest.fn().mockReturnValue(existing.artifactHash),
      getCurrentArtifactVersion: jest.fn().mockReturnValue(existing.artifactVersion),
    };
    const validationContractService = {
      normalizeInput: jest.fn((_: unknown, input: Record<string, unknown>) => ({ input })),
      validateResult: jest.fn().mockReturnValue({ success: true, errors: [] }),
    };
    const service = new TemporalWorkflowArtifactValidationService(
      prisma as any,
      validationFacade as any,
      artifactService as any,
      validationContractService as any
    );

    const response = await service.validateSavedWorkflowArtifact(
      existing.id,
      { query: 'Temporal news' },
      '60s'
    );

    expect(prisma.temporalWorkflow.updateMany).toHaveBeenCalledWith({
      where: {
        id: existing.id,
        artifactVersion: existing.artifactVersion,
        generatedCode: existing.generatedCode,
        updatedAt: existing.updatedAt,
      },
      data: expect.objectContaining({
        validationStatus: 'validated',
        validationScore: 100,
        validatedAt: expect.any(Date),
        validationResultJson: expect.objectContaining({
          artifactHash: existing.artifactHash,
          artifactVersion: existing.artifactVersion,
          workflowId: existing.id,
          workflowClassName: 'WebSearchWorkflow',
          success: true,
          score: 100,
          input: { query: 'Temporal news' },
          timeout: '60s',
          validatedAt: expect.any(String),
        }),
      }),
    });
    expect(response.workflow.validationResult).toEqual(
      expect.objectContaining({
        artifactHash: existing.artifactHash,
        workflowId: existing.id,
        success: true,
      })
    );
  });

  it('keeps failed validation failed, strips preview mode, and redacts persisted secrets', async () => {
    const existing = {
      id: 'workflow-2',
      name: 'WebSearchWorkflow',
      description: null,
      taskQueue: 'web-search-task-queue',
      workflowDsl: {
        name: 'WebSearchWorkflow',
        workflowClassName: 'WebSearchWorkflow',
        taskQueue: 'web-search-task-queue',
        steps: [],
      },
      activityDsl: { activities: [] },
      generatedCode: 'class WebSearchWorkflow: pass',
      artifactVersion: 4,
      artifactHash: 'sha256:artifact-2',
      validationStatus: 'generated',
      validationScore: 0,
      validationResultJson: null,
      validatedAt: null,
      isActive: false,
      deployedAt: null,
      createdAt: new Date('2026-08-09T00:00:00.000Z'),
      updatedAt: new Date('2026-08-09T00:00:00.000Z'),
    };
    let stored = existing as any;
    const prisma = {
      temporalWorkflow: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
        updateMany: jest.fn().mockImplementation(({ data }) => {
          stored = { ...stored, ...data };
          return Promise.resolve({ count: 1 });
        }),
      },
    };
    const validationFacade = {
      validateWorkflowReal: jest.fn().mockResolvedValue({
        success: false,
        logs: ['network failed'],
        error: 'Temporary failure in name resolution',
        score: 50,
      }),
    };
    const artifactService = {
      repairWorkflowArtifactMetadataIfNeeded: jest.fn().mockResolvedValue(existing),
      computeArtifactHash: jest.fn().mockReturnValue(existing.artifactHash),
      getCurrentArtifactVersion: jest.fn().mockReturnValue(existing.artifactVersion),
    };
    const validationContractService = {
      normalizeInput: jest.fn((_: unknown, input: Record<string, unknown>) => ({
        input: Object.fromEntries(
          Object.entries(input).filter(([key]) => key !== '__httpResponsePreview')
        ),
      })),
      validateResult: jest.fn().mockReturnValue({ success: true, errors: [] }),
    };
    const service = new TemporalWorkflowArtifactValidationService(
      prisma as any,
      validationFacade as any,
      artifactService as any,
      validationContractService as any
    );

    await service.validateSavedWorkflowArtifact(existing.id, {
      query: 'Temporal news',
      apiKey: 'secret-value',
      __httpResponsePreview: 'true',
    });

    expect(validationFacade.validateWorkflowReal).toHaveBeenCalledWith(
      existing.generatedCode,
      'WebSearchWorkflow',
      { query: 'Temporal news', apiKey: 'secret-value' },
      existing.taskQueue,
      undefined
    );
    expect(prisma.temporalWorkflow.updateMany).toHaveBeenCalledWith({
      where: {
        id: existing.id,
        artifactVersion: existing.artifactVersion,
        generatedCode: existing.generatedCode,
        updatedAt: existing.updatedAt,
      },
      data: expect.objectContaining({
        validationStatus: 'failed',
        validationScore: 50,
        validatedAt: null,
        validationResultJson: expect.objectContaining({
          success: false,
          input: { query: 'Temporal news', apiKey: '[REDACTED]' },
          attemptedAt: expect.any(String),
          validatedAt: null,
        }),
      }),
    });
  });

  it('does not persist validation evidence when the artifact changes during execution', async () => {
    const existing = {
      id: 'workflow-race',
      name: 'RaceWorkflow',
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: { workflowClassName: 'RaceWorkflow' },
      activityDsl: { activities: [] },
      generatedCode: 'class RaceWorkflow: pass\n',
      artifactVersion: 2,
      artifactHash: 'sha256:old',
      validationStatus: 'generated',
      validationScore: 0,
      validationResultJson: null,
      validatedAt: null,
      isActive: false,
      deployedAt: null,
      createdAt: new Date('2026-08-12T00:00:00.000Z'),
      updatedAt: new Date('2026-08-12T00:00:00.000Z'),
    };
    const prisma = {
      temporalWorkflow: {
        findUnique: jest.fn().mockResolvedValue(existing),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const validationFacade = {
      validateWorkflowReal: jest.fn().mockResolvedValue({
        success: true,
        logs: ['completed'],
        score: 100,
      }),
    };
    const artifactService = {
      repairWorkflowArtifactMetadataIfNeeded: jest.fn().mockResolvedValue(existing),
      computeArtifactHash: jest.fn().mockReturnValue('sha256:exact'),
      getCurrentArtifactVersion: jest.fn().mockReturnValue(2),
    };
    const validationContractService = {
      normalizeInput: jest.fn((_: unknown, input: Record<string, unknown>) => ({ input })),
      validateResult: jest.fn().mockReturnValue({ success: true, errors: [] }),
    };
    const service = new TemporalWorkflowArtifactValidationService(
      prisma as any,
      validationFacade as any,
      artifactService as any,
      validationContractService as any
    );

    await expect(service.validateSavedWorkflowArtifact(existing.id, {})).rejects.toThrow(
      '验证执行期间 Workflow 工件或定义已发生变化'
    );
  });
});

describe('TemporalWorkflowArtifactService legacy metadata repair', () => {
  it('does not turn a recorded failed validation into validated merely because validatedAt exists', async () => {
    const workflow = {
      id: 'workflow-failed',
      generatedCode: 'class FailedWorkflow: pass',
      artifactVersion: 1,
      artifactHash: null,
      validationStatus: 'failed',
      validationScore: 50,
      validationResultJson: { success: false, score: 50 },
      validatedAt: new Date('2026-08-09T00:00:00.000Z'),
      updatedAt: new Date('2026-08-09T00:00:00.000Z'),
    };
    const prisma = {
      temporalWorkflow: {
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...workflow, ...data })),
      },
    };
    const service = new TemporalWorkflowArtifactService(prisma as any);

    await service.repairWorkflowArtifactMetadataIfNeeded(workflow as any);

    const updateData = prisma.temporalWorkflow.update.mock.calls[0]?.[0]?.data;
    expect(updateData).not.toEqual(expect.objectContaining({ validationStatus: 'validated' }));
    expect(updateData).toEqual(expect.objectContaining({ validatedAt: null }));
  });

  it('hashes the exact persisted code bytes and invalidates evidence for trimmed code', async () => {
    const workflow = {
      id: 'workflow-newline',
      generatedCode: 'class WeatherWorkflow: pass\n',
      artifactVersion: 1,
      artifactHash: null,
      validationStatus: 'validated',
      validationScore: 100,
      validationResultJson: {
        success: true,
        score: 100,
      },
      validatedAt: new Date('2026-08-12T00:00:00.000Z'),
      updatedAt: new Date('2026-08-12T00:00:00.000Z'),
    };
    const prisma = {
      temporalWorkflow: {
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...workflow, ...data })),
      },
    };
    const service = new TemporalWorkflowArtifactService(prisma as any);
    const rawHash = service.computeArtifactHash(workflow.generatedCode);
    const trimmedHash = service.computeArtifactHash(workflow.generatedCode.trim());

    await service.repairWorkflowArtifactMetadataIfNeeded({
      ...workflow,
      artifactHash: trimmedHash,
      validationResultJson: {
        ...workflow.validationResultJson,
        artifactHash: trimmedHash,
        artifactVersion: 1,
      },
    } as any);

    expect(rawHash).not.toBe(trimmedHash);
    expect(prisma.temporalWorkflow.update).toHaveBeenCalledWith({
      where: { id: workflow.id },
      data: expect.objectContaining({
        artifactHash: rawHash,
        validationStatus: 'generated',
        validationScore: 0,
        validatedAt: null,
      }),
    });
  });

  it('disables legacy records that were never published', async () => {
    const workflow = {
      id: 'workflow-never-published',
      generatedCode: 'class DraftWorkflow: pass',
      artifactVersion: 1,
      artifactHash: null,
      validationStatus: 'generated',
      validationScore: 0,
      validationResultJson: null,
      validatedAt: null,
      isActive: true,
      deployedAt: null,
      updatedAt: new Date('2026-08-12T00:00:00.000Z'),
    };
    const prisma = {
      temporalWorkflow: {
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...workflow, ...data })),
      },
    };
    const service = new TemporalWorkflowArtifactService(prisma as any);

    await service.repairWorkflowArtifactMetadataIfNeeded(workflow as any);

    expect(prisma.temporalWorkflow.update).toHaveBeenCalledWith({
      where: { id: workflow.id },
      data: expect.objectContaining({ isActive: false }),
    });
  });
});
