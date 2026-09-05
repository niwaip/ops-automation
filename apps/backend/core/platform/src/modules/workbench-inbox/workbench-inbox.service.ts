import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkbenchTodoService } from '../workbench-todo/workbench-todo.service';
import {
  ConvertInboxToTodoDto,
  InboxAiClarification,
  InboxItemStatus,
  IngestInboxItemDto,
  QueryInboxDto,
  TodoStatus,
  UnifiedInboxContent,
} from './dto/workbench-inbox.dto';
import { WorkbenchInboxIngestionService } from './workbench-inbox-ingestion.service';
import { WorkbenchInboxClarifierService } from './workbench-inbox-clarifier.service';

@Injectable()
export class WorkbenchInboxService {
  private readonly logger = new Logger(WorkbenchInboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestionService: WorkbenchInboxIngestionService,
    private readonly clarifierService: WorkbenchInboxClarifierService,
    private readonly todoService: WorkbenchTodoService
  ) {}

  /**
   * 接入新条目至 GTD 收件箱 (多源统一协议归一化与快速置信度评估)
   */
  async ingest(userId: string, dto: IngestInboxItemDto) {
    const workflows = await this.todoService.discoverTaskRunnableWorkflows();
    const { title, unifiedPayload, initialClarification } =
      this.ingestionService.normalizeIngestPayload(dto, workflows);

    const item = await this.prisma.workbenchInboxItem.create({
      data: {
        userId,
        title,
        rawContent: dto.rawContent.trim(),
        sourceType: dto.sourceType || 'manual',
        sourceRefId: dto.sourceRefId || null,
        sourceTitle: dto.sourceTitle || null,
        sourceSender: dto.sourceSender || null,
        unifiedPayload: unifiedPayload as any,
        status: InboxItemStatus.unprocessed,
        confidence: initialClarification.confidence,
        aiClarification: initialClarification as any,
      },
    });

    return item;
  }

  /**
   * 分页查询当前用户的收件箱条目
   */
  async findAll(userId: string, query: QueryInboxDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 50;
    const skip = (page - 1) * pageSize;

    const where: any = {
      userId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.sourceType) {
      where.sourceType = query.sourceType;
    }

    if (typeof query.minConfidence === 'number') {
      where.confidence = { ...(where.confidence || {}), gte: query.minConfidence };
    }
    if (typeof query.maxConfidence === 'number') {
      where.confidence = { ...(where.confidence || {}), lte: query.maxConfidence };
    }

    if (query.keyword?.trim()) {
      const kw = query.keyword.trim();
      where.OR = [
        { title: { contains: kw, mode: 'insensitive' } },
        { rawContent: { contains: kw, mode: 'insensitive' } },
        { sourceTitle: { contains: kw, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.workbenchInboxItem.count({ where }),
      this.prisma.workbenchInboxItem.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }],
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
   * 获取单条收件箱记录
   */
  async findById(userId: string, id: string) {
    const item = await this.prisma.workbenchInboxItem.findUnique({
      where: { id },
    });

    if (!item || item.userId !== userId) {
      throw new NotFoundException(`收件箱条目不存在: ${id}`);
    }

    return item;
  }

  /**
   * 对收件箱条目触发 LLM 深度厘清与 5W1H 要素整理
   */
  async clarify(userId: string, id: string) {
    const item = await this.findById(userId, id);
    const workflows = await this.todoService.discoverTaskRunnableWorkflows();

    const unifiedContent = item.unifiedPayload as unknown as UnifiedInboxContent;
    const clarification = await this.clarifierService.clarifyInboxItem(
      unifiedContent || {
        title: item.title,
        rawContent: item.rawContent,
        source: { type: item.sourceType },
      },
      workflows
    );

    const updated = await this.prisma.workbenchInboxItem.update({
      where: { id: item.id },
      data: {
        title: clarification.actionItem?.title || item.title,
        status: InboxItemStatus.clarified,
        confidence: clarification.confidence,
        aiClarification: clarification as any,
        clarifiedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return updated;
  }

  /**
   * 将收件箱条目正式转为待办任务 (WorkbenchTodo)
   */
  async convertToTodo(userId: string, id: string, dto: ConvertInboxToTodoDto) {
    const item = await this.findById(userId, id);
    const clarification = item.aiClarification as InboxAiClarification | null;
    const actionItem = clarification?.actionItem;

    const title = dto.title?.trim() || actionItem?.title || item.title;
    const description =
      dto.description?.trim() ||
      actionItem?.description ||
      item.rawContent;
    const priority = dto.priority || actionItem?.priority || 'medium';
    const dueDate = dto.dueDate || actionItem?.dueDate;
    const boundWorkflowId = dto.boundWorkflowId || actionItem?.suggestedWorkflowId;

    // 1. 创建正式待办任务
    const createdTodo = await this.prisma.workbenchTodo.create({
      data: {
        userId,
        title,
        description,
        priority,
        status: TodoStatus.pending,
        dueDate: dueDate ? new Date(dueDate) : null,
        sourceType: item.sourceType,
        sourceRefId: item.sourceRefId || item.id,
        sourceTitle: item.sourceTitle || item.title,
        boundWorkflowId: boundWorkflowId || null,
        contextData: {
          inboxItemId: item.id,
          sourceSender: item.sourceSender,
          unifiedPayload: item.unifiedPayload as any,
          clarification: clarification as any,
          ...(dto.overrideContext || {}),
        },
      },
    });

    // 2. 将收件箱条目状态置为 converted 并绑定待办ID
    const updatedInbox = await this.prisma.workbenchInboxItem.update({
      where: { id: item.id },
      data: {
        status: InboxItemStatus.converted,
        convertedTodoId: createdTodo.id,
        updatedAt: new Date(),
      },
    });

    return {
      todo: createdTodo,
      inboxItem: updatedInbox,
    };
  }

  /**
   * 更新收件箱条目状态（如归档/丢弃）
   */
  async updateStatus(userId: string, id: string, status: InboxItemStatus) {
    await this.findById(userId, id);
    return await this.prisma.workbenchInboxItem.update({
      where: { id },
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * 删除收件箱条目
   */
  async delete(userId: string, id: string) {
    await this.findById(userId, id);
    await this.prisma.workbenchInboxItem.delete({
      where: { id },
    });
    return { success: true, id };
  }
}
