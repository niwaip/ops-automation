import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
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

    // 检查是否存在同名基础成果文件夹
    const existingFolder = await this.prisma.workspaceNode.findFirst({
      where: {
        workspaceId: workspace.id,
        parentId: baseFolderId,
        name: baseFolderName,
        type: 'folder',
      },
    });

    let targetFolderNode: any = null;
    let targetFolderName = baseFolderName;

    if (existingFolder) {
      // 严格会话与时间窗口隔离：仅当该文件夹确实属于当前会话，且在 5 分钟内创建时，才允许幂等复用
      let isSameSession = false;
      if (existingFolder.digestJson) {
        try {
          const dj =
            typeof existingFolder.digestJson === 'string'
              ? JSON.parse(existingFolder.digestJson)
              : existingFolder.digestJson;
          if (dj?.sessionId && dto.sessionId && dj.sessionId === dto.sessionId) {
            isSameSession = true;
          }
        } catch {
          // ignore parse errors
        }
      }
      const folderCreatedRecently =
        Math.abs(now.getTime() - new Date(existingFolder.createdAt).getTime()) < 300_000;

      if (folderCreatedRecently && isSameSession) {
        targetFolderNode = existingFolder;
      } else {
        // 重名但非同会话/超出 5 分钟，生成带时分秒后缀的唯一专属成果文件夹，坚决避免跨会话污染
        const timeSuffix = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        targetFolderName = `${baseFolderName}_${timeSuffix}`;
      }
    }

    const baseFileName = safeTitle.toLowerCase().endsWith('.md') ? safeTitle : `${safeTitle}.md`;
    const finalFileName = baseFileName;

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

    // 若未复用现有专属文件夹，新建带精准会话元数据的独立专属成果文件夹
    if (!targetFolderNode) {
      targetFolderNode = await this.prisma.workspaceNode.create({
        data: {
          workspaceId: workspace.id,
          parentId: baseFolderId,
          name: targetFolderName,
          type: 'folder',
          createdBy: userId,
          digestJson: {
            sessionId: dto.sessionId || '',
            messageId: dto.messageId || '',
            createdAt: now.toISOString(),
          },
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

    // 6.1 同步至用户沙箱成果库目录 (/workspace/deliverables/)，供 Agent 检索参考
    try {
      const candidateRoots = [
        path.join('/workspace/data/users', userId, 'workspace'),
        path.join(process.cwd(), 'data/users', userId, 'workspace'),
        path.resolve(process.cwd(), '../../../../data/users', userId, 'workspace'),
      ];
      for (const cand of candidateRoots) {
        if (fs.existsSync(cand)) {
          const targetDir = path.join(cand, 'deliverables', targetFolderName);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          fs.writeFileSync(path.join(targetDir, finalFileName), fileBuffer);
          break;
        }
      }
    } catch (deliverableSyncErr: any) {
      this.logger.warn(`Failed to sync note to user deliverables dir: ${deliverableSyncErr.message}`);
    }

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
        : this.extractFallbackTags(dto.title, dto.userQuery, dto.content);

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

    // 顶部结构化元数据面板：提问背景 + 核心标签
    const metaLines: string[] = [];
    if (dto.userQuery && dto.userQuery.trim()) {
      metaLines.push(`> 📌 **提问背景**：${dto.userQuery.trim()}`);
    }
    if (tags.length > 0) {
      const tagBadges = tags.map((t) => `\`#${t}\``).join(' ');
      metaLines.push(`> 🏷️ **核心标签**：${tagBadges}`);
    }
    if (metaLines.length > 0) {
      bodySections.push(metaLines.join('  \n'));
      bodySections.push('');
      bodySections.push('---');
      bodySections.push('');
    }

    if (!rawContent.startsWith('#')) {
      bodySections.push('## 💡 核心要点与记录');
    }
    bodySections.push(rawContent);
    bodySections.push('');

    return `${frontMatterLines.join('\n')}\n${bodySections.join('\n')}`;
  }

  private extractFallbackTags(title: string, userQuery?: string, content?: string): string[] {
    const tagsSet = new Set<string>();
    const textToAnalyze = `${title || ''} ${userQuery || ''} ${(content || '').slice(0, 400)}`;

    const engEntities = textToAnalyze.match(/\b[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*\b/g) || [];
    for (const ent of engEntities) {
      if (
        ent.length >= 2 &&
        !/^(the|and|for|with|this|that|from|into|view|show|get|post|have|will|can|not)$/i.test(ent)
      ) {
        if (/^[A-Z]/.test(ent) || ent.length >= 4) {
          tagsSet.add(ent);
        }
      }
      if (tagsSet.size >= 3) break;
    }

    const KEYWORD_PATTERNS = [
      { pattern: /(?:安装|部署|配置|环境|初始化)/, tag: '安装配置' },
      { pattern: /(?:调研|方案|剖析|选型|对比)/, tag: '技术调研' },
      { pattern: /(?:排错|报错|故障|修复|诊断)/, tag: '运维排错' },
      { pattern: /(?:接口|API|SDK|联调|协议)/, tag: '接口集成' },
      { pattern: /(?:性能|时延|压测|优化|基准)/, tag: '性能优化' },
      { pattern: /(?:数据|报表|指标|统计|分析)/, tag: '数据分析' },
      { pattern: /(?:规范|指南|文档|手册|教程)/, tag: '使用指南' },
    ];
    for (const kp of KEYWORD_PATTERNS) {
      if (kp.pattern.test(textToAnalyze)) {
        tagsSet.add(kp.tag);
      }
      if (tagsSet.size >= 4) break;
    }

    if (tagsSet.size === 0) {
      tagsSet.add('技术笔记');
    }

    return Array.from(tagsSet).slice(0, 5);
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
