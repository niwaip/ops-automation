import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkbenchInboxService } from '@ops/workbench/inbox';
import {
  CoordinationTaskPriority,
  CoordinationTaskStatus,
  CoordinationTaskType,
  WorkbenchCoordinationService,
  MockHrService,
  OrgWorkflowService,
  CoordinationStageEngineService,
  CoordinationAutomationRunnerService,
  CoordinationCollaboratorService,
  CoordinationAttachmentStorageService,
  WORKBENCH_PRISMA,
} from '@ops/workbench';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn().mockRejectedValue(new Error('Mock network offline')),
    get: jest.fn().mockRejectedValue(new Error('Mock network offline')),
  },
  post: jest.fn().mockRejectedValue(new Error('Mock network offline')),
  get: jest.fn().mockRejectedValue(new Error('Mock network offline')),
}));

describe('WorkbenchCoordinationService', () => {
  let service: WorkbenchCoordinationService;
  let mockHrService: MockHrService;
  let orgWorkflowService: OrgWorkflowService;

  const mockPrisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    workbenchInboxItem: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    workbenchTodo: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    execution: {
      create: jest.fn().mockImplementation((args) =>
        Promise.resolve({ id: 'exec-auto-review-1', ...args.data })
      ),
    },
    executionStep: {
      create: jest.fn().mockImplementation((args) =>
        Promise.resolve({ id: 'step-auto-review-1', ...args.data })
      ),
    },
  };

  const mockInboxService = {
    ingest: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkbenchCoordinationService,
        OrgWorkflowService,
        CoordinationStageEngineService,
        CoordinationAutomationRunnerService,
        CoordinationCollaboratorService,
        MockHrService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WORKBENCH_PRISMA, useValue: mockPrisma },
        { provide: WorkbenchInboxService, useValue: mockInboxService },
      ],
    }).compile();

    service = module.get<WorkbenchCoordinationService>(
      WorkbenchCoordinationService
    );
    mockHrService = module.get<MockHrService>(MockHrService);
    orgWorkflowService = module.get<OrgWorkflowService>(OrgWorkflowService);
  });

  it('should search collaborators with password excluded', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'u-1',
        username: 'alice',
        email: 'alice@example.com',
        role: 'employee',
      },
    ]);

    const res = await service.searchCollaborators('u-0', { keyword: 'ali' });
    expect(res).toHaveLength(1);
    expect(res[0].username).toBe('alice');
    expect((res[0] as any).passwordHash).toBeUndefined();
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
        }),
      })
    );
  });

  it('should create coordination task and ingest into assignee inbox', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'u-initiator',
        username: 'alice',
        email: 'alice@example.com',
      })
      .mockResolvedValueOnce({
        id: 'u-assignee',
        username: 'bob',
        email: 'bob@example.com',
      });

    mockPrisma.workbenchInboxItem.create.mockResolvedValue({
      id: 'inbox-123',
    });

    const result = await service.createTask('u-initiator', {
      assigneeId: 'u-assignee',
      taskType: CoordinationTaskType.approval,
      title: '生产环境发布申请',
      content: '请批准本次 Release v1.2 发布',
      priority: CoordinationTaskPriority.high,
    });

    expect(result.taskId).toMatch(/^coord_/);
    expect(result.status).toBe(CoordinationTaskStatus.pending);
    expect(mockPrisma.workbenchInboxItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-assignee',
        title: expect.stringContaining('[待我承认] 生产环境发布申请'),
        sourceSender: 'alice',
      }),
    });
  });

  it('should submit action (approve) and update inbox item & notify initiator', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-123',
      title: '[待我承认] 生产环境发布申请',
      sourceTitle: '生产环境发布申请',
      unifiedPayload: {
        taskId: 'coord_abc',
        initiator: { id: 'u-initiator', username: 'alice' },
        assignee: { id: 'u-assignee', username: 'bob' },
        actions: [],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-assignee',
      username: 'bob',
    });

    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const result = await service.submitAction('u-assignee', 'coord_abc', {
      action: 'approve',
      comment: '同意发布，已核对配置。',
      attachments: [{ name: 'check.pdf', url: 'https://example.com/check.pdf' }],
    });

    expect(result.status).toBe(CoordinationTaskStatus.approved);
    expect(result.action).toBe('approve');
    expect(mockPrisma.workbenchInboxItem.update).toHaveBeenCalledWith({
      where: { id: 'inbox-123' },
      data: expect.objectContaining({
        status: 'converted',
      }),
    });
    // Should notify initiator
    expect(mockPrisma.workbenchInboxItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-initiator',
        title: expect.stringContaining('bob 已同意承认'),
        unifiedPayload: expect.objectContaining({
          isReceipt: true,
          taskType: 'receipt',
        }),
      }),
    });
  });

  it('should return built-in workflow templates including hr.leave.request with schema', () => {
    const templates = service.getWorkflowTemplates();
    expect(templates).toBeInstanceOf(Array);
    const leaveTemplate = templates.find((t) => t.id === 'hr.leave.request');
    expect(leaveTemplate).toBeDefined();
    expect(leaveTemplate?.name).toBe('员工请假审批');
    expect(leaveTemplate?.category).toBe('hr');
    expect(leaveTemplate?.paramsSchema.required).toContain('leaveType');
    expect(leaveTemplate?.paramsSchema.required).toContain('startTime');
    expect(leaveTemplate?.paramsSchema.required).toContain('endTime');
    expect(leaveTemplate?.paramsSchema.required).toContain('reason');
    expect(leaveTemplate?.paramsSchema.properties.leaveType.enum).toContain('事假');
  });

  it('should call mock HR system when approving hr.leave.request task', async () => {
    const spySync = jest.spyOn(mockHrService, 'syncLeaveApproval');

    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-leave-1',
      title: '[待我承认] [请假审批] 事假 4小时',
      sourceTitle: '[请假审批] 事假 4小时',
      unifiedPayload: {
        taskId: 'coord_leave_123',
        workflowId: 'hr.leave.request',
        taskType: 'approval',
        parameters: {
          leaveType: '事假',
          startTime: '2026-09-05 14:00',
          endTime: '2026-09-05 18:00',
          durationHours: 4,
          reason: '去趟医院看门诊',
        },
        initiator: { id: 'u-applicant', username: 'alice' },
        assignee: { id: 'u-manager', username: 'bob' },
        actions: [],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-manager',
      username: 'bob',
    });

    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const result = await service.submitAction('u-manager', 'coord_leave_123', {
      action: 'approve',
      comment: '同意请假，注意身体。',
    });

    expect(result.status).toBe(CoordinationTaskStatus.approved);
    expect(spySync).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'coord_leave_123',
        applicantName: 'alice',
        approverName: 'bob',
        leaveType: '事假',
        durationHours: 4,
        reason: '去趟医院看门诊',
      })
    );
    expect(mockPrisma.workbenchInboxItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-applicant',
        rawContent: expect.stringContaining('人事考勤中心'),
      }),
    });
  });

  it('should submit action (complete) for assignment tasks', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-assign-1',
      title: '[待我执行] 编写自动化脚本',
      sourceTitle: '编写自动化脚本',
      unifiedPayload: {
        taskId: 'coord_assign_1',
        taskType: 'assignment',
        initiator: { id: 'u-admin', username: 'admin' },
        assignee: { id: 'u-test', username: 'test' },
        actions: [],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-test',
      username: 'test',
    });
    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const result = await service.submitAction('u-test', 'coord_assign_1', {
      action: 'complete',
      comment: '自动化脚本已编写完成并提交至仓库。',
      attachments: [{ name: 'result.log', url: 'https://example.com/result.log' }],
    });

    expect(result.status).toBe(CoordinationTaskStatus.completed);
    expect(result.action).toBe('complete');
    expect(mockPrisma.workbenchInboxItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-admin',
        title: expect.stringContaining('已完成提交'),
      }),
    });
  });

  it('should list coordination tasks with deduplication and role filter', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-current',
      username: 'current_user',
    });

    mockPrisma.workbenchInboxItem.findMany.mockResolvedValue([
      {
        id: 'inbox-1',
        sourceRefId: 'coord_task_1',
        sourceTitle: '请假申请',
        title: '[待我承认] 请假申请',
        rawContent: '去医院看病',
        createdAt: new Date(),
        updatedAt: new Date(),
        unifiedPayload: {
          taskId: 'coord_task_1',
          workflowId: 'hr.leave.request',
          status: 'pending',
          taskType: 'approval',
          initiator: { id: 'u-other', username: 'other' },
          assignee: { id: 'u-current', username: 'current_user' },
        },
      },
      {
        id: 'inbox-2',
        sourceRefId: 'coord_task_1', // duplicate inbox item for same task
        sourceTitle: '请假申请',
        title: '[协同回执] 请假申请',
        rawContent: '已同意',
        createdAt: new Date(),
        updatedAt: new Date(),
        unifiedPayload: {
          taskId: 'coord_task_1',
          workflowId: 'hr.leave.request',
          status: 'approved',
          taskType: 'approval',
          initiator: { id: 'u-other', username: 'other' },
          assignee: { id: 'u-current', username: 'current_user' },
        },
      },
    ]);

    const tasks = await service.listTasks('u-current', 'assignee');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskId).toBe('coord_task_1');
    expect(tasks[0].workflowId).toBe('hr.leave.request');
  });

  it('should safely resolve non-UUID username or anonymous user without crashing', async () => {
    // initiator is anonymous -> fallback via findFirst
    mockPrisma.user.findFirst
      .mockResolvedValueOnce({
        id: '22222222-2222-2222-2222-222222222222',
        username: 'admin',
        email: 'admin@example.com',
      })
      // assignee is username 'admin' -> findFirst by username
      .mockResolvedValueOnce({
        id: '22222222-2222-2222-2222-222222222222',
        username: 'admin',
        email: 'admin@example.com',
      });

    mockPrisma.workbenchInboxItem.create.mockResolvedValue({
      id: 'inbox-nda-1',
    });

    const result = await service.createTask('anonymous', {
      assigneeId: 'admin',
      workflowId: 'legal.nda.generation_and_review_flow',
      title: '腾讯科技 - 商业保密协议 (NDA)',
      content: '帮我和腾讯科技签署一份为期3年的商业保密协议(NDA)，用于云计算技术合作，立场偏我方，违约金50万',
      taskType: CoordinationTaskType.approval,
      parameters: {
        counterpartyName: '腾讯科技',
        durationYears: 3,
        cooperationSubject: '云计算技术合作',
        myPosition: 'buyer',
        penaltyAmount: 500000,
      },
    });

    expect(result.taskId).toMatch(/^coord_/);
    expect(result.status).toBe(CoordinationTaskStatus.pending);
    expect(result.initiator.username).toBe('admin');
    expect(result.assignee.username).toBe('admin');
    expect(mockPrisma.workbenchInboxItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: '22222222-2222-2222-2222-222222222222',
        sourceSender: 'admin',
        title: expect.stringMatching(/\[待(?:担当确认|我承认|发送)\] 腾讯科技 - 商业保密协议 \(NDA\)/),
      }),
    });
  });

  it('should approve legal NDA task and produce archive record with tracking number', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-nda-item',
      title: '[待我承认] 腾讯科技 - 商业保密协议 (NDA)',
      sourceTitle: '腾讯科技 - 商业保密协议 (NDA)',
      unifiedPayload: {
        taskId: 'coord_nda_1',
        workflowId: 'legal.nda.generation_and_review_flow',
        taskType: 'approval',
        parameters: {
          contractTitle: '腾讯科技 - 商业保密协议 (NDA)',
          counterpartyName: '腾讯科技',
        },
        initiator: { id: '11111111-1111-1111-1111-111111111111', username: 'alice' },
        assignee: { id: '22222222-2222-2222-2222-222222222222', username: 'legal_officer' },
        actions: [],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      username: 'legal_officer',
    });
    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const result = await service.submitAction('22222222-2222-2222-2222-222222222222', 'coord_nda_1', {
      action: 'approve',
      comment: '合规审查通过，知识产权保护与违约金约定符合企业风控标准，同意归档。',
    });

    expect(result.status).toBe(CoordinationTaskStatus.approved);
    expect(result.unifiedPayload.externalSyncResult.success).toBe(true);
    expect(result.unifiedPayload.externalSyncResult.trackingNumber).toMatch(/^LEGAL-ARC-/);
    expect(result.unifiedPayload.externalSyncResult.externalSystem).toBe('法务电子合同库 & 存证归档中心');
  });

  it('should reject legal NDA task and set revision_required with rollbackTarget', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-nda-item-2',
      title: '[待我承认] 腾讯科技 - 商业保密协议 (NDA)',
      sourceTitle: '腾讯科技 - 商业保密协议 (NDA)',
      unifiedPayload: {
        taskId: 'coord_nda_2',
        workflowId: 'legal.nda.generation_and_review_flow',
        taskType: 'approval',
        initiator: { id: '11111111-1111-1111-1111-111111111111', username: 'alice' },
        assignee: { id: '22222222-2222-2222-2222-222222222222', username: 'legal_officer' },
        actions: [],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      username: 'legal_officer',
    });
    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const result = await service.submitAction('22222222-2222-2222-2222-222222222222', 'coord_nda_2', {
      action: 'reject',
      comment: '违约责任条款定义过宽，请调整第5条赔偿上限后再重新提报。',
    });

    expect(result.status).toBe('revision_required');
    expect(result.unifiedPayload.externalSyncResult.success).toBe(false);
    expect(result.unifiedPayload.externalSyncResult.rollbackTarget).toBe('draft_submission');
    expect(mockPrisma.workbenchInboxItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: '11111111-1111-1111-1111-111111111111',
        title: expect.stringContaining('已驳回退回修改'),
      }),
    });
  });

  it('should approve initiator_confirm stage in NDA flow, run automated review, and dispatch to law01', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-nda-initiator-1',
      title: '[待担当确认] 豆包有限公司 - 商业保密协议 (NDA)',
      sourceTitle: '豆包有限公司 - 商业保密协议 (NDA)',
      unifiedPayload: {
        taskId: 'coord_nda_init_1',
        workflowId: 'legal.nda.generation_and_review_flow',
        currentStage: 'initiator_confirm',
        taskType: 'approval',
        parameters: {
          contractTitle: '豆包有限公司 - 商业保密协议 (NDA)',
          counterpartyName: '豆包有限公司',
          durationYears: 3,
          penaltyAmount: 500000,
        },
        initiator: { id: 'u-initiator-1', username: 'business_owner' },
        assignee: { id: 'u-initiator-1', username: 'business_owner' },
        attachments: [{ name: '保密合同_豆包有限公司_v1_20260914.docx', url: 'http://example.com/nda.docx' }],
        actions: [],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-initiator-1',
      username: 'business_owner',
    });

    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u-law01-uuid',
      username: 'law01',
      email: 'law01@example.com',
    });

    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const result = await service.submitAction('u-initiator-1', 'coord_nda_init_1', {
      action: 'approve',
      comment: '初稿已核验，主体与合作主题准确无误，提交合规审查。',
      sync: true,
    });

    expect(result.status).toBe(CoordinationTaskStatus.approved);
    expect(result.unifiedPayload.externalSyncResult.success).toBe(true);
    expect(result.unifiedPayload.externalSyncResult.currentStage).toBe('legal_review');
    expect(result.unifiedPayload.externalSyncResult.nextAssignee).toBe('law01');
    expect(result.unifiedPayload.externalSyncResult.trackingNumber).toMatch(/^LEGAL-REV-/);
    expect(result.unifiedPayload.externalSyncResult.reviewReport.overallRisk).toBe('LOW');

    expect(mockPrisma.workbenchInboxItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-law01-uuid',
        title: expect.stringContaining('[待法务确认]'),
        sourceTitle: '豆包有限公司 - 商业保密协议 (NDA)',
        unifiedPayload: expect.objectContaining({
          currentStage: 'legal_review',
          previousStage: 'initiator_confirm',
        }),
      }),
    });
  });

  it('should complete initiator_confirm stage with replaced file and forward replaced draft to law01', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-nda-initiator-2',
      title: '[待担当确认] 豆包有限公司 - 商业保密协议 (NDA)',
      sourceTitle: '豆包有限公司 - 商业保密协议 (NDA)',
      unifiedPayload: {
        taskId: 'coord_nda_init_2',
        workflowId: 'legal.nda.generation_and_review_flow',
        currentStage: 'initiator_confirm',
        taskType: 'assignment',
        parameters: {
          contractTitle: '豆包有限公司 - 商业保密协议 (NDA)',
          counterpartyName: '豆包有限公司',
          durationYears: 3,
          penaltyAmount: 500000,
          downloadUrl: 'http://example.com/original.docx',
        },
        initiator: { id: 'u-initiator-1', username: 'business_owner' },
        assignee: { id: 'u-initiator-1', username: 'business_owner' },
        attachments: [{ name: '保密合同_豆包有限公司_v1_原初稿.docx', url: 'http://example.com/original.docx' }],
        actions: [],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-initiator-1',
      username: 'business_owner',
    });

    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u-law01-uuid',
      username: 'law01',
      email: 'law01@example.com',
    });

    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const replacementAttachment = {
      name: '保密合同_豆包有限公司_v2_担当修改版.docx',
      url: '/api/workbench-coordination/attachments/att_12345/download',
      size: 20480,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    const result = await service.submitAction('u-initiator-1', 'coord_nda_init_2', {
      action: 'complete',
      comment: '在本地对保密信息定义进行了补充细化，已上传最新修订版文档。',
      attachments: [replacementAttachment],
      sync: true,
    });

    expect(result.status).toBe(CoordinationTaskStatus.completed);
    expect(result.unifiedPayload.externalSyncResult.success).toBe(true);
    expect(result.unifiedPayload.externalSyncResult.isDraftReplaced).toBe(true);
    expect(result.unifiedPayload.externalSyncResult.activeAttachment.name).toBe('保密合同_豆包有限公司_v2_担当修改版.docx');

    expect(mockPrisma.workbenchInboxItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-law01-uuid',
        title: expect.stringContaining('担当已上传修订版'),
        rawContent: expect.stringContaining('保密合同_豆包有限公司_v2_担当修改版.docx'),
        unifiedPayload: expect.objectContaining({
          currentStage: 'legal_review',
          previousStage: 'initiator_confirm',
          parameters: expect.objectContaining({
            downloadUrl: '/api/workbench-coordination/attachments/att_12345/download',
            isDraftReplaced: true,
          }),
          attachments: expect.arrayContaining([
            replacementAttachment,
            expect.objectContaining({ url: 'http://example.com/original.docx' }),
          ]),
          metadata: expect.objectContaining({
            isDraftReplaced: true,
            replacedFileName: '保密合同_豆包有限公司_v2_担当修改版.docx',
          }),
        }),
      }),
    });

    expect(mockPrisma.execution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'succeeded',
        inputJson: expect.objectContaining({
          capabilityId: 'platform.document.contract-reviewer',
        }),
      }),
    });
    expect(mockPrisma.executionStep.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        executionId: 'exec-auto-review-1',
        capabilityId: 'platform.document.contract-reviewer',
        status: 'succeeded',
      }),
    });
    expect(result.unifiedPayload.externalSyncResult.reviewReport.executionId).toBe('exec-auto-review-1');
    expect(result.unifiedPayload.externalSyncResult.executionId).toBe('exec-auto-review-1');
  });

  it('should reject at legal_review stage and roll back to initiator_confirm', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-nda-legal-item',
      title: '[待法务确认] 豆包有限公司 - 商业保密协议 (NDA)',
      sourceTitle: '豆包有限公司 - 商业保密协议 (NDA)',
      unifiedPayload: {
        taskId: 'coord_nda_legal_1',
        workflowId: 'legal.nda.generation_and_review_flow',
        currentStage: 'legal_review',
        taskType: 'approval',
        initiator: { id: 'u-initiator-1', username: 'business_owner' },
        assignee: { id: 'u-law01-uuid', username: 'law01' },
        actions: [],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-law01-uuid',
      username: 'law01',
    });
    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const result = await service.submitAction('u-law01-uuid', 'coord_nda_legal_1', {
      action: 'reject',
      comment: '请核实相对方纳税人识别号与开户行信息，并明确除外条款范围。',
    });

    expect(result.status).toBe('revision_required');
    expect(result.unifiedPayload.externalSyncResult.success).toBe(false);
    expect(result.unifiedPayload.externalSyncResult.rollbackTarget).toBe('initiator_confirm');
    expect(mockPrisma.workbenchInboxItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-initiator-1',
        title: expect.stringContaining('已驳回退回担当重修'),
      }),
    });
  });

  it('should reject at initiator_confirm stage and roll back to draft_submission', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-nda-initiator-reject',
      title: '[待担当确认] 豆包有限公司 - 商业保密协议 (NDA)',
      sourceTitle: '豆包有限公司 - 商业保密协议 (NDA)',
      unifiedPayload: {
        taskId: 'coord_nda_init_reject_1',
        workflowId: 'legal.nda.generation_and_review_flow',
        currentStage: 'initiator_confirm',
        taskType: 'assignment',
        initiator: { id: 'u-business-user', username: 'business_owner' },
        assignee: { id: 'u-business-user', username: 'business_owner' },
        actions: [],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-business-user',
      username: 'business_owner',
    });
    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const result = await service.submitAction('u-business-user', 'coord_nda_init_reject_1', {
      action: 'reject',
      comment: '商务条款有误，相对方名称写错了，退回重新提单。',
    });

    expect(result.status).toBe('revision_required');
    expect(result.unifiedPayload.externalSyncResult.success).toBe(false);
    expect(result.unifiedPayload.externalSyncResult.rollbackTarget).toBe('draft_submission');
  });

  it('should throw BadRequestException if revision_required task is resubmitted without modifications', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-nda-revision-item',
      title: '[需重修] 豆包有限公司 - 商业保密协议 (NDA) - 审查失败',
      sourceTitle: '豆包有限公司 - 商业保密协议 (NDA)',
      unifiedPayload: {
        taskId: 'coord_nda_revision_1',
        workflowId: 'legal.nda.generation_and_review_flow',
        currentStage: 'initiator_confirm',
        taskType: 'approval',
        status: 'revision_required',
        initiator: { id: 'u-initiator-1', username: 'business_owner' },
        assignee: { id: 'u-initiator-1', username: 'business_owner' },
        actions: [{ id: 'act_prev_reject', action: 'reject', comment: '缺少条款' }],
        parameters: {
          counterpartyName: '豆包有限公司',
          cooperationSubject: 'AI模型算法技术合作',
          durationYears: 3,
        },
        attachments: [
          { name: '保密协议.docx', url: 'http://minio/nda.docx' },
        ],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-initiator-1',
      username: 'business_owner',
    });

    await expect(
      service.submitAction('u-initiator-1', 'coord_nda_revision_1', {
        action: 'approve',
        parameters: {
          counterpartyName: '豆包有限公司',
          cooperationSubject: 'AI模型算法技术合作',
          durationYears: 3,
        },
        attachments: [
          { name: '保密协议.docx', url: 'http://minio/nda.docx' },
        ],
      })
    ).rejects.toThrow('已驳回的任务不能无修改直接提交');
  });

  it('should allow resubmitting revision_required task when business parameters are modified', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-nda-revision-item',
      title: '[需重修] 豆包有限公司 - 商业保密协议 (NDA) - 审查失败',
      sourceTitle: '豆包有限公司 - 商业保密协议 (NDA)',
      unifiedPayload: {
        taskId: 'coord_nda_revision_2',
        workflowId: 'legal.nda.generation_and_review_flow',
        currentStage: 'initiator_confirm',
        taskType: 'approval',
        status: 'revision_required',
        initiator: { id: 'u-initiator-1', username: 'business_owner' },
        assignee: { id: 'u-initiator-1', username: 'business_owner' },
        actions: [{ id: 'act_prev_reject', action: 'reject', comment: '相对方名称错误' }],
        parameters: {
          counterpartyName: '豆包有限公司',
          cooperationSubject: 'AI模型算法技术合作',
          durationYears: 3,
        },
        attachments: [
          { name: '保密协议.docx', url: 'http://minio/nda.docx' },
        ],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-initiator-1',
      username: 'business_owner',
    });
    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const result = await service.submitAction('u-initiator-1', 'coord_nda_revision_2', {
      action: 'approve',
      sync: true,
      comment: '已修正相对方名称为北京火山引擎科技有限公司',
      parameters: {
        counterpartyName: '北京火山引擎科技有限公司',
        cooperationSubject: 'AI模型算法技术合作',
        durationYears: 3,
      },
      attachments: [
        { name: '保密协议.docx', url: 'http://minio/nda.docx' },
      ],
    });

    expect(result.status).not.toBe('revision_required');
    expect(mockPrisma.workbenchInboxItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inbox-nda-revision-item' },
        data: expect.objectContaining({
          status: 'converted',
          title: expect.stringContaining('豆包有限公司 - 商业保密协议 (NDA)'),
        }),
      })
    );
  });

  it('should allow resubmitting revision_required task when replacement attachment is uploaded', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-nda-revision-item-3',
      title: '[需重修] 豆包有限公司 - 商业保密协议 (NDA)',
      sourceTitle: '豆包有限公司 - 商业保密协议 (NDA)',
      unifiedPayload: {
        taskId: 'coord_nda_revision_3',
        workflowId: 'legal.nda.generation_and_review_flow',
        currentStage: 'initiator_confirm',
        taskType: 'approval',
        status: 'revision_required',
        initiator: { id: 'u-initiator-1', username: 'business_owner' },
        assignee: { id: 'u-initiator-1', username: 'business_owner' },
        actions: [{ id: 'act_prev_reject', action: 'reject' }],
        parameters: {
          counterpartyName: '豆包有限公司',
          downloadUrl: 'http://minio/nda_old.docx',
        },
        attachments: [
          { name: '保密协议_初版.docx', url: 'http://minio/nda_old.docx' },
        ],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-initiator-1',
      username: 'business_owner',
    });
    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const result = await service.submitAction('u-initiator-1', 'coord_nda_revision_3', {
      action: 'approve',
      sync: true,
      comment: '已替换修订版协议文件并提交重新审查',
      attachments: [
        { name: '保密协议_修订盖章版.docx', url: 'http://minio/nda_revised_signed.docx' },
      ],
      parameters: {
        counterpartyName: '豆包有限公司',
        isDraftReplaced: true,
        downloadUrl: 'http://minio/nda_revised_signed.docx',
      },
    });

    expect(result.status).not.toBe('revision_required');
    expect(mockPrisma.workbenchInboxItem.update).toHaveBeenCalled();
  });

  it('should allow resubmitting revision_required task when explanation comment is provided without param or attachment changes', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-nda-revision-item-comment',
      title: '[需重修] 豆包有限公司 - 商业保密协议 (NDA)',
      sourceTitle: '豆包有限公司 - 商业保密协议 (NDA)',
      unifiedPayload: {
        taskId: 'coord_nda_revision_4',
        workflowId: 'legal.nda.generation_and_review_flow',
        currentStage: 'initiator_confirm',
        taskType: 'approval',
        status: 'revision_required',
        initiator: { id: 'u-initiator-1', username: 'business_owner' },
        assignee: { id: 'u-initiator-1', username: 'business_owner' },
        actions: [{ id: 'act_prev_reject', action: 'reject', comment: '缺少说明' }],
        parameters: {
          counterpartyName: '豆包有限公司',
          cooperationSubject: 'AI模型算法技术合作',
          durationYears: 3,
        },
        attachments: [
          { name: '保密协议.docx', url: 'http://minio/nda.docx' },
        ],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-initiator-1',
      username: 'business_owner',
    });

    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const result = await service.submitAction('u-initiator-1', 'coord_nda_revision_4', {
      action: 'approve',
      sync: true,
      comment: '经与法务口头确认，该协议为标准模板无需修改条款，特此说明并重新发送。',
      attachments: [
        { name: '保密协议.docx', url: 'http://minio/nda.docx' },
      ],
      parameters: {
        counterpartyName: '豆包有限公司',
        cooperationSubject: 'AI模型算法技术合作',
        durationYears: 3,
      },
    });

    expect(result.status).not.toBe('revision_required');
    expect(mockPrisma.workbenchInboxItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'converted',
        }),
      })
    );
  });

  it('should advance workflow and dispatch to next stage rather than archiving when resubmitting a rejected receipt task', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-receipt-rejected-item',
      title: '[协同回执] @law01 已驳回退回担当重修: 豆包有限公司 - 商业保密协议 (NDA)',
      sourceTitle: '豆包有限公司 - 商业保密协议 (NDA)',
      sourceRefId: 'coord_ece70e20-6250-4782-807c-ff5c777afe73',
      unifiedPayload: {
        taskId: 'coord_ece70e20-6250-4782-807c-ff5c777afe73',
        workflowId: 'legal.nda.generation_and_review_flow',
        currentStage: 'initiator_confirm',
        taskType: 'receipt',
        isReceipt: true,
        receiptAction: 'reject',
        status: 'revision_required',
        initiator: { id: 'u-initiator-1', username: 'business_owner' },
        assignee: { id: 'u-law01-uuid', username: 'law01' },
        actions: [{ id: 'act_reject_1', action: 'reject', comment: '保密期间太短了' }],
        parameters: {
          counterpartyName: '豆包有限公司',
          durationYears: 3,
          downloadUrl: 'http://minio/nda_v1.docx',
        },
        attachments: [
          { name: '保密协议_v1.docx', url: 'http://minio/nda_v1.docx' },
        ],
        externalSyncResult: {
          success: false,
          rollbackTarget: 'initiator_confirm',
          rollbackAssignee: 'business_owner',
        },
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-initiator-1',
      username: 'business_owner',
    });
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u-law01-uuid',
      username: 'law01',
      email: 'law01@example.com',
    });
    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const result = await service.submitAction('u-initiator-1', 'coord_ece70e20-6250-4782-807c-ff5c777afe73', {
      action: 'approve',
      sync: true,
      comment: '已追加新版本文件并调整保密期限为5年',
      parameters: {
        counterpartyName: '豆包有限公司',
        durationYears: 5,
        downloadUrl: 'http://minio/nda_v2.docx',
      },
      attachments: [
        { name: '保密协议_v2.docx', url: 'http://minio/nda_v2.docx' },
        { name: '保密协议_v1.docx', url: 'http://minio/nda_v1.docx' },
      ],
    });

    expect(result.status).not.toBe('archived');
    expect(result.status).toBe(CoordinationTaskStatus.approved);

    // Verify it updated initiator's item to converted with [已发送] title
    expect(mockPrisma.workbenchInboxItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inbox-receipt-rejected-item' },
        data: expect.objectContaining({
          status: 'converted',
          title: expect.stringContaining('[已发送] 豆包有限公司 - 商业保密协议 (NDA)'),
        }),
      })
    );

    // Verify it created next stage task for law01
    expect(mockPrisma.workbenchInboxItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u-law01-uuid',
          title: expect.stringContaining('[待法务确认]'),
          unifiedPayload: expect.objectContaining({
            currentStage: 'legal_review',
          }),
        }),
      })
    );
  });

  it('should safely query target inbox item when taskId is not a standard UUID (e.g. coord_ prefix)', async () => {
    mockPrisma.workbenchInboxItem.findFirst.mockImplementation(async (query: any) => {
      const orConditions = query?.where?.OR || [];
      // Verify that no invalid UUID string is passed to `id`
      for (const cond of orConditions) {
        if (cond.id && typeof cond.id === 'string' && cond.id.startsWith('coord_')) {
          throw new Error(`Inconsistent column data: Error creating UUID, invalid character: expected an optional prefix of urn:uuid: followed by [0-9a-fA-F-], found 'o' at 2`);
        }
      }
      return {
        id: 'fbb7a5f4-0fb2-4ed2-89ba-c9fa83dcd0b3',
        title: '[协同回执] @law01 已驳回退回担当重修: 豆包有限公司 - 商业保密协议 (NDA)',
        sourceTitle: '豆包有限公司 - 商业保密协议 (NDA)',
        unifiedPayload: {
          taskId: 'coord_b2478028-5621-4a21-b739-ac709fd1c15d',
          workflowId: 'legal.nda.generation_and_review_flow',
          currentStage: 'initiator_confirm',
          taskType: 'approval',
          status: 'revision_required',
          parameters: {
            contractTitle: '豆包有限公司 - 商业保密协议 (NDA)',
            counterpartyName: '豆包有限公司',
            durationYears: 3,
          },
          initiator: { id: 'u-initiator-1', username: 'admin' },
          assignee: { id: 'u-initiator-1', username: 'admin' },
          actions: [],
        },
      };
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-initiator-1',
      username: 'admin',
    });
    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const result = await service.submitAction('u-initiator-1', 'coord_b2478028-5621-4a21-b739-ac709fd1c15d', {
      action: 'approve',
      sync: true,
      comment: '已核实无误，重新发送',
    });

    expect(result).toBeDefined();
    expect(result.status).not.toBe('revision_required');
  });

  it('should dynamically handle custom arbitrary workflow stages with file replacement and routing', async () => {
    (orgWorkflowService as any).workflows.set('custom.tech.solution_flow', {
      id: 'custom.tech.solution_flow',
      workflowId: 'custom.tech.solution_flow',
      name: '技术方案核准流',
      description: '生成方案后由经办核实，自动化安全核验后流转专家评审',
      category: 'tech',
      taskType: CoordinationTaskType.approval,
      status: 'published',
      isPublished: true,
      version: '1.0.0',
      assembledWorkflows: [],
      processDefinition: {
        stages: [
          {
            id: 'solution_submission',
            name: '方案提交',
            type: 'submission',
            description: '提交技术方案初始参数',
          },
          {
            id: 'author_confirm',
            name: '主创核验确认',
            type: 'approval',
            description: '主创人员核验生成的技术方案并支持上传修改稿',
            approverRule: 'initiator',
            allowFileReplacement: true,
            isArtifactReview: true,
            rollbackStageId: 'solution_submission',
          },
          {
            id: 'sec_scan_execution',
            name: '架构合规初核',
            type: 'automation',
            description: '自动化检测架构安全性',
          },
          {
            id: 'expert_review',
            name: '专家终审把关',
            type: 'approval',
            description: '技术专家审查方案',
            approverRule: 'specific_user',
            approverUsername: 'expert01',
            rollbackStageId: 'author_confirm',
          },
          {
            id: 'archive',
            name: '归档存证',
            type: 'archive',
            description: '存证归档',
          },
        ],
      },
    });

    mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
      id: 'inbox-custom-tech-1',
      title: '[待主创核验] 微服务中台架构演进方案',
      sourceTitle: '微服务中台架构演进方案',
      unifiedPayload: {
        taskId: 'coord_tech_task_1',
        workflowId: 'custom.tech.solution_flow',
        currentStage: 'author_confirm',
        taskType: 'approval',
        parameters: {
          solutionTitle: '微服务中台架构演进方案',
          downloadUrl: 'http://example.com/arch_v1.docx',
        },
        initiator: { id: 'u-architect-1', username: 'author_bob' },
        assignee: { id: 'u-architect-1', username: 'author_bob' },
        attachments: [{ name: '微服务架构方案_v1_原稿.docx', url: 'http://example.com/arch_v1.docx' }],
        actions: [],
      },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-architect-1',
      username: 'author_bob',
    });

    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u-expert-99',
      username: 'expert01',
      email: 'expert01@example.com',
    });

    mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
    mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

    const replacementAttachment = {
      name: '微服务架构方案_v2_主创优化版.docx',
      url: '/api/workbench-coordination/attachments/att_tech_999/download',
      size: 32768,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    const result = await service.submitAction('u-architect-1', 'coord_tech_task_1', {
      action: 'approve',
      comment: '根据最新基线修正了微服务边界划分，上传替换为 v2 版方案。',
      attachments: [replacementAttachment],
      sync: true,
    });

    expect(result.status).toBe(CoordinationTaskStatus.approved);
    expect(result.unifiedPayload.externalSyncResult.success).toBe(true);
    expect(result.unifiedPayload.externalSyncResult.isDraftReplaced).toBe(true);
    expect(result.unifiedPayload.externalSyncResult.activeAttachment.name).toBe('微服务架构方案_v2_主创优化版.docx');

    // 验证自动流转到下一个人工阶段：专家终审把关 (expert_review, expert01)
    expect(mockPrisma.workbenchInboxItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-expert-99',
        title: expect.stringContaining('专家终审把关'),
        rawContent: expect.stringContaining('微服务架构方案_v2_主创优化版.docx'),
        unifiedPayload: expect.objectContaining({
          currentStage: 'expert_review',
          previousStage: 'author_confirm',
          attachments: expect.arrayContaining([replacementAttachment]),
          metadata: expect.objectContaining({
            isDraftReplaced: true,
            replacedFileName: '微服务架构方案_v2_主创优化版.docx',
          }),
        }),
      }),
    });
  });

  it('should asynchronously execute NDA contract review without blocking, returning processing status immediately', async () => {
      mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
        id: 'inbox-nda-async-1',
        title: '[待担当确认] 腾讯科技有限公司 - 商业保密协议 (NDA)',
        sourceTitle: '腾讯科技有限公司 - 商业保密协议 (NDA)',
        unifiedPayload: {
          taskId: 'coord_nda_async_1',
          workflowId: 'legal.nda.generation_and_review_flow',
          currentStage: 'initiator_confirm',
          taskType: 'approval',
          parameters: {
            contractTitle: '腾讯科技有限公司 - 商业保密协议 (NDA)',
            counterpartyName: '腾讯科技有限公司',
            durationYears: 3,
            penaltyAmount: 500000,
          },
          initiator: { id: 'u-initiator-1', username: 'business_owner' },
          assignee: { id: 'u-initiator-1', username: 'business_owner' },
          attachments: [{ name: '保密合同_腾讯_v1.docx', url: 'http://example.com/nda.docx' }],
          actions: [],
        },
      });

      mockPrisma.workbenchInboxItem.update.mockResolvedValue({});

      const result = await service.submitAction('u-initiator-1', 'coord_nda_async_1', {
        action: 'approve',
        comment: '提交异步法务审查',
      });

      expect(result.isAsync).toBe(true);
      expect(result.message).toContain('异步执行');
      expect(result.status).toBe(CoordinationTaskStatus.pending);
      expect(result.unifiedPayload.asyncExecution.status).toBe('running');
    });

    it('should retry 3 times on automated review failure and roll back to current assignee', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-initiator-1',
        username: 'business_owner',
      });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u-initiator-1',
        username: 'business_owner',
      });
      mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
        id: 'inbox-nda-fail-1',
        title: '[待担当确认] 字节跳动 - 商业保密协议 (NDA)',
        sourceTitle: '字节跳动 - 商业保密协议 (NDA)',
        unifiedPayload: {
          taskId: 'coord_nda_fail_1',
          workflowId: 'legal.nda.generation_and_review_flow',
          currentStage: 'initiator_confirm',
          taskType: 'approval',
          parameters: {
            contractTitle: '字节跳动 - 商业保密协议 (NDA)',
            counterpartyName: '字节跳动',
            simulateFailure: true,
            simulateErrorMessage: '审查服务超时：条款规则库未响应',
          },
          initiator: { id: 'u-initiator-1', username: 'business_owner' },
          assignee: { id: 'u-initiator-1', username: 'business_owner' },
          attachments: [{ name: '保密合同_字节_v1.docx', url: 'http://example.com/nda.docx' }],
          actions: [],
        },
      });

      mockPrisma.workbenchInboxItem.update.mockResolvedValue({});

      const result = await service.submitAction('u-initiator-1', 'coord_nda_fail_1', {
        action: 'approve',
        comment: '提交审查（模拟失败重试）',
        sync: true,
      });

      expect(result.status).toBe('revision_required');
      expect(result.unifiedPayload.externalSyncResult.success).toBe(false);
      expect(result.unifiedPayload.externalSyncResult.retryAttempts).toBe(3);
      expect(result.unifiedPayload.externalSyncResult.rollbackAssignee).toBe('business_owner');

      // 验证未向法务专员创建条目，而是回退更新当前担当条目为需重修
      expect(mockPrisma.workbenchInboxItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: expect.stringContaining('[需重修]'),
            status: 'unprocessed',
          }),
        })
      );
    });

    it('should support converting inbox item to todo first, then submitting action identically', async () => {
      // 模拟先转为待办任务，通过 todo.id 提交动作
      const mockTodoId = 'todo-nda-uuid-1';
      mockPrisma.workbenchInboxItem.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'inbox-nda-todo-1',
        title: '[待担当确认] 阿里巴巴 - 商业保密协议 (NDA)',
        sourceTitle: '阿里巴巴 - 商业保密协议 (NDA)',
        convertedTodoId: mockTodoId,
        sourceRefId: 'coord_nda_todo_1',
        unifiedPayload: {
          taskId: 'coord_nda_todo_1',
          workflowId: 'legal.nda.generation_and_review_flow',
          currentStage: 'initiator_confirm',
          taskType: 'approval',
          parameters: {
            contractTitle: '阿里巴巴 - 商业保密协议 (NDA)',
            counterpartyName: '阿里巴巴',
            durationYears: 3,
            penaltyAmount: 1000000,
          },
          initiator: { id: 'u-initiator-1', username: 'business_owner' },
          assignee: { id: 'u-initiator-1', username: 'business_owner' },
          attachments: [{ name: '保密合同_阿里_v1.docx', url: 'http://example.com/nda.docx' }],
          actions: [],
        },
      });

      (mockPrisma as any).workbenchTodo = {
        findFirst: jest.fn().mockResolvedValue({
          id: mockTodoId,
          sourceRefId: 'coord_nda_todo_1',
          contextData: {
            taskId: 'coord_nda_todo_1',
            inboxItemId: 'inbox-nda-todo-1',
            isProcessTask: true,
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };

      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u-law01-uuid',
        username: 'law01',
        email: 'law01@example.com',
      });
      mockPrisma.workbenchInboxItem.update.mockResolvedValue({});
      mockPrisma.workbenchInboxItem.create.mockResolvedValue({});

      const result = await service.submitAction('u-initiator-1', mockTodoId, {
        action: 'approve',
        comment: '从待办列表核实确认并发送',
        sync: true,
      });

      expect(result.status).toBe(CoordinationTaskStatus.approved);
      expect(result.unifiedPayload.externalSyncResult.success).toBe(true);
      expect(result.unifiedPayload.externalSyncResult.nextAssignee).toBe('law01');

      // 验证法务收件箱成功接收到该任务
      expect(mockPrisma.workbenchInboxItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u-law01-uuid',
          title: expect.stringContaining('[待法务确认]'),
          sourceTitle: '阿里巴巴 - 商业保密协议 (NDA)',
        }),
      });

      // 验证原待办被标记为 completed，流转进入已发事项
      expect((mockPrisma as any).workbenchTodo.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'completed',
          }),
        })
      );
    });

    it('should recall sent coordination task back to pending todo without ending it', async () => {
      const mockTaskId = 'coord_recall_test_1';
      mockPrisma.workbenchInboxItem.findFirst.mockResolvedValue({
        id: 'inbox_item_recall_1',
        title: '[已发送] 腾讯科技 - 战略合作保密协议 (NDA)',
        sourceTitle: '腾讯科技 - 战略合作保密协议 (NDA)',
        sourceRefId: mockTaskId,
        userId: 'u-initiator-1',
        sourceSender: 'business_owner',
        status: 'converted',
        unifiedPayload: {
          taskId: mockTaskId,
          workflowId: 'legal.nda.generation_and_review_flow',
          currentStage: 'contract_review_execution',
          status: 'pending',
          inTransit: true,
          isSent: true,
          initiator: { id: 'u-initiator-1', username: 'business_owner' },
          assignee: { id: 'u-law01-uuid', username: 'law01' },
          parameters: {
            contractTitle: '腾讯科技 - 战略合作保密协议 (NDA)',
          },
        },
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-initiator-1',
        username: 'business_owner',
      });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u-initiator-1',
        username: 'business_owner',
      });

      (mockPrisma as any).workbenchInboxItem.updateMany.mockResolvedValue({ count: 1 });
      (mockPrisma as any).workbenchTodo.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.workbenchInboxItem.update.mockResolvedValue({});

      const recallResult = await service.recallTask('u-initiator-1', mockTaskId, '发现合作金额填错，撤回修正');

      expect(recallResult.success).toBe(true);
      expect(recallResult.status).toBe('pending');
      expect(recallResult.message).toContain('已返回您的「待办」');

      // 验证经办人条目被置为 converted，仅在行动待办看板中显示
      expect(mockPrisma.workbenchInboxItem.update).toHaveBeenCalledWith({
        where: { id: 'inbox_item_recall_1' },
        data: expect.objectContaining({
          title: '[已撤回] 腾讯科技 - 战略合作保密协议 (NDA)',
          status: 'converted',
          unifiedPayload: expect.objectContaining({
            isRecalled: true,
            inTransit: false,
            isSent: false,
            currentStage: 'initiator_confirm',
          }),
        }),
      });

      // 验证待办任务状态被重置为 pending，回到待办
      expect((mockPrisma as any).workbenchTodo.updateMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        data: expect.objectContaining({
          title: '[已撤回] 腾讯科技 - 战略合作保密协议 (NDA)',
          status: 'pending',
          completedAt: null,
          contextData: expect.objectContaining({
            isRecalled: true,
          }),
        }),
      });

      // 验证下游任务被废弃（status: discarded）
      expect((mockPrisma as any).workbenchInboxItem.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: { not: 'u-initiator-1' },
        }),
        data: expect.objectContaining({
          status: 'discarded',
        }),
      });
    });

  describe('MockHrService', () => {
    it('should sync leave approval and return tracking number with detail', async () => {
      const res = await mockHrService.syncLeaveApproval({
        taskId: 'coord_leave_mock',
        applicantName: 'alice',
        approverName: 'bob',
        leaveType: '事假',
        startTime: '2026-09-05 14:00',
        endTime: '2026-09-05 18:00',
        durationHours: 4,
        reason: '门诊看病',
      });
      expect(res.success).toBe(true);
      expect(res.trackingNumber).toMatch(/^HR-LEAVE-/);
      expect(res.detail.applicant).toBe('alice');
      expect(res.detail.approver).toBe('bob');
      expect(res.detail.status).toBe('RECORDED_AND_DEDUCTED');
    });
  });

  describe('CoordinationAttachmentStorageService', () => {
    it('should save attachment and retrieve it successfully', async () => {
      const storageService = new CoordinationAttachmentStorageService();
      const mockFile = {
        originalname: '保密协议_修订版_豆包.docx',
        buffer: Buffer.from('mock word docx file content'),
        size: 27,
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };

      const saved = await storageService.saveAttachment(mockFile, 'u-test-user');
      expect(saved.name).toBe('保密协议_修订版_豆包.docx');
      expect(saved.size).toBe(27);
      expect(saved.url).toContain('/api/workbench-coordination/attachments/');
      expect(saved.url).toContain('fileName=%E4%BF%9D%E5%AF%86%E5%8D%8F%E8%AE%AE_%E4%BF%AE%E8%AE%A2%E7%89%88_%E8%B1%86%E5%8C%85.docx');

      const retrieved = await storageService.getAttachment(saved.attachmentId);
      expect(retrieved.fileName).toBe('保密协议_修订版_豆包.docx');
      expect(retrieved.buffer.toString()).toBe('mock word docx file content');
      expect(retrieved.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
  });
});
