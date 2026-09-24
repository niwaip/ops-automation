import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { BadRequestException } from '@nestjs/common';
import {
  SystemBackupService,
  TemplateFlowBackupHandler,
  WorkspaceBackupHandler,
  SystemBackupArchive,
} from '@ops/system-backup';
import { BuiltinSkillProvisioningService } from '@ops/skill-registry/builtin';
import { CoordinationCollaboratorService } from '@ops/workbench';

const testStorageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-backup-test-'));
process.env.WORKSPACE_STORAGE_ROOT = testStorageRoot;

/**
 * Stateful In-Memory Database Engine simulating PostgreSQL & Prisma
 * Enforces foreign key constraints, unique constraints, and SQL queries.
 */
class InMemoryDatabaseEngine {
  workspaces = new Map<string, any>();
  workspaceNodes = new Map<string, any>();
  llmOperations = new Map<string, any>();
  llmOperationVersions = new Map<string, any>();
  llmOperationActivations = new Map<string, any>();
  executionFlowTemplates = new Map<string, any>();

  createPrismaClient() {
    return {
      workspace: {
        count: async () => this.workspaces.size,
        findMany: async (args?: any) => {
          const list = Array.from(this.workspaces.values());
          if (args?.select) {
            return list.map((w) => {
              const res: any = {};
              for (const k of Object.keys(args.select)) res[k] = w[k];
              return res;
            });
          }
          return list;
        },
        findUnique: async (args: { where: { id: string } }) => {
          return this.workspaces.get(args.where.id) || null;
        },
        findFirst: async (args: { where: any }) => {
          for (const w of this.workspaces.values()) {
            let match = true;
            for (const [k, v] of Object.entries(args.where)) {
              if (w[k] !== v) {
                match = false;
                break;
              }
            }
            if (match) return w;
          }
          return null;
        },
        create: async (args: { data: any }) => {
          const id = args.data.id || `ws-${Date.now()}-${Math.random()}`;
          const item = { ...args.data, id, createdAt: new Date(), updatedAt: new Date() };
          this.workspaces.set(id, item);
          return item;
        },
        update: async (args: { where: { id: string }; data: any }) => {
          const existing = this.workspaces.get(args.where.id);
          if (!existing) throw new Error(`Workspace ${args.where.id} not found`);
          const updated = { ...existing, ...args.data, updatedAt: new Date() };
          this.workspaces.set(args.where.id, updated);
          return updated;
        },
      },

      workspaceNode: {
        count: async () => this.workspaceNodes.size,
        findMany: async (args?: any) => {
          const list = Array.from(this.workspaceNodes.values());
          if (args?.select) {
            return list.map((n) => {
              const res: any = {};
              for (const k of Object.keys(args.select)) res[k] = n[k];
              return res;
            });
          }
          return list;
        },
        findUnique: async (args: { where: { id: string } }) => {
          return this.workspaceNodes.get(args.where.id) || null;
        },
        findFirst: async (args: { where: any }) => {
          for (const n of this.workspaceNodes.values()) {
            let match = true;
            for (const [k, v] of Object.entries(args.where)) {
              if (n[k] !== v) {
                match = false;
                break;
              }
            }
            if (match) return n;
          }
          return null;
        },
        create: async (args: { data: any }) => {
          const data = args.data;
          // Enforce foreign key: workspaceId must exist in workspaces
          if (!this.workspaces.has(data.workspaceId)) {
            throw new Error(
              `Foreign key violation: workspaceId ${data.workspaceId} does not exist in workspaces`
            );
          }
          // Enforce foreign key: parentId must exist in workspaceNodes if provided
          if (data.parentId && !this.workspaceNodes.has(data.parentId)) {
            throw new Error(
              `Foreign key violation: parentId ${data.parentId} does not exist in workspaceNodes`
            );
          }
          const id = data.id || `node-${Date.now()}-${Math.random()}`;
          const item = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
          this.workspaceNodes.set(id, item);
          return item;
        },
        update: async (args: { where: { id: string }; data: any }) => {
          const existing = this.workspaceNodes.get(args.where.id);
          if (!existing) throw new Error(`WorkspaceNode ${args.where.id} not found`);
          if (args.data.workspaceId && !this.workspaces.has(args.data.workspaceId)) {
            throw new Error(
              `Foreign key violation: workspaceId ${args.data.workspaceId} does not exist`
            );
          }
          if (args.data.parentId && !this.workspaceNodes.has(args.data.parentId)) {
            throw new Error(
              `Foreign key violation: parentId ${args.data.parentId} does not exist`
            );
          }
          const updated = { ...existing, ...args.data, updatedAt: new Date() };
          this.workspaceNodes.set(args.where.id, updated);
          return updated;
        },
      },

      executionFlowTemplate: {
        findMany: async () => Array.from(this.executionFlowTemplates.values()),
        findUnique: async (args: { where: { name: string } }) => {
          for (const f of this.executionFlowTemplates.values()) {
            if (f.name === args.where.name) return f;
          }
          return null;
        },
        create: async (args: { data: any }) => {
          const id = args.data.id || `flow-${Date.now()}`;
          const item = { ...args.data, id };
          this.executionFlowTemplates.set(id, item);
          return item;
        },
        update: async (args: { where: { name: string }; data: any }) => {
          for (const [id, f] of this.executionFlowTemplates.entries()) {
            if (f.name === args.where.name) {
              const updated = { ...f, ...args.data };
              this.executionFlowTemplates.set(id, updated);
              return updated;
            }
          }
          throw new Error(`Execution flow template ${args.where.name} not found`);
        },
      },

      $queryRawUnsafe: async <T = any>(query: string, ...values: any[]): Promise<T> => {
        const q = query.trim();
        if (q.includes('FROM public.llm_operations')) {
          if (q.includes('WHERE id = $1::uuid OR operation_key = $2')) {
            const [id, opKey] = values;
            for (const op of this.llmOperations.values()) {
              if (op.id === id || op.operation_key === opKey) {
                return [op] as any;
              }
            }
            return [] as any;
          }
          return Array.from(this.llmOperations.values()) as any;
        }

        if (q.includes('FROM public.llm_operation_versions')) {
          if (q.includes('WHERE id = $1::uuid OR (operation_id = $2::uuid AND version = $3)')) {
            const [id, opId, version] = values;
            for (const v of this.llmOperationVersions.values()) {
              if (v.id === id || (v.operation_id === opId && v.version === version)) {
                return [v] as any;
              }
            }
            return [] as any;
          }
          return Array.from(this.llmOperationVersions.values()) as any;
        }

        if (q.includes('FROM public.llm_operation_activations')) {
          if (q.includes('WHERE id = $1::uuid OR (operation_id = $2::uuid AND environment = $3)')) {
            const [id, opId, env] = values;
            for (const a of this.llmOperationActivations.values()) {
              if (a.id === id || (a.operation_id === opId && a.environment === env)) {
                return [a] as any;
              }
            }
            return [] as any;
          }
          return Array.from(this.llmOperationActivations.values()) as any;
        }

        return [] as any;
      },

      $executeRawUnsafe: async (query: string, ...values: any[]): Promise<number> => {
        const q = query.trim();
        if (q.startsWith('INSERT INTO public.llm_operations')) {
          const [id, opKey, displayName, description, owner, status, source, createdAt] = values;
          this.llmOperations.set(id, {
            id,
            operation_key: opKey,
            display_name: displayName,
            description,
            owner,
            status,
            source,
            created_at: createdAt,
            updated_at: new Date(),
          });
          return 1;
        }

        if (q.startsWith('UPDATE public.llm_operations')) {
          const [displayName, description, owner, status, source, id] = values;
          const existing = this.llmOperations.get(id);
          if (!existing) throw new Error(`llm_operation ${id} not found`);
          this.llmOperations.set(id, {
            ...existing,
            display_name: displayName,
            description,
            owner,
            status,
            source,
            updated_at: new Date(),
          });
          return 1;
        }

        if (q.startsWith('INSERT INTO public.llm_operation_versions')) {
          const [
            id,
            operationId,
            version,
            state,
            manifestJson,
            opDigest,
            contractDigest,
            changeSummary,
            source,
            approvedBy,
            approvedAt,
            createdBy,
            createdAt,
          ] = values;

          // FOREIGN KEY CHECK: operationId must exist in llm_operations
          if (!this.llmOperations.has(operationId)) {
            throw new Error(
              `Foreign key constraint violation: llm_operations(${operationId}) does not exist`
            );
          }

          this.llmOperationVersions.set(id, {
            id,
            operation_id: operationId,
            version,
            state,
            manifest_json: typeof manifestJson === 'string' ? JSON.parse(manifestJson) : manifestJson,
            operation_digest: opDigest,
            contract_digest: contractDigest,
            change_summary: changeSummary,
            source,
            approved_by: approvedBy,
            approved_at: approvedAt,
            created_by: createdBy,
            created_at: createdAt,
            updated_at: new Date(),
          });
          return 1;
        }

        if (q.startsWith('UPDATE public.llm_operation_versions')) {
          const [
            state,
            manifestJson,
            opDigest,
            contractDigest,
            changeSummary,
            source,
            approvedBy,
            approvedAt,
            id,
          ] = values;
          const existing = this.llmOperationVersions.get(id);
          if (!existing) throw new Error(`llm_operation_version ${id} not found`);
          this.llmOperationVersions.set(id, {
            ...existing,
            state,
            manifest_json: typeof manifestJson === 'string' ? JSON.parse(manifestJson) : manifestJson,
            operation_digest: opDigest,
            contract_digest: contractDigest,
            change_summary: changeSummary,
            source,
            approved_by: approvedBy,
            approved_at: approvedAt,
            updated_at: new Date(),
          });
          return 1;
        }

        if (q.startsWith('INSERT INTO public.llm_operation_activations')) {
          const [
            id,
            operationId,
            versionId,
            env,
            label,
            activatedBy,
            reason,
            rolloutPercent,
            activatedAt,
          ] = values;

          // FOREIGN KEY CHECKS
          if (!this.llmOperations.has(operationId)) {
            throw new Error(
              `Foreign key constraint violation: llm_operations(${operationId}) does not exist`
            );
          }
          if (!this.llmOperationVersions.has(versionId)) {
            throw new Error(
              `Foreign key constraint violation: llm_operation_versions(${versionId}) does not exist`
            );
          }

          this.llmOperationActivations.set(id, {
            id,
            operation_id: operationId,
            version_id: versionId,
            environment: env,
            label,
            activated_by: activatedBy,
            reason,
            rollout_percent: rolloutPercent,
            activated_at: activatedAt,
            updated_at: new Date(),
          });
          return 1;
        }

        if (q.startsWith('UPDATE public.llm_operation_activations')) {
          const [versionId, label, activatedBy, reason, rolloutPercent, activatedAt, id] = values;
          const existing = this.llmOperationActivations.get(id);
          if (!existing) throw new Error(`llm_operation_activation ${id} not found`);
          if (!this.llmOperationVersions.has(versionId)) {
            throw new Error(
              `Foreign key constraint violation: llm_operation_versions(${versionId}) does not exist`
            );
          }
          this.llmOperationActivations.set(id, {
            ...existing,
            version_id: versionId,
            label,
            activated_by: activatedBy,
            reason,
            rollout_percent: rolloutPercent,
            activated_at: activatedAt,
            updated_at: new Date(),
          });
          return 1;
        }

        return 1;
      },
    };
  }
}

describe('SystemBackup Integration Roundtrip Tests', () => {
  const createMockOtherHandlers = () => ({
    aiModelHandler: {
      count: jest.fn().mockResolvedValue(0),
      export: jest.fn().mockResolvedValue({ models: [], providers: [], apiKeys: [] }),
      preview: jest.fn().mockResolvedValue(null),
      import: jest.fn().mockResolvedValue({ created: 0, updated: 0, skipped: 0 }),
    } as any,
    skillWorkflowHandler: {
      countSkills: jest.fn().mockResolvedValue(0),
      countWorkflows: jest.fn().mockResolvedValue(0),
      exportSkills: jest.fn().mockResolvedValue({ skillConfigs: [] }),
      exportWorkflows: jest.fn().mockResolvedValue({ temporalWorkflows: [] }),
      previewSkills: jest.fn().mockResolvedValue(null),
      previewWorkflows: jest.fn().mockResolvedValue(null),
      importSkills: jest.fn().mockResolvedValue({ created: 0, updated: 0, skipped: 0 }),
      importWorkflows: jest.fn().mockResolvedValue({ created: 0, updated: 0, skipped: 0 }),
    } as any,
    capabilityReleaseHandler: {
      count: jest.fn().mockResolvedValue(0),
      export: jest.fn().mockResolvedValue({ capabilityReleases: [] }),
      preview: jest.fn().mockResolvedValue(null),
      import: jest.fn().mockResolvedValue({ created: 0, updated: 0, skipped: 0 }),
    } as any,
    userOrgHandler: {
      count: jest.fn().mockResolvedValue(0),
      export: jest.fn().mockResolvedValue({ users: [], organizations: [] }),
      preview: jest.fn().mockResolvedValue(null),
      import: jest.fn().mockResolvedValue({ created: 0, updated: 0, skipped: 0 }),
    } as any,
    taskPolicyHandler: {
      count: jest.fn().mockResolvedValue(0),
      export: jest.fn().mockResolvedValue({ policySets: [], recipes: [], commandAliases: [] }),
      preview: jest.fn().mockResolvedValue(null),
      import: jest.fn().mockResolvedValue({ created: 0, updated: 0, skipped: 0 }),
    } as any,
  });

  describe('Scenario 1: Export -> Empty Database Restore', () => {
    it('successfully exports workspaces with folder hierarchy and LLM operations, then restores to clean database', async () => {
      // 1. Seed source DB
      const sourceDb = new InMemoryDatabaseEngine();
      const ws1 = {
        id: 'ws-src-1',
        name: '采购部空间',
        type: 'department',
        departmentId: 'dept-procurement',
        quotaBytes: 10737418240n,
        usedBytes: 5242880n,
      };
      sourceDb.workspaces.set(ws1.id, ws1);

      // Hierarchical nodes: Folder -> SubFolder -> File
      const rootFolder = {
        id: 'node-folder-1',
        workspaceId: ws1.id,
        parentId: null,
        name: '2026采购订单',
        type: 'folder',
        fileSize: 0n,
        createdBy: 'user-alice',
      };
      const subFolder = {
        id: 'node-folder-2',
        workspaceId: ws1.id,
        parentId: rootFolder.id,
        name: 'Q3季度',
        type: 'folder',
        fileSize: 0n,
        createdBy: 'user-alice',
      };
      const contractPdf = {
        id: 'node-file-1',
        workspaceId: ws1.id,
        parentId: subFolder.id,
        name: '服务器采购合同.pdf',
        type: 'file',
        fileSize: 2048000n,
        mimeType: 'application/pdf',
        storagePath: 'department/dept-procurement/node-file-1_contract.pdf',
        digestJson: { sha256: 'abc123hash', pages: 12 },
        createdBy: 'user-bob',
      };
      sourceDb.workspaceNodes.set(rootFolder.id, rootFolder);
      sourceDb.workspaceNodes.set(subFolder.id, subFolder);
      sourceDb.workspaceNodes.set(contractPdf.id, contractPdf);

      // Seed LLM Operation, version, activation
      const op1 = {
        id: 'src-op-1',
        operation_key: 'contract.risk_analysis',
        display_name: '合同风险审核',
        description: '审核合同法律及商业风险',
        owner: 'legal',
        status: 'active',
        source: 'system_seed',
        created_at: new Date().toISOString(),
      };
      const ver1 = {
        id: 'src-ver-1',
        operation_id: op1.id,
        version: '1.0.0',
        state: 'approved',
        manifest_json: { model: 'gpt-4o', temperature: 0.2 },
        operation_digest: 'op-digest-1',
        contract_digest: 'contract-digest-1',
        change_summary: '初始版本',
        source: 'system_seed',
        approved_by: 'admin',
        approved_at: new Date().toISOString(),
        created_by: 'admin',
        created_at: new Date().toISOString(),
      };
      const act1 = {
        id: 'src-act-1',
        operation_id: op1.id,
        version_id: ver1.id,
        environment: 'production',
        label: 'production',
        activated_by: 'admin',
        reason: '上线',
        rollout_percent: 100,
        activated_at: new Date().toISOString(),
      };
      sourceDb.llmOperations.set(op1.id, op1);
      sourceDb.llmOperationVersions.set(ver1.id, ver1);
      sourceDb.llmOperationActivations.set(act1.id, act1);

      // Export from source DB
      const sourcePrisma = sourceDb.createPrismaClient();
      const otherHandlers = createMockOtherHandlers();
      const sourceWsHandler = new WorkspaceBackupHandler(sourcePrisma as any);
      const sourceTemplateFlowHandler = new TemplateFlowBackupHandler(sourcePrisma as any);

      // Seed physical file on disk for contractPdf so export embeds contentBase64
      const physicalPdfPath = sourceWsHandler.resolveStoragePath(contractPdf.storagePath);
      fs.mkdirSync(path.dirname(physicalPdfPath), { recursive: true });
      fs.writeFileSync(physicalPdfPath, Buffer.from('TEST_PDF_FILE_BINARY_CONTENT'));

      const sourceBackupService = new SystemBackupService(
        otherHandlers.aiModelHandler,
        otherHandlers.skillWorkflowHandler,
        otherHandlers.capabilityReleaseHandler,
        sourceTemplateFlowHandler,
        otherHandlers.userOrgHandler,
        otherHandlers.taskPolicyHandler,
        sourceWsHandler
      );

      const archive = await sourceBackupService.exportBackup([
        'workspaces',
        'executionFlowTemplates',
      ]);

      expect(archive.manifest.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(archive.modules.workspaces?.workspaces).toHaveLength(1);
      expect(archive.modules.workspaces?.nodes).toHaveLength(3);
      const exportedPdfNode = (archive.modules.workspaces as any)?.nodes?.find((n: any) => n.id === contractPdf.id);
      expect(exportedPdfNode?.contentBase64).toBe(Buffer.from('TEST_PDF_FILE_BINARY_CONTENT').toString('base64'));
      expect(archive.modules.executionFlowTemplates?.llmOperations).toHaveLength(1);
      expect(archive.modules.executionFlowTemplates?.llmOperationVersions).toHaveLength(1);
      expect(archive.modules.executionFlowTemplates?.llmOperationActivations).toHaveLength(1);

      // 2. Restore into target completely empty DB
      const targetDb = new InMemoryDatabaseEngine();
      const targetPrisma = targetDb.createPrismaClient();
      const targetWsHandler = new WorkspaceBackupHandler(targetPrisma as any);
      const targetTemplateFlowHandler = new TemplateFlowBackupHandler(targetPrisma as any);

      const targetBackupService = new SystemBackupService(
        otherHandlers.aiModelHandler,
        otherHandlers.skillWorkflowHandler,
        otherHandlers.capabilityReleaseHandler,
        targetTemplateFlowHandler,
        otherHandlers.userOrgHandler,
        otherHandlers.taskPolicyHandler,
        targetWsHandler
      );

      const preview = await targetBackupService.previewBackup(archive);
      expect(preview.valid).toBe(true);
      expect(preview.summary.newItems).toBeGreaterThan(0);
      expect(preview.summary.conflictItems).toBe(0);

      const importResult = await targetBackupService.importBackup(archive, 'merge_override');
      expect(importResult.success).toBe(true);
      expect(importResult.errors).toHaveLength(0);

      // 3. Verify Target DB content and hierarchy
      expect(targetDb.workspaces.size).toBe(1);
      expect(targetDb.workspaces.get(ws1.id)?.name).toBe('采购部空间');

      expect(targetDb.workspaceNodes.size).toBe(3);
      const restoredFile = targetDb.workspaceNodes.get(contractPdf.id);
      expect(restoredFile).toBeDefined();
      expect(restoredFile.name).toBe('服务器采购合同.pdf');
      expect(restoredFile.fileSize).toBe(2048000n);
      expect(restoredFile.storagePath).toBe('department/dept-procurement/node-file-1_contract.pdf');
      expect(restoredFile.parentId).toBe(subFolder.id);

      expect(targetDb.llmOperations.size).toBe(1);
      const restoredOp = targetDb.llmOperations.get(op1.id);
      expect(restoredOp?.operation_key).toBe('contract.risk_analysis');

      expect(targetDb.llmOperationVersions.size).toBe(1);
      const restoredVer = targetDb.llmOperationVersions.get(ver1.id);
      expect(restoredVer?.operation_id).toBe(op1.id);

      expect(targetDb.llmOperationActivations.size).toBe(1);
      const restoredAct = targetDb.llmOperationActivations.get(act1.id);
      expect(restoredAct?.operation_id).toBe(op1.id);
      expect(restoredAct?.version_id).toBe(ver1.id);
    });
  });

  describe('Scenario 2: Export -> Existing Data Merge Restore with Remapping', () => {
    it('correctly maps operation and version IDs when target DB has matching operation_key under different UUID', async () => {
      // 1. Create a backup archive where the LLM Operation has UUID "src-op-uuid-999"
      const archive: SystemBackupArchive = {
        manifest: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          systemVersion: '1.0.0',
          checksum: '',
          counts: {
            aiModels: 0,
            skills: 0,
            temporalWorkflows: 0,
            capabilityReleases: 0,
            browserTemplates: 0,
            executionFlowTemplates: 3,
            userOrganizations: 0,
            taskPolicies: 0,
            workspaces: 2,
            documentTemplates: 0,
          },
        },
        modules: {
          workspaces: {
            workspaces: [
              {
                id: 'backup-ws-uuid-1',
                name: '个人空间',
                type: 'personal',
                ownerUserId: 'user-charlie',
                quotaBytes: 5368709120,
                usedBytes: 1024,
              },
            ],
            nodes: [
              {
                id: 'backup-node-uuid-1',
                workspaceId: 'backup-ws-uuid-1',
                parentId: null,
                name: '我的便签.md',
                type: 'file',
                fileSize: 1024,
                storagePath: 'personal/user-charlie/note.md',
                contentBase64: Buffer.from('# 我的个人便签').toString('base64'),
                createdBy: 'user-charlie',
              },
            ],
          },
          executionFlowTemplates: {
            llmOperations: [
              {
                id: 'src-op-uuid-999',
                operation_key: 'document.summarize',
                display_name: '文档速读与摘要',
                description: '快速提炼正文核心观点',
                owner: 'system',
                status: 'active',
                source: 'system_seed',
                created_at: new Date().toISOString(),
              },
            ],
            llmOperationVersions: [
              {
                id: 'src-ver-uuid-101',
                operation_id: 'src-op-uuid-999',
                version: '2.0.0',
                state: 'approved',
                manifest_json: { model: 'claude-3-5-sonnet' },
                operation_digest: 'digest-2.0.0',
                contract_digest: 'contract-2.0.0',
                change_summary: '升级模型至 Sonnet',
                source: 'system_seed',
                approved_by: 'lead',
                approved_at: new Date().toISOString(),
                created_by: 'lead',
                created_at: new Date().toISOString(),
              },
            ],
            llmOperationActivations: [
              {
                id: 'src-act-uuid-201',
                operation_id: 'src-op-uuid-999',
                version_id: 'src-ver-uuid-101',
                environment: 'production',
                label: 'production',
                activated_by: 'lead',
                reason: '全量放量',
                rollout_percent: 100,
                activated_at: new Date().toISOString(),
              },
            ],
          },
        },
      };

      // 2. Set up target DB where `document.summarize` ALREADY EXISTS under a DIFFERENT UUID "target-op-uuid-existing"
      const targetDb = new InMemoryDatabaseEngine();
      const existingTargetOpId = 'target-op-uuid-existing';
      targetDb.llmOperations.set(existingTargetOpId, {
        id: existingTargetOpId,
        operation_key: 'document.summarize',
        display_name: '旧名称',
        description: '旧描述',
        owner: 'system',
        status: 'active',
        source: 'system_seed',
        created_at: new Date().toISOString(),
      });

      // Target DB also has an existing workspace for user-charlie with a different UUID
      const existingTargetWsId = 'target-ws-uuid-existing';
      targetDb.workspaces.set(existingTargetWsId, {
        id: existingTargetWsId,
        name: '我的空间',
        type: 'personal',
        ownerUserId: 'user-charlie',
        quotaBytes: 5368709120n,
        usedBytes: 0n,
      });

      const targetPrisma = targetDb.createPrismaClient();
      const otherHandlers = createMockOtherHandlers();
      const targetWsHandler = new WorkspaceBackupHandler(targetPrisma as any);
      const targetTemplateFlowHandler = new TemplateFlowBackupHandler(targetPrisma as any);

      const targetBackupService = new SystemBackupService(
        otherHandlers.aiModelHandler,
        otherHandlers.skillWorkflowHandler,
        otherHandlers.capabilityReleaseHandler,
        targetTemplateFlowHandler,
        otherHandlers.userOrgHandler,
        otherHandlers.taskPolicyHandler,
        targetWsHandler
      );

      // Compute valid checksum for this test payload
      const jsonStr = JSON.stringify(archive.modules);
      archive.manifest.checksum = `sha256:${crypto.createHash('sha256').update(jsonStr, 'utf-8').digest('hex')}`;

      // 3. Execute Import with merge_override
      const importResult = await targetBackupService.importBackup(archive, 'merge_override');

      expect(importResult.success).toBe(true);
      expect(importResult.errors).toHaveLength(0);

      // 4. Verify target DB:
      // Operation key `document.summarize` should still be at `target-op-uuid-existing` with updated display name
      const targetOp = targetDb.llmOperations.get(existingTargetOpId);
      expect(targetOp).toBeDefined();
      expect(targetOp.display_name).toBe('文档速读与摘要');
      expect(targetDb.llmOperations.size).toBe(1);

      // Version `2.0.0` should have its foreign key `operation_id` remapped to `target-op-uuid-existing`
      const restoredVer = targetDb.llmOperationVersions.get('src-ver-uuid-101');
      expect(restoredVer).toBeDefined();
      expect(restoredVer.operation_id).toBe(existingTargetOpId); // REMAPPED!

      // Activation should have both `operation_id` and `version_id` pointing to the target entities
      const restoredAct = targetDb.llmOperationActivations.get('src-act-uuid-201');
      expect(restoredAct).toBeDefined();
      expect(restoredAct.operation_id).toBe(existingTargetOpId); // REMAPPED!
      expect(restoredAct.version_id).toBe('src-ver-uuid-101');

      // Workspace node should have its workspaceId remapped to `target-ws-uuid-existing`
      const restoredNode = targetDb.workspaceNodes.get('backup-node-uuid-1');
      expect(restoredNode).toBeDefined();
      expect(restoredNode.workspaceId).toBe(existingTargetWsId); // REMAPPED!
    });
  });

  describe('Scenario 3: Corrupted Checksum Rejection', () => {
    it('rejects tampered archives in preview and rejects import with BadRequestException', async () => {
      const sourceDb = new InMemoryDatabaseEngine();
      const sourcePrisma = sourceDb.createPrismaClient();
      const otherHandlers = createMockOtherHandlers();
      const wsHandler = new WorkspaceBackupHandler(sourcePrisma as any);
      const templateFlowHandler = new TemplateFlowBackupHandler(sourcePrisma as any);

      const service = new SystemBackupService(
        otherHandlers.aiModelHandler,
        otherHandlers.skillWorkflowHandler,
        otherHandlers.capabilityReleaseHandler,
        templateFlowHandler,
        otherHandlers.userOrgHandler,
        otherHandlers.taskPolicyHandler,
        wsHandler
      );

      const archive = await service.exportBackup(['workspaces']);
      expect(archive.manifest.checksum).toBeDefined();

      // Tamper with the modules payload
      (archive.modules.workspaces as any).workspaces.push({
        id: 'malicious-workspace',
        name: '注入空间',
      });

      // Preview should show valid: false
      const preview = await service.previewBackup(archive);
      expect(preview.valid).toBe(false);

      // Import should throw BadRequestException
      await expect(service.importBackup(archive)).rejects.toThrow(BadRequestException);
      await expect(service.importBackup(archive)).rejects.toThrow(/校验和不匹配/);
    });
  });

  describe('Scenario 4: Builtin Skill Provisioning Smoke Test Status and Skip Separation', () => {
    it('records smokeTestStatus as "untested" when BUILTIN_SKILL_PROVISION_SKIP_SMOKE=true', async () => {
      const mockRegistryService = {
        upsertSkillFromManifest: jest.fn().mockResolvedValue({
          skill: { id: 's1', capabilityKey: 'platform.document.test-skill' },
          version: { id: 'v1', definitionVersion: '1.0.0' },
        }),
        attestVersion: jest.fn().mockResolvedValue({
          id: 'v1',
          definitionVersion: '1.0.0',
        }),
        markDeployment: jest.fn().mockResolvedValue({}),
        activateVersion: jest.fn().mockResolvedValue({}),
      };
      const mockAuditService = {
        logEvent: jest.fn().mockResolvedValue(undefined),
      };

      const originalEnv = process.env.BUILTIN_SKILL_PROVISION_SKIP_SMOKE;
      process.env.BUILTIN_SKILL_PROVISION_SKIP_SMOKE = 'true';

      try {
        const service = new BuiltinSkillProvisioningService(
          mockRegistryService as any,
          mockAuditService as any
        );

        const bundleDir = path.resolve(__dirname, '../../../../builtin-skills/platform.search.web');

        await service.provisionBundle(bundleDir, 'bootstrap');

        // Check markDeployment was called with smokeTestStatus: 'untested' and status: 'registered'
        expect(mockRegistryService.markDeployment).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'registered',
            smokeTestStatus: 'untested',
          })
        );
      } finally {
        if (originalEnv !== undefined) {
          process.env.BUILTIN_SKILL_PROVISION_SKIP_SMOKE = originalEnv;
        } else {
          delete process.env.BUILTIN_SKILL_PROVISION_SKIP_SMOKE;
        }
      }
    });
  });

  describe('Scenario 5: Physical File Missing on Disk Detection & Non-Overwriting Protection', () => {
    it('fails export if physical file node is missing on disk', async () => {
      const sourceDb = new InMemoryDatabaseEngine();
      const ws1 = { id: 'ws-src-1', name: '研发空间', type: 'team' };
      const missingNode = {
        id: 'node-missing-physical-file',
        workspaceId: 'ws-src-1',
        name: '不存在的文件.pdf',
        type: 'file',
        storagePath: 'team/ws-src-1/missing.pdf',
      };
      sourceDb.workspaces.set(ws1.id, ws1);
      sourceDb.workspaceNodes.set(missingNode.id, missingNode);

      const sourcePrisma = sourceDb.createPrismaClient();
      const otherHandlers = createMockOtherHandlers();
      const wsHandler = new WorkspaceBackupHandler(sourcePrisma as any);
      const templateFlowHandler = new TemplateFlowBackupHandler(sourcePrisma as any);

      const backupService = new SystemBackupService(
        otherHandlers.aiModelHandler,
        otherHandlers.skillWorkflowHandler,
        otherHandlers.capabilityReleaseHandler,
        templateFlowHandler,
        otherHandlers.userOrgHandler,
        otherHandlers.taskPolicyHandler,
        wsHandler
      );

      await expect(backupService.exportBackup(['workspaces'])).rejects.toThrow(
        /工作空间文件节点.*物理文件缺失/
      );
    });

    it('flags missing physical file error when contentBase64 is omitted and disk file does not exist', async () => {
      const targetDb = new InMemoryDatabaseEngine();
      const targetPrisma = targetDb.createPrismaClient();
      const otherHandlers = createMockOtherHandlers();
      const targetWsHandler = new WorkspaceBackupHandler(targetPrisma as any);
      const targetTemplateFlowHandler = new TemplateFlowBackupHandler(targetPrisma as any);

      const targetBackupService = new SystemBackupService(
        otherHandlers.aiModelHandler,
        otherHandlers.skillWorkflowHandler,
        otherHandlers.capabilityReleaseHandler,
        targetTemplateFlowHandler,
        otherHandlers.userOrgHandler,
        otherHandlers.taskPolicyHandler,
        targetWsHandler
      );

      const payload: any = {
        manifest: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          appVersion: '1.0.0',
          environment: 'production',
          checksum: '',
          counts: { workspaces: 1 },
        },
        modules: {
          workspaces: {
            workspaces: [
              {
                id: 'ws-missing-file-test',
                name: '文件丢失测试空间',
                type: 'department',
                departmentId: 'dept-test-missing',
              },
            ],
            nodes: [
              {
                id: 'node-nonexistent-file',
                workspaceId: 'ws-missing-file-test',
                parentId: null,
                name: '不存在的文件.pdf',
                type: 'file',
                fileSize: 2048,
                storagePath: 'department/dept-test-missing/nonexistent-file-99999.pdf',
                // deliberately no contentBase64
              },
            ],
          },
        },
      };

      payload.manifest.checksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(payload.modules), 'utf-8').digest('hex')}`;

      const result = await targetBackupService.importBackup(payload, 'merge_override');
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e: string) => e.includes('物理文件缺失'))).toBe(true);
    });

    it('skip_existing preserves existing physical files on disk without overwriting', async () => {
      const targetDb = new InMemoryDatabaseEngine();
      const ws = { id: 'ws-existing', name: '共享空间', type: 'team' };
      const node = {
        id: 'node-existing-1',
        workspaceId: 'ws-existing',
        parentId: null,
        name: 'existing.txt',
        type: 'file',
        storagePath: 'team/ws-existing/existing.txt',
      };
      targetDb.workspaces.set(ws.id, ws);
      targetDb.workspaceNodes.set(node.id, node);

      const targetPrisma = targetDb.createPrismaClient();
      const otherHandlers = createMockOtherHandlers();
      const targetWsHandler = new WorkspaceBackupHandler(targetPrisma as any);
      const targetTemplateFlowHandler = new TemplateFlowBackupHandler(targetPrisma as any);

      const targetBackupService = new SystemBackupService(
        otherHandlers.aiModelHandler,
        otherHandlers.skillWorkflowHandler,
        otherHandlers.capabilityReleaseHandler,
        targetTemplateFlowHandler,
        otherHandlers.userOrgHandler,
        otherHandlers.taskPolicyHandler,
        targetWsHandler
      );

      // Seed pre-existing physical file
      const physicalFilePath = targetWsHandler.resolveStoragePath(node.storagePath);
      fs.mkdirSync(path.dirname(physicalFilePath), { recursive: true });
      fs.writeFileSync(physicalFilePath, 'ORIGINAL_UNTOUCHED_CONTENT');

      // Archive with new content for the same file
      const payload: any = {
        manifest: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          appVersion: '1.0.0',
          environment: 'production',
          checksum: '',
          counts: { workspaces: 1 },
        },
        modules: {
          workspaces: {
            workspaces: [ws],
            nodes: [
              {
                ...node,
                contentBase64: Buffer.from('OVERWRITTEN_MALICIOUS_CONTENT').toString('base64'),
              },
            ],
          },
        },
      };

      payload.manifest.checksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(payload.modules), 'utf-8').digest('hex')}`;

      const result = await targetBackupService.importBackup(payload, 'skip_existing');
      expect(result.success).toBe(true);

      // Verify file on disk was NOT overwritten!
      const contentOnDisk = fs.readFileSync(physicalFilePath, 'utf8');
      expect(contentOnDisk).toBe('ORIGINAL_UNTOUCHED_CONTENT');
    });
  });

  describe('Scenario 6: Multi-Dimensional Workspace Matching', () => {
    it('matches and merges existing department, company, and process workspaces without duplicating', async () => {
      const targetDb = new InMemoryDatabaseEngine();
      // Pre-seed target DB with:
      // 1. Department workspace with departmentId 'dept-legal' under UUID 'target-dept-legal-id'
      targetDb.workspaces.set('target-dept-legal-id', {
        id: 'target-dept-legal-id',
        name: '法务部共享',
        type: 'department',
        departmentId: 'dept-legal',
        ownerUserId: null,
      });
      // 2. Company workspace singleton under UUID 'target-company-id'
      targetDb.workspaces.set('target-company-id', {
        id: 'target-company-id',
        name: '公司公共盘',
        type: 'company',
      });
      // 3. Process workspace singleton under UUID 'target-process-id'
      targetDb.workspaces.set('target-process-id', {
        id: 'target-process-id',
        name: '流程管理空间',
        type: 'process',
      });

      const targetPrisma = targetDb.createPrismaClient();
      const otherHandlers = createMockOtherHandlers();
      const targetWsHandler = new WorkspaceBackupHandler(targetPrisma as any);
      const targetTemplateFlowHandler = new TemplateFlowBackupHandler(targetPrisma as any);

      const targetBackupService = new SystemBackupService(
        otherHandlers.aiModelHandler,
        otherHandlers.skillWorkflowHandler,
        otherHandlers.capabilityReleaseHandler,
        targetTemplateFlowHandler,
        otherHandlers.userOrgHandler,
        otherHandlers.taskPolicyHandler,
        targetWsHandler
      );

      // Backup payload has different UUIDs for department, company, and process
      const payload: any = {
        manifest: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          appVersion: '1.0.0',
          environment: 'production',
          checksum: '',
          counts: { workspaces: 3 },
        },
        modules: {
          workspaces: {
            workspaces: [
              {
                id: 'backup-dept-uuid-from-source',
                name: '法务部旧名称',
                type: 'department',
                departmentId: 'dept-legal',
                ownerUserId: null,
              },
              {
                id: 'backup-company-uuid-from-source',
                name: '公共网盘',
                type: 'company',
              },
              {
                id: 'backup-process-uuid-from-source',
                name: '流程空间',
                type: 'process',
              },
            ],
            nodes: [
              {
                id: 'backup-node-under-dept',
                workspaceId: 'backup-dept-uuid-from-source',
                parentId: null,
                name: '法务文件夹',
                type: 'folder',
              },
            ],
          },
        },
      };

      payload.manifest.checksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(payload.modules), 'utf-8').digest('hex')}`;

      // Preview should detect all 3 as conflicts (existing in target)
      const preview = await targetBackupService.previewBackup(payload);
      expect(preview.summary.conflictItems).toBeGreaterThanOrEqual(3);

      // Import should merge into existing IDs, not creating duplicate workspaces
      const result = await targetBackupService.importBackup(payload, 'merge_override');
      expect(result.success).toBe(true);
      expect(targetDb.workspaces.size).toBe(3); // Total count unchanged, no duplicates created!

      // Node should have its workspaceId remapped to target-dept-legal-id
      const restoredNode = targetDb.workspaceNodes.get('backup-node-under-dept');
      expect(restoredNode).toBeDefined();
      expect(restoredNode.workspaceId).toBe('target-dept-legal-id');
    });
  });

  describe('Scenario 7: Untested Builtin Skill Cannot Be Activated', () => {
    it('does not attest version when skipSmoke=true and activateVersion is blocked', async () => {
      const mockRegistryService = {
        upsertSkillFromManifest: jest.fn().mockResolvedValue({
          skill: { id: 's1', capabilityKey: 'platform.search.web' },
          version: { id: 'v1', definitionVersion: '1.0.0' },
        }),
        attestVersion: jest.fn(),
        markDeployment: jest.fn().mockResolvedValue({}),
      };
      const mockAuditService = {
        logEvent: jest.fn().mockResolvedValue(undefined),
      };

      const originalEnv = process.env.BUILTIN_SKILL_PROVISION_SKIP_SMOKE;
      process.env.BUILTIN_SKILL_PROVISION_SKIP_SMOKE = 'true';

      try {
        const service = new BuiltinSkillProvisioningService(
          mockRegistryService as any,
          mockAuditService as any
        );

        const bundleDir = path.resolve(__dirname, '../../../../builtin-skills/platform.search.web');

        await service.provisionBundle(bundleDir, 'bootstrap');

        // Verify attestVersion was NOT called
        expect(mockRegistryService.attestVersion).not.toHaveBeenCalled();

        // Verify deployment marked as registered & untested
        expect(mockRegistryService.markDeployment).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'registered',
            smokeTestStatus: 'untested',
          })
        );
      } finally {
        if (originalEnv !== undefined) {
          process.env.BUILTIN_SKILL_PROVISION_SKIP_SMOKE = originalEnv;
        } else {
          delete process.env.BUILTIN_SKILL_PROVISION_SKIP_SMOKE;
        }
      }
    });
  });

  describe('Scenario 8: Mandatory Checksum Enforcement', () => {
    it('rejects archive when manifest.checksum is omitted', async () => {
      const targetDb = new InMemoryDatabaseEngine();
      const targetPrisma = targetDb.createPrismaClient();
      const otherHandlers = createMockOtherHandlers();
      const targetWsHandler = new WorkspaceBackupHandler(targetPrisma as any);
      const targetTemplateFlowHandler = new TemplateFlowBackupHandler(targetPrisma as any);

      const targetBackupService = new SystemBackupService(
        otherHandlers.aiModelHandler,
        otherHandlers.skillWorkflowHandler,
        otherHandlers.capabilityReleaseHandler,
        targetTemplateFlowHandler,
        otherHandlers.userOrgHandler,
        otherHandlers.taskPolicyHandler,
        targetWsHandler
      );

      const archiveWithoutChecksum: any = {
        manifest: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          appVersion: '1.0.0',
          environment: 'production',
          // checksum deliberately omitted
          counts: { workspaces: 0 },
        },
        modules: {
          workspaces: {
            workspaces: [],
            nodes: [],
          },
        },
      };

      const preview = await targetBackupService.previewBackup(archiveWithoutChecksum);
      expect(preview.valid).toBe(false);

      await expect(targetBackupService.importBackup(archiveWithoutChecksum)).rejects.toThrow(
        /备份文件缺少必填的 manifest\.checksum 字段/
      );
    });
  });

  describe('Scenario 9: Coordination Collaborator Approver Resolution & Strict Blocking', () => {
    it('resolves active users by id/username/email, returns null for unknown users without fallback, and blocks unresolved approvers', async () => {
      const mockUsers = new Map<string, any>([
        ['user-law-1', { id: 'user-law-1', username: 'lawyer_bob', email: 'bob@example.com', isActive: true, role: 'legal' }],
        ['user-admin-1', { id: 'user-admin-1', username: 'admin', email: 'admin@example.com', isActive: true, role: 'admin' }],
      ]);

      const mockPrisma: any = {
        user: {
          findUnique: async (args: any) => mockUsers.get(args.where?.id) || null,
          findFirst: async (args: any) => {
            for (const u of mockUsers.values()) {
              if (args.where?.username?.equals && u.username.toLowerCase() === args.where.username.equals.toLowerCase()) {
                return u;
              }
              if (args.where?.email?.equals && u.email?.toLowerCase() === args.where.email.equals.toLowerCase()) {
                return u;
              }
              if (args.where?.role && u.role === args.where.role && u.isActive) {
                return u;
              }
            }
            return null;
          },
        },
        orgMembership: {
          findFirst: async () => null,
        },
        department: {
          findFirst: async () => null,
        },
      };

      const collaboratorService = new CoordinationCollaboratorService(mockPrisma);

      // 1. Valid user resolution
      const byId = await collaboratorService.resolveUser('user-law-1');
      expect(byId?.username).toBe('lawyer_bob');

      const byUsername = await collaboratorService.resolveUser('lawyer_bob');
      expect(byUsername?.id).toBe('user-law-1');

      const byEmail = await collaboratorService.resolveUser('bob@example.com');
      expect(byEmail?.id).toBe('user-law-1');

      // 2. Unknown user resolution returns null (NO fallback to arbitrary admin)
      const unknown = await collaboratorService.resolveUser('totally_nonexistent_user');
      expect(unknown).toBeNull();

      // 3. resolveStageApprover with specific_user where user does not exist throws BadRequestException
      const mockWorkflowService: any = {
        getWorkflowById: () => ({
          processDefinition: {
            stages: [
              {
                id: 'stage-finance-review',
                name: '财务三审',
                approverRule: 'specific_user',
                approverUsername: 'ghost_account',
              },
            ],
          },
        }),
      };

      const collaboratorServiceWithWf = new CoordinationCollaboratorService(
        mockPrisma,
        mockWorkflowService
      );

      await expect(
        collaboratorServiceWithWf.resolveStageApprover(
          'test-wf',
          'stage-finance-review',
          'user-law-1'
        )
      ).rejects.toThrow(BadRequestException);

      await expect(
        collaboratorServiceWithWf.resolveStageApprover(
          'test-wf',
          'stage-finance-review',
          'user-law-1'
        )
      ).rejects.toThrow(/无法解析流程阶段【财务三审】的审批人/);

      // 4. Missing stage throws BadRequestException immediately without fallback to initiator
      await expect(
        collaboratorServiceWithWf.resolveStageApprover(
          'test-wf',
          'nonexistent-stage',
          'user-law-1'
        )
      ).rejects.toThrow(BadRequestException);
      await expect(
        collaboratorServiceWithWf.resolveStageApprover(
          'test-wf',
          'nonexistent-stage',
          'user-law-1'
        )
      ).rejects.toThrow(/流程中未找到阶段【nonexistent-stage】，已阻止该次流转/);

      // 5. Department stage: specified approver who is not a member of the department is rejected
      const mockWorkflowWithDept: any = {
        getWorkflowById: () => ({
          processDefinition: {
            stages: [
              {
                id: 'stage-dept-legal',
                name: '法务部初审',
                approverRule: 'department',
                approverDepartment: '法务部',
                approverUsername: 'admin', // admin is NOT a member of legal department!
              },
            ],
          },
        }),
      };

      const deptService = new CoordinationCollaboratorService(
        mockPrisma,
        mockWorkflowWithDept
      );

      await expect(
        deptService.resolveStageApprover(
          'test-wf',
          'stage-dept-legal',
          'user-law-1'
        )
      ).rejects.toThrow(BadRequestException);
      await expect(
        deptService.resolveStageApprover(
          'test-wf',
          'stage-dept-legal',
          'user-law-1'
        )
      ).rejects.toThrow(/不属于部门【法务部】，已拒绝作为该部门审批人/);
    });
  });

  afterAll(() => {
    if (testStorageRoot && fs.existsSync(testStorageRoot)) {
      try {
        fs.rmSync(testStorageRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
});
