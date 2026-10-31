import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../ports';
import { STORAGE_DRIVER, type StorageDriver } from './storage/storage-driver.interface';

export interface TempCleanupOptions {
  retentionDays?: number;
  forceEmpty?: boolean;
}

export interface TempCleanupResult {
  success: boolean;
  ghostNodesCleaned: number;
  cacheFilesCleaned: number;
  expiredFilesCleaned: number;
  totalCleaned: number;
  remainingFiles: number;
}

@Injectable()
export class WorkspaceTempCleanerService {
  private readonly logger = new Logger(WorkspaceTempCleanerService.name);

  constructor(
    @Inject(WORKBENCH_PRISMA) private readonly prisma: WorkbenchPrismaPort,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver
  ) {}

  public getPhysicalUserDir(userId: string, subDir: 'workspace' | 'knowledge'): string | null {
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
   * 判断文件名是否属于系统衍生文本缓存（如 .docx.txt, .xlsx.txt, .pdf.txt, OCR .txt）
   */
  public isDerivedCacheFile(fileName: string, existingFileNames: Set<string>): boolean {
    const lower = fileName.toLowerCase();
    if (/\.(docx|xlsx|pptx|pdf|jpg|png|jpeg)\.txt$/i.test(lower)) {
      return true;
    }
    if (lower.endsWith('.tmp')) {
      return true;
    }
    // 处理 OCR 或提取缓存：如 "合同 (8).txt"，而同目录下存在 "合同 (8).docx"
    if (lower.endsWith('.txt')) {
      const stem = fileName.slice(0, -4);
      for (const ext of ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.pdf', '.jpg', '.jpeg', '.png']) {
        if (existingFileNames.has(stem + ext) || existingFileNames.has(stem.toLowerCase() + ext)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 彻底同步删除沙箱底层物理磁盘中的用户文件与文件夹（覆盖 /workspace、/knowledge 及 .sessions 私有目录）
   * 杜绝前端/数据库删除后，再次进入目录被扫描器重新读取“死循环复活”的 Bug
   */
  public async deletePhysicalUserFiles(
    userId: string,
    fileNames: string[],
    folderNames?: string[]
  ): Promise<void> {
    if (!userId) return;
    const wsDir = this.getPhysicalUserDir(userId, 'workspace');
    const knDir = this.getPhysicalUserDir(userId, 'knowledge');

    // 1. 同步清理物理文件夹（如 outputs/ 或自定义专属文件夹，彻底连带删除磁盘物理目录）
    if (folderNames && folderNames.length > 0) {
      const folderSet = new Set(folderNames.filter(Boolean));
      for (const fName of Array.from(folderSet)) {
        if (wsDir) {
          const fPath = path.join(wsDir, fName);
          if (fs.existsSync(fPath)) {
            await fs.promises.rm(fPath, { recursive: true, force: true }).catch((err) => {
              this.logger.warn(`Failed to rm physical workspace directory ${fPath}: ${err.message}`);
            });
          }
        }
        if (knDir) {
          const fPath = path.join(knDir, fName);
          if (fs.existsSync(fPath)) {
            await fs.promises.rm(fPath, { recursive: true, force: true }).catch((err) => {
              this.logger.warn(`Failed to rm physical knowledge directory ${fPath}: ${err.message}`);
            });
          }
        }
      }
    }

    // 2. 同步清理物理文件
    const namesSet = new Set((fileNames || []).filter(Boolean));
    if (namesSet.size === 0) return;

    for (const name of Array.from(namesSet)) {
      // 1) workspace 根目录及 outputs 子目录
      if (wsDir) {
        const p = path.join(wsDir, name);
        if (fs.existsSync(p)) {
          await fs.promises.unlink(p).catch((err) => {
            this.logger.warn(`Failed to unlink workspace file ${p}: ${err.message}`);
          });
        }
        const wsOutputs = path.join(wsDir, 'outputs', name);
        if (fs.existsSync(wsOutputs)) {
          await fs.promises.unlink(wsOutputs).catch(() => undefined);
        }
      }

      // 2) knowledge 根目录及 outputs 子目录
      if (knDir) {
        const p = path.join(knDir, name);
        if (fs.existsSync(p)) {
          await fs.promises.unlink(p).catch((err) => {
            this.logger.warn(`Failed to unlink knowledge file ${p}: ${err.message}`);
          });
        }
        const knOutputs = path.join(knDir, 'outputs', name);
        if (fs.existsSync(knOutputs)) {
          await fs.promises.unlink(knOutputs).catch(() => undefined);
        }
      }

      // 3) .sessions 目录下的会话专属附件与 Scratchpad 副本
      if (wsDir) {
        const sessionsDir = path.join(wsDir, '.sessions');
        if (fs.existsSync(sessionsDir)) {
          try {
            const subdirs = await fs.promises.readdir(sessionsDir);
            for (const sSub of subdirs) {
              const sFile = path.join(sessionsDir, sSub, name);
              if (fs.existsSync(sFile)) {
                await fs.promises.unlink(sFile).catch(() => undefined);
              }
            }
          } catch {
            // best-effort
          }
        }
      }
    }
  }

  /**
   * 一键清理临时工作区 (temp)：
   * 1. 清理已在磁盘物理删除的失效幽灵记录 (Ghost Nodes)
   * 2. 清理系统衍生的提取文本缓存 (如 *.docx.txt, *.xlsx.txt, *.pdf.txt, 伴随 OCR 缓存)
   * 3. 默认清理超过 7 天（一星期）的旧临时草稿文件 (Expired Temporary Files)，释放空间
   * 4. 若 forceEmpty=true 则彻底清空临时目录内所有非文件夹文件
   */
  public async cleanupTempWorkspace(
    workspaceId: string,
    userId: string,
    options?: TempCleanupOptions
  ): Promise<TempCleanupResult> {
    const retentionDays = options?.retentionDays ?? 7;
    const forceEmpty = Boolean(options?.forceEmpty);
    const now = Date.now();
    const retentionMs = retentionDays > 0 ? retentionDays * 24 * 60 * 60 * 1000 : 0;

    const tempFolder = await this.prisma.workspaceNode.findFirst({
      where: {
        workspaceId,
        parentId: null,
        name: { contains: 'temp' },
        type: 'folder',
      },
    });

    if (!tempFolder) {
      return {
        success: true,
        ghostNodesCleaned: 0,
        cacheFilesCleaned: 0,
        expiredFilesCleaned: 0,
        totalCleaned: 0,
        remainingFiles: 0,
      };
    }

    const dirPath = this.getPhysicalUserDir(userId, 'workspace');
    const physicalFiles = new Set<string>();
    if (dirPath && fs.existsSync(dirPath)) {
      try {
        const entries = await fs.promises.readdir(dirPath);
        for (const e of entries) {
          physicalFiles.add(e);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to read physical directory ${dirPath}: ${err.message}`);
      }
    }

    // 查询 tempFolder 下所有直接子节点
    const childNodes = await this.prisma.workspaceNode.findMany({
      where: {
        workspaceId,
        parentId: tempFolder.id,
      },
    });

    const ghostNodeIds: string[] = [];
    const cacheNodeIds: string[] = [];
    const expiredNodeIds: string[] = [];
    const storagePathsToDelete: string[] = [];
    let totalFreedBytes = 0n;

    for (const node of childNodes) {
      if (node.type === 'folder') continue;

      const physicalExists = dirPath ? physicalFiles.has(node.name) : false;

      // 0. 强制全部清空模式
      if (forceEmpty) {
        cacheNodeIds.push(node.id);
        if (node.storagePath) storagePathsToDelete.push(node.storagePath);
        totalFreedBytes += node.fileSize;

        if (dirPath && physicalExists) {
          const filePath = path.join(dirPath, node.name);
          try {
            if (fs.existsSync(filePath)) {
              await fs.promises.unlink(filePath);
              physicalFiles.delete(node.name);
            }
          } catch (err: any) {
            this.logger.warn(`Failed to unlink file ${filePath}: ${err.message}`);
          }
        }
        continue;
      }

      // 1. 幽灵节点判断：物理文件已不存在
      if (!physicalExists) {
        ghostNodeIds.push(node.id);
        if (node.storagePath) storagePathsToDelete.push(node.storagePath);
        totalFreedBytes += node.fileSize;
        continue;
      }

      // 2. 衍生缓存文件判断
      if (this.isDerivedCacheFile(node.name, physicalFiles)) {
        cacheNodeIds.push(node.id);
        if (node.storagePath) storagePathsToDelete.push(node.storagePath);
        totalFreedBytes += node.fileSize;

        // 同步删除物理文件
        if (dirPath) {
          const filePath = path.join(dirPath, node.name);
          try {
            if (fs.existsSync(filePath)) {
              await fs.promises.unlink(filePath);
              physicalFiles.delete(node.name);
            }
          } catch (err: any) {
            this.logger.warn(`Failed to unlink cache file ${filePath}: ${err.message}`);
          }
        }
        continue;
      }

      // 3. 超过保留期（默认 7 天 / 一星期）的过期临时文件判断
      if (retentionMs > 0) {
        const fileAge = now - new Date(node.updatedAt || node.createdAt).getTime();
        if (fileAge > retentionMs) {
          expiredNodeIds.push(node.id);
          if (node.storagePath) storagePathsToDelete.push(node.storagePath);
          totalFreedBytes += node.fileSize;

          if (dirPath) {
            const filePath = path.join(dirPath, node.name);
            try {
              if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
                physicalFiles.delete(node.name);
              }
            } catch (err: any) {
              this.logger.warn(`Failed to unlink expired temp file ${filePath}: ${err.message}`);
            }
          }
          continue;
        }
      }
    }

    // 物理磁盘中可能存在的未入库游离衍生缓存或超期旧文件也一并安全清理
    if (dirPath && fs.existsSync(dirPath)) {
      for (const pName of Array.from(physicalFiles)) {
        if (pName.startsWith('.') || pName === 'skills' || pName === 'node_modules') continue;
        const filePath = path.join(dirPath, pName);
        let shouldUnlink = forceEmpty || this.isDerivedCacheFile(pName, physicalFiles);

        if (!shouldUnlink && retentionMs > 0) {
          try {
            const stat = await fs.promises.stat(filePath);
            if (stat.isFile() && now - stat.mtimeMs > retentionMs) {
              shouldUnlink = true;
            }
          } catch {
            // ignore
          }
        }

        if (shouldUnlink) {
          try {
            if (fs.existsSync(filePath)) {
              await fs.promises.unlink(filePath);
              physicalFiles.delete(pName);
            }
          } catch (err: any) {
            this.logger.warn(`Failed to unlink physical temp file ${filePath}: ${err.message}`);
          }
        }
      }

      // 4. 清理 .sessions 下超过保留期的旧会话临时目录
      const sessionsDir = path.join(dirPath, '.sessions');
      if (fs.existsSync(sessionsDir)) {
        try {
          const sEntries = await fs.promises.readdir(sessionsDir, { withFileTypes: true });
          for (const sEnt of sEntries) {
            if (!sEnt.isDirectory()) continue;
            const sSubPath = path.join(sessionsDir, sEnt.name);
            try {
              const stat = await fs.promises.stat(sSubPath);
              if (forceEmpty || (retentionMs > 0 && now - stat.mtimeMs > retentionMs)) {
                await fs.promises.rm(sSubPath, { recursive: true, force: true }).catch(() => undefined);
              }
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      }
    }

    const allNodeIdsToDelete = [...ghostNodeIds, ...cacheNodeIds, ...expiredNodeIds];

    if (allNodeIdsToDelete.length > 0) {
      // 批量删除 storageDriver 中的文件副本
      for (const sp of storagePathsToDelete) {
        await this.storage.deleteFile(sp).catch(() => undefined);
      }

      // 批量从数据库删除节点
      await this.prisma.workspaceNode.deleteMany({
        where: {
          id: { in: allNodeIdsToDelete },
        },
      });

      // 扣减空间配额占用
      if (totalFreedBytes > 0n) {
        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (ws) {
          const newUsed = ws.usedBytes > totalFreedBytes ? ws.usedBytes - totalFreedBytes : 0n;
          await this.prisma.workspace.update({
            where: { id: workspaceId },
            data: { usedBytes: newUsed },
          });
        }
      }
    }

    const remainingCount = childNodes.length - allNodeIdsToDelete.length;

    this.logger.log(
      `Cleaned temp workspace [${workspaceId}]: ${ghostNodeIds.length} ghost nodes, ${cacheNodeIds.length} cache files, ${expiredNodeIds.length} expired files. Remaining: ${remainingCount}`
    );

    return {
      success: true,
      ghostNodesCleaned: ghostNodeIds.length,
      cacheFilesCleaned: cacheNodeIds.length,
      expiredFilesCleaned: expiredNodeIds.length,
      totalCleaned: allNodeIdsToDelete.length,
      remainingFiles: Math.max(0, remainingCount),
    };
  }
}
