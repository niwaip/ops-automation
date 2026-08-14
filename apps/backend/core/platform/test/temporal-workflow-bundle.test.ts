import { BadRequestException, StreamableFile } from '@nestjs/common';
import { createHash } from 'crypto';
import { TemporalWorkflowController } from '../src/modules/temporal-workflow/temporal-workflow.controller';
import { TemporalWorkflowBundleService } from '../src/modules/temporal-workflow/temporal-workflow-bundle.service';
import {
  createTarGzip,
  extractTarGzip,
} from '../src/modules/temporal-workflow/temporal-workflow-bundle-tar.utils';
import { TemporalWorkflowManagementService } from '../src/workflow-registry/workflow-template/temporal-workflow-management.service';

const workflowCode =
  'from temporalio import workflow\n\n@workflow.defn\nclass NewsWorkflow:\n    pass\n';
const activityCode = 'def search_news(query: str):\n    return {"query": query}\n';
const workflowDsl = {
  name: 'NewsWorkflow',
  workflowClassName: 'NewsWorkflow',
  taskQueue: 'SKILL_TASK_QUEUE',
  inputParams: {
    topic: {
      type: 'string' as const,
      enum: ['general', 'news', 'finance'],
      defaultValue: 'general',
    },
  },
  steps: [
    {
      id: 'search',
      name: '搜索新闻',
      type: 'activity' as const,
      activityRef: 'builtin:webSearch',
      activityName: 'searchNews',
    },
  ],
};
const activityDsl = {
  activities: [
    {
      activityRef: 'builtin:webSearch',
      name: '搜索新闻',
      fn: 'search_news',
      timeout: '30s',
      handler: 'api' as const,
      config: { topic: 'news' },
      generatedCode: activityCode,
    },
  ],
};

const artifactHash = `sha256:${createHash('sha256').update(workflowCode).digest('hex')}`;

function createFixture() {
  const workflow = {
    id: 'd208d29c-3cb8-4a9f-bbfd-8cf2c15bde04',
    name: 'AI 新闻工作流',
    description: '查询、总结并生成结果',
    taskQueue: 'SKILL_TASK_QUEUE',
    workflowDsl,
    activityDsl,
    generatedCode: workflowCode,
    artifactVersion: 3,
    artifactHash,
    validationStatus: 'validated',
    validationScore: 98,
    validatedAt: new Date('2026-08-03T10:00:00.000Z'),
    isActive: true,
    deployedAt: new Date('2026-08-03T10:05:00.000Z'),
    createdAt: new Date('2026-08-03T09:00:00.000Z'),
    updatedAt: new Date('2026-08-03T10:05:00.000Z'),
  } as any;
  const imported = {
    ...workflow,
    id: '27fe212a-8612-4350-810c-7501bebd35f7',
    isActive: false,
    deployedAt: null,
    validationStatus: 'generated',
    validatedAt: null,
  } as any;
  const workflowManagementService = {
    findOne: jest.fn().mockResolvedValue(workflow),
    create: jest.fn().mockResolvedValue(imported),
  };
  const workflowDslValidationService = {
    validate: jest.fn().mockResolvedValue({
      isValid: true,
      score: 100,
      errors: [],
      warnings: [],
    }),
  };
  const service = new TemporalWorkflowBundleService(
    workflowManagementService as any,
    workflowDslValidationService as any
  );
  return { service, workflowManagementService, workflowDslValidationService };
}

describe('TemporalWorkflowBundleService', () => {
  it('streams the exported bundle as raw gzip bytes at the HTTP boundary', async () => {
    const { service } = createFixture();
    const controller = new TemporalWorkflowController({} as any, {} as any, service);

    const response = await controller.exportBundle('d208d29c-3cb8-4a9f-bbfd-8cf2c15bde04');
    expect(response).toBeInstanceOf(StreamableFile);
    expect(response.getHeaders()).toEqual(
      expect.objectContaining({
        type: 'application/gzip',
        disposition: 'attachment; filename="AI.tar.gz"',
      })
    );

    const chunks: Buffer[] = [];
    for await (const chunk of response.getStream()) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const archive = Buffer.concat(chunks);
    expect([...archive.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
    expect(extractTarGzip(archive).has('manifest.json')).toBe(true);
  });

  it('exports and imports a complete workflow bundle as a non-published draft', async () => {
    const { service, workflowManagementService, workflowDslValidationService } = createFixture();

    const exported = await service.exportBundle('d208d29c-3cb8-4a9f-bbfd-8cf2c15bde04');
    expect(exported.fileName).toBe('AI.tar.gz');

    const entries = extractTarGzip(exported.archive);
    expect([...entries.keys()].sort()).toEqual(
      [
        'code/activities/01-search_news.py',
        'code/workflow.py',
        'dsl/activities.json',
        'dsl/workflow.json',
        'manifest.json',
        'metadata/source.json',
      ].sort()
    );
    expect(entries.get('code/workflow.py')?.toString('utf8')).toBe(workflowCode);
    expect(entries.get('code/activities/01-search_news.py')?.toString('utf8')).toBe(activityCode);

    const result = await service.importBundle(exported.archive);

    expect(workflowDslValidationService.validate).toHaveBeenCalledWith(
      workflowDsl,
      expect.objectContaining({
        activities: [expect.objectContaining({ generatedCode: activityCode })],
      })
    );
    expect(workflowManagementService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'AI 新闻工作流',
        generatedCode: workflowCode,
        isActive: false,
        activityDsl: expect.objectContaining({
          activities: [expect.objectContaining({ generatedCode: activityCode })],
        }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        requiresRuntimeValidation: true,
        nextAction: 'validate_saved_artifact',
      })
    );
  });

  it('rejects a bundle whose declared file digest no longer matches', async () => {
    const { service, workflowManagementService } = createFixture();
    const exported = await service.exportBundle('d208d29c-3cb8-4a9f-bbfd-8cf2c15bde04');
    const entries = extractTarGzip(exported.archive);
    entries.set('code/workflow.py', Buffer.from(`${workflowCode}\n# tampered\n`, 'utf8'));
    const tampered = createTarGzip(
      [...entries.entries()].map(([path, content]) => ({ path, content }))
    );

    await expect(service.importBundle(tampered)).rejects.toThrow('文件摘要不匹配');
    expect(workflowManagementService.create).not.toHaveBeenCalled();
  });

  it('rejects a statically invalid DSL before creating a workflow record', async () => {
    const { service, workflowManagementService, workflowDslValidationService } = createFixture();
    const exported = await service.exportBundle('d208d29c-3cb8-4a9f-bbfd-8cf2c15bde04');
    workflowDslValidationService.validate.mockResolvedValue({
      isValid: false,
      score: 20,
      errors: ['缺少 builtin:webSearch'],
      warnings: [],
    });

    await expect(service.importBundle(exported.archive)).rejects.toThrow(
      '工作流包 DSL 校验失败: 缺少 builtin:webSearch'
    );
    expect(workflowManagementService.create).not.toHaveBeenCalled();
  });

  it('requires generated workflow code for a complete export', async () => {
    const { service, workflowManagementService } = createFixture();
    workflowManagementService.findOne.mockResolvedValue({ generatedCode: null });

    await expect(service.exportBundle('draft-only')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TemporalWorkflowManagementService publish gate', () => {
  const createManagementService = (existing: Record<string, unknown>) => {
    let stored = existing;
    const prisma = {
      temporalWorkflow: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
        updateMany: jest.fn().mockImplementation(({ data }) => {
          stored = { ...stored, ...data };
          return Promise.resolve({ count: 1 });
        }),
      },
    };
    const artifactService = {
      computeArtifactHash: jest.fn().mockReturnValue(artifactHash),
      repairWorkflowArtifactMetadataIfNeeded: jest.fn().mockImplementation((workflow) => workflow),
      inspectValidationBinding: jest.fn().mockImplementation((workflow) => {
        const evidence = workflow.validationResultJson || {};
        return {
          artifactHash,
          artifactVersion: workflow.artifactVersion || 0,
          isCurrent:
            workflow.artifactHash === artifactHash &&
            workflow.validationStatus === 'validated' &&
            Boolean(workflow.validatedAt) &&
            evidence.success === true &&
            evidence.artifactHash === artifactHash &&
            evidence.artifactVersion === workflow.artifactVersion,
        };
      }),
    };
    const service = new TemporalWorkflowManagementService(
      prisma as any,
      {} as any,
      artifactService as any
    );
    return { service, prisma };
  };

  it('blocks publishing an imported artifact that has not passed runtime validation', async () => {
    const { service, prisma } = createManagementService({
      generatedCode: workflowCode,
      artifactHash,
      validationStatus: 'generated',
      validatedAt: null,
    });

    await expect(service.deploy('imported-workflow')).rejects.toThrow('尚未通过最新版本的真实验证');
    expect(prisma.temporalWorkflow.updateMany).not.toHaveBeenCalled();
  });

  it('publishes and enables the exact artifact that passed runtime validation', async () => {
    const existing = {
      id: 'validated-workflow',
      name: 'validated',
      description: null,
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl,
      activityDsl,
      generatedCode: workflowCode,
      artifactVersion: 1,
      artifactHash,
      validationStatus: 'validated',
      validationScore: 100,
      validationResultJson: { success: true, artifactHash, artifactVersion: 1 },
      validatedAt: new Date(),
      isActive: false,
      deployedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { service, prisma } = createManagementService(existing);

    const result = await service.deploy('validated-workflow');

    expect(prisma.temporalWorkflow.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'validated-workflow',
        artifactHash,
        artifactVersion: 1,
        validationStatus: 'validated',
      }),
      data: { deployedAt: expect.any(Date), isActive: true },
    });
    expect(result.isActive).toBe(true);
  });

  it('discards stale generated code when the DSL changes without a new artifact', async () => {
    const existing = {
      id: 'workflow-with-stale-code',
      name: 'old workflow',
      description: null,
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl,
      activityDsl,
      generatedCode: workflowCode,
      artifactVersion: 2,
      artifactHash,
      validationStatus: 'validated',
      validationScore: 100,
      validationResultJson: { success: true },
      validatedAt: new Date(),
      isActive: true,
      deployedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      temporalWorkflow: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
      },
    };
    const changedWorkflowDsl = {
      ...workflowDsl,
      extraPrompt: 'new code generation behavior',
    };
    const normalizationService = {
      normalizeActivityDsl: jest.fn((value) => value),
      normalizeWorkflowDsl: jest.fn((value, name, taskQueue) =>
        Promise.resolve({ ...value, name, taskQueue })
      ),
      normalizeName: jest.fn((value) => value),
      normalizeDescription: jest.fn((value) => value || null),
      normalizeTaskQueue: jest.fn((value) => value),
    };
    const artifactService = {
      computeArtifactHash: jest.fn().mockReturnValue(artifactHash),
      getCurrentArtifactVersion: jest.fn().mockReturnValue(2),
    };
    const service = new TemporalWorkflowManagementService(
      prisma as any,
      normalizationService as any,
      artifactService as any
    );

    await service.update('workflow-with-stale-code', {
      workflowDsl: changedWorkflowDsl,
      generatedCode: workflowCode,
    });

    expect(prisma.temporalWorkflow.update).toHaveBeenCalledWith({
      where: { id: 'workflow-with-stale-code' },
      data: expect.objectContaining({
        generatedCode: null,
        artifactHash: null,
        deployedAt: null,
        isActive: false,
        validationStatus: 'draft',
        validationScore: 0,
        validatedAt: null,
      }),
    });
  });

  it('preserves validation evidence when saving a semantically unchanged artifact', async () => {
    const validatedAt = new Date('2026-08-06T03:00:00.000Z');
    const validationResultJson = {
      success: true,
      score: 100,
      logs: ['workflow completed'],
      result: { searchResults: [{ title: 'Temporal' }] },
    };
    const existing = {
      id: 'validated-workflow',
      name: 'AI 新闻工作流',
      description: 'before save',
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl,
      activityDsl,
      generatedCode: workflowCode,
      artifactVersion: 1,
      artifactHash,
      validationStatus: 'validated',
      validationScore: 100,
      validationResultJson,
      validatedAt,
      isActive: false,
      deployedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      temporalWorkflow: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
      },
    };
    const normalizationService = {
      normalizeActivityDsl: jest.fn((value) => JSON.parse(JSON.stringify(value))),
      normalizeWorkflowDsl: jest.fn((value, name, taskQueue) =>
        Promise.resolve({ ...JSON.parse(JSON.stringify(value)), name, taskQueue })
      ),
      normalizeName: jest.fn((value) => value),
      normalizeDescription: jest.fn((value) => value || null),
      normalizeTaskQueue: jest.fn((value) => value),
    };
    const artifactService = {
      computeArtifactHash: jest.fn().mockReturnValue(artifactHash),
      getCurrentArtifactVersion: jest.fn().mockReturnValue(1),
    };
    const service = new TemporalWorkflowManagementService(
      prisma as any,
      normalizationService as any,
      artifactService as any
    );

    const result = await service.update(existing.id, {
      name: existing.name,
      description: 'saved without definition changes',
      taskQueue: existing.taskQueue,
      workflowDsl: { ...workflowDsl },
      activityDsl: { ...activityDsl },
    });

    const updateData = prisma.temporalWorkflow.update.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('validatedAt');
    expect(updateData).not.toHaveProperty('validationResultJson');
    expect(updateData).not.toHaveProperty('validationStatus');
    expect(result).toEqual(
      expect.objectContaining({
        validationStatus: 'validated',
        validationScore: 100,
        validationResult: validationResultJson,
        validatedAt,
      })
    );
  });

  it('invalidates evidence but preserves code when only the validation contract changes', async () => {
    const existing = {
      id: 'workflow-validation-contract-change',
      name: 'AI 新闻工作流',
      description: null,
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl,
      activityDsl,
      generatedCode: workflowCode,
      artifactVersion: 1,
      artifactHash,
      validationStatus: 'validated',
      validationScore: 100,
      validationResultJson: { success: true },
      validatedAt: new Date(),
      isActive: true,
      deployedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      temporalWorkflow: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
      },
    };
    const normalizationService = {
      normalizeActivityDsl: jest.fn((value) => JSON.parse(JSON.stringify(value))),
      normalizeWorkflowDsl: jest.fn((value, name, taskQueue) =>
        Promise.resolve({ ...JSON.parse(JSON.stringify(value)), name, taskQueue })
      ),
      normalizeName: jest.fn((value) => value),
      normalizeDescription: jest.fn((value) => value || null),
      normalizeTaskQueue: jest.fn((value) => value),
    };
    const artifactService = {
      computeArtifactHash: jest.fn().mockReturnValue(artifactHash),
      getCurrentArtifactVersion: jest.fn().mockReturnValue(1),
    };
    const service = new TemporalWorkflowManagementService(
      prisma as any,
      normalizationService as any,
      artifactService as any
    );

    await service.update(existing.id, {
      workflowDsl: {
        ...workflowDsl,
        validation: {
          assertions: [
            { path: '$.result.result.businessData.items', operator: 'minItems', value: 1 },
          ],
        },
      },
    });

    expect(prisma.temporalWorkflow.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: expect.objectContaining({
        workflowDsl: expect.any(Object),
        isActive: false,
        deployedAt: null,
        validationStatus: 'generated',
        validationScore: 0,
        validatedAt: null,
      }),
    });
    const updateData = prisma.temporalWorkflow.update.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('generatedCode');
    expect(updateData).not.toHaveProperty('artifactHash');
  });
});
