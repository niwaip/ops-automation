import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_DRIVER, type StorageDriver } from './storage/storage-driver.interface';
import { WorkspaceContentIndexerService } from './workspace-content-indexer.service';
import { WorkspaceDigestService } from './workspace-digest.service';
import type {
  ContentSearchResultDto,
  WorkspaceNodeDto,
  WorkspaceSummaryDto,
  RegenerateDigestDto,
  BatchRegenerateDigestDto,
  SaveTextNoteDto,
} from './dto/workspace.dto';
import { WorkspaceNoteService } from './workspace-note.service';

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    private readonly contentIndexer: WorkspaceContentIndexerService,
    private readonly digestService: WorkspaceDigestService,
    private readonly noteService: WorkspaceNoteService
  ) {}

  /**
   * 保存文本笔记/AI对话沉淀
   */
  public async saveTextNote(
    userId: string,
    dto: SaveTextNoteDto,
    departmentId?: string,
    userRoles: string[] = []
  ): Promise<WorkspaceNodeDto> {
    return await this.noteService.saveTextNote(userId, dto, departmentId, userRoles);
  }

  /**
   * 查找或初始化当前用户可见的三级工作空间（个人空间、部门共享、公司公共盘）
   */
  public async getMyWorkspaces(
    userId: string,
    departmentId?: string
  ): Promise<{
    personal: WorkspaceSummaryDto;
    company: WorkspaceSummaryDto;
    department: WorkspaceSummaryDto | null;
  }> {
    // 1. 个人空间 (Personal Workspace)
    let personal = await this.prisma.workspace.findFirst({
      where: { type: 'personal', ownerUserId: userId },
    });
    if (!personal) {
      personal = await this.prisma.workspace.create({
        data: {
          name: '我的空间',
          type: 'personal',
          ownerUserId: userId,
        },
      });
      this.logger.log(`Created personal workspace for user: ${userId}`);
    }

    // 2. 公司公共盘 (Company Shared)
    let company = await this.prisma.workspace.findFirst({
      where: { type: 'company' },
    });
    if (!company) {
      company = await this.prisma.workspace.create({
        data: {
          name: '公司公共盘',
          type: 'company',
        },
      });
      this.logger.log(`Initialized company-wide public workspace`);
    }

    // 3. 部门共享空间 (Department Shared)
    let department = null;
    if (departmentId) {
      department = await this.prisma.workspace.findFirst({
        where: { type: 'department', departmentId },
      });
      if (!department) {
        department = await this.prisma.workspace.create({
          data: {
            name: '部门共享',
            type: 'department',
            departmentId,
          },
        });
        this.logger.log(`Created department workspace for departmentId: ${departmentId}`);
      }
    }

    return {
      personal: this.toWorkspaceSummary(personal),
      company: this.toWorkspaceSummary(company),
      department: department ? this.toWorkspaceSummary(department) : null,
    };
  }

  /**
   * 获取指定目录下的文件与文件夹列表
   */
  public async getNodes(
    workspaceId: string,
    parentId: string | null | undefined,
    userId: string,
    departmentId?: string
  ): Promise<WorkspaceNodeDto[]> {
    await this.assertAccess(workspaceId, userId, departmentId, 'read');

    const nodes = await this.prisma.workspaceNode.findMany({
      where: {
        workspaceId,
        parentId: parentId || null,
      },
      orderBy: [{ type: 'desc' }, { name: 'asc' }],
    });

    return nodes.map((node) => this.toNodeDto(node));
  }

  /**
   * 创建文件夹
   */
  public async createFolder(
    workspaceId: string,
    parentId: string | null | undefined,
    name: string,
    userId: string,
    userRoles: string[] = [],
    departmentId?: string
  ): Promise<WorkspaceNodeDto> {
    await this.assertAccess(workspaceId, userId, departmentId, 'write', userRoles);

    const safeName = name.trim();
    if (!safeName) {
      throw new BadRequestException('文件夹名称不能为空');
    }

    const existing = await this.prisma.workspaceNode.findFirst({
      where: {
        workspaceId,
        parentId: parentId || null,
        name: safeName,
      },
    });
    if (existing) {
      throw new BadRequestException(`当前目录下已存在同名项目: "${safeName}"`);
    }

    const folder = await this.prisma.workspaceNode.create({
      data: {
        workspaceId,
        parentId: parentId || null,
        name: safeName,
        type: 'folder',
        createdBy: userId,
      },
    });

    return this.toNodeDto(folder);
  }

  /**
   * 上传文件并落盘
   */
  public async uploadFile(
    workspaceId: string,
    parentId: string | null | undefined,
    file: Express.Multer.File,
    userId: string,
    userRoles: string[] = [],
    departmentId?: string
  ): Promise<WorkspaceNodeDto> {
    const workspace = await this.assertAccess(workspaceId, userId, departmentId, 'write', userRoles);

    if (!file || !file.buffer) {
      throw new BadRequestException('未接收到文件内容');
    }

    // 检查空间配额
    const nextUsedBytes = BigInt(workspace.usedBytes) + BigInt(file.size);
    if (nextUsedBytes > BigInt(workspace.quotaBytes)) {
      throw new BadRequestException('工作空间存储配额已满，无法上传');
    }

    let safeOriginalName = file.originalname || '未命名文件';
    try {
      const decoded = Buffer.from(safeOriginalName, 'latin1').toString('utf8');
      if (decoded && !decoded.includes('\ufffd')) {
        safeOriginalName = decoded;
      }
    } catch {
      // ignore
    }
    safeOriginalName = safeOriginalName.replace(/[\\/:*?"<>|]/g, '_');
    const nodeId = require('crypto').randomUUID();
    const storageKey = `${workspace.type}/${workspace.id}/${nodeId}_${safeOriginalName}`;

    // 物理落盘
    await this.storage.putFile(storageKey, file.buffer);

    // 写入数据库
    const node = await this.prisma.workspaceNode.create({
      data: {
        id: nodeId,
        workspaceId,
        parentId: parentId || null,
        name: safeOriginalName,
        type: 'file',
        fileSize: BigInt(file.size),
        mimeType: file.mimetype || 'application/octet-stream',
        storagePath: storageKey,
        createdBy: userId,
      },
    });

    // 更新空间使用量
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { usedBytes: nextUsedBytes },
    });

    // 异步提取纯文本并构建结构化摘要卡片
    this.contentIndexer
      .extractText(file.buffer, safeOriginalName, file.mimetype)
      .then(async (text) => {
        if (text) {
          await this.contentIndexer.cacheExtractedText(storageKey, text);
          await this.digestService.generateAndSaveDigest(
            nodeId,
            storageKey,
            safeOriginalName,
            file.mimetype
          );
        }
      })
      .catch((err) => {
        this.logger.warn(`Background text indexing/digesting failed for ${safeOriginalName}: ${err.message}`);
      });

    return this.toNodeDto(node);
  }

  /**
   * 下载文件
   */
  public async downloadFile(
    workspaceId: string,
    nodeId: string,
    userId: string,
    departmentId?: string
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    await this.assertAccess(workspaceId, userId, departmentId, 'read');

    const node = await this.prisma.workspaceNode.findFirst({
      where: { id: nodeId, workspaceId },
    });
    if (!node || node.type !== 'file' || !node.storagePath) {
      throw new NotFoundException('指定文件不存在或不是文件节点');
    }

    const buffer = await this.storage.getFile(node.storagePath);
    return {
      buffer,
      fileName: node.name,
      mimeType: node.mimeType || 'application/octet-stream',
    };
  }

  /**
   * 删除文件或文件夹
   */
  public async deleteNode(
    workspaceId: string,
    nodeId: string,
    userId: string,
    userRoles: string[] = [],
    departmentId?: string
  ): Promise<{ success: boolean; deletedCount: number }> {
    await this.assertAccess(workspaceId, userId, departmentId, 'delete', userRoles);

    const node = await this.prisma.workspaceNode.findFirst({
      where: { id: nodeId, workspaceId },
    });
    if (!node) {
      // 幂等处理：节点已被删除或不存在时，直接返回成功，避免前端 404 报错
      return { success: true, deletedCount: 0 };
    }

    // 收集所有需要清理物理文件的子孙文件节点
    const filesToDelete: { storagePath: string | null; fileSize: bigint }[] = [];
    if (node.type === 'file') {
      filesToDelete.push({ storagePath: node.storagePath, fileSize: node.fileSize });
    } else {
      const descendants = await this.getAllDescendantNodes(workspaceId, [node.id]);
      for (const d of descendants) {
        if (d.type === 'file') {
          filesToDelete.push({ storagePath: d.storagePath, fileSize: d.fileSize });
        }
      }
    }

    // 删除物理磁盘文件
    for (const f of filesToDelete) {
      if (f.storagePath) {
        await this.storage.deleteFile(f.storagePath).catch(() => undefined);
      }
    }

    // 数据库级联删除
    await this.prisma.workspaceNode.delete({
      where: { id: nodeId },
    });

    // 扣减空间使用量
    const totalFreed = filesToDelete.reduce((acc, curr) => acc + curr.fileSize, 0n);
    if (totalFreed > 0n) {
      const currentWs = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (currentWs) {
        const remaining = currentWs.usedBytes > totalFreed ? currentWs.usedBytes - totalFreed : 0n;
        await this.prisma.workspace.update({
          where: { id: workspaceId },
          data: { usedBytes: remaining },
        });
      }
    }

    return { success: true, deletedCount: filesToDelete.length + (node.type === 'folder' ? 1 : 0) };
  }

  /**
   * 跨所有可见空间快速模糊搜索文件（供聊天框 @ 文件提示使用）
   */
  public async searchFiles(
    userId: string,
    departmentId?: string,
    query?: string
  ): Promise<WorkspaceNodeDto[]> {
    const spaces = await this.getMyWorkspaces(userId, departmentId);
    const visibleWorkspaceIds = [
      spaces.personal.id,
      spaces.company.id,
      spaces.department?.id,
    ].filter(Boolean) as string[];

    const q = (query || '').trim();
    const nodes = await this.prisma.workspaceNode.findMany({
      where: {
        workspaceId: { in: visibleWorkspaceIds },
        type: 'file',
        name: q ? { contains: q, mode: 'insensitive' } : undefined,
      },
      include: {
        workspace: true,
      },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });

    return nodes.map((node) => ({
      ...this.toNodeDto(node),
      workspaceType: node.workspace.type,
      workspaceName: node.workspace.name,
    }));
  }

  /**
   * 基于纯文本与伴生缓存的全文关键词检索（Grep / Content Search）
   */
  public async searchContent(
    userId: string,
    departmentId: string | undefined,
    query: string,
    workspaceId?: string
  ): Promise<ContentSearchResultDto[]> {
    const q = (query || '').trim();
    if (!q || q.length < 2) {
      return [];
    }

    const spaces = await this.getMyWorkspaces(userId, departmentId);
    const visibleWorkspaceIds = [
      spaces.personal.id,
      spaces.company.id,
      spaces.department?.id,
    ].filter(Boolean) as string[];

    let targetWorkspaceIds = visibleWorkspaceIds;
    if (workspaceId) {
      if (!visibleWorkspaceIds.includes(workspaceId)) {
        throw new ForbiddenException('您无权检索指定工作空间的内容');
      }
      targetWorkspaceIds = [workspaceId];
    }

    // 获取有权访问的所有文件节点
    const nodes = await this.prisma.workspaceNode.findMany({
      where: {
        workspaceId: { in: targetWorkspaceIds },
        type: 'file',
        storagePath: { not: null },
      },
      include: {
        workspace: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    const results: ContentSearchResultDto[] = [];
    for (const node of nodes) {
      if (!node.storagePath) continue;
      let matches = await this.contentIndexer.grepFile(
        node.storagePath,
        node.name,
        node.mimeType,
        q,
        3
      );
      if (matches.length === 0 && node.name.toLowerCase().includes(q.toLowerCase())) {
        try {
          const preview = await this.getFileContent(
            node.workspaceId,
            node.id,
            userId,
            ['admin'],
            departmentId,
            1,
            3
          );
          if (preview.content) {
            matches = preview.content
              .split('\n')
              .filter((l) => l.trim().length > 0)
              .slice(0, 3)
              .map((line, idx) => ({ line: idx + 1, snippet: line }));
          }
        } catch {
          // ignore preview error
        }
      }
      if (matches.length > 0) {
        results.push({
          ...this.toNodeDto(node),
          workspaceType: node.workspace.type,
          workspaceName: node.workspace.name,
          matches,
        });
        if (results.length >= 30) break;
      }
    }

    return results;
  }

  /**
   * 获取文件纯文本预览内容
   */
  public async getFileContent(
    workspaceId: string,
    nodeId: string,
    userId: string,
    userRoles: string[] = [],
    departmentId?: string,
    startLine?: number,
    endLine?: number
  ): Promise<{
    content: string;
    mimeType: string;
    fileName: string;
    isText: boolean;
    startLine?: number;
    endLine?: number;
    totalLines?: number;
  }> {
    await this.assertAccess(workspaceId, userId, departmentId, 'read', userRoles);

    const node = await this.prisma.workspaceNode.findUnique({
      where: { id: nodeId },
    });
    if (!node || node.workspaceId !== workspaceId) {
      throw new NotFoundException('找不到指定文件');
    }
    if (!node.storagePath) {
      throw new BadRequestException('该文件暂无物理存储路径');
    }

    const text = await this.contentIndexer.getExtractedText(
      node.storagePath,
      node.name,
      node.mimeType
    );

    if (text === null) {
      return {
        content: '（该文件类型暂不支持纯文本预览，请点击下载查看）',
        mimeType: node.mimeType || 'application/octet-stream',
        fileName: node.name,
        isText: false,
      };
    }

    const lines = text.split(/\r?\n/);
    const totalLines = lines.length;

    if (startLine !== undefined || endLine !== undefined) {
      const s = Math.max(1, startLine || 1);
      const e = Math.min(totalLines, endLine || s + 100);
      const sliced = lines.slice(s - 1, e);
      return {
        content: sliced.map((line, idx) => `${s + idx} | ${line}`).join('\n'),
        mimeType: node.mimeType || 'text/plain',
        fileName: node.name,
        isText: true,
        startLine: s,
        endLine: e,
        totalLines,
      };
    }

    return {
      content: text,
      mimeType: node.mimeType || 'text/plain',
      fileName: node.name,
      isText: true,
      totalLines,
    };
  }

  /**
   * 递归获取某文件夹下的所有子节点
   */
  private async getAllDescendantNodes(workspaceId: string, parentIds: string[]): Promise<any[]> {
    if (!parentIds.length) return [];
    const children = await this.prisma.workspaceNode.findMany({
      where: {
        workspaceId,
        parentId: { in: parentIds },
      },
    });
    if (!children.length) return [];
    const folderIds = children.filter((c) => c.type === 'folder').map((c) => c.id);
    const subDescendants = await this.getAllDescendantNodes(workspaceId, folderIds);
    return [...children, ...subDescendants];
  }

  /**
   * 校验权限
   */
  private async assertAccess(
    workspaceId: string,
    userId: string,
    departmentId: string | undefined,
    action: 'read' | 'write' | 'delete',
    userRoles: string[] = []
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException('指定的工作空间不存在');
    }

    const isAdmin = userRoles.includes('admin');

    if (workspace.type === 'personal') {
      if (workspace.ownerUserId !== userId && !isAdmin) {
        throw new ForbiddenException('您无权访问或修改此个人工作空间');
      }
      return workspace;
    }

    if (workspace.type === 'department') {
      const belongsToDept = departmentId && workspace.departmentId === departmentId;
      if (!belongsToDept && !isAdmin) {
        throw new ForbiddenException('您不属于该部门，无权访问该部门工作空间');
      }
      return workspace;
    }

    if (workspace.type === 'company') {
      if (action === 'read') {
        return workspace; // 全员只读
      }
      if (!isAdmin) {
        throw new ForbiddenException('只有系统管理员有权修改公司公共盘内容');
      }
      return workspace;
    }

    return workspace;
  }

  /**
   * 手动重新生成文档结构化摘要卡片（支持可选大模型清洗与特定数据提取）
   */
  public async regenerateDigest(
    workspaceId: string,
    nodeId: string,
    userId: string,
    userRoles: string[] = [],
    departmentId?: string,
    options?: RegenerateDigestDto
  ): Promise<{ success: boolean; digest: any }> {
    await this.assertAccess(workspaceId, userId, departmentId, 'write', userRoles);
    const node = await this.prisma.workspaceNode.findUnique({
      where: { id: nodeId },
    });
    if (!node || node.workspaceId !== workspaceId) {
      throw new NotFoundException('找不到指定文件');
    }
    if (!node.storagePath) {
      throw new BadRequestException('该文件暂无物理存储路径');
    }

    const digest = await this.digestService.generateAndSaveDigest(
      node.id,
      node.storagePath,
      node.name,
      node.mimeType,
      options
    );
    return { success: true, digest };
  }

  /**
   * 批量调用重新生成文档结构化摘要卡片 / AI 批量清洗
   */
  public async batchRegenerateDigest(
    workspaceId: string,
    nodeIds: string[],
    userId: string,
    userRoles: string[] = [],
    departmentId?: string,
    options?: RegenerateDigestDto
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: Array<{ nodeId: string; name: string; success: boolean; error?: string }>;
  }> {
    await this.assertAccess(workspaceId, userId, departmentId, 'write', userRoles);

    const nodes = await this.prisma.workspaceNode.findMany({
      where: {
        id: { in: nodeIds },
        workspaceId,
        type: 'file',
      },
    });

    const results: Array<{ nodeId: string; name: string; success: boolean; error?: string }> = [];
    let successful = 0;
    let failed = 0;

    for (const node of nodes) {
      if (!node.storagePath) {
        results.push({ nodeId: node.id, name: node.name, success: false, error: '无存储路径' });
        failed++;
        continue;
      }
      try {
        await this.digestService.generateAndSaveDigest(
          node.id,
          node.storagePath,
          node.name,
          node.mimeType,
          options
        );
        results.push({ nodeId: node.id, name: node.name, success: true });
        successful++;
      } catch (err: any) {
        results.push({ nodeId: node.id, name: node.name, success: false, error: err.message });
        failed++;
      }
    }

    return {
      total: nodes.length,
      successful,
      failed,
      results,
    };
  }

  private toWorkspaceSummary(ws: any): WorkspaceSummaryDto {
    return {
      id: ws.id,
      name: ws.name,
      type: ws.type,
      ownerUserId: ws.ownerUserId,
      departmentId: ws.departmentId,
      quotaBytes: ws.quotaBytes.toString(),
      usedBytes: ws.usedBytes.toString(),
      createdAt: ws.createdAt.toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
    };
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
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    };
  }
}
