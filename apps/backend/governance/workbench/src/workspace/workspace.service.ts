import {
BadRequestException,
ForbiddenException,
Inject,
Injectable,
Logger,
NotFoundException,
OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { WORKBENCH_PRISMA,WorkbenchPrismaPort } from '../ports';
import type {
  BatchRegenerateDigestDto,
  ContentMatchSnippet,
  ContentSearchResultDto,
  DepartmentSummaryDto,
  MulterUploadedFile,
  MyWorkspacesResponseDto,
  RegenerateDigestDto,
  SaveTextNoteDto,
  WorkspaceDigestStatsDto,
  WorkspaceNodeDto,
  WorkspaceSummaryDto
} from './dto/workspace.dto';
import { STORAGE_DRIVER,type StorageDriver } from './storage/storage-driver.interface';
import { WorkspaceContentIndexerService } from './workspace-content-indexer.service';
import { WorkspaceDigestService } from './workspace-digest.service';
import { WorkspaceNoteService } from './workspace-note.service';
import { WorkspaceTempCleanerService } from './workspace-temp-cleaner.service';
import {
WorkspaceProcessArchiveService,
type ArchiveDeliverablesOptions,
type ArchiveResult,
} from './workspace-process-archive.service';
import {
  buildQueryTokenProfile,
  scoreCandidateNode,
  evaluateDocumentRelevance,
  extractMetadataMatchSnippets,
} from './workspace-search-relevance.helper';
import { guessMimeType } from './workspace-artifact-sync.helper';

@Injectable()
export class WorkspaceService implements OnModuleInit {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    @Inject(WORKBENCH_PRISMA) private readonly prisma: WorkbenchPrismaPort,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    private readonly contentIndexer: WorkspaceContentIndexerService,
    private readonly digestService: WorkspaceDigestService,
    private readonly noteService: WorkspaceNoteService,
    private readonly processArchiveService: WorkspaceProcessArchiveService,
    private readonly tempCleaner: WorkspaceTempCleanerService
  ) {}

  async onModuleInit() {
    setImmediate(async () => {
      try {
        await this.processArchiveService.syncHistoricalArchivedTasks();
      } catch (err) {
        this.logger.warn('Failed to sync historical archived tasks during onModuleInit:', err);
      }
    });
  }

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
    departmentId?: string,
    userRoles: string[] = []
  ): Promise<MyWorkspacesResponseDto> {
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
    if (personal) {
      await this.syncUserSandboxKnowledge(personal.id, userId);
      personal = (await this.prisma.workspace.findUnique({ where: { id: personal.id } })) || personal;
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
    // 严格从服务端 orgMembership 查询当前用户所属的部门
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    const memberships = isUuid
      ? await this.prisma.orgMembership.findMany({
          where: {
            userId,
            status: 'active',
            departmentId: { not: null },
          },
        })
      : [];
    const userDeptIds = memberships.map((m) => m.departmentId!).filter(Boolean);
    const isAdmin = userRoles.includes('admin');

    // 获取组织部门备选（管理员可见全量部门备选，普通成员仅可见其所属部门）
    const allDepts = isAdmin
      ? await this.prisma.department.findMany({ orderBy: { name: 'asc' } })
      : userDeptIds.length > 0
      ? await this.prisma.department.findMany({
          where: { id: { in: userDeptIds } },
          orderBy: { name: 'asc' },
        })
      : [];

    // 确定当前请求优先使用的部门 ID：仅允许用户实际所属部门，管理员可切换任意指定部门
    let effectiveDeptId: string | null = null;
    if (isAdmin && departmentId) {
      effectiveDeptId = departmentId;
    } else if (departmentId && userDeptIds.includes(departmentId)) {
      effectiveDeptId = departmentId;
    } else if (userDeptIds.length > 0) {
      effectiveDeptId = userDeptIds[0];
    } else if (isAdmin && allDepts.length > 0) {
      effectiveDeptId = allDepts[0].id;
    }
    // 未归属任何部门的非管理员用户，严格不授予任何部门空间（保持为 null，杜绝越权访问其他部门）

    let department = null;
    if (effectiveDeptId) {
      department = await this.prisma.workspace.findFirst({
        where: { type: 'department', departmentId: effectiveDeptId },
      });
      if (!department) {
        const deptRecord = await this.prisma.department.findUnique({
          where: { id: effectiveDeptId },
        });
        department = await this.prisma.workspace.create({
          data: {
            name: deptRecord ? `${deptRecord.name}共享` : '部门共享',
            type: 'department',
            departmentId: effectiveDeptId,
          },
        });
        this.logger.log(`Created department workspace for departmentId: ${effectiveDeptId}`);
      }
    }

    // 4. 流程管理空间 (Process / Workflow Archive)
    let processWorkspace = await this.prisma.workspace.findFirst({
      where: { type: 'process' },
    });
    if (!processWorkspace) {
      processWorkspace = await this.prisma.workspace.create({
        data: {
          name: '流程管理空间',
          type: 'process',
        },
      });
      this.logger.log(`Initialized process workspace`);
    }

    // 计算当前用户可见的部门列表
    const targetDepts = allDepts;
    const deptWorkspaces = await this.prisma.workspace.findMany({
      where: { type: 'department', departmentId: { in: targetDepts.map((d) => d.id) } },
    });
    const wsMap = new Map<string, string>(deptWorkspaces.map((w) => [w.departmentId!, w.id]));
    const departmentsList: DepartmentSummaryDto[] = targetDepts.map((d) => ({
      id: d.id,
      name: d.name,
      workspaceId: wsMap.get(d.id) || '',
    }));

    return {
      personal: this.toWorkspaceSummary(personal),
      company: this.toWorkspaceSummary(company),
      department: department ? this.toWorkspaceSummary(department) : null,
      process: this.toWorkspaceSummary(processWorkspace),
      departments: departmentsList,
    };
  }

  /**
   * 获取指定目录下的文件与文件夹列表
   */
  public async getNodes(
    workspaceId: string,
    parentId: string | null | undefined,
    userId: string,
    userRoles: string[] = [],
    departmentId?: string,
    sortBy?: string,
    order?: 'asc' | 'desc',
    scope?: 'folder' | 'all' | 'ai_cleaned' | 'uncleaned'
  ): Promise<WorkspaceNodeDto[]> {
    await this.assertAccess(workspaceId, userId, departmentId, 'read', userRoles);

    // 识别个人临时工作区文件夹，将其下的临时运行文件作为对象外排除
    const tempFolders = await this.prisma.workspaceNode.findMany({
      where: {
        workspaceId,
        type: 'folder',
        OR: [
          { name: { contains: 'temp', mode: 'insensitive' } },
          { name: { contains: '临时工作区' } },
        ],
      },
      select: { id: true },
    });
    const tempFolderIds = new Set(tempFolders.map((f) => f.id));

    let orderByClause: any[] = [{ type: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }];
    if (sortBy === 'name') {
      orderByClause = [{ type: 'desc' }, { name: order === 'desc' ? 'desc' : 'asc' }];
    } else if (sortBy === 'fileSize') {
      orderByClause = [{ type: 'desc' }, { fileSize: order === 'asc' ? 'asc' : 'desc' }];
    } else if (sortBy === 'createdAt') {
      orderByClause = [{ type: 'desc' }, { createdAt: order === 'asc' ? 'asc' : 'desc' }];
    } else if (sortBy === 'updatedAt') {
      orderByClause = [{ type: 'desc' }, { updatedAt: order === 'asc' ? 'asc' : 'desc' }];
    }

    // 平铺文档一览模式（全量文档、已AI提炼文档、未清洗文档）
    if (scope && scope !== 'folder') {
      let files = await this.prisma.workspaceNode.findMany({
        where: {
          workspaceId,
          type: 'file',
        },
        orderBy: orderByClause,
      });

      if (tempFolderIds.size > 0) {
        files = files.filter((f) => !f.parentId || !tempFolderIds.has(f.parentId));
      }

      if (scope === 'ai_cleaned') {
        files = files.filter((f) => Boolean((f.digestJson as any)?.cleanedByAi));
      } else if (scope === 'uncleaned') {
        files = files.filter((f) => !(f.digestJson as any)?.cleanedByAi);
      }

      const parentFolderIds = Array.from(new Set(files.map((f) => f.parentId).filter(Boolean))) as string[];
      const parentFolders = parentFolderIds.length > 0
        ? await this.prisma.workspaceNode.findMany({
            where: { id: { in: parentFolderIds } },
            select: { id: true, name: true },
          })
        : [];
      const parentMap = new Map<string, string>(parentFolders.map((p) => [p.id, p.name]));

      return files.map((node) => {
        const dto = this.toNodeDto(node);
        if (node.parentId) {
          dto.parentName = parentMap.get(node.parentId);
        }
        return dto;
      });
    }

    // 若访问的是个人空间根目录，自动同步沙箱个人空间目录
    if (!parentId) {
      await this.syncUserSandboxKnowledge(workspaceId, userId);
    } else {
      // 增量同步特定子目录
      try {
        const currentFolder = await this.prisma.workspaceNode.findUnique({ where: { id: parentId } });
        if (currentFolder && currentFolder.workspaceId === workspaceId) {
          if (currentFolder.name.includes('temp') || currentFolder.name.includes('临时工作区')) {
            await this.syncPhysicalDirToNodeFolder(workspaceId, userId, parentId, 'workspace');
          } else if (currentFolder.name.includes('saved') || currentFolder.name.includes('沙盒保存内容')) {
            await this.syncPhysicalDirToNodeFolder(workspaceId, userId, parentId, 'knowledge');
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to incremental sync subfolder ${parentId}: ${err.message}`);
      }
    }

    const nodes = await this.prisma.workspaceNode.findMany({
      where: {
        workspaceId,
        parentId: parentId || null,
      },
      orderBy: orderByClause,
    });

    const folderIds = nodes.filter((n) => n.type === 'folder').map((n) => n.id);
    const folderStatsMap = new Map<string, { count: number; latestUpdatedAt: Date | null }>();
    if (folderIds.length > 0) {
      try {
        const stats = await this.prisma.workspaceNode.groupBy({
          by: ['parentId'],
          where: {
            workspaceId,
            parentId: { in: folderIds },
          },
          _count: { id: true },
          _max: { updatedAt: true },
        });
        for (const s of stats) {
          if (s.parentId) {
            folderStatsMap.set(s.parentId, {
              count: s._count.id,
              latestUpdatedAt: s._max.updatedAt,
            });
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to aggregate folder stats: ${err.message}`);
      }
    }

    return nodes.map((node) => {
      const dto = this.toNodeDto(node);
      if (node.type === 'folder') {
        const stat = folderStatsMap.get(node.id);
        dto.fileCount = stat?.count ?? 0;
        if (stat?.latestUpdatedAt) {
          dto.latestUpdatedAt = stat.latestUpdatedAt.toISOString();
        }
      }
      return dto;
    });
  }

  /**
   * 按 ID 获取单个节点详情（含摘要与空间信息，供工具或详情页跨目录读取）
   */
  public async getNodeById(
    workspaceId: string,
    nodeId: string,
    userId: string,
    userRoles: string[] = [],
    departmentId?: string
  ): Promise<WorkspaceNodeDto> {
    await this.assertAccess(workspaceId, userId, departmentId, 'read', userRoles);
    const node = await this.prisma.workspaceNode.findUnique({
      where: { id: nodeId },
    });
    if (!node || node.workspaceId !== workspaceId) {
      throw new NotFoundException(`未找到指定文件或目录节点: ${nodeId}`);
    }
    return this.toNodeDto(node);
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
    file: MulterUploadedFile,
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
    const nodeId = randomUUID();
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
    userRoles: string[] = [],
    departmentId?: string
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    await this.assertAccess(workspaceId, userId, departmentId, 'read', userRoles);

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

    // 根目录系统文件夹保护：个人空间的根目录标准文件夹不可删除
    if (node.type === 'folder' && !node.parentId) {
      const lower = node.name.toLowerCase();
      if (
        lower.includes('tasks') ||
        lower.includes('saved') ||
        lower.includes('temp') ||
        lower.includes('工作任务成果') ||
        lower.includes('沙盒保存内容') ||
        lower.includes('临时工作区')
      ) {
        throw new BadRequestException('根目录下的系统内置文件夹（工作任务成果、沙盒保存内容、临时工作区）受系统保护，不可删除');
      }
    }

    // 收集所有需要清理物理文件的子孙文件节点以及物理文件夹
    const filesToDelete: { id: string; name: string; storagePath: string | null; fileSize: bigint }[] = [];
    const foldersToDelete: string[] = [];
    if (node.type === 'file') {
      filesToDelete.push({ id: node.id, name: node.name, storagePath: node.storagePath, fileSize: node.fileSize });
    } else {
      foldersToDelete.push(node.name);
      const descendants = await this.getAllDescendantNodes(workspaceId, [node.id]);
      for (const d of descendants) {
        if (d.type === 'file') {
          filesToDelete.push({ id: d.id, name: d.name, storagePath: d.storagePath, fileSize: d.fileSize });
        } else if (d.type === 'folder') {
          foldersToDelete.push(d.name);
        }
      }
    }

    // 1. 删除 storageDriver 中的对象存储副本
    for (const f of filesToDelete) {
      if (f.storagePath) {
        await this.storage.deleteFile(f.storagePath).catch(() => undefined);
      }
    }

    // 2. 彻底同步物理删除沙箱底层磁盘文件与文件夹 (workspace & knowledge)，断绝重新进入目录被扫描复活
    await this.tempCleaner.deletePhysicalUserFiles(
      userId,
      filesToDelete.map((f) => f.name),
      foldersToDelete
    );

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
   * 批量删除文件或文件夹（同步彻底清理沙箱底层物理磁盘与对象存储，杜绝复活）
   */
  public async batchDeleteNodes(
    workspaceId: string,
    nodeIds: string[],
    userId: string,
    userRoles: string[] = [],
    departmentId?: string
  ): Promise<{ success: boolean; deletedCount: number }> {
    await this.assertAccess(workspaceId, userId, departmentId, 'delete', userRoles);
    if (!nodeIds || nodeIds.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    const nodes = await this.prisma.workspaceNode.findMany({
      where: { id: { in: nodeIds }, workspaceId },
    });
    if (nodes.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    // 过滤掉根目录系统保护文件夹（tasks/saved/temp）
    const validNodes = nodes.filter((node) => {
      if (node.type === 'folder' && !node.parentId) {
        const lower = node.name.toLowerCase();
        if (
          lower.includes('tasks') ||
          lower.includes('saved') ||
          lower.includes('temp') ||
          lower.includes('工作任务成果') ||
          lower.includes('沙盒保存内容') ||
          lower.includes('临时工作区')
        ) {
          return false;
        }
      }
      return true;
    });

    if (validNodes.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    const folderNodes = validNodes.filter((n) => n.type === 'folder');
    const folderIds = folderNodes.map((n) => n.id);
    const foldersToDelete: string[] = folderNodes.map((n) => n.name);

    const descendantFiles: Array<{ id: string; name: string; storagePath: string | null; fileSize: bigint }> = [];
    if (folderIds.length > 0) {
      const descendants = await this.getAllDescendantNodes(workspaceId, folderIds);
      for (const d of descendants) {
        if (d.type === 'file') {
          descendantFiles.push({ id: d.id, name: d.name, storagePath: d.storagePath, fileSize: d.fileSize });
        } else if (d.type === 'folder') {
          foldersToDelete.push(d.name);
        }
      }
    }

    const filesToDelete = [
      ...validNodes.filter((n) => n.type === 'file').map((n) => ({ id: n.id, name: n.name, storagePath: n.storagePath, fileSize: n.fileSize })),
      ...descendantFiles,
    ];

    // 1. 删除 storageDriver 中的文件副本
    for (const f of filesToDelete) {
      if (f.storagePath) {
        await this.storage.deleteFile(f.storagePath).catch(() => undefined);
      }
    }

    // 2. 彻底同步物理删除沙箱底层磁盘文件与文件夹 (workspace & knowledge)
    await this.tempCleaner.deletePhysicalUserFiles(
      userId,
      filesToDelete.map((f) => f.name),
      foldersToDelete
    );

    // 3. 收集所有要删除的节点 ID
    const allIdsToDelete = Array.from(new Set([
      ...validNodes.map((n) => n.id),
      ...descendantFiles.map((d) => d.id),
    ]));

    await this.prisma.workspaceNode.deleteMany({
      where: { id: { in: allIdsToDelete } },
    });

    // 4. 扣减配额
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

    return { success: true, deletedCount: allIdsToDelete.length };
  }

  /**
   * 一键清理临时工作区 (temp)：清理失效幽灵记录、衍生文本缓存与超 7 天过期临时文件
   */
  public async cleanupTempWorkspace(
    workspaceId: string,
    userId: string,
    userRoles: string[] = [],
    departmentId?: string,
    options?: { retentionDays?: number; forceEmpty?: boolean }
  ) {
    await this.assertAccess(workspaceId, userId, departmentId, 'write', userRoles);
    return await this.tempCleaner.cleanupTempWorkspace(workspaceId, userId, options);
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
      spaces.process?.id,
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
    workspaceId?: string,
    userRoles: string[] = [],
    folderId?: string
  ): Promise<ContentSearchResultDto[]> {
    const q = (query || '').trim();
    if (!q || q.length < 2) {
      return [];
    }

    const isAdmin = userRoles.includes('admin');
    const spaces = await this.getMyWorkspaces(userId, departmentId, userRoles);
    const additionalDeptWorkspaceIds = ((spaces as any).departments || [])
      .map((d: any) => d.workspaceId || d.id)
      .filter(Boolean);
    const visibleWorkspaceIds = Array.from(
      new Set(
        [
          spaces.personal?.id,
          spaces.company?.id,
          spaces.department?.id,
          spaces.process?.id,
          ...additionalDeptWorkspaceIds,
        ].filter(Boolean) as string[]
      )
    );

    let targetWorkspaceIds = visibleWorkspaceIds;
    if (workspaceId) {
      if (!visibleWorkspaceIds.includes(workspaceId) && !isAdmin) {
        throw new ForbiddenException('您无权检索指定工作空间的内容');
      }
      targetWorkspaceIds = [workspaceId];
    }

    // 目录作用域收敛与临时文件隔离：
    // 1. 若前端传入具体 folderId，仅检索当前文件夹及其子孙目录；
    // 2. 若在空间根目录下检索，默认严格排除「临时工作区 (temp)」下的临时中间物，确保只检索已保存的正式成果
    let scopedFileNodeIds: string[] | undefined = undefined;
    const excludedFileNodeIds: string[] = [];

    if (folderId) {
      const targetWorkspaceId = workspaceId || targetWorkspaceIds[0];
      const descendants = await this.getAllDescendantNodes(targetWorkspaceId, [folderId]);
      scopedFileNodeIds = descendants.filter((d) => d.type === 'file').map((d) => d.id);
      if (scopedFileNodeIds.length === 0) {
        return [];
      }
    } else {
      const tempFolders = await this.prisma.workspaceNode.findMany({
        where: {
          workspaceId: { in: targetWorkspaceIds },
          parentId: null,
          type: 'folder',
          OR: [
            { name: { contains: 'temp', mode: 'insensitive' } },
            { name: { contains: '临时' } },
          ],
        },
        select: { id: true, workspaceId: true },
      });
      for (const tf of tempFolders) {
        const tempDescendants = await this.getAllDescendantNodes(tf.workspaceId, [tf.id]);
        for (const td of tempDescendants) {
          if (td.type === 'file') excludedFileNodeIds.push(td.id);
        }
      }
    }

    const nodeScopeFilter: any = {};
    if (scopedFileNodeIds) {
      nodeScopeFilter.id = { in: scopedFileNodeIds };
    } else if (excludedFileNodeIds.length > 0) {
      nodeScopeFilter.id = { notIn: excludedFileNodeIds };
    }

    const cleanQ = q.replace(/^#+/, '').trim() || q;
    const tokenProfile = buildQueryTokenProfile(cleanQ);
    const rawTokens = tokenProfile.hasCoreEntities ? tokenProfile.coreEntities : tokenProfile.tokens;
    const searchTokens = Array.from(new Set([cleanQ, ...rawTokens])).filter((t) => t.length >= 2);

    // 1. 文件名全文与核心关键词检索（覆盖可见空间高频匹配）
    const matchedNodes = await this.prisma.workspaceNode.findMany({
      where: {
        workspaceId: { in: targetWorkspaceIds },
        type: 'file',
        storagePath: { not: null },
        ...nodeScopeFilter,
        OR: [
          { name: { contains: cleanQ, mode: 'insensitive' } },
          ...searchTokens.map((token) => ({ name: { contains: token, mode: 'insensitive' as const } })),
        ],
      },
      include: { workspace: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    // 2. 跨全空间通过数据库检索伴生结构化摘要与元数据（解除 80 份滑动窗口截断，盘活沉淀历史文档）
    let metadataMatchedNodes: typeof matchedNodes = [];
    try {
      const searchTerms = Array.from(new Set([cleanQ, ...searchTokens])).slice(0, 5);
      const orConditions = searchTerms.map((_, idx) => `digest_json::text ILIKE $${idx + 2}`).join(' OR ');
      const rawRows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM workspace_nodes WHERE workspace_id = ANY($1::uuid[]) AND type = 'file' AND storage_path IS NOT NULL AND (${orConditions}) ORDER BY updated_at DESC LIMIT 100`,
        targetWorkspaceIds,
        ...searchTerms.map((t) => `%${t}%`)
      );
      if (rawRows.length > 0) {
        metadataMatchedNodes = await this.prisma.workspaceNode.findMany({
          where: { id: { in: rawRows.map((r) => r.id) } },
          include: { workspace: true },
        });
        if (scopedFileNodeIds) {
          const allowedSet = new Set(scopedFileNodeIds);
          metadataMatchedNodes = metadataMatchedNodes.filter((n) => allowedSet.has(n.id));
        } else if (excludedFileNodeIds.length > 0) {
          const excludeSet = new Set(excludedFileNodeIds);
          metadataMatchedNodes = metadataMatchedNodes.filter((n) => !excludeSet.has(n.id));
        }
      }
    } catch (err: any) {
      this.logger.warn(`Metadata full-text search fallback: ${err.message}`);
    }

    // 3. 补充最近更新文件候选（若已从元数据/标题获取充分候选，收敛扫描窗口至 60 份，极大降低全量磁盘 I/O）
    const hasStrongMatches = matchedNodes.length > 0 || metadataMatchedNodes.length > 0;
    const isDeepExactScan =
      tokenProfile.exactIdentifiers.length > 0 &&
      !hasStrongMatches;
    const recentTakeLimit = isDeepExactScan
      ? 500
      : hasStrongMatches
      ? 60
      : tokenProfile.exactIdentifiers.length > 0 || tokenProfile.hasCoreEntities
      ? 200
      : 80;
    const recentNodes = await this.prisma.workspaceNode.findMany({
      where: {
        workspaceId: { in: targetWorkspaceIds },
        type: 'file',
        storagePath: { not: null },
        ...nodeScopeFilter,
      },
      include: { workspace: true },
      orderBy: { updatedAt: 'desc' },
      take: recentTakeLimit,
    });

    const IGNORED_BINARY_EXTS = new Set([
      '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico',
      '.zip', '.tar', '.gz', '.7z', '.rar', '.bz2',
      '.mp4', '.avi', '.mov', '.wmv', '.mkv', '.mp3', '.wav', '.flac',
      '.exe', '.dll', '.bin', '.iso', '.dmg', '.pkg', '.apk',
      '.woff', '.woff2', '.ttf', '.eot',
      '.xls', '.doc', '.pptx', '.ppt',
    ]);

    const candidateMap = new Map<string, typeof recentNodes[0]>();
    for (const node of matchedNodes) candidateMap.set(node.id, node);
    for (const node of metadataMatchedNodes) {
      if (!candidateMap.has(node.id)) candidateMap.set(node.id, node);
    }
    for (const node of recentNodes) {
      if (!candidateMap.has(node.id)) candidateMap.set(node.id, node);
    }

    const scoreNode = (node: typeof recentNodes[0]): number =>
      scoreCandidateNode(node, tokenProfile);

    const nodes = Array.from(candidateMap.values())
      .filter((node) => {
        const ext = node.name.toLowerCase().slice(node.name.lastIndexOf('.'));
        if (IGNORED_BINARY_EXTS.has(ext)) {
          const digest = (node as any).digestJson as { summary?: string; cleanedContent?: string } | undefined;
          return Boolean(digest?.summary || digest?.cleanedContent);
        }
        return true;
      })
      .sort((a, b) => scoreNode(b) - scoreNode(a));

    const seenNodeIds = new Set<string>();
    const seenFileIdentities = new Set<string>();
    const admittedCandidates: Array<{ item: ContentSearchResultDto; relevanceScore: number }> = [];

    // 分批并发加速扫描与高分贪心提前熔断（单批 12 个并发，达 30 命中立即返回，杜绝 500 次串行 I/O 拖垮响应）
    const BATCH_SIZE = 12;
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      if (admittedCandidates.length >= 30) {
        break;
      }
      const batch = nodes.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (node) => {
          if (!node.storagePath) return;
          if (seenNodeIds.has(node.id)) return;
          const fileIdentity = `${node.workspaceId}:${node.parentId || 'root'}:${node.name.trim().toLowerCase()}`;
          if (seenFileIdentities.has(fileIdentity)) return;
          seenNodeIds.add(node.id);
          seenFileIdentities.add(fileIdentity);

          let matches: Array<ContentMatchSnippet> = (
            await this.contentIndexer.grepFile(
              node.storagePath,
              node.name,
              node.mimeType,
              cleanQ,
              3
            )
          ).map((m) => ({ ...m, sourceKind: 'physical_line' as const }));

          if (matches.length === 0 && searchTokens.length > 0) {
            const seenLines = new Set<number>();
            for (const token of searchTokens) {
              const subMatches = await this.contentIndexer.grepFile(
                node.storagePath,
                node.name,
                node.mimeType,
                token,
                2
              );
              for (const m of subMatches) {
                if (!seenLines.has(m.line)) {
                  seenLines.add(m.line);
                  matches.push({ ...m, sourceKind: 'physical_line' as const });
                }
              }
              if (matches.length >= 8) break;
            }
          }

          if (matches.length === 0) {
            matches = extractMetadataMatchSnippets({
              digestJson: (node as any).digestJson,
              searchTokens,
              rawQuery: cleanQ,
            });
          }

          if (matches.length === 0 && searchTokens.some((t) => node.name.toLowerCase().includes(t.toLowerCase()))) {
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
                  .map((line, idx) => ({
                    line: idx + 1,
                    snippet: line,
                    sourceKind: 'physical_line' as const,
                  }));
              }
            } catch {
              // ignore preview error
            }
          }

          if (matches.length > 0) {
            const relevanceEval = evaluateDocumentRelevance({
              nodeName: node.name,
              digestSummary: (node as any).digestJson?.summary,
              digestJson: (node as any).digestJson,
              profile: tokenProfile,
              contentMatches: matches,
              baseScore: scoreNode(node),
            });

            if (!relevanceEval.admitted) {
              return;
            }

            let fullTextPreview: string | undefined;
            try {
              const extracted = await this.contentIndexer.getExtractedText(
                node.storagePath,
                node.name,
                node.mimeType
              );
              if (extracted && extracted.length <= 8000) {
                fullTextPreview = extracted;
              }
            } catch {
              // ignore preview error
            }

            admittedCandidates.push({
              item: {
                ...this.toNodeDto(node),
                workspaceType: node.workspace.type,
                workspaceName: node.workspace.name,
                matches,
                fullTextPreview,
                physicalVerified: relevanceEval.physicalVerified,
              },
              relevanceScore: relevanceEval.totalScore,
            });
          }
        })
      );
    }

    // 全局按最终相关度打分倒序排序，确保交付的相关性最高
    admittedCandidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const results = admittedCandidates.slice(0, 30).map((c) => c.item);
    this.logger.log(
      `[Zero-Vector Retrieval] query="${q}" engine=physical_grep_metadata vector_service_invoked=false candidates=${nodes.length} admitted=${results.length}`
    );
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

    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(nodeId)) {
      throw new NotFoundException('找不到指定文件');
    }

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
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(workspaceId)) {
      throw new NotFoundException('指定的工作空间不存在');
    }
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
      if (isAdmin) return workspace;
      let belongsToDept = false;
      if (userId && workspace.departmentId) {
        const count = await this.prisma.orgMembership.count({
          where: {
            userId,
            departmentId: workspace.departmentId,
            status: 'active',
          },
        });
        belongsToDept = count > 0;
      }
      if (!belongsToDept) {
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

    if (workspace.type === 'process') {
      if (action === 'read') {
        return workspace; // 全员只读
      }
      if (action === 'delete' && !isAdmin) {
        throw new ForbiddenException('只有系统管理员有权删除流程归档文档');
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
   * 获取指定工作空间的文档知识提炼与 AI 治理统计指标
   */
  public async getDigestStats(
    workspaceId: string,
    userId: string,
    userRoles: string[] = [],
    departmentId?: string
  ): Promise<WorkspaceDigestStatsDto> {
    await this.assertAccess(workspaceId, userId, departmentId, 'read', userRoles);
    return await this.digestService.getDigestStats(workspaceId);
  }

  /**
   * 批量调用重新生成文档结构化摘要卡片 / AI 批量与全量清洗
   */
  public async batchRegenerateDigest(
    workspaceId: string,
    nodeIds: string[] | undefined,
    userId: string,
    userRoles: string[] = [],
    departmentId?: string,
    options?: BatchRegenerateDigestDto
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: Array<{ nodeId: string; name: string; success: boolean; error?: string }>;
  }> {
    await this.assertAccess(workspaceId, userId, departmentId, 'write', userRoles);
    return await this.digestService.batchRegenerateDigest(workspaceId, nodeIds, options);
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

  /**
   * 确保个人空间根目录下存在标准子目录：
   * 1. 临时工作区 (temp) - 映射沙箱 /workspace 临时运行工作目录
   * 2. 沙盒保存内容 (saved) - 映射沙箱 /knowledge 持久化知识与对话主动保存目录
   */
  public async ensureStandardFolder(
    workspaceId: string,
    userId: string,
    folderName: string
  ): Promise<any> {
    let folder = await this.prisma.workspaceNode.findFirst({
      where: {
        workspaceId,
        parentId: null,
        name: folderName,
        type: 'folder',
      },
    });

    if (!folder) {
      folder = await this.prisma.workspaceNode.create({
        data: {
          id: randomUUID(),
          workspaceId,
          parentId: null,
          name: folderName,
          type: 'folder',
          createdBy: userId,
        },
      });
    }

    return folder;
  }

  /**
   * 将物理磁盘目录文件增量同步到指定的 Workspace 文件夹节点下
   */
  public async syncPhysicalDirToNodeFolder(
    workspaceId: string,
    userId: string,
    targetFolderId: string,
    subDir: 'workspace' | 'knowledge'
  ): Promise<void> {
    try {
      const dirPath = this.getPhysicalUserDir(userId, subDir);
      if (!dirPath || !fs.existsSync(dirPath)) return;

      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (
          entry.name.startsWith('.') ||
          entry.name === 'skills' ||
          entry.name === 'node_modules' ||
          entry.name.endsWith('.tmp') ||
          /\.(docx|xlsx|pptx|pdf|jpg|png|jpeg)\.txt$/i.test(entry.name)
        ) {
          continue;
        }

        const filePath = path.join(dirPath, entry.name);
        let stat: fs.Stats;
        try {
          stat = await fs.promises.stat(filePath);
        } catch {
          continue;
        }

        // 如果是子目录（如 outputs）
        if (entry.isDirectory()) {
          if (entry.name === 'outputs') {
            let subFolder = await this.prisma.workspaceNode.findFirst({
              where: {
                workspaceId,
                parentId: targetFolderId,
                name: 'outputs',
                type: 'folder',
              },
            });
            if (!subFolder) {
              subFolder = await this.prisma.workspaceNode.create({
                data: {
                  id: randomUUID(),
                  workspaceId,
                  parentId: targetFolderId,
                  name: 'outputs',
                  type: 'folder',
                  createdBy: userId,
                },
              });
            }
            try {
              const subEntries = await fs.promises.readdir(filePath, { withFileTypes: true });
              for (const subEntry of subEntries) {
                if (subEntry.name.startsWith('.') || subEntry.isDirectory()) continue;
                const subFilePath = path.join(filePath, subEntry.name);
                const subStat = await fs.promises.stat(subFilePath);
                if (!subStat.isFile()) continue;

                const existingSub = await this.prisma.workspaceNode.findFirst({
                  where: {
                    workspaceId,
                    parentId: subFolder.id,
                    name: subEntry.name,
                  },
                });

                const subMime = guessMimeType(subEntry.name);
                if (!existingSub) {
                  const buffer = await fs.promises.readFile(subFilePath);
                  const subNodeId = randomUUID();
                  const storageKey = `personal/${workspaceId}/${subNodeId}_${subEntry.name}`;
                  await this.storage.putFile(storageKey, buffer);
                  await this.prisma.workspaceNode.create({
                    data: {
                      id: subNodeId,
                      workspaceId,
                      parentId: subFolder.id,
                      name: subEntry.name,
                      type: 'file',
                      fileSize: BigInt(subStat.size),
                      mimeType: subMime,
                      storagePath: storageKey,
                      createdBy: userId,
                    },
                  });
                  await this.prisma.workspace.update({
                    where: { id: workspaceId },
                    data: { usedBytes: { increment: BigInt(subStat.size) } },
                  });

                  this.contentIndexer
                    .extractText(buffer, subEntry.name, subMime)
                    .then(async (text) => {
                      if (text) {
                        await this.contentIndexer.cacheExtractedText(storageKey, text);
                        await this.digestService.generateAndSaveDigest(subNodeId, storageKey, subEntry.name, subMime);
                      }
                    })
                    .catch(() => {});
                }
              }
            } catch (subErr: any) {
              this.logger.warn(`Failed to sync subfolder outputs: ${subErr.message}`);
            }
          }
          continue;
        }

        if (!stat.isFile()) continue;

        const existing = await this.prisma.workspaceNode.findFirst({
          where: {
            workspaceId,
            parentId: targetFolderId,
            name: entry.name,
          },
        });

        const mimeType = guessMimeType(entry.name);

        if (!existing) {
          const buffer = await fs.promises.readFile(filePath);
          const nodeId = randomUUID();
          const storageKey = `personal/${workspaceId}/${nodeId}_${entry.name}`;

          await this.storage.putFile(storageKey, buffer);

          await this.prisma.workspaceNode.create({
            data: {
              id: nodeId,
              workspaceId,
              parentId: targetFolderId,
              name: entry.name,
              type: 'file',
              fileSize: BigInt(stat.size),
              mimeType,
              storagePath: storageKey,
              createdBy: userId,
            },
          });

          await this.prisma.workspace.update({
            where: { id: workspaceId },
            data: { usedBytes: { increment: BigInt(stat.size) } },
          });

          this.contentIndexer
            .extractText(buffer, entry.name, mimeType)
            .then(async (text) => {
              if (text) {
                await this.contentIndexer.cacheExtractedText(storageKey, text);
                await this.digestService.generateAndSaveDigest(nodeId, storageKey, entry.name, mimeType);
              }
            })
            .catch(() => {});
        } else if (existing.storagePath) {
          const isSizeDifferent = BigInt(stat.size) !== existing.fileSize;
          let buffer: Buffer | null = null;
          let isContentChanged = isSizeDifferent;

          if (!isSizeDifferent) {
            buffer = await fs.promises.readFile(filePath);
            const existingBuffer = (await this.storage.exists(existing.storagePath))
              ? await this.storage.getFile(existing.storagePath)
              : null;
            isContentChanged = !existingBuffer || !buffer.equals(existingBuffer);
          } else {
            buffer = await fs.promises.readFile(filePath);
          }

          if (isContentChanged && buffer) {
            await this.storage.putFile(existing.storagePath, buffer);
            const sizeDiff = BigInt(stat.size) - existing.fileSize;
            await this.prisma.workspaceNode.update({
              where: { id: existing.id },
              data: {
                fileSize: BigInt(stat.size),
                updatedAt: new Date(),
              },
            });
            if (sizeDiff !== 0n) {
              await this.prisma.workspace.update({
                where: { id: workspaceId },
                data: { usedBytes: { increment: sizeDiff } },
              });
            }
            // 关键：源文件发生更新，立即失效旧提取缓存并重建结构化摘要
            const freshText = await this.contentIndexer.extractText(buffer, entry.name, mimeType);
            if (freshText) {
              await this.contentIndexer.cacheExtractedText(existing.storagePath, freshText);
              await this.digestService.generateAndSaveDigest(existing.id, existing.storagePath, entry.name, mimeType);
            }
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to sync physical dir ${subDir} to folder ${targetFolderId}: ${err.message}`);
    }
  }

  /**
   * 自动同步沙箱个人空间目录结构与物理文件：
   * 1. 确保根目录下有两个标准子目录：「临时工作区 (temp)」与「沙盒保存内容 (saved)」
   * 2. 迁移根目录下历史旧文件与目录至「沙盒保存内容 (saved)」
   * 3. 自动增量同步沙箱物理 workspace -> temp，knowledge -> saved
   */
  public async syncUserSandboxKnowledge(workspaceId: string, userId: string): Promise<void> {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
      });
      if (!workspace || workspace.type !== 'personal' || workspace.ownerUserId !== userId) {
        return;
      }

      // 1. 创建或获取三个标准根目录（临时工作区、沙盒保存内容、工作任务成果）
      const tempFolder = await this.ensureStandardFolder(workspaceId, userId, '临时工作区 (temp)');
      const savedFolder = await this.ensureStandardFolder(workspaceId, userId, '沙盒保存内容 (saved)');
      const tasksFolder = await this.ensureStandardFolder(workspaceId, userId, '工作任务成果 (tasks)');

      // 2. 将旧的根级文件或旧文件夹（如 AI知识候选）归拢至「沙盒保存内容 (saved)」
      const legacyRootNodes = await this.prisma.workspaceNode.findMany({
        where: {
          workspaceId,
          parentId: null,
          id: { notIn: [tempFolder.id, savedFolder.id, tasksFolder.id] },
        },
      });

      for (const legacy of legacyRootNodes) {
        if (legacy.name === 'AI知识候选' || legacy.type === 'file') {
          await this.prisma.workspaceNode.update({
            where: { id: legacy.id },
            data: { parentId: savedFolder.id },
          });
        }
      }

      // 3. 分别增量同步沙箱中的 workspace 与 knowledge 目录
      await this.syncPhysicalDirToNodeFolder(workspaceId, userId, tempFolder.id, 'workspace');
      await this.syncPhysicalDirToNodeFolder(workspaceId, userId, savedFolder.id, 'knowledge');
    } catch (err: any) {
      this.logger.warn(`Failed to sync user sandbox knowledge: ${err.message}`);
    }
  }

  private getPhysicalUserDir(userId: string, subDir: 'workspace' | 'knowledge'): string | null {
    const candidates = [
      process.env.SANDBOX_DATA_ROOT ? path.join(process.env.SANDBOX_DATA_ROOT, 'users', userId, subDir) : null,
      path.join('/workspace', 'data', 'users', userId, subDir),
      path.resolve(process.cwd(), '../../../../data/users', userId, subDir),
      path.resolve(process.cwd(), 'data/users', userId, subDir),
      path.join('/app', 'data', 'users', userId, subDir),
    ].filter(Boolean) as string[];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }
    return null;
  }

  /**
   * 自动将流程成果物（合同文档、智能审查报告、存证备案单）归档入库到「流程管理空间」
   */
  public async archiveWorkflowDeliverables(
    opts: ArchiveDeliverablesOptions
  ): Promise<ArchiveResult> {
    return await this.processArchiveService.archiveWorkflowDeliverables(opts);
  }

  /**
   * 同步历史已办结/已归档任务成果物
   */
  public async syncHistoricalArchivedTasks(): Promise<number> {
    return await this.processArchiveService.syncHistoricalArchivedTasks();
  }
}
