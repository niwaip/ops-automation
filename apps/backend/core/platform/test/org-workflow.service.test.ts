import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrgWorkflowService } from '../src/modules/workbench-coordination/org-workflow.service';
import { CoordinationTaskType } from '../src/modules/workbench-coordination/dto/workbench-coordination.dto';

describe('OrgWorkflowService', () => {
  let service: OrgWorkflowService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        if (where.id === 'user-admin') {
          return { id: 'user-admin', username: 'admin_user', role: 'admin', userRoles: [] };
        }
        if (where.id === 'user-employee') {
          return { id: 'user-employee', username: 'john_doe', role: 'employee', userRoles: [] };
        }
        if (where.id === 'user-finance') {
          return {
            id: 'user-finance',
            username: 'finance_user',
            role: 'employee',
            userRoles: [{ roleId: 'role-finance', role: { name: 'finance' } }],
          };
        }
        if (where.id === 'user-guest') {
          return { id: 'user-guest', username: 'guest_user', role: 'guest', userRoles: [] };
        }
        return null;
      }),
    },
    executionFlowTemplate: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'flow-1', name: 'HRMS 自动打卡同步流', category: 'hr', description: '对接考勤 API' },
      ]),
    },
    temporalWorkflow: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'temp-1', name: '报销财务自动化打款流', category: 'finance', description: '财务打款' },
      ]),
    },
    skillConfig: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'skill-1', name: '邮件通知派发器', category: 'notification', description: '邮件通知' },
      ]),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgWorkflowService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<OrgWorkflowService>(OrgWorkflowService);
    await service.onModuleInit();
  });

  it('should seed default workflows with process definitions and assembled workflows', () => {
    const leaveWf = service.getWorkflowById('hr.leave.request');
    expect(leaveWf).toBeDefined();
    expect(leaveWf?.name).toBe('员工请假审批');
    expect(leaveWf?.isPublished).toBe(true);
    expect(leaveWf?.assembledWorkflows.length).toBe(0);
    expect(leaveWf?.processDefinition.stages.length).toBe(4);
    expect(leaveWf?.paramsSchema.required).toContain('leaveType');
  });

  it('should list admin workflows and return accurate statistics', async () => {
    const res = await service.listAdminWorkflows();
    expect(res.workflows.length).toBeGreaterThanOrEqual(3);
    expect(res.stats.total).toBe(res.workflows.length);
    expect(res.stats.publishedCount).toBeGreaterThanOrEqual(3);
    expect(res.stats.draftCount).toBe(0);
    expect(res.stats.assembledBaseCount).toBe(0);
  });

  it('should fetch available base workflows from 5173 ExecutionFlows, Temporal and Skills', async () => {
    const baseList = await service.getAvailableBaseWorkflows();
    expect(baseList.length).toBeGreaterThanOrEqual(3);
    expect(baseList.find((b) => b.type === 'execution_flow')).toBeDefined();
    expect(baseList.find((b) => b.type === 'temporal_workflow')).toBeDefined();
    expect(baseList.find((b) => b.type === 'skill')).toBeDefined();
  });

  it('should create a new draft enterprise workflow assembled with base workflows', async () => {
    const created = await service.createWorkflow({
      workflowId: 'it.device.requisition',
      name: 'IT 办公设备领用申请',
      description: '员工领用显示器、笔记本电脑审批流',
      category: 'it',
      taskType: CoordinationTaskType.approval,
      assembledWorkflows: [
        {
          type: 'execution_flow',
          refId: 'flow_it_asset_register',
          name: '资产管理系统自动登记',
          triggerEvent: 'on_approve',
        },
      ],
      grantedRoleIds: ['admin'],
    });

    expect(created.id).toBe('it.device.requisition');
    expect(created.status).toBe('draft');
    expect(created.isPublished).toBe(false);
    expect(created.assembledWorkflows.length).toBe(1);
    expect(created.processDefinition.stages.length).toBe(3);

    // Admin workflow stats should now have 1 draft
    const statsRes = await service.listAdminWorkflows();
    expect(statsRes.stats.draftCount).toBe(1);
  });

  it('should toggle publish status and respect publication in user catalog', async () => {
    const wfId = 'it.device.requisition';
    // Initially draft (created above)
    await service.createWorkflow({
      workflowId: wfId,
      name: 'IT 办公设备领用申请',
      description: '领用设备',
      grantedRoleIds: ['employee', 'admin'],
    });

    // Catalog for employee shouldn't see draft
    let catalog = await service.listCatalogForUser('user-employee');
    expect(catalog.find((w) => w.id === wfId)).toBeUndefined();

    // Publish it
    await service.togglePublish(wfId, true);
    const publishedWf = service.getWorkflowById(wfId);
    expect(publishedWf?.isPublished).toBe(true);

    // Now employee should see it in catalog
    catalog = await service.listCatalogForUser('user-employee');
    const item = catalog.find((w) => w.id === wfId);
    expect(item).toBeDefined();
    expect(item?.accessStatus).toBe('authorized');
  });

  it('should correctly calculate accessStatus based on role permissions', async () => {
    // Create a workflow only granted to 'finance'
    await service.createWorkflow({
      workflowId: 'finance.tax.filing',
      name: '企业税务申报凭单',
      description: '财务专用',
      status: 'published',
      grantedRoleIds: ['role-finance'],
    });

    // Admin should always be authorized
    const adminCatalog = await service.listCatalogForUser('user-admin');
    const adminItem = adminCatalog.find((w) => w.id === 'finance.tax.filing');
    expect(adminItem?.accessStatus).toBe('authorized');

    // Finance user should be authorized
    const finCatalog = await service.listCatalogForUser('user-finance');
    const finItem = finCatalog.find((w) => w.id === 'finance.tax.filing');
    expect(finItem?.accessStatus).toBe('authorized');

    // Regular employee without finance role should be unauthorized
    const empCatalog = await service.listCatalogForUser('user-employee');
    const empItem = empCatalog.find((w) => w.id === 'finance.tax.filing');
    expect(empItem?.accessStatus).toBe('unauthorized');
  });

  it('should handle employee requestAccess and admin review approval', async () => {
    await service.createWorkflow({
      workflowId: 'restricted.flow',
      name: '受限审计流程',
      description: '需要申请',
      status: 'published',
      grantedRoleIds: ['admin'],
    });

    // 1. Employee submits access request
    const req = await service.requestAccess('restricted.flow', 'user-employee', '用于 Q3 审计排查');
    expect(req.status).toBe('pending');

    // 2. Employee catalog should now report 'requested'
    let catalog = await service.listCatalogForUser('user-employee');
    let item = catalog.find((w) => w.id === 'restricted.flow');
    expect(item?.accessStatus).toBe('requested');

    // 3. Admin reviews and approves
    const reviewed = await service.reviewAccessRequest(req.id, 'user-admin', 'approved', '核准开通');
    expect(reviewed.status).toBe('approved');

    // 4. Employee catalog should now report 'authorized'
    catalog = await service.listCatalogForUser('user-employee');
    item = catalog.find((w) => w.id === 'restricted.flow');
    expect(item?.accessStatus).toBe('authorized');
  });

  it('should register a custom process stage base workflow and include it in availableBaseWorkflows', async () => {
    const custom = await service.registerCustomBaseWorkflow({
      id: 'flow_custom_it_ticket_dispatch',
      name: 'IT 故障工单自动派发与响应流',
      category: 'it',
      stageType: 'automation',
      handlerRule: 'IT 服务台接口自动化执行',
      requiredMetadata: ['工单号', '故障等级', '派发运维组'],
      description: '将钉钉协同工单推送到 IT 资产派单系统',
    });

    expect(custom.id).toBe('flow_custom_it_ticket_dispatch');

    const available = await service.getAvailableBaseWorkflows();
    const found = available.find((w) => w.id === 'flow_custom_it_ticket_dispatch');
    expect(found).toBeDefined();
    expect(found?.name).toBe('IT 故障工单自动派发与响应流');
    expect(found?.stageType).toBe('automation');

    // Deleting the custom workflow
    const deleteRes = await service.deleteCustomBaseWorkflow('flow_custom_it_ticket_dispatch');
    expect(deleteRes).toBe(true);
    const afterDelete = await service.getAvailableBaseWorkflows();
    expect(afterDelete.find((w) => w.id === 'flow_custom_it_ticket_dispatch')).toBeUndefined();
  });

  it('should clear all custom process stage base workflows', async () => {
    await service.registerCustomBaseWorkflow({
      id: 'flow_test_to_clear_1',
      name: '测试流1',
      stageType: 'automation',
    });
    await service.registerCustomBaseWorkflow({
      id: 'flow_test_to_clear_2',
      name: '测试流2',
      stageType: 'approval',
    });
    await service.clearAllCustomBaseWorkflows();
    const available = await service.getAvailableBaseWorkflows();
    expect(available.find((w) => w.id === 'flow_test_to_clear_1')).toBeUndefined();
    expect(available.find((w) => w.id === 'flow_test_to_clear_2')).toBeUndefined();
  });

  it('should generate stage flow AI drafts for API and browser template modes', async () => {
    const { StageFlowAiDraftService } = require('../src/modules/workbench-coordination/stage-flow-ai-draft.service');
    const aiService = new StageFlowAiDraftService(mockPrismaService as any);

    // Mode 1: API update flow
    const apiDraft = await aiService.generateDraft({
      prompt: '请假审批通过后，调用人事系统接口扣减假期额度并更新考勤状态',
      preferredMode: 'api',
      credentialSecretKey: 'VAULT_HRMS_KEY',
      targetEndpointUrl: 'https://hrms.corp.com/api/leave/deduct',
    });

    expect(apiDraft.executionMode).toBe('api');
    expect(apiDraft.stageType).toBe('automation');
    expect(apiDraft.apiConfig).toBeDefined();
    expect(apiDraft.apiConfig?.authActivity.credentialKeyRef).toBe('VAULT_HRMS_KEY');
    expect(apiDraft.apiConfig?.updateActivity.endpointUrl).toBe('https://hrms.corp.com/api/leave/deduct');
    expect(apiDraft.apiConfig?.businessParams.length).toBeGreaterThan(0);
    // Standard DSL and code generation assertions
    expect(apiDraft.workflowDsl).toBeDefined();
    expect(apiDraft.workflowDsl.steps.length).toBe(2);
    expect(apiDraft.generatedCode).toContain('@workflow.defn');
    expect(apiDraft.generatedCode).toContain('async def run');

    // Mode 2: Browser template flow
    const browserDraft = await aiService.generateDraft({
      prompt: '通过浏览器录制模版在OA系统填写报销单并提交',
      preferredMode: 'browser_template',
      credentialSecretKey: 'VAULT_OA_PASSWORD',
    });

    expect(browserDraft.executionMode).toBe('browser_template');
    expect(browserDraft.browserConfig).toBeDefined();
    expect(browserDraft.browserConfig?.credentialMapping.vaultSecretKey).toBe('VAULT_OA_PASSWORD');
    expect(browserDraft.browserConfig?.paramMappings.length).toBeGreaterThan(0);
    expect(browserDraft.workflowDsl).toBeDefined();
    expect(browserDraft.generatedCode).toContain('@workflow.defn');
  });
});
