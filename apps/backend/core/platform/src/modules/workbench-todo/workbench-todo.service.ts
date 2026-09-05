import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateWorkbenchTodoDto,
  DueFilter,
  ExtractTodoPreviewDto,
  ExecuteTodoTaskDto,
  QueryWorkbenchTodoDto,
  TodoPriority,
  TodoSourceType,
  TodoStatus,
  UpdateWorkbenchTodoDto,
} from './dto/workbench-todo.dto';
import {
  ExtractedTodoPreview,
  WorkbenchTodoParserService,
} from './workbench-todo-parser.service';
import {
  TaskExecutionResult,
  WorkbenchTodoExecutorService,
} from './workbench-todo-executor.service';

export interface TaskRunnableCapability {
  id: string;
  name: string;
  description?: string;
  type: 'temporal_workflow' | 'flow_template' | 'skill';
  taskQueue?: string;
}

@Injectable()
export class WorkbenchTodoService {
  private readonly logger = new Logger(WorkbenchTodoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parserService: WorkbenchTodoParserService,
    private readonly executorService: WorkbenchTodoExecutorService
  ) {}

  /**
   * 分页查询当前用户的待办任务（支持状态、优先级、来源、时间维度与关键词过滤）
   */
  async findAll(userId: string, query: QueryWorkbenchTodoDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 50;
    const skip = (page - 1) * pageSize;

    const where: any = {
      userId: userId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.sourceType) {
      where.sourceType = query.sourceType;
    }

    if (query.keyword?.trim()) {
      const kw = query.keyword.trim();
      where.OR = [
        { title: { contains: kw, mode: 'insensitive' } },
        { description: { contains: kw, mode: 'insensitive' } },
        { sourceTitle: { contains: kw, mode: 'insensitive' } },
      ];
    }

    // 处理时间维度过滤
    const now = new Date();
    if (query.dueFilter === DueFilter.TODAY) {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      where.dueDate = {
        gte: startOfDay,
        lte: endOfDay,
      };
    } else if (query.dueFilter === DueFilter.OVERDUE) {
      where.dueDate = {
        lt: now,
      };
      where.status = {
        notIn: [TodoStatus.completed, TodoStatus.cancelled],
      };
    } else if (query.dueFilter === DueFilter.UPCOMING) {
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      where.dueDate = {
        gt: endOfDay,
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.workbenchTodo.count({ where }),
      this.prisma.workbenchTodo.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [
          { status: 'asc' },
          { priority: 'desc' },
          { dueDate: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取待办详情
   */
  async findById(userId: string, id: string) {
    const todo = await this.prisma.workbenchTodo.findUnique({
      where: { id },
    });

    if (!todo || todo.userId !== userId) {
      throw new NotFoundException(`待办任务不存在: ${id}`);
    }

    return todo;
  }

  /**
   * 创建待办任务
   */
  async create(userId: string, dto: CreateWorkbenchTodoDto) {
    return await this.prisma.workbenchTodo.create({
      data: {
        userId: userId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        priority: dto.priority || TodoPriority.medium,
        status: TodoStatus.pending,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        sourceType: dto.sourceType || TodoSourceType.manual,
        sourceRefId: dto.sourceRefId || null,
        sourceTitle: dto.sourceTitle || null,
        contextData: dto.contextData || {},
        boundWorkflowId: dto.boundWorkflowId || null,
      },
    });
  }

  /**
   * 更新待办任务
   */
  async update(userId: string, id: string, dto: UpdateWorkbenchTodoDto) {
    const existing = await this.findById(userId, id);

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (dto.title !== undefined) updateData.title = dto.title.trim();
    if (dto.description !== undefined) updateData.description = dto.description?.trim() || null;
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.dueDate !== undefined) updateData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.boundWorkflowId !== undefined) updateData.boundWorkflowId = dto.boundWorkflowId;
    if (dto.contextData !== undefined) updateData.contextData = dto.contextData;

    if (dto.status !== undefined) {
      updateData.status = dto.status;
      if (dto.status === TodoStatus.completed && existing.status !== TodoStatus.completed) {
        updateData.completedAt = new Date();
      } else if (dto.status !== TodoStatus.completed) {
        updateData.completedAt = null;
      }
    }

    return await this.prisma.workbenchTodo.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * 删除待办任务
   */
  async delete(userId: string, id: string) {
    await this.findById(userId, id);
    await this.prisma.workbenchTodo.delete({
      where: { id },
    });
    return { success: true, id };
  }

  /**
   * 解析并提炼 5W1H 待办草稿预览（AI 识别 + 启发式提取 + 匹配工作流）
   */
  async extractPreview(userId: string, dto: ExtractTodoPreviewDto): Promise<ExtractedTodoPreview> {
    const availableWorkflows = await this.discoverTaskRunnableWorkflows();
    return await this.parserService.extractTodoPreview(dto, availableWorkflows);
  }

  /**
   * 触发执行绑定工作流
   */
  async executeTask(
    userId: string,
    id: string,
    dto: ExecuteTodoTaskDto,
    authToken?: string
  ): Promise<TaskExecutionResult> {
    return await this.executorService.executeTask(userId, id, dto.overrideInput, authToken);
  }

  /**
   * 发现可执行任务的工作流与技能能力列表
   */
  async discoverTaskRunnableWorkflows(): Promise<TaskRunnableCapability[]> {
    try {
      const workflows = await this.prisma.temporalWorkflow.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          description: true,
          taskQueue: true,
          workflowDsl: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      return workflows.map((wf) => ({
        id: wf.id,
        name: wf.name,
        description: wf.description || undefined,
        type: 'temporal_workflow',
        taskQueue: wf.taskQueue,
      }));
    } catch (err: any) {
      this.logger.warn(`Failed to query temporal workflows for task discovery: ${err?.message}`);
      return [];
    }
  }
}
