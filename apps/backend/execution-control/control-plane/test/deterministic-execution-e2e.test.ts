process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ops:ops_secret@localhost:5432/ops';

import axios from 'axios';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { DeterministicPlanValidatorService } from '../src/modules/execution/plan-runtime/deterministic-plan-validator.service';
import { DeterministicPlanFreezeService } from '../src/modules/execution/plan-runtime/deterministic-plan-freeze.service';
import { DeterministicPlanSchedulerService } from '../src/modules/execution/plan-runtime/deterministic-plan-scheduler.service';
import { LegacyOutputAdapterService } from '../src/modules/execution/plan-runtime/legacy-output-adapter.service';
import { CapabilityContractCatalogService } from '../src/modules/execution/plan-runtime/capability-contract-catalog.service';
import { OutputNormalizerService } from '../src/modules/execution/plan-runtime/output-normalizer.service';
import { GracePolicyService } from '../src/modules/execution/plan-runtime/grace-policy.service';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;
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

// Single authoritative migration sequence lives in core/platform
// (#70 merge): execution-control has no migrations of its own anymore.
// Idempotent manual application keeps the shared dev DB schema current
// without depending on the prisma CLI inside jest.
const MIGRATION_SQL_FILES = [
  '20260608_init_platform_baseline/migration.sql',
  '20260609000000_add_execution_phases/migration.sql',
  '20260609010000_add_execution_phase_steps/migration.sql',
  '20260625000000_add_scheduler/migration.sql',
  '20260704194500_add_skill_access_requests/migration.sql',
  '20260728120000_add_deterministic_execution_plan/migration.sql',
  '20260729000000_fix_granted_by_type/migration.sql',
  '20260729140000_add_builtin_skills/migration.sql',
  '20260731110000_add_execution_step_output_schema_json/migration.sql',
  '20260731110000_add_skill_config_output_schema/migration.sql',
  '20260801120000_add_execution_step_input_schema_json/migration.sql',
  '20260801130000_add_candidate_schema_and_build_diff/migration.sql',
  '20260801140000_add_attestation_and_fixture/migration.sql',
  '20260802000000_fix_uuid_id_defaults/migration.sql',
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
  const migrationsDir = path.resolve(__dirname, '../../../core/platform/prisma/migrations');
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
    const catalog = new CapabilityContractCatalogService();
    const attestationClient = {
      hasValidAttestation: jest.fn().mockResolvedValue(true),
      hasValidAttestationForVersion: jest.fn().mockResolvedValue(true),
    };
    freezeService = new DeterministicPlanFreezeService(prisma, validator, catalog, attestationClient as any);

    // Mock axios for llm_operation catalog and attestation calls
    mockAxios.get.mockImplementation(async (url: string) => {
      if (url.includes('/operations/catalog/')) {
        return {
          data: {
            capabilityRef: { id: 'summarize_list', version: 'v1', digest: 'test-digest' },
            inputSchema: { type: 'object', properties: { items: { type: 'array' } } },
            outputSchema: { type: 'object', properties: { summaryText: { type: 'string' } } },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        } as any;
      }
      if (url.includes('/operations/attestations/')) {
        return {
          data: { valid: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        } as any;
      }
      throw new Error(`Unexpected axios GET: ${url}`);
    });

    await applyMigrations(prisma);

    // Seed a builtin_skill + builtin_skill_version row so the PINNED
    // 'tavily_search@1.0.0' nodes resolve through the strict §9.3 builtin
    // manifest branch — the same branch the markdown-artifact-writer@1.0.1
    // rows satisfy in the dev DB. Without it the pinned version falls to the
    // custom-release branch, `Number('1.0.0')` → 1, and fails closed on a
    // missing capability_releases row (the live config must not be
    // substituted). The seed is hermetic: afterAll removes both rows.
    const tavilySkill = await prisma.builtinSkill.upsert({
      where: { capabilityKey: 'tavily_search' },
      update: {},
      create: {
        capabilityKey: 'tavily_search',
        displayName: 'Tavily Search (e2e seed)',
        description: 'e2e seed for deterministic plan freeze',
        owner: 'platform-search',
        category: 'search',
        isEnabled: true,
      },
    });
    await prisma.builtinSkillVersion.upsert({
      where: {
        builtinSkillId_definitionVersion: {
          builtinSkillId: tavilySkill.id,
          definitionVersion: '1.0.0',
        },
      },
      update: {},
      create: {
        builtinSkillId: tavilySkill.id,
        definitionVersion: '1.0.0',
        apiVersion: 'platform.ops/v1alpha1',
        definitionDigest: 'sha256:' + 'e2e-tavily'.padEnd(64, '0'),
        manifestJson: {
          spec: {
            contracts: {
              output: {
                schema: {
                  type: 'object',
                  properties: { results: { type: 'array' } },
                },
              },
            },
          },
        },
      },
    });
    // Also seed a skill_configs row so the unpinned fallback path stays
    // resolvable too. Custom skills have no input schema in the DB, so input
    // validation for it is skipped by design.
    await prisma.skillConfig.upsert({
      where: { name: 'tavily_search' },
      update: {
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { results: { type: 'array' } },
        },
        configStatus: 'published',
        isActive: true,
      },
      create: {
        name: 'tavily_search',
        description: 'e2e seed for deterministic plan freeze',
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { results: { type: 'array' } },
        },
        configStatus: 'published',
        isActive: true,
      },
    });
    // Same for the markdown artifact writer used by the builtin-handler tests:
    // without a resolvable authoritative output schema, freeze fails closed.
    await prisma.skillConfig.upsert({
      where: { name: 'platform.document.markdown-artifact-writer' },
      update: {
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { artifact: { type: 'object' } },
        },
        configStatus: 'published',
        isActive: true,
      },
      create: {
        name: 'platform.document.markdown-artifact-writer',
        description: 'e2e seed for deterministic plan freeze',
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { artifact: { type: 'object' } },
        },
        configStatus: 'published',
        isActive: true,
      },
    });
  }, 60000);

  afterAll(async () => {
    await prisma.skillConfig.deleteMany({
      where: { name: { in: ['tavily_search', 'platform.document.markdown-artifact-writer'] } },
    });
    // Remove the hermetic tavily_search builtin seed (versions cascade via
    // onDelete: Cascade). Never touches markdown-artifact-writer, which
    // resolves against the platform's own dev-DB rows.
    await prisma.builtinSkill.deleteMany({
      where: { capabilityKey: 'tavily_search' },
    });
    await prisma.$disconnect();
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
          skillVersion: '1.0.1',
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

    // Start a mock LLM Operation Registry so 'summarize_list' resolves its
    // authoritative contract hermetically (no dependency on ai-orchestrator).
    const registryServer = http.createServer((req, res) => {
      if (req.url === '/ai/operations/summarize_list' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // The registry values mirror the node pins EXACTLY (§6.4 fail-closed
        // version/promptTemplateId verification), and the output schema
        // declares the path the downstream node binds (fix ⑧).
        res.end(JSON.stringify({
          operationId: 'summarize_list',
          promptTemplateId: 'template-sum-1',
          version: 'v1',
          modelPolicyId: 'task-default',
          temperature: 0,
          maxInputTokens: 4000,
          maxOutputTokens: 2000,
          inputSchema: {
            type: 'object',
            required: ['items'],
            properties: { items: { type: 'array' } },
          },
          outputSchema: {
            type: 'object',
            required: ['summaryText'],
            properties: { summaryText: { type: 'string' } },
          },
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>(resolve => registryServer.listen(0, resolve));
    const registryAddr = registryServer.address() as { port: number };
    const originalAiOrchestratorUrl = process.env.AI_ORCHESTRATOR_URL;
    process.env.AI_ORCHESTRATOR_URL = `http://localhost:${registryAddr.port}`;

    // 2. Freeze plan into execution_plans and execution_steps tables
    let frozenPlan: { planId: string; planHash: string };
    try {
      frozenPlan = await freezeService.freezeAndPersistPlan(execution.id, planDraft);
    } finally {
      if (originalAiOrchestratorUrl !== undefined) {
        process.env.AI_ORCHESTRATOR_URL = originalAiOrchestratorUrl;
      } else {
        delete process.env.AI_ORCHESTRATOR_URL;
      }
      registryServer.close();
    }

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

    // 4. Verify authoritative contract metadata is frozen onto every step (§9.3):
    //    contractRef/contractDigest live in outputContractJson._frozenMetadata;
    //    inputBindingsJson stays clean of metadata; outputSchemaJson carries the
    //    authoritative schema resolved from the catalog (fail-closed).
    for (const step of steps) {
      const inputBindings = step.inputBindingsJson as any;
      const outputContract = step.outputContractJson as any;
      const inputMeta = inputBindings?._frozenMetadata;
      const outputMeta = outputContract?._frozenMetadata;
      expect(inputMeta).toBeUndefined();
      expect(outputMeta).toBeDefined();
      expect(outputMeta.contractRef).toMatch(/^capability:\/\/[a-z_]+(\.[a-z-]+)*\/.+\/.+\/output$/);
      expect(outputMeta.contractDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(outputMeta.contractCheckMode).toBe('schema');
      expect(outputMeta.legacy).toBe(false);
      expect(step.outputSchemaJson).toBeDefined();
      expect(Object.keys(step.outputSchemaJson as any).length).toBeGreaterThan(0);
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
      new LegacyOutputAdapterService(),
      new CapabilityContractCatalogService(),
      new OutputNormalizerService(),
      new GracePolicyService(),
    );

    // Call advanceExecution: the single step acquires its lease and completes
    // via the mock orchestrator in one pass (leaseOwner persists after success).
    await scheduler.advanceExecution(execution.id);

    // Verify execution completed
    const updatedExecution = await prisma.execution.findUnique({
      where: { id: execution.id },
    });
    expect(updatedExecution?.status).toBe('succeeded');

    // Verify step acquired lease and succeeded with validated output
    const steps = await prisma.executionStep.findMany({
      where: { executionId: execution.id },
    });
    expect(steps.length).toBe(1);
    expect(steps[0].status).toBe('succeeded');
    expect(steps[0].leaseOwner).toBe('deterministic-scheduler');
    expect(steps[0].outputJson).toEqual({ results: ['mock result'] });

    // Verify events were created
    const events = await prisma.executionEvent.findMany({
      where: { executionId: execution.id },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const stepStartedEvents = events.filter(e => e.eventType === 'step.started');
    expect(stepStartedEvents.length).toBe(1);
  });

  it('persists the __promptDebug snapshot into step outputJson for llm_operation steps', async () => {
    // The global axios mock (beforeEach) serves the llm_operation catalog with
    // capabilityRef { id: 'summarize_list', version: 'v1', digest: 'test-digest' }
    // and outputSchema { summaryText: string } — pin the node to that authority.
    const planDraft: any = {
      schemaVersion: 'deterministic-plan/v1',
      plannerVersion: 'v1',
      catalogVersion: 'v1',
      planType: 'sequential',
      objective: 'Summarize list',
      originalRequest: 'Summarize list',
      status: 'draft',
      nodes: [
        {
          nodeId: 'summarize_list_node',
          sequence: 1,
          title: '列表摘要',
          kind: 'llm_operation',
          operationId: 'summarize_list',
          runtimeType: 'llm_operation',
          dependsOn: [],
          inputBindings: {
            items: { source: 'literal', value: ['条目一', '条目二'] },
          },
          outputContract: { summaryText: 'string' },
          failurePolicy: 'abort',
        },
      ],
      finalOutputs: [
        {
          targetField: 'summaryText',
          fromNodeId: 'summarize_list_node',
          fromNodeOutput: 'summaryText',
          expectedType: 'string',
        },
      ],
    };

    const execution = await prisma.execution.create({
      data: {
        executionMode: 'deterministic_plan',
        status: 'queued',
        createdBy: '5654953e-1b01-4094-bb29-b28f61d3f6a6',
        inputJson: { prompt: '总结列表' },
      },
    });

    await freezeService.freezeAndPersistPlan(execution.id, planDraft);

    // Mock the LLM adapter: success output + promptDebug snapshot (B-2)
    const promptSnapshot = {
      systemPrompt: '你是一个专业的总结分析助手。',
      userPrompt: '请对以下内容做结构化总结：\n\n[条目 1] 条目一',
      modelId: 'model-1',
      llmResponseText: '{"summaryText": "要点总结"}',
    };
    const mockLlmAdapter = {
      executeOperation: jest.fn().mockResolvedValue({
        success: true,
        operationId: 'summarize_list',
        templateVersion: 'v1',
        output: { summaryText: '要点总结' },
        promptDebug: promptSnapshot,
      }),
    };

    const eventService = new ExecutionEventService(prisma);
    const eventPublisher = new ExecutionStreamService(eventService);
    const inputResolver = new DeterministicNodeInputResolverService(prisma);
    const finalOutput = new DeterministicFinalOutputService(prisma);

    const scheduler = new DeterministicPlanSchedulerService(
      prisma,
      inputResolver,
      finalOutput,
      mockLlmAdapter as any,
      { executeStep: jest.fn() } as any,
      eventPublisher,
      new LegacyOutputAdapterService(),
      new CapabilityContractCatalogService(),
      new OutputNormalizerService(),
      new GracePolicyService(),
    );

    await scheduler.advanceExecution(execution.id);

    const steps = await prisma.executionStep.findMany({
      where: { executionId: execution.id },
    });
    expect(steps.length).toBe(1);
    expect(steps[0].status).toBe('succeeded');
    expect((steps[0].outputJson as any)?.summaryText).toBe('要点总结');
    expect((steps[0].outputJson as any)?.__promptDebug).toEqual(promptSnapshot);
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
          skillVersion: '1.0.1',
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
              id: 'test-md',
              url: '/artifacts/test.md',
              name: 'test.md',
              type: 'markdown',
              metadata: {},
              mimeType: 'text/markdown',
            },
            artifacts: [{
              id: 'test-md',
              url: '/artifacts/test.md',
              name: 'test.md',
              type: 'markdown',
              metadata: {},
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
      new LegacyOutputAdapterService(),
      new CapabilityContractCatalogService(),
      new OutputNormalizerService(),
      new GracePolicyService(),
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
          skillVersion: '1.0.1',
          runtimeType: 'workflow',
          dependsOn: [],
          inputBindings: {
            content: { source: 'literal', value: 'hello from e2e' },
            fileName: { source: 'literal', value: 'e2e-test.md' },
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

    // This test performs REAL HTTP calls (builtin handler → mock Document
    // Domain server). The global jest.mock('axios') above is for the
    // llm_operation catalog/attestation GETs; restore the real axios POST
    // implementation for this test only.
    const realAxios = jest.requireActual('axios');
    (mockAxios.post as jest.Mock).mockImplementation(realAxios.default.post);

    // Start mock Document Domain HTTP server so the real handler makes an actual HTTP call
    const mockDomainServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        if (req.url === '/internal/document/markdown-artifacts/invoke' && req.method === 'POST') {
          const artifact = {
            url: 'e2e://artifacts/test-artifact.md',
            name: 'test-artifact.md',
            type: 'markdown',
            metadata: { sha256: 'e2e-test-sha256' },
            sizeBytes: 64,
            mimeType: 'text/markdown',
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            output: {
              artifact,
              artifacts: [artifact],
              artifact_ref: { url: 'e2e://artifacts/test-artifact.md', sha256: 'e2e-test-sha256' },
              sha256: 'e2e-test-sha256',
              sizeBytes: 64,
            },
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
      const registry = new RuntimeAdapterRegistry([
        new BrowserRuntimeAdapter(),
        new CapabilityRuntimeAdapter(new OutputNormalizerService()),
        new DocumentRuntimeAdapter(),
        new WorkflowRuntimeAdapter(),
        builtinAdapter,
      ]);
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
        new LegacyOutputAdapterService(),
        new CapabilityContractCatalogService(),
        new OutputNormalizerService(),
        new GracePolicyService(),
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

  it('should reject queued execution after legacy grace deadline (§17.1)', async () => {
    const planDraft: any = {
      schemaVersion: 'deterministic-plan/v1',
      plannerVersion: 'v1',
      catalogVersion: 'v1',
      planType: 'sequential',
      objective: 'grace policy e2e',
      originalRequest: 'grace policy e2e',
      status: 'draft',
      nodes: [
        {
          nodeId: 'step1',
          sequence: 1,
          title: 'search step',
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

    const execution = await prisma.execution.create({
      data: {
        executionMode: 'deterministic_plan',
        status: 'queued',
        createdBy: '5654953e-1b01-4094-bb29-b28f61d3f6a6',
        inputJson: { prompt: 'test' },
      },
    });
    await freezeService.freezeAndPersistPlan(execution.id, planDraft);

    // §17.1 gate applies ONLY to legacy plans (fix ⑩): nodes without the
    // freeze-stamped authoritative contractRef. Today's freeze stamps
    // contractRef, so strip it from the frozen planJson to simulate a plan
    // frozen before authoritative contract arbitration existed.
    const frozenPlan = await prisma.executionPlan.findFirst({
      where: { executionId: execution.id },
    });
    const legacyJson = JSON.parse(JSON.stringify(frozenPlan!.planJson));
    for (const node of (legacyJson.nodes ?? []) as any[]) {
      delete node.contractRef;
      delete node.contractDigest;
    }
    await prisma.executionPlan.update({
      where: { id: frozenPlan!.id },
      data: { planJson: legacyJson },
    });

    const eventService = new ExecutionEventService(prisma);
    const eventPublisher = new ExecutionStreamService(eventService);
    const inputResolver = new DeterministicNodeInputResolverService(prisma);
    const finalOutput = new DeterministicFinalOutputService(prisma);
    const llmAdapter = new LlmOperationRuntimeAdapter();
    const mockOrchestrator = {
      executeStep: jest.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        output: { results: ['mock result'] },
      }),
    };

    // Past deadline + default reject_not_started mode → queued executions are
    // rejected without ever touching the orchestrator.
    process.env.LEGACY_GRACE_DEADLINE = '2020-01-01T00:00:00.000Z';
    const expiredGrace = new GracePolicyService();
    delete process.env.LEGACY_GRACE_DEADLINE;

    const scheduler = new DeterministicPlanSchedulerService(
      prisma,
      inputResolver,
      finalOutput,
      llmAdapter,
      mockOrchestrator as any,
      eventPublisher,
      new LegacyOutputAdapterService(),
      new CapabilityContractCatalogService(),
      new OutputNormalizerService(),
      expiredGrace,
    );

    await scheduler.advanceExecution(execution.id);

    const updatedExecution = await prisma.execution.findUnique({
      where: { id: execution.id },
    });
    expect(updatedExecution?.status).toBe('failed');
    expect(updatedExecution?.failureCode).toBe('LEGACY_GRACE_EXPIRED');

    // The rejection event was published; the orchestrator never ran.
    const events = await prisma.executionEvent.findMany({
      where: { executionId: execution.id },
    });
    expect(events.some((e) => e.eventType === 'execution.legacy_grace.rejected')).toBe(true);
    expect(mockOrchestrator.executeStep).not.toHaveBeenCalled();
  });
});
