import { Logger } from '@nestjs/common';
import {
  seedSystemLlmOperations,
  SYSTEM_OPERATION_VERSION,
} from '../src/modules/llm-operation/seed/system-operations.seed';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { LLM_OPERATION_TEMPLATES } from '../src/modules/llm-operation/llm-operation.registry';
import {
  buildOperationManifest,
  computeOperationContractDigest,
  computeOperationDigestFromManifest,
} from '../src/modules/llm-operation/operation-manifest.util';
import { PromptRendererService } from '../src/modules/llm-operation/runtime/prompt-renderer.service';
import { buildSystemEvalFixtures } from '../src/modules/llm-operation/seed/system-operation-eval-fixtures';

describe('seedSystemLlmOperations', () => {
  let prisma: jest.Mocked<PrismaService>;
  let logger: jest.Mocked<Logger>;

  const mockPrismaResponse = {
    llmOperation: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    llmOperationVersion: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    llmOperationActivation: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    llmOperationEvalSuite: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      llmOperation: mockPrismaResponse.llmOperation,
      llmOperationVersion: mockPrismaResponse.llmOperationVersion,
      llmOperationActivation: mockPrismaResponse.llmOperationActivation,
      llmOperationEvalSuite: mockPrismaResponse.llmOperationEvalSuite,
    } as any;

    logger = {
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
  });

  it('keeps runtime input placeholders so retrieved content reaches the model prompt', () => {
    const manifest = buildOperationManifest(
      'summarize_list',
      LLM_OPERATION_TEMPLATES.summarize_list,
      SYSTEM_OPERATION_VERSION,
    );
    const renderer = new PromptRendererService();
    const rendered = renderer.renderManifestPrompt(manifest, {
      items: [{ title: 'Physical AI breakthrough', url: 'https://example.test/news' }],
    });

    expect(rendered.userPrompt).toContain('Physical AI breakthrough');
    expect(rendered.userPrompt).toContain('https://example.test/news');
    expect(rendered.userPrompt).not.toContain('{{items}}');
  });

  it('compiles system manifests with closed input and output contracts', () => {
    const manifest = buildOperationManifest(
      'summarize_list',
      LLM_OPERATION_TEMPLATES.summarize_list,
      SYSTEM_OPERATION_VERSION,
    );

    expect(manifest.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });
    expect(manifest.outputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });
  });

  it('seeds candidate versions and fixtures without activating unattested operations', async () => {
    mockPrismaResponse.llmOperation.findUnique.mockResolvedValue(null);
    mockPrismaResponse.llmOperation.create.mockImplementation((args: any) =>
      Promise.resolve({
        id: `op-${args.data.operation_key}`,
        operation_key: args.data.operation_key,
        display_name: args.data.display_name,
        description: args.data.description,
        owner: args.data.owner,
        status: 'active',
        source: 'system_seed',
        created_at: new Date(),
        updated_at: new Date(),
      }),
    );

    mockPrismaResponse.llmOperationVersion.findUnique.mockResolvedValue(null);
    mockPrismaResponse.llmOperationVersion.create.mockImplementation((args: any) =>
      Promise.resolve({
        id: `ver-${args.data.operation_id}-${args.data.version}`,
        operation_id: args.data.operation_id,
        version: args.data.version,
        state: args.data.state,
        manifest_json: args.data.manifest_json,
        operation_digest: args.data.operation_digest,
        contract_digest: args.data.contract_digest,
        change_summary: args.data.change_summary,
        source: 'system_seed',
        approved_by: null,
        approved_at: null,
        created_by: 'system',
        created_at: new Date(),
        updated_at: new Date(),
      }),
    );

    mockPrismaResponse.llmOperationActivation.findUnique.mockResolvedValue(null);
    mockPrismaResponse.llmOperationActivation.create.mockImplementation((args: any) =>
      Promise.resolve({
        id: `act-${args.data.operation_id}`,
        operation_id: args.data.operation_id,
        version_id: args.data.version_id,
        environment: 'production',
        activated_by: 'system',
        reason: 'Initial system seed',
        activated_at: new Date(),
        updated_at: new Date(),
      }),
    );
    mockPrismaResponse.llmOperationEvalSuite.findFirst.mockResolvedValue(null);
    mockPrismaResponse.llmOperationEvalSuite.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'suite-1', ...args.data }),
    );

    const result = await seedSystemLlmOperations(prisma, logger);

    expect(result.created).toHaveLength(6);
    expect(result.failed).toHaveLength(0);
    expect(mockPrismaResponse.llmOperation.create).toHaveBeenCalledTimes(6);
    expect(mockPrismaResponse.llmOperationVersion.create).toHaveBeenCalledTimes(6);
    expect(mockPrismaResponse.llmOperationVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: 'candidate',
          approvedBy: null,
          approvedAt: null,
        }),
      }),
    );
    expect(mockPrismaResponse.llmOperationActivation.create).not.toHaveBeenCalled();
    expect(mockPrismaResponse.llmOperationEvalSuite.create).toHaveBeenCalledTimes(6);
  });

  it('should be idempotent on second call', async () => {
    const manifestJson = buildOperationManifest(
      'summarize_list',
      LLM_OPERATION_TEMPLATES.summarize_list,
      SYSTEM_OPERATION_VERSION,
    );
    const operationDigest = computeOperationDigestFromManifest(
      manifestJson,
      SYSTEM_OPERATION_VERSION,
    );
    const contractDigest = computeOperationContractDigest(
      'summarize_list',
      SYSTEM_OPERATION_VERSION,
      manifestJson,
    );
    const existingOperation = {
      id: 'op-existing',
      operationKey: 'summarize_list',
      displayName: '列表摘要',
      description: '对列表文本、搜索结果或文章项集合做精炼要点总结',
      owner: 'system',
      status: 'active',
      source: 'system_seed',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const existingVersion = {
      id: 'ver-existing',
      operationId: 'op-existing',
      version: SYSTEM_OPERATION_VERSION,
      state: 'approved',
      manifestJson,
      operationDigest,
      contractDigest,
      changeSummary: 'Initial system seed',
      source: 'system_seed',
      approvedBy: 'system',
      approvedAt: new Date(),
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrismaResponse.llmOperation.findUnique.mockImplementation((args: any) =>
      Promise.resolve({
        ...existingOperation,
        id: `op-${args.where.operationKey}`,
        operationKey: args.where.operationKey,
      }),
    );

    mockPrismaResponse.llmOperationVersion.findUnique.mockImplementation((args: any) => {
      const operationId = args.where.operationId_version.operationId as string;
      const operationKey = operationId.replace(/^op-/, '') as keyof typeof LLM_OPERATION_TEMPLATES;
      const operationManifest = buildOperationManifest(
        operationKey,
        LLM_OPERATION_TEMPLATES[operationKey],
        SYSTEM_OPERATION_VERSION,
      );
      return Promise.resolve({
        ...existingVersion,
        id: `ver-${operationKey}`,
        operationId,
        manifestJson: operationManifest,
        operationDigest: computeOperationDigestFromManifest(
          operationManifest,
          SYSTEM_OPERATION_VERSION,
        ),
        contractDigest: computeOperationContractDigest(
          operationKey,
          SYSTEM_OPERATION_VERSION,
          operationManifest,
        ),
      });
    });

    mockPrismaResponse.llmOperationActivation.findUnique.mockResolvedValue({
      id: 'act-existing',
      operation_id: 'op-existing',
      version_id: 'ver-existing',
      environment: 'production',
      activated_by: 'system',
      reason: 'Initial system seed',
      activated_at: new Date(),
      updated_at: new Date(),
    } as any);
    mockPrismaResponse.llmOperationEvalSuite.findFirst.mockImplementation((args: any) => {
      const operationKey = String(args.where.operationId).replace(/^op-/, '') as keyof typeof LLM_OPERATION_TEMPLATES;
      const operationManifest = buildOperationManifest(
        operationKey,
        LLM_OPERATION_TEMPLATES[operationKey],
        SYSTEM_OPERATION_VERSION,
      );
      return Promise.resolve({
        id: `suite-${operationKey}`,
        suiteDigest: buildSystemEvalFixtures(operationKey, operationManifest).digest,
      });
    });

    const result = await seedSystemLlmOperations(prisma, logger);

    expect(result.created).toContain('summarize_list');
    expect(mockPrismaResponse.llmOperation.create).not.toHaveBeenCalled();
    expect(mockPrismaResponse.llmOperationVersion.create).not.toHaveBeenCalled();
    expect(mockPrismaResponse.llmOperationActivation.create).not.toHaveBeenCalled();
    expect(mockPrismaResponse.llmOperationEvalSuite.create).not.toHaveBeenCalled();
  });

  it('should throw on digest mismatch for same operation_key + version', async () => {
    const existingOperation = {
      id: 'op-existing',
      operationKey: 'summarize_list',
      displayName: '列表摘要',
      description: '对列表文本、搜索结果或文章项集合做精炼要点总结',
      owner: 'system',
      status: 'active',
      source: 'system_seed',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const existingVersionWithDifferentDigest = {
      id: 'ver-existing',
      operationId: 'op-existing',
      version: SYSTEM_OPERATION_VERSION,
      state: 'approved',
      manifestJson: {},
      operationDigest: 'sha256:DIGESTMISMATCH',
      contractDigest: 'sha256:DIGESTMISMATCH',
      changeSummary: 'Initial system seed',
      source: 'system_seed',
      approvedBy: 'system',
      approvedAt: new Date(),
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrismaResponse.llmOperation.findUnique.mockResolvedValue(existingOperation);
    mockPrismaResponse.llmOperationVersion.findUnique.mockResolvedValue(
      existingVersionWithDifferentDigest,
    );

    await expect(seedSystemLlmOperations(prisma, logger)).rejects.toThrow(/Digest mismatch/);
  });

  it('should throw on duplicate operation_digest with different version', async () => {
    const existingOperation = {
      id: 'op-existing',
      operationKey: 'summarize_list',
      displayName: '列表摘要',
      description: '对列表文本、搜索结果或文章项集合做精炼要点总结',
      owner: 'system',
      status: 'active',
      source: 'system_seed',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrismaResponse.llmOperation.findUnique.mockResolvedValue(existingOperation);
    mockPrismaResponse.llmOperationVersion.findUnique.mockResolvedValue(null);
    mockPrismaResponse.llmOperationVersion.create.mockRejectedValue(
      new Error('Unique constraint violation on operation_digest'),
    );

    await expect(seedSystemLlmOperations(prisma, logger)).rejects.toThrow();
  });
});
