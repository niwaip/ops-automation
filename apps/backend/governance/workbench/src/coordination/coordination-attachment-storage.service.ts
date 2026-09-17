import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { CoordinationAttachment } from './dto/workbench-coordination.dto';

export interface StoredAttachmentMeta {
  attachmentId: string;
  fileName: string;
  size: number;
  mimeType: string;
  storagePath: string;
  uploadedBy?: string;
  createdAt: string;
}

export interface MulterLikeFile {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

@Injectable()
export class CoordinationAttachmentStorageService {
  private readonly logger = new Logger(CoordinationAttachmentStorageService.name);
  private storageDir: string;

  constructor() {
    this.storageDir = this.resolveStorageDir();
    this.logger.log(`CoordinationAttachmentStorageService initialized at: ${this.storageDir}`);
  }

  private resolveStorageDir(): string {
    const candidates = [
      process.env.COORDINATION_STORAGE_ROOT,
      '/workspace/data/storage/attachments',
      path.resolve(process.cwd(), 'data/storage/attachments'),
      path.resolve(process.cwd(), '../../../data/storage/attachments'),
      path.resolve(process.cwd(), '../../../../data/storage/attachments'),
      '/tmp/coordination-attachments',
    ].filter(Boolean) as string[];

    for (const cand of candidates) {
      try {
        if (fs.existsSync(cand)) {
          return cand;
        }
        const parent = path.dirname(cand);
        if (fs.existsSync(parent)) {
          fs.mkdirSync(cand, { recursive: true });
          return cand;
        }
      } catch {
        // continue
      }
    }

    const fallback = '/tmp/coordination-attachments';
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
    return fallback;
  }

  /**
   * 保存上传的协同附件/替换文件
   */
  public async saveAttachment(
    file: MulterLikeFile,
    userId?: string
  ): Promise<CoordinationAttachment & { attachmentId: string }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('未接收到文件内容');
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

    const attachmentId = `att_${randomUUID()}`;
    const diskFileName = `${attachmentId}_${safeOriginalName}`;
    const fullPath = path.join(this.storageDir, diskFileName);
    const metaPath = path.join(this.storageDir, `${attachmentId}.meta.json`);

    await fs.promises.writeFile(fullPath, file.buffer);

    const meta: StoredAttachmentMeta = {
      attachmentId,
      fileName: safeOriginalName,
      size: file.size,
      mimeType: file.mimetype || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      storagePath: fullPath,
      uploadedBy: userId,
      createdAt: new Date().toISOString(),
    };

    await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

    const downloadUrl = `/api/workbench-coordination/attachments/${attachmentId}/download?fileName=${encodeURIComponent(safeOriginalName)}`;

    return {
      attachmentId,
      name: safeOriginalName,
      size: file.size,
      mimeType: meta.mimeType,
      url: downloadUrl,
      storagePath: fullPath,
    };
  }

  /**
   * 获取附件文件供流式下载
   */
  public async getAttachment(attachmentId: string): Promise<{
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }> {
    const metaPath = path.join(this.storageDir, `${attachmentId}.meta.json`);
    let meta: StoredAttachmentMeta | null = null;

    if (fs.existsSync(metaPath)) {
      try {
        const raw = await fs.promises.readFile(metaPath, 'utf-8');
        meta = JSON.parse(raw);
      } catch (err: any) {
        this.logger.warn(`Failed to read meta for attachment ${attachmentId}: ${err.message}`);
      }
    }

    if (meta && meta.storagePath && fs.existsSync(meta.storagePath)) {
      const buffer = await fs.promises.readFile(meta.storagePath);
      return {
        buffer,
        fileName: meta.fileName,
        mimeType: meta.mimeType,
      };
    }

    // 若元数据不存在，直接按前缀查找匹配文件
    const files = await fs.promises.readdir(this.storageDir);
    const match = files.find((f) => f.startsWith(`${attachmentId}_`));
    if (!match) {
      throw new NotFoundException(`未找到协同附件: ${attachmentId}`);
    }

    const filePath = path.join(this.storageDir, match);
    const buffer = await fs.promises.readFile(filePath);
    const fileName = match.slice(attachmentId.length + 1);

    return {
      buffer,
      fileName,
      mimeType: fileName.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/octet-stream',
    };
  }
}
