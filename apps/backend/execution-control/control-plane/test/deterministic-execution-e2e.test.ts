process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ops:ops_secret@localhost:5432/ops';

import { PrismaService } from '../src/modules/prisma/prisma.service';
import { DeterministicPlanValidatorService } from '../src/modules/execution/plan-runtime/deterministic-plan-validator.service';
import { DeterministicPlanFreezeService } from '../src/modules/execution/plan-runtime/deterministic-plan-freeze.service';
import { DeterministicPlanSchedulerService } from '../src/modules/execution/plan-runtime/deterministic-plan-scheduler.service';
import { DeterministicNodeInputResolverService } from '../src/modules/execution/plan-runtime/deterministic-node-input-resolver.service';
import { DeterministicFinalOutputService } from '../src/modules/execution/plan-runtime/deterministic-final-output.service';
import { LlmOperationRuntimeAdapter } from '../src/modules/execution/adapters/llm-operation-runtime.adapter';
import { ExecutionStreamService } from '../src/modules/execution/lifecycle/execution-stream.service';
import { ExecutionEventService } from '../src/modules/execution/state/execution-event.service';
import { RuntimeAdapterRegistry } from '../src/modules/execution/adapters/runtime-adapter.registry';
import { BuiltinWorkflowRuntimeAdapter } from '../src/modules/execution/adapters/builtin-workflow-runtime.adapter';
import { BuiltinHandlerRegistryService } from '../src/modules/execution/adapters/builtin-handler-registry.service';
import { BrowserRuntimeAdapter } from '../src/modules/execution/adapters/browser-runtime.adapter';
import { CapabilityRuntimeAdapter } from '../src/modules/execution/adapters/capability-runtime.adapter';
import { DocumentRuntimeAdapter } from '../src/modules/execution/adapters/document-runtime.adapter';
import { WorkflowRuntimeAdapter } from '../src/modules/execution/adapters/workflow-runtime.adapter';
import { RuntimeExecutionOrchestrator } from '../src/modules/execution/step-runner/runtime/runtime-execution.orchestrator';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const MIGRATION_SQL_FILES = [
  '20260515143000_add_execution_phases/migration.sql',
  '20260516140000_add_execution_phase_steps/migration.sql',
  '20260625000000_add_scheduler/migration.sql',
  '20260728120000_add_deterministic_execution_plan/migration.sql',
];

/**
 * Split PostgreSQL SQL into top-level statements, correctly handling:
 * - -- line comments (skipped)
 * - /* * / block comments (skipped)
 * - 'single-quoted strings' (preserved, including '' escapes)
 * - dollar-quoted strings $tag$...$tag$ (preserved, including inner semicolons)
 * - ; statement separators (only at top level)
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    // -- line comment: skip to end of line
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    // /* */ block comment: skip to closing */
    if (sql[i] === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Dollar-quoted string: $$...$$ or $tag$...$tag$
    if (sql[i] === '$') {
      const start = i;
      i++;
      let tag = '';
      while (i < sql.length && sql[i] !== '$') {
        tag += sql[i];
        i++;
      }
      if (i < sql.length && sql[i] === '$') {
        const closeTag = '$' + tag + '$';
        current += sql.slice(start, i + 1);
        i++;
        const closeIdx = sql.indexOf(closeTag, i);
        if (closeIdx !== -1) {
          current += sql.slice(i, closeIdx + closeTag.length);
          i = closeIdx + closeTag.length;
          continue;
        }
      }
      // Fallthrough: lone $ not part of dollar-quote
      current += sql.slice(start, i);
      continue;
    }

    // Single-quoted string: '...' ('' is escaped quote)
    if (sql[i] === "'") {
      current += sql[i];
      i++;
      while (i < sql.length) {
        current += sql[i];
        if (sql[i] === "'") {
          if (i + 1 < sql.length && sql[i + 1] === "'") {
            // Escaped quote '' — consume second quote
            current += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Semicolon at top level → statement boundary
    if (sql[i] === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed + ';');
      current = '';
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
}

async function applyMigrations(prisma: PrismaService): Promise<void> {
  const migrationsDir = path.resolve(__dirname, '../prisma/migrations');
  for (const relativePath of MIGRATION_SQL_FILES) {
    const sqlPath = path.join(migrationsDir, relativePath);
    if (!fs.existsSync(sqlPath)) {
      console.warn(`Migration file not found: ${sqlPath}`);
      continue;
    }
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const statements = splitSqlStatements(sql);
    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt);
      } catch (err: any) {
        // Ignore "already exists" errors — migration may be partially applied
        if (err?.message?.includes('already exists')) continue;
        if (err?.message?.includes('duplicate key')) continue;
        throw err;
      }
    }
  }
}

describe('Deterministic Plan Execution E2E Test', () => {
  let prisma: PrismaService;
  let validator: DeterministicPlanValidatorService;
  let freezeService: DeterministicPlanFreezeService;

  beforeAll(async () => {
    prisma = new PrismaService();
    validator = new DeterministicPlanValidatorService();
    freezeService = new DeterministicPlanFreezeService(prisma, validator);
    await applyMigrations(prisma);
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up any leftover data from tests
    const executions = await prisma.execution.findMany({
      where: { executionMode: 'deterministic_plan' },
      select: { id: true },
    });
    for (const exec of executions) {
      await prisma.executionStep.deleteMany({ where: { executionId: exec.id } });
      await prisma.executionArtifact.deleteMany({ where: { executionId: exec.id } });
      await prisma.executionEvent.deleteMany({ where: { executionId: exec.id } });
      await prisma.executionPlan.deleteMany({ where: { executionId: exec.id } });
      await prisma.execution.delete({ where: { id: exec.id } });
    }
  });

  it('should validate and freeze plan into database successfully', async () => {
    const planDraft: any = {
      schemaVersion: 'deterministic-plan/v1',
      plannerVersion: 'v1',
      catalogVersion: 'v1',
      planType: 'sequential',
      objective: '获取最新 AI 新闻并输出为 Markdown 文件',
      originalRequest: '获取最新 AI 新闻，总结，输出 md 文件',
      status: 'draft',
      nodes: [
        {
          nodeId: 'search_ai_news',
          sequence: 1,
          title: '搜索最新 AI 新闻',
          kind: 'skill',
          skillId: 'tavily_search',
          skillVersion: '1.0.0',
          runtimeType: 'workflow',
          dependsOn: [],
          inputBindings: {
            query: { source: 'literal', value: 'latest AI artificial intelligence news' },
          },
          outputContract: { results: 'news_item_list' },
          failurePolicy: 'abort',
        },
        {
          nodeId: 'summarize_news',
          sequence: 2,
          title: '总结 AI 新闻要点',
          kind: 'llm_operation',
          operationId: 'summarize_list',
          promptTemplateId: 'template-sum-1',
          promptTemplateVersion: 'v1',
          runtimeType: 'llm_operation',
          dependsOn: ['search_ai_news'],
          inputBindings: {
            items: { source: 'node_output', fromNodeId: 'search_ai_news', outputPath: 'results' },
          },
          outputContract: { summaryText: 'markdown_content' },
          failurePolicy: 'abort',
        },
        {
          nodeId: 'write_md_file',
          sequence: 3,
          title: '生成 Markdown 文件产物',
          kind: 'skill',
          skillId: 'platform.document.markdown-artifact-writer',
          skillVersion: '1.0.0',
          runtimeType: 'artifact',
          dependsOn: ['summarize_news'],
          inputBindings: {
            content: { source: 'node_output', fromNodeId: 'summarize_news', outputPath: 'summaryText' },
            fileName: { source: 'literal', value: 'ai-news-summary.md' },
          },
          outputContract: { artifact: 'artifact_ref' },
          failurePolicy: 'abort',
          metadata: {
            handlerKey: 'document.markdown-artifact-writer',
            definitionVersion: '1.0.0',
            definitionDigest: 'abc123def456',
            adapterRoute: 'workflow:builtin',
          },
        },
      ],
      finalOutputs: [
        {
          targetField: 'artifact',
          fromNodeId: 'write_md_file',
          fromNodeOutput: 'artifact',
          expectedType: 'artifact_ref',
        },
      ],
    };

    // 1. Create execution DB record
    const execution = await prisma.execution.create({
      data: {
        executionMode: 'deterministic_plan',
        status: 'queued',
        createdBy: '5654953e-1b01-4094-bb29-b28f61d3f6a6',
        inputJson: { prompt: '获取最新 AI 新闻，总结，输出 md 文件' },
      },
    });

    expect(execution.id).toBeDefined();
    expect(execution.executionMode).toBe('deterministic_plan');

    // 2. Freeze plan into execution_plans and execution_steps tables
    const frozenPlan = await freezeService.freezeAndPersistPlan(execution.id, planDraft);

    expect(frozenPlan.planHash).toBeDefined();
    expect(frozenPlan.planId).toBeDefined();

    // 3. Verify steps in DB
    const steps = await prisma.executionStep.findMany({
      where: { executionId: execution.id },
      orderBy: { stepIndex: 'asc' },
    });

    expect(steps.length).toBe(3);
    expect(steps[0].capabilityId).toBe('tavily_search');
    expect(steps[1].capabilityId).toBe('summarize_list');
    expect(steps[2].capabilityId).toBe('platform.document.markdown-artifact-writer');

    // 4. Verify _frozenMetadata is NOT stored in inputBindingsJson or outputContractJson (P0-2 fixed)
    for (const step of steps) {
      const inputBindings = step.inputBindingsJson as any;
      const outputContract = step.outputContractJson as any;
      const inputMeta = inputBindings?._frozenMetadata;
      const outputMeta = outputContract?._frozenMetadata;
      expect(inputMeta).toBeUndefined();
      expect(outputMeta).toBeUndefined();
    }
  });

  it('should advance execution from queued to running and acquire step lease', async () => {
    const planDraft: any = {
      schemaVersion: 'deterministic-plan/v1',
      plannerVersion: 'v1',
      catalogVersion: 'v1',
      planType: 'sequential',
      objective: 'Test advance execution',
      originalRequest: 'Test',
      status: 'draft',
      nodes: [
        {
          nodeId: 'step1',
          sequence: 1,
          title: 'Test Step',
          kind: 'skill',
          skillId: 'tavily_search',
          skillVersion: '1.0.0',
          runtimeType: 'workflow',
          dependsOn: [],
          inputBindings: {
            query: { source: 'literal', value: 'test query' },
          },
          outputContract: { results: 'news_item_list' },
          failurePolicy: 'abort',
          metadata: {
            handlerKey: 'search.web',
            definitionVersion: '1.0.0',
            definitionDigest: 'test',
            adapterRoute: 'workflow:skill.runtime',
          },
        },
      ],
      finalOutputs: [
        {
          targetField: 'results',
          fromNodeId: 'step1',
          fromNodeOutput: 'results',
          expectedType: 'news_item_list',
        },
      ],
    };

    // Create execution + freeze
    const execution = await prisma.execution.create({
      data: {
        executionMode: 'deterministic_plan',
        status: 'queued',
        createdBy: '5654953e-1b01-4094-bb29-b28f61d3f6a6',
        inputJson: { prompt: 'test' },
      },
    });
    await freezeService.freezeAndPersistPlan(execution.id, planDraft);

    // Build scheduler with real deps + mock orchestrator
    const eventService = new ExecutionEventService(prisma);
    const eventPublisher = new ExecutionStreamService(eventService);
    const inputResolver = new DeterministicNodeInputResolverService(prisma);
    const finalOutput = new DeterministicFinalOutputService(prisma);
    const llmAdapter = new LlmOperationRuntimeAdapter();

    // Mock the orchestrator to return success without real adapters
    const mockOrchestrator = {
      executeStep: jest.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        output: { results: ['mock result'] },
      }),
    };

    const scheduler = new DeterministicPlanSchedulerService(
      prisma,
      inputResolver,
      finalOutput,
      llmAdapter,
      mockOrchestrator as any,
      eventPublisher,
    );

    // Call advanceExecution
    await scheduler.advanceExecution(execution.id);

    // Verify execution moved to running
    const updatedExecution = await prisma.execution.findUnique({
      where: { id: execution.id },
    });
    expect(updatedExecution?.status).toBe('running');

    // Verify step acquired lease and is running
    const steps = await prisma.executionStep.findMany({
      where: { executionId: execution.id },
    });
    expect(steps.length).toBe(1);
    expect(steps[0].status).toBe('running');
    expect(steps[0].leaseOwner).toBe('deterministic-scheduler');
    expect(steps[0].leaseExpiresAt).toBeDefined();

    // Verify events were created
    const events = await prisma.executionEvent.findMany({
      where: { executionId: execution.id },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const stepStartedEvents = events.filter(e => e.eventType === 'step.started');
    expect(stepStartedEvents.length).toBe(1);
  });

  it('should propagate frozen metadata for builtin skills in scheduler request (P0-3)', async () => {
    const planDraft: any = {
      schemaVersion: 'deterministic-plan/v1',
      plannerVersion: 'v1',
      catalogVersion: 'v1',
      planType: 'sequential',
      objective: 'Test builtin metadata propagation',
      originalRequest: 'Test',
      status: 'draft',
      nodes: [
        {
          nodeId: 'write_doc',
          sequence: 1,
          title: 'Write Document',
          kind: 'skill',
          skillId: 'platform.document.markdown-artifact-writer',
          skillVersion: '1.0.0',
          runtimeType: 'artifact',
          dependsOn: [],
          inputBindings: {
            content: { source: 'literal', value: '# Test' },
            fileName: { source: 'literal', value: 'test.md' },
          },
          outputContract: { artifact: 'artifact_ref' },
          failurePolicy: 'abort',
          metadata: {
            handlerKey: 'document.markdown-artifact-writer',
            definitionVersion: '1.0.0',
            definitionDigest: 'sha256:abc123',
            adapterRoute: 'workflow:builtin',
          },
        },
      ],
      finalOutputs: [
        {
          targetField: 'artifact',
          fromNodeId: 'write_doc',
          fromNodeOutput: 'artifact',
          expectedType: 'artifact_ref',
        },
      ],
    };

    // Create execution + freeze
    const execution = await prisma.execution.create({
      data: {
        executionMode: 'deterministic_plan',
        status: 'queued',
        createdBy: '5654953e-1b01-4094-bb29-b28f61d3f6a6',
        inputJson: { prompt: 'test builtin' },
      },
    });
    await freezeService.freezeAndPersistPlan(execution.id, planDraft);

    // Build scheduler with real deps + mock orchestrator
    const eventService = new ExecutionEventService(prisma);
    const eventPublisher = new ExecutionStreamService(eventService);
    const inputResolver = new DeterministicNodeInputResolverService(prisma);
    const finalOutput = new DeterministicFinalOutputService(prisma);
    const llmAdapter = new LlmOperationRuntimeAdapter();

    // Capture the request that would be sent to the orchestrator
    const capturedRequests: any[] = [];
    const mockOrchestrator = {
      executeStep: jest.fn().mockImplementation((request: any) => {
        capturedRequests.push(request);
        return Promise.resolve({
          success: true,
          status: 'completed',
          output: {
            artifact: {
              url: '/artifacts/test.md',
              name: 'test.md',
              mimeType: 'text/markdown',
            },
            artifacts: [{
              url: '/artifacts/test.md',
              name: 'test.md',
              mimeType: 'text/markdown',
            }],
          },
        });
      }),
    };

    const scheduler = new DeterministicPlanSchedulerService(
      prisma,
      inputResolver,
      finalOutput,
      llmAdapter,
      mockOrchestrator as any,
      eventPublisher,
    );

    await scheduler.advanceExecution(execution.id);

    // Verify the request sent to orchestrator has correct builtin metadata
    expect(capturedRequests.length).toBe(1);
    const req = capturedRequests[0];
    expect(req.capabilityType).toBe('builtin');
    expect(req.metadata.builtinSkill).toBe(true);
    expect(req.metadata.handlerKey).toBe('document.markdown-artifact-writer');
    expect(req.metadata.definitionVersion).toBe('1.0.0');
    expect(req.metadata.definitionDigest).toBe('sha256:abc123');
    expect(req.metadata.adapterRoute).toBe('workflow:builtin');

    // Verify step completed successfully
    const step = await prisma.executionStep.findFirst({
      where: { executionId: execution.id },
    });
    expect(step?.status).toBe('succeeded');
    expect(step?.outputJson).toBeDefined();
  });

  it('should invoke builtin handler through real adapter chain with HTTP Documents Domain endpoint', async () => {
    const planDraft: any = {
      schemaVersion: 'deterministic-plan/v1',
      plannerVersion: 'v1',
      catalogVersion: 'v1',
      planType: 'sequential',
      objective: 'Test real adapter chain with real handler key',
      originalRequest: 'Test',
      status: 'draft',
      nodes: [
        {
          nodeId: 'handler_step',
          sequence: 1,
          title: 'Builtin Document markdown write',
          kind: 'skill',
          skillId: 'platform.document.markdown-artifact-writer',
          skillVersion: '1.0.0',
          runtimeType: 'workflow',
          dependsOn: [],
          inputBindings: {
            message: { source: 'literal', value: 'hello from e2e' },
          },
          outputContract: { artifact: 'artifact_ref' },
          failurePolicy: 'abort',
          metadata: {
            handlerKey: 'document.markdown-artifact-writer',
            definitionVersion: '1.0.0',
            definitionDigest: 'sha256:e2e-test',
            adapterRoute: 'workflow:builtin',
          },
        },
      ],
      finalOutputs: [
        {
          targetField: 'artifact',
          fromNodeId: 'handler_step',
          fromNodeOutput: 'artifact',
          expectedType: 'artifact_ref',
        },
      ],
    };

    const execution = await prisma.execution.create({
      data: {
        executionMode: 'deterministic_plan',
        status: 'queued',
        createdBy: '5654953e-1b01-4094-bb29-b28f61d3f6a6',
        inputJson: { prompt: 'test adapter chain' },
      },
    });
    await freezeService.freezeAndPersistPlan(execution.id, planDraft);

    // Start mock Document Domain HTTP server so the real handler makes an actual HTTP call
    const mockDomainServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        if (req.url === '/internal/document/markdown-artifacts/invoke' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            output: {
              artifact: {
                url: 'e2e://artifacts/test-artifact.md',
                metadata: { sha256: 'e2e-test-sha256' },
                sizeBytes: 64,
                mimeType: 'text/markdown',
                filename: 'test-artifact.md',
              },
              artifacts: [],
              artifact_ref: { url: 'e2e://artifacts/test-artifact.md', sha256: 'e2e-test-sha256' },
              sha256: 'e2e-test-sha256',
              sizeBytes: 64,
            },
            artifacts: [],
          }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });
    const originalCarboneUrl = process.env.CARBONE_SERVICE_URL;
    await new Promise<void>(resolve => mockDomainServer.listen(0, resolve));
    const addr = mockDomainServer.address() as { port: number };
    process.env.CARBONE_SERVICE_URL = `http://localhost:${addr.port}`;

    try {
      // Use real BuiltinHandlerRegistryService with default HTTP handler
      const handlerRegistry = new BuiltinHandlerRegistryService();
      handlerRegistry.onModuleInit(); // registers real document.markdown-artifact-writer handler

      const builtinAdapter = new BuiltinWorkflowRuntimeAdapter(handlerRegistry);
      const registry = new RuntimeAdapterRegistry(
        new BrowserRuntimeAdapter(),
        new CapabilityRuntimeAdapter(),
        new DocumentRuntimeAdapter(),
        new WorkflowRuntimeAdapter(),
        builtinAdapter,
      );
      const realOrchestrator = new RuntimeExecutionOrchestrator(registry);

      const eventService = new ExecutionEventService(prisma);
      const eventPublisher = new ExecutionStreamService(eventService);
      const inputResolver = new DeterministicNodeInputResolverService(prisma);
      const finalOutput = new DeterministicFinalOutputService(prisma);
      const llmAdapter = new LlmOperationRuntimeAdapter();

      const scheduler = new DeterministicPlanSchedulerService(
        prisma,
        inputResolver,
        finalOutput,
        llmAdapter,
        realOrchestrator,
        eventPublisher,
      );

      await scheduler.advanceExecution(execution.id);

      const step = await prisma.executionStep.findFirst({
        where: { executionId: execution.id },
      });
      expect(step?.status).toBe('succeeded');
      expect(step?.outputJson).toBeDefined();

      const output = step?.outputJson as any;
      expect(output?.artifact?.url).toBe('e2e://artifacts/test-artifact.md');
      expect(output?.artifact?.metadata?.sha256).toBe('e2e-test-sha256');
      expect(output?.artifact?.sizeBytes).toBe(64);
    } finally {
      mockDomainServer.close();
      if (originalCarboneUrl !== undefined) {
        process.env.CARBONE_SERVICE_URL = originalCarboneUrl;
      } else {
        delete process.env.CARBONE_SERVICE_URL;
      }
    }
  });
});
