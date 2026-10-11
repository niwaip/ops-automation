import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../ports';
import { STORAGE_DRIVER, type StorageDriver } from './storage/storage-driver.interface';

export interface TempCleanupResult {
  success: boolean;
  ghostNodesCleaned: number;
  cacheFilesCleaned: number;
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
   * 一键清理临时工作区 (temp)：
   * 1. 清理已在磁盘物理删除的失效幽灵记录 (Ghost Nodes)
   * 2. 清理系统衍生的提取文本缓存 (如 *.docx.txt, *.xlsx.txt, *.pdf.txt, 伴随 OCR 缓存)
   * 3. 释放存储空间并保证真实交付成果安全
   */
  public async cleanupTempWorkspace(workspaceId: string, userId: string): Promise<TempCleanupResult> {
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

    // 查询 tempFolder 下所有子孙节点
    const childNodes = await this.prisma.workspaceNode.findMany({
      where: {
        workspaceId,
        parentId: tempFolder.id,
      },
    });

    const ghostNodeIds: string[] = [];
    const cacheNodeIds: string[] = [];
    const storagePathsToDelete: string[] = [];
    let totalFreedBytes = 0n;

    for (const node of childNodes) {
      if (node.type === 'folder') continue;

      const physicalExists = dirPath ? physicalFiles.has(node.name) : false;

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
      }
    }

    // 物理磁盘中可能存在的未入库游离衍生缓存也一并安全清理
    if (dirPath && fs.existsSync(dirPath)) {
      for (const pName of Array.from(physicalFiles)) {
        if (this.isDerivedCacheFile(pName, physicalFiles)) {
          const filePath = path.join(dirPath, pName);
          try {
            if (fs.existsSync(filePath)) {
              await fs.promises.unlink(filePath);
              physicalFiles.delete(pName);
            }
          } catch (err: any) {
            this.logger.warn(`Failed to unlink unindexed cache file ${filePath}: ${err.message}`);
          }
        }
      }
    }

    const allNodeIdsToDelete = [...ghostNodeIds, ...cacheNodeIds];

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
      `Cleaned temp workspace [${workspaceId}]: ${ghostNodeIds.length} ghost nodes, ${cacheNodeIds.length} cache files. Remaining: ${remainingCount}`
    );

    return {
      success: true,
      ghostNodesCleaned: ghostNodeIds.length,
      cacheFilesCleaned: cacheNodeIds.length,
      totalCleaned: allNodeIdsToDelete.length,
      remainingFiles: Math.max(0, remainingCount),
    };
  }
}
