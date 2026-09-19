import * as fs from 'fs';
import * as path from 'path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_BACKUP_PRISMA, SystemBackupPrismaPort } from '../ports';
import {
  BackupConflictItem,
  BackupImportStrategy,
  BackupModulePreview,
} from '../interfaces/system-backup.interface';

@Injectable()
export class WorkspaceBackupHandler {
  private readonly logger = new Logger(WorkspaceBackupHandler.name);

  constructor(
    @Inject(SYSTEM_BACKUP_PRISMA) private readonly prisma: SystemBackupPrismaPort
  ) {}

  public getStorageRoot(): string {
    if (process.env.WORKSPACE_STORAGE_ROOT) {
      return process.env.WORKSPACE_STORAGE_ROOT;
    }
    const candidates = [
      '/workspace/data/storage/workspaces',
      path.resolve(process.cwd(), 'data/storage/workspaces'),
      path.resolve(process.cwd(), '../../../data/storage/workspaces'),
      path.resolve(process.cwd(), '../../../../data/storage/workspaces'),
      path.resolve(__dirname, '../../../../../../data/storage/workspaces'),
    ].filter(Boolean) as string[];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }
    return candidates[0] || path.resolve(process.cwd(), 'data/storage/workspaces');
  }

  public resolveStoragePath(storageKey: string): string {
    const root = this.getStorageRoot();
    const safeKey = path.normalize(storageKey).replace(/^(\.\.(?:\/|\\))+/, '');
    return path.join(root, safeKey);
  }

  async count(): Promise<number> {
    try {
      let total = 0;
      if (this.prisma.workspace) {
        total += await this.prisma.workspace.count();
      }
      if (this.prisma.workspaceNode) {
        total += await this.prisma.workspaceNode.count();
      } else if (this.prisma.workspaceDocument) {
        total += await this.prisma.workspaceDocument.count();
      }
      return total;
    } catch {
      return 0;
    }
  }

  private serializeWorkspace(w: any): any {
    if (!w) return w;
    return {
      ...w,
      quotaBytes:
        typeof w.quotaBytes === 'bigint'
          ? Number(w.quotaBytes) <= Number.MAX_SAFE_INTEGER
            ? Number(w.quotaBytes)
            : w.quotaBytes.toString()
          : w.quotaBytes,
      usedBytes:
        typeof w.usedBytes === 'bigint'
          ? Number(w.usedBytes) <= Number.MAX_SAFE_INTEGER
            ? Number(w.usedBytes)
            : w.usedBytes.toString()
          : w.usedBytes,
    };
  }

  private serializeNode(n: any): any {
    if (!n) return n;
    return {
      ...n,
      fileSize:
        typeof n.fileSize === 'bigint'
          ? Number(n.fileSize) <= Number.MAX_SAFE_INTEGER
            ? Number(n.fileSize)
            : n.fileSize.toString()
          : n.fileSize,
    };
  }

  async export(): Promise<{
    workspaces: any[];
    nodes: any[];
    documents: any[];
  }> {
    try {
      const [workspaces, nodes] = await Promise.all([
        this.prisma.workspace ? this.prisma.workspace.findMany() : [],
        this.prisma.workspaceNode
          ? this.prisma.workspaceNode.findMany({ orderBy: [{ createdAt: 'asc' }] })
          : this.prisma.workspaceDocument
          ? this.prisma.workspaceDocument.findMany()
          : [],
      ]);
      const serializedNodes = Array.isArray(nodes)
        ? nodes.map((n) => {
            const serialized = this.serializeNode(n);
            if (n.type === 'file' && n.storagePath) {
              const fullPath = this.resolveStoragePath(n.storagePath);
              if (!fs.existsSync(fullPath)) {
                const msg = `工作空间文件节点 ${n.name || n.id} 物理文件缺失 (路径: ${n.storagePath})，无法执行完整备份`;
                this.logger.error(msg);
                throw new Error(msg);
              }
              const stats = fs.statSync(fullPath);
              const maxSingleFileBytes = 50 * 1024 * 1024; // 50MB
              if (stats.size > maxSingleFileBytes) {
                const msg = `工作空间文件节点 ${n.name || n.id} 单文件体积超限 (${(stats.size / 1024 / 1024).toFixed(2)}MB > 50MB)，无法直接打包进 JSON 备份`;
                this.logger.error(msg);
                throw new Error(msg);
              }
              const fileBuffer = fs.readFileSync(fullPath);
              serialized.contentBase64 = fileBuffer.toString('base64');
            }
            return serialized;
          })
        : [];
      return {
        workspaces: Array.isArray(workspaces)
          ? workspaces.map((w) => this.serializeWorkspace(w))
          : [],
        nodes: serializedNodes,
        documents: serializedNodes.map(({ contentBase64: _contentBase64, ...rest }) => rest),
      };
    } catch (err: any) {
      this.logger.error(`Failed to export workspaces: ${err.message}`);
      throw err;
    }
  }

  async preview(backupData?: {
    workspaces?: any[];
    nodes?: any[];
    documents?: any[];
  }): Promise<BackupModulePreview> {
    const workspaces = backupData?.workspaces || [];
    const nodes = backupData?.nodes || backupData?.documents || [];

    let currentWorkspaces: any[] = [];
    let currentNodes: any[] = [];
    try {
      if (this.prisma.workspace) {
        currentWorkspaces = await this.prisma.workspace.findMany({
          select: { id: true, name: true, type: true, ownerUserId: true, departmentId: true },
        });
      }
      const nodePrisma = this.prisma.workspaceNode || this.prisma.workspaceDocument;
      if (nodePrisma) {
        currentNodes = await nodePrisma.findMany({
          select: { id: true, workspaceId: true, parentId: true, name: true },
        });
      }
    } catch {
      currentWorkspaces = [];
      currentNodes = [];
    }

    const currentWsMap = new Map<string, any>();
    for (const w of currentWorkspaces) {
      currentWsMap.set(w.id, w);
      if (w.name) currentWsMap.set(`name:${w.name}`, w);
      if (w.type && w.ownerUserId) currentWsMap.set(`type_owner:${w.type}:${w.ownerUserId}`, w);
      if (w.type === 'department' && w.departmentId) currentWsMap.set(`type_dept:${w.departmentId}`, w);
      if (w.type === 'company') currentWsMap.set('singleton:company', w);
      if (w.type === 'process') currentWsMap.set('singleton:process', w);
    }

    const findExistingWorkspace = (item: any): any => {
      if (currentWsMap.has(item.id)) return currentWsMap.get(item.id);
      if (item.type === 'company' && currentWsMap.has('singleton:company')) return currentWsMap.get('singleton:company');
      if (item.type === 'process' && currentWsMap.has('singleton:process')) return currentWsMap.get('singleton:process');
      if (item.type === 'department' && item.departmentId && currentWsMap.has(`type_dept:${item.departmentId}`)) {
        return currentWsMap.get(`type_dept:${item.departmentId}`);
      }
      if (item.type === 'personal' && item.ownerUserId && currentWsMap.has(`type_owner:personal:${item.ownerUserId}`)) {
        return currentWsMap.get(`type_owner:personal:${item.ownerUserId}`);
      }
      if (item.type && item.ownerUserId && currentWsMap.has(`type_owner:${item.type}:${item.ownerUserId}`)) {
        return currentWsMap.get(`type_owner:${item.type}:${item.ownerUserId}`);
      }
      if (item.name && currentWsMap.has(`name:${item.name}`)) return currentWsMap.get(`name:${item.name}`);
      return null;
    };

    const currentNodesMap = new Map<string, any>();
    for (const n of currentNodes) {
      currentNodesMap.set(n.id, n);
      currentNodesMap.set(`${n.workspaceId}:${n.parentId || 'root'}:${n.name}`, n);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of workspaces) {
      const id = item.id;
      const name = item.name || id;
      const exists = Boolean(findExistingWorkspace(item));
      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `Workspace: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `Workspace: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    for (const node of nodes) {
      const id = node.id;
      const name = node.name || id;
      const exists =
        currentNodesMap.has(id) ||
        currentNodesMap.has(`${node.workspaceId}:${node.parentId || 'root'}:${node.name}`);
      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `Workspace Node: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `Workspace Node: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'workspaces',
      totalInBackup: workspaces.length + nodes.length,
      newCount,
      conflictCount,
      items,
    };
  }

  async import(
    backupData: {
      workspaces?: any[];
      nodes?: any[];
      documents?: any[];
    },
    strategy: BackupImportStrategy
  ): Promise<{ created: number; updated: number; skipped: number; errors?: string[] }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    const workspaceIdMap = new Map<string, string>();
    const workspaces = backupData.workspaces || [];

    // 1. Import Workspaces
    for (const w of workspaces) {
      try {
        if (!this.prisma.workspace) continue;
        let exists = await this.prisma.workspace.findUnique({
          where: { id: w.id },
        });

        if (!exists) {
          if (w.type === 'company') {
            exists = await this.prisma.workspace.findFirst({ where: { type: 'company' } });
          } else if (w.type === 'process') {
            exists = await this.prisma.workspace.findFirst({ where: { type: 'process' } });
          } else if (w.type === 'department' && w.departmentId) {
            exists = await this.prisma.workspace.findFirst({
              where: { type: 'department', departmentId: w.departmentId },
            });
          } else if (w.type === 'personal' && w.ownerUserId) {
            exists = await this.prisma.workspace.findFirst({
              where: { type: 'personal', ownerUserId: w.ownerUserId },
            });
          } else if (w.type && w.ownerUserId) {
            exists = await this.prisma.workspace.findFirst({
              where: { type: w.type, ownerUserId: w.ownerUserId },
            });
          }
        }

        if (!exists && w.name) {
          exists = await this.prisma.workspace.findFirst({ where: { name: w.name } });
        }

        const quotaBytes = w.quotaBytes != null ? BigInt(w.quotaBytes) : undefined;
        const usedBytes = w.usedBytes != null ? BigInt(w.usedBytes) : undefined;

        if (exists) {
          workspaceIdMap.set(w.id, exists.id);
          if (strategy === 'skip_existing') {
            skipped += 1;
          } else {
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = w;
            const dataToUpdate: any = { ...rest };
            if (quotaBytes !== undefined) dataToUpdate.quotaBytes = quotaBytes;
            if (usedBytes !== undefined) dataToUpdate.usedBytes = usedBytes;
            await this.prisma.workspace.update({
              where: { id: exists.id },
              data: dataToUpdate,
            });
            updated += 1;
          }
        } else {
          const dataToCreate: any = { ...w };
          if (quotaBytes !== undefined) dataToCreate.quotaBytes = quotaBytes;
          if (usedBytes !== undefined) dataToCreate.usedBytes = usedBytes;
          const createdWs = await this.prisma.workspace.create({
            data: dataToCreate,
          });
          workspaceIdMap.set(w.id, createdWs?.id || w.id);
          created += 1;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to import workspace ${w.id}: ${err.message}`);
        errors.push(`工作空间 ${w.id} 导入失败: ${err.message}`);
        skipped += 1;
      }
    }

    // 2. Import Workspace Nodes
    const nodes = backupData.nodes || backupData.documents || [];
    const nodePrisma = this.prisma.workspaceNode || this.prisma.workspaceDocument;

    if (nodes.length > 0 && nodePrisma) {
      const nodeIdMap = new Map<string, string>();
      const sortedNodes = this.sortNodesTopologically(nodes);

      for (const node of sortedNodes) {
        let tempFilePath: string | null = null;
        try {
          const targetWorkspaceId = workspaceIdMap.get(node.workspaceId) || node.workspaceId;
          const targetParentId = node.parentId
            ? nodeIdMap.get(node.parentId) || node.parentId
            : null;

          let exists = await nodePrisma.findUnique({
            where: { id: node.id },
          });

          if (!exists) {
            try {
              exists = await nodePrisma.findFirst({
                where: {
                  workspaceId: targetWorkspaceId,
                  parentId: targetParentId,
                  name: node.name,
                },
              });
            } catch {
              // ignore
            }
          }

          // Rule 1: skip_existing must NEVER overwrite existing records or disk files
          if (exists) {
            nodeIdMap.set(node.id, exists.id);
            if (strategy === 'skip_existing') {
              skipped += 1;
              continue;
            }
          }

          const targetStoragePath = exists?.storagePath || node.storagePath;
          let fullTargetDiskPath: string | null = null;

          if (targetStoragePath) {
            fullTargetDiskPath = this.resolveStoragePath(targetStoragePath);
          }

          // Stage file content in temporary file for atomic write after DB success
          if (node.contentBase64 && fullTargetDiskPath) {
            const dir = path.dirname(fullTargetDiskPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            tempFilePath = `${fullTargetDiskPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
            fs.writeFileSync(tempFilePath, Buffer.from(node.contentBase64, 'base64'));
          } else if (node.type === 'file' && fullTargetDiskPath) {
            if (!fs.existsSync(fullTargetDiskPath)) {
              this.logger.warn(
                `Missing workspace file on disk for node ${node.id} at ${targetStoragePath}`
              );
              errors.push(
                `工作空间文件节点 ${node.name || node.id} 物理文件缺失 (路径: ${targetStoragePath})，无法恢复文件内容`
              );
            }
          }

          const fileSize = node.fileSize != null ? BigInt(node.fileSize) : undefined;
          const {
            id: _id,
            createdAt: _createdAt,
            updatedAt: _updatedAt,
            workspaceId: _workspaceId,
            parentId: _parentId,
            contentBase64: _contentBase64,
            ...rest
          } = node;

          if (exists) {
            const dataToUpdate: any = {
              ...rest,
              workspaceId: targetWorkspaceId,
              parentId: targetParentId,
            };
            if (fileSize !== undefined) dataToUpdate.fileSize = fileSize;
            await nodePrisma.update({
              where: { id: exists.id },
              data: dataToUpdate,
            });

            // Atomic rename to final path on DB success
            if (tempFilePath && fullTargetDiskPath) {
              fs.renameSync(tempFilePath, fullTargetDiskPath);
              tempFilePath = null;
            }
            updated += 1;
          } else {
            const dataToCreate: any = {
              ...rest,
              id: node.id,
              workspaceId: targetWorkspaceId,
              parentId: targetParentId,
            };
            if (fileSize !== undefined) dataToCreate.fileSize = fileSize;
            const createdNode = await nodePrisma.create({
              data: dataToCreate,
            });
            nodeIdMap.set(node.id, createdNode?.id || node.id);

            // Atomic rename to final path on DB success
            if (tempFilePath && fullTargetDiskPath) {
              fs.renameSync(tempFilePath, fullTargetDiskPath);
              tempFilePath = null;
            }
            created += 1;
          }
        } catch (err: any) {
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
              fs.unlinkSync(tempFilePath);
            } catch {
              // ignore
            }
          }
          this.logger.warn(
            `Failed to import workspace node ${node.id} (${node.name}): ${err.message}`
          );
          errors.push(`工作空间节点 ${node.name || node.id} 导入失败: ${err.message}`);
          skipped += 1;
        }
      }
    }

    return { created, updated, skipped, errors };
  }

  private sortNodesTopologically(nodes: any[]): any[] {
    const roots: any[] = [];
    const remaining = new Map<string, any>();
    for (const node of nodes) {
      if (!node.parentId) {
        roots.push(node);
      } else {
        remaining.set(node.id, node);
      }
    }

    const sorted = [...roots];
    const resolvedIds = new Set(roots.map((r) => r.id));

    let progressed = true;
    while (remaining.size > 0 && progressed) {
      progressed = false;
      for (const [id, node] of remaining.entries()) {
        if (resolvedIds.has(node.parentId)) {
          sorted.push(node);
          resolvedIds.add(id);
          remaining.delete(id);
          progressed = true;
        }
      }
    }

    // Append any dangling or cyclic nodes
    for (const node of remaining.values()) {
      sorted.push(node);
    }

    return sorted;
  }
}
