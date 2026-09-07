import { SystemBackupService } from '../src/modules/system-backup/system-backup.service';
import { AIModelBackupHandler } from '../src/modules/system-backup/handlers/ai-model-backup.handler';
import { SkillWorkflowBackupHandler } from '../src/modules/system-backup/handlers/skill-workflow-backup.handler';
import { CapabilityReleaseBackupHandler } from '../src/modules/system-backup/handlers/capability-release-backup.handler';
import { TemplateFlowBackupHandler } from '../src/modules/system-backup/handlers/template-flow-backup.handler';
import { UserOrgBackupHandler } from '../src/modules/system-backup/handlers/user-org-backup.handler';

describe('SystemBackupService', () => {
  let service: SystemBackupService;
  let aiModelHandler: jest.Mocked<AIModelBackupHandler>;
  let skillWorkflowHandler: jest.Mocked<SkillWorkflowBackupHandler>;
  let capabilityReleaseHandler: jest.Mocked<CapabilityReleaseBackupHandler>;
  let templateFlowHandler: jest.Mocked<TemplateFlowBackupHandler>;
  let userOrgHandler: jest.Mocked<UserOrgBackupHandler>;

  beforeEach(() => {
    aiModelHandler = {
      count: jest.fn().mockResolvedValue(6),
      export: jest.fn().mockResolvedValue({
        models: [{ id: 'm-1', name: 'gpt-4o' }],
        providers: [{ id: 'p-1', name: 'openai' }],
        apiKeys: [],
        providerApiKeys: [],
      }),
      preview: jest.fn().mockResolvedValue({
        moduleKey: 'aiModels',
        totalInBackup: 1,
        newCount: 0,
        conflictCount: 1,
        items: [
          { key: 'm-1', name: 'AI Model: gpt-4o', existsInTarget: true, action: 'update' },
        ],
      }),
      import: jest.fn().mockResolvedValue({ created: 0, updated: 1, skipped: 0 }),
    } as any;

    skillWorkflowHandler = {
      countSkills: jest.fn().mockResolvedValue(10),
      countWorkflows: jest.fn().mockResolvedValue(4),
      exportSkills: jest.fn().mockResolvedValue({
        skillConfigs: [{ id: 's-1', name: 'Web Search', skillId: 'web_search' }],
        toolCatalogs: [],
        skillToolBindings: [],
        skillPermissions: [],
        skillSchedules: [],
      }),
      exportWorkflows: jest.fn().mockResolvedValue({
        temporalWorkflows: [{ id: 'wf-1', name: 'WebSearchWorkflow' }],
        activities: [],
      }),
      previewSkills: jest.fn().mockResolvedValue({
        moduleKey: 'skills',
        totalInBackup: 1,
        newCount: 1,
        conflictCount: 0,
        items: [{ key: 's-1', name: 'Skill: Web Search', existsInTarget: false, action: 'create' }],
      }),
      previewWorkflows: jest.fn().mockResolvedValue({
        moduleKey: 'temporalWorkflows',
        totalInBackup: 1,
        newCount: 0,
        conflictCount: 1,
        items: [
          {
            key: 'wf-1',
            name: 'Workflow: WebSearchWorkflow',
            existsInTarget: true,
            action: 'update',
          },
        ],
      }),
      importSkills: jest.fn().mockResolvedValue({ created: 1, updated: 0, skipped: 0 }),
      importWorkflows: jest.fn().mockResolvedValue({ created: 0, updated: 1, skipped: 0 }),
    } as any;

    capabilityReleaseHandler = {
      count: jest.fn().mockResolvedValue(2),
      export: jest.fn().mockResolvedValue({
        capabilityReleases: [{ id: 'rel-1', sourceName: 'WebSearch' }],
        capabilitySourceSnapshots: [],
        capabilityBuilds: [],
        skillDrafts: [],
      }),
      preview: jest.fn().mockResolvedValue({
        moduleKey: 'capabilityReleases',
        totalInBackup: 1,
        newCount: 0,
        conflictCount: 1,
        items: [{ key: 'rel-1', name: 'Release: WebSearch', existsInTarget: true, action: 'update' }],
      }),
      import: jest.fn().mockResolvedValue({ created: 0, updated: 1, skipped: 0 }),
    } as any;

    templateFlowHandler = {
      countTemplates: jest.fn().mockResolvedValue(5),
      countFlowTemplates: jest.fn().mockResolvedValue(3),
      exportTemplates: jest.fn().mockResolvedValue({
        templates: [{ id: 'tpl-1', name: 'Baidu Search' }],
      }),
      exportFlowTemplates: jest.fn().mockResolvedValue({
        executionFlowTemplates: [{ id: 'flow-1', name: 'Customer Service Flow' }],
        llmOperations: [],
      }),
      previewTemplates: jest.fn().mockResolvedValue({
        moduleKey: 'browserTemplates',
        totalInBackup: 1,
        newCount: 1,
        conflictCount: 0,
        items: [
          { key: 'tpl-1', name: 'Template: Baidu Search', existsInTarget: false, action: 'create' },
        ],
      }),
      previewFlowTemplates: jest.fn().mockResolvedValue({
        moduleKey: 'executionFlowTemplates',
        totalInBackup: 1,
        newCount: 0,
        conflictCount: 1,
        items: [
          {
            key: 'flow-1',
            name: 'Flow Template: Customer Service Flow',
            existsInTarget: true,
            action: 'update',
          },
        ],
      }),
      importTemplates: jest.fn().mockResolvedValue({ created: 1, updated: 0, skipped: 0 }),
      importFlowTemplates: jest.fn().mockResolvedValue({ created: 0, updated: 1, skipped: 0 }),
    } as any;

    userOrgHandler = {
      count: jest.fn().mockResolvedValue(8),
      export: jest.fn().mockResolvedValue({
        users: [{ id: 'u-1', username: 'admin' }],
        roles: [],
        userRoles: [],
        organizations: [{ id: 'org-1', name: 'Headquarters' }],
        departments: [],
        teams: [],
        orgMemberships: [],
        orgRoleBindings: [],
      }),
      preview: jest.fn().mockResolvedValue({
        moduleKey: 'userOrganizations',
        totalInBackup: 1,
        newCount: 0,
        conflictCount: 1,
        items: [{ key: 'u-1', name: 'User: admin', existsInTarget: true, action: 'update' }],
      }),
      import: jest.fn().mockResolvedValue({ created: 0, updated: 1, skipped: 0 }),
    } as any;

    service = new SystemBackupService(
      aiModelHandler,
      skillWorkflowHandler,
      capabilityReleaseHandler,
      templateFlowHandler,
      userOrgHandler
    );
  });

  it('should summarize asset counts across all modules', async () => {
    const summary = await service.getAssetSummary();
    expect(summary.totalAssets).toBe(38);
    expect(summary.counts.aiModels).toBe(6);
    expect(summary.counts.skills).toBe(10);
    expect(summary.counts.temporalWorkflows).toBe(4);
    expect(summary.counts.capabilityReleases).toBe(2);
    expect(summary.counts.browserTemplates).toBe(5);
    expect(summary.counts.executionFlowTemplates).toBe(3);
    expect(summary.counts.userOrganizations).toBe(8);
  });

  it('should export all requested modules with manifest and checksum', async () => {
    const archive = await service.exportBackup();
    expect(archive.manifest.version).toBe('1.0.0');
    expect(archive.manifest.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(archive.modules.aiModels?.models).toHaveLength(1);
    expect(archive.modules.skills?.skillConfigs).toHaveLength(1);
    expect(archive.modules.temporalWorkflows?.temporalWorkflows).toHaveLength(1);
  });

  it('should generate preview and conflict analysis for uploaded archive', async () => {
    const archive = await service.exportBackup();
    const preview = await service.previewBackup(archive);
    expect(preview.valid).toBe(true);
    expect(preview.modulePreviews.length).toBeGreaterThan(0);
    expect(preview.summary.totalItems).toBeGreaterThan(0);
  });

  it('should execute import with merge_override strategy successfully', async () => {
    const archive = await service.exportBackup();
    const result = await service.importBackup(archive, 'merge_override');
    expect(result.success).toBe(true);
    expect(result.strategy).toBe('merge_override');
    expect(result.importedCounts.aiModels.updated).toBe(1);
    expect(result.importedCounts.skills.created).toBe(1);
    expect(result.errors).toHaveLength(0);
  });
});
