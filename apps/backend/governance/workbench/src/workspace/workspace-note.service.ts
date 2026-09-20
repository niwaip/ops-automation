import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../ports';
import { STORAGE_DRIVER, type StorageDriver } from './storage/storage-driver.interface';
import { WorkspaceContentIndexerService } from './workspace-content-indexer.service';
import { WorkspaceDigestService } from './workspace-digest.service';
import type { SaveTextNoteDto, WorkspaceNodeDto } from './dto/workspace.dto';
import { WorkspaceArtifactSyncHelper } from './workspace-artifact-sync.helper';
import { WorkspaceNoteAiHelper } from './workspace-note-ai.helper';

@Injectable()
export class WorkspaceNoteService {
  private readonly logger = new Logger(WorkspaceNoteService.name);

  constructor(
    @Inject(WORKBENCH_PRISMA) private readonly prisma: WorkbenchPrismaPort,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    private readonly contentIndexer: WorkspaceContentIndexerService,
    private readonly digestService: WorkspaceDigestService,
    private readonly artifactSyncHelper: WorkspaceArtifactSyncHelper,
    private readonly aiHelper: WorkspaceNoteAiHelper
  ) {}

  /**
   * 将文本/AI对话及伴生产物异步智能归档至「沙盒保存内容」下的专属成果文件夹中
   */
  public async saveTextNote(
    userId: string,
    dto: SaveTextNoteDto,
    departmentId?: string,
    userRoles: string[] = []
  ): Promise<WorkspaceNodeDto> {
    if (!dto.title || !dto.title.trim()) {
      throw new BadRequestException('文档标题不能为空');
    }
    if (!dto.content || !dto.content.trim()) {
      throw new BadRequestException('文档内容不能为空');
    }

    // 1. 确定目标工作空间（默认用户个人空间）
    let workspace: any;
    if (dto.workspaceId) {
      workspace = await this.prisma.workspace.findUnique({
        where: { id: dto.workspaceId },
      });
      if (!workspace) {
        throw new NotFoundException('指定的工作空间不存在');
      }
      this.assertWorkspaceAccess(workspace, userId, departmentId, userRoles);
    } else {
      workspace = await this.prisma.workspace.findFirst({
        where: { type: 'personal', ownerUserId: userId },
      });
      if (!workspace) {
        workspace = await this.prisma.workspace.create({
          data: {
            name: '我的空间',
            type: 'personal',
            ownerUserId: userId,
          },
        });
        this.logger.log(`Created personal workspace for user: ${userId}`);
      }
    }

    // 2. 确定顶层归档分类目录（工作模式默认为 "工作任务成果 (tasks)"，常规问答/沙盒保存默认为 "沙盒保存内容 (saved)"）
    const now = new Date();
    const isTaskMode = dto.type === 'task_result' || Boolean(dto.executionId);
    const defaultFolder = isTaskMode ? '工作任务成果 (tasks)' : '沙盒保存内容 (saved)';
    const rawFolderPath = (dto.folderPath && dto.folderPath.trim()) || defaultFolder;
    const folderSegments = rawFolderPath
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);

    let baseFolderId: string | null = null;
    for (const segment of folderSegments) {
      let folderNode: any = await this.prisma.workspaceNode.findFirst({
        where: {
          workspaceId: workspace.id,
          parentId: baseFolderId,
          name: segment,
          type: 'folder',
        },
      });

      if (!folderNode) {
        folderNode = await this.prisma.workspaceNode.create({
          data: {
            workspaceId: workspace.id,
            parentId: baseFolderId,
            name: segment,
            type: 'folder',
            createdBy: userId,
          },
        });
      }
      baseFolderId = folderNode.id;
    }

    // 3. 构建带 FrontMatter 的初始结构化 Markdown 内容
    const markdownContent = this.buildStructuredMarkdown(dto, now);
    const fileBuffer = Buffer.from(markdownContent, 'utf-8');
    const fileSize = BigInt(fileBuffer.length);

    // 4. 检查工作空间配额
    const nextUsedBytes = BigInt(workspace.usedBytes) + fileSize;
    if (nextUsedBytes > BigInt(workspace.quotaBytes)) {
      throw new BadRequestException('工作空间存储配额已满，无法保存文档');
    }

    // 5. 在分类目录下创建本次保存的专属成果文件夹（支持 YYYYMMDD_主题 初始命名，防重幂等）
    const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const safeTitle = dto.title.trim().replace(/[\\/:*?"<>|]/g, '_');
    const baseFolderName = `${dateTag}_${safeTitle}`;

    // 幂等防重：检查是否 5 分钟内已保存过完全相同的成果文件夹与笔记
    let targetFolderNode = await this.prisma.workspaceNode.findFirst({
      where: {
        workspaceId: workspace.id,
        parentId: baseFolderId,
        name: baseFolderName,
        type: 'folder',
      },
    });

    const baseFileName = safeTitle.toLowerCase().endsWith('.md') ? safeTitle : `${safeTitle}.md`;
    let finalFileName = baseFileName;

    const candidateParentIds = targetFolderNode ? [targetFolderNode.id, baseFolderId] : [baseFolderId];
    for (const pId of candidateParentIds) {
      if (!pId) continue;
      const existingFile = await this.prisma.workspaceNode.findFirst({
        where: {
          workspaceId: workspace.id,
          parentId: pId,
          name: finalFileName,
        },
      });

      if (existingFile) {
        const createdRecently =
          Math.abs(now.getTime() - new Date(existingFile.createdAt).getTime()) < 300_000;
        if (createdRecently && existingFile.fileSize === fileSize) {
          this.logger.log(
            `Duplicate note detected within 5 minutes for "${finalFileName}", returning existing node: ${existingFile.id}`
          );
          return this.toNodeDto(existingFile);
        }
      }
    }

    // 若无现有专属文件夹或重名不同内容，新建带时间后缀的唯一专属文件夹
    if (!targetFolderNode) {
      targetFolderNode = await this.prisma.workspaceNode.create({
        data: {
          workspaceId: workspace.id,
          parentId: baseFolderId,
          name: baseFolderName,
          type: 'folder',
          createdBy: userId,
        },
      });
    }

    // 6. 物理落盘与数据库主笔记记录（存入该专属文件夹中，parentId 绑定为 targetFolderNode.id）
    const nodeId = randomUUID();
    const storageKey = `${workspace.type}/${workspace.id}/${nodeId}_${finalFileName}`;

    await this.storage.putFile(storageKey, fileBuffer);

    const noteNode = await this.prisma.workspaceNode.create({
      data: {
        id: nodeId,
        workspaceId: workspace.id,
        parentId: targetFolderNode.id,
        name: finalFileName,
        type: 'file',
        fileSize,
        mimeType: 'text/markdown',
        storagePath: storageKey,
        createdBy: userId,
      },
    });

    // 7. 更新已用空间配额
    await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: { usedBytes: nextUsedBytes },
    });

    // 8. 异步非阻塞处理流水线：资产归集入夹 + LLM 规范命名文件夹与总结重构
    const folderId = targetFolderNode.id;
    const currentFolderName = targetFolderNode.name;
    setImmediate(async () => {
      try {
        // 1) 扫描并归集全部伴生资产（HTML、Word、PDF、Excel、图表等）至专属文件夹
        const syncedArtifacts = await this.artifactSyncHelper.syncReferencedArtifactsToWorkspace(
          userId,
          workspace,
          folderId,
          dto
        );

        // 2) 异步唤起大模型综合提炼：更新文件夹规范命名、生成内容总结、注入资产清单导航与更新索引
        await this.aiHelper.refineFolderAndNoteWithAi({
          folderNodeId: folderId,
          baseFolderId,
          currentFolderName,
          noteNodeId: nodeId,
          noteStorageKey: storageKey,
          currentNoteFileName: finalFileName,
          dto,
          userId,
          workspace,
          syncedArtifacts,
        });
      } catch (err: any) {
        this.logger.warn(
          `Background archive refinement pipeline failed for folder ${folderId}: ${err.message}`
        );
      }
    });

    return this.toNodeDto(noteNode);
  }

  /**
   * 构造初始 YAML FrontMatter 与分块正文
   */
  private buildStructuredMarkdown(dto: SaveTextNoteDto, date: Date): string {
    const rawContent = dto.content.trim();

    if (rawContent.startsWith('---')) {
      return rawContent;
    }

    const tags =
      Array.isArray(dto.tags) && dto.tags.length > 0
        ? dto.tags.map((t) => String(t).trim()).filter(Boolean)
        : ['AI沉淀', '知识候选'];

    const frontMatterLines = [
      '---',
      `title: ${JSON.stringify(dto.title.trim())}`,
      `type: ${JSON.stringify(dto.type || 'task_result')}`,
      'status: "candidate"',
      `created_at: ${JSON.stringify(date.toISOString())}`,
      `tags: ${JSON.stringify(tags)}`,
      'source:',
      '  channel: "chat"',
      `  session_id: ${JSON.stringify(dto.sessionId || '')}`,
      `  message_id: ${JSON.stringify(dto.messageId || '')}`,
      `  execution_id: ${JSON.stringify(dto.executionId || '')}`,
      `  skill_used: ${JSON.stringify(dto.skillUsed || '')}`,
      `ai_model: ${JSON.stringify(dto.aiModel || '')}`,
      '---',
      '',
    ];

    const bodySections: string[] = [];
    bodySections.push(`# ${dto.title.trim()}`);
    bodySections.push('');

    if (dto.userQuery && dto.userQuery.trim()) {
      bodySections.push('## 📌 提问背景');
      bodySections.push(`> ${dto.userQuery.trim()}`);
      bodySections.push('');
    }

    if (!rawContent.startsWith('#')) {
      bodySections.push('## 💡 核心结论与 AI 总结');
    }
    bodySections.push(rawContent);
    bodySections.push('');

    if (dto.rawResultData) {
      bodySections.push('## 🔍 原始佐证与执行详情');
      bodySections.push('<details>');
      bodySections.push('<summary>展开查看原始结构化数据</summary>');
      bodySections.push('');
      bodySections.push('```json');
      try {
        const jsonText =
          typeof dto.rawResultData === 'string'
            ? JSON.stringify(JSON.parse(dto.rawResultData), null, 2)
            : JSON.stringify(dto.rawResultData, null, 2);
        bodySections.push(jsonText);
      } catch {
        bodySections.push(String(dto.rawResultData));
      }
      bodySections.push('```');
      bodySections.push('</details>');
      bodySections.push('');
    }

    bodySections.push('## 📝 知识核验与批注');
    bodySections.push('- [ ] 待人工确认准确性');
    bodySections.push('- 状态：个人知识候选 (Candidate)');
    bodySections.push('');

    return `${frontMatterLines.join('\n')}\n${bodySections.join('\n')}`;
  }

  /**
   * 鉴权检查
   */
  private assertWorkspaceAccess(
    workspace: any,
    userId: string,
    departmentId?: string,
    userRoles: string[] = []
  ): void {
    const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin');
    if (workspace.type === 'personal') {
      if (workspace.ownerUserId !== userId && !isAdmin) {
        throw new ForbiddenException('您无权向他人的个人空间写入文件');
      }
    } else if (workspace.type === 'department') {
      if (!departmentId || workspace.departmentId !== departmentId) {
        if (!isAdmin) {
          throw new ForbiddenException('您无权向非本部门空间写入文件');
        }
      }
    }
  }

  private toNodeDto(node: any): WorkspaceNodeDto {
    return {
      id: node.id,
      workspaceId: node.workspaceId,
      parentId: node.parentId,
      name: node.name,
      type: node.type,
      fileSize: node.fileSize.toString(),
      mimeType: node.mimeType,
      storagePath: node.storagePath,
      digest: node.digestJson || null,
      createdBy: node.createdBy,
      createdAt: node.createdAt instanceof Date ? node.createdAt.toISOString() : String(node.createdAt),
      updatedAt: node.updatedAt instanceof Date ? node.updatedAt.toISOString() : String(node.updatedAt),
    };
  }

  // 兼容性委托方法
  public async refineNoteWithAi(
    nodeId: string,
    storageKey: string,
    currentFileName: string,
    dto: SaveTextNoteDto,
    userId: string
  ): Promise<void> {
    const node = this.prisma.workspaceNode.findUnique
      ? await this.prisma.workspaceNode.findUnique({ where: { id: nodeId } })
      : await this.prisma.workspaceNode.findFirst({ where: { id: nodeId } });
    const workspaceId = node?.workspaceId || 'ws-1';
    const workspace = this.prisma.workspace.findUnique
      ? await this.prisma.workspace.findUnique({ where: { id: workspaceId } })
      : await this.prisma.workspace.findFirst({ where: { id: workspaceId } });
    await this.aiHelper.refineFolderAndNoteWithAi({
      folderNodeId: node?.parentId && node.parentId !== nodeId ? node.parentId : '',
      baseFolderId: null,
      currentFolderName: '',
      noteNodeId: nodeId,
      noteStorageKey: storageKey,
      currentNoteFileName: currentFileName,
      dto,
      userId,
      workspace: workspace || { id: workspaceId, type: 'personal' },
      syncedArtifacts: [],
    });
  }

  public async syncReferencedArtifactsToWorkspace(
    userId: string,
    workspace: any,
    parentId: string | null,
    dto: SaveTextNoteDto
  ): Promise<void> {
    if (!parentId) return;
    await this.artifactSyncHelper.syncReferencedArtifactsToWorkspace(userId, workspace, parentId, dto);
  }
}
