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
  WORKBENCH_PRISMA,
} from '@ops/workbench';

describe('WorkbenchCoordinationService', () => {
  let service: WorkbenchCoordinationService;
  let mockHrService: MockHrService;

  const mockPrisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    workbenchInboxItem: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
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
        rawContent: expect.stringContaining('外部人事考勤系统联动已完成'),
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
});
