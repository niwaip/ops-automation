import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../common/guards/ai-auth.guard';

export interface ServeFileOptions {
  targetUserId: string;
  fileName: string;
  requestingUser?: AuthenticatedUser;
  res: Response;
}

@Injectable()
export class WorkspaceArtifactService {
  private readonly logger = new Logger(WorkspaceArtifactService.name);

  /**
   * Resolves the physical path of a file strictly within the given user's workspace or knowledge directory.
   * Absolutely NO cross-user fallback scanning is permitted.
   */
  resolveUserFilePath(userId: string, safeFileName: string): string | null {
    if (!userId || !safeFileName || userId.includes('..') || safeFileName.includes('..')) {
      return null;
    }

    const candidatePaths = [
      path.join('/workspace/data/users', userId, 'workspace', safeFileName),
      path.join(process.cwd(), 'data/users', userId, 'workspace', safeFileName),
      path.resolve(__dirname, '../../../../../../../data/users', userId, 'workspace', safeFileName),
      path.join('/workspace/data/users', userId, 'knowledge', safeFileName),
      path.join(process.cwd(), 'data/users', userId, 'knowledge', safeFileName),
      path.resolve(__dirname, '../../../../../../../data/users', userId, 'knowledge', safeFileName),
    ];

    for (const p of candidatePaths) {
      if (this.fileExists(p)) {
        return p;
      }
    }

    return null;
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  createFileStream(filePath: string): fs.ReadStream {
    return fs.createReadStream(filePath);
  }

  /**
   * Sniffs magic bytes to accurately detect binary image types and prevent MIME spoofing.
   */
  sniffMimeType(filePath: string, fallbackMime: string): string {
    try {
      const fd = fs.openSync(filePath, 'r');
      const header = Buffer.alloc(12);
      fs.readSync(fd, header, 0, 12, 0);
      fs.closeSync(fd);

      if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
        return 'image/jpeg';
      }
      if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) {
        return 'image/png';
      }
      if (
        header[0] === 0x52 &&
        header[1] === 0x49 &&
        header[2] === 0x46 &&
        header[3] === 0x46 &&
        header[8] === 0x57 &&
        header[9] === 0x45 &&
        header[10] === 0x42 &&
        header[11] === 0x50
      ) {
        return 'image/webp';
      }
      if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
        return 'image/gif';
      }
    } catch {
      // ignore sniff errors
    }
    return fallbackMime;
  }

  /**
   * Returns standard MIME type by file extension.
   */
  getMimeTypeByExtension(ext: string): string {
    switch (ext) {
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      case '.svg':
        return 'image/svg+xml';
      case '.pdf':
        return 'application/pdf';
      case '.docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case '.doc':
        return 'application/msword';
      case '.xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case '.xls':
        return 'application/vnd.ms-excel';
      case '.pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case '.ppt':
        return 'application/vnd.ms-powerpoint';
      case '.zip':
        return 'application/zip';
      case '.csv':
        return 'text/csv; charset=utf-8';
      case '.html':
      case '.htm':
        return 'text/html; charset=utf-8';
      case '.md':
        return 'text/markdown; charset=utf-8';
      case '.txt':
        return 'text/plain; charset=utf-8';
      case '.json':
        return 'application/json; charset=utf-8';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Determines if a file is safe for inline browser rendering.
   * [P1 FIX] HTML, HTM, and SVG are strictly excluded from inline to prevent stored XSS.
   */
  isSafeInlineExtension(ext: string): boolean {
    const safeInlineExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf']);
    return safeInlineExtensions.has(ext);
  }

  /**
   * Validates access and serves the requested workspace artifact.
   */
  async serveWorkspaceFile(options: ServeFileOptions): Promise<void> {
    const { targetUserId, fileName, requestingUser, res } = options;

    const rawUserId = String(targetUserId || '').trim();
    const rawFileName = String(fileName || '').trim();

    // 防御路径穿越
    if (!rawUserId || !rawFileName || rawUserId.includes('..') || rawFileName.includes('..')) {
      throw new BadRequestException('Invalid userId or fileName parameter');
    }

    let safeFileName = path.basename(rawFileName);
    try {
      safeFileName = path.basename(decodeURIComponent(rawFileName));
    } catch {
      // ignore decode error
    }

    // [P0 FIX] 鉴权上下文检查
    if (!requestingUser || !requestingUser.id) {
      throw new UnauthorizedException('Authentication required to access workspace files');
    }

    // 支持 me / default 虚拟路径解析为当前认证用户
    let effectiveUserId = rawUserId;
    if (rawUserId === 'me' || rawUserId === 'default') {
      effectiveUserId = requestingUser.id;
    } else if (rawUserId !== requestingUser.id) {
      const isPrivileged = requestingUser.role === 'admin' || requestingUser.isInternalService;
      if (!isPrivileged) {
        this.logger.warn(
          `Cross-user workspace access denied: requesting user [${requestingUser.id}] attempted to read files for user [${rawUserId}]`
        );
        throw new ForbiddenException('Access denied to other user workspace files');
      }
    }

    const filePath = this.resolveUserFilePath(effectiveUserId, safeFileName);
    if (!filePath || !this.fileExists(filePath)) {
      throw new NotFoundException('File not found in workspace');
    }

    const ext = path.extname(safeFileName).toLowerCase();
    let mime = this.getMimeTypeByExtension(ext);
    if (mime.startsWith('image/') && ext !== '.svg') {
      mime = this.sniffMimeType(filePath, mime);
    }

    // [P1 FIX] 仅安全图片与PDF支持 inline，HTML/SVG 强制 attachment
    const isInline = this.isSafeInlineExtension(ext);
    const dispositionType = isInline ? 'inline' : 'attachment';
    const encodedFileName = encodeURIComponent(safeFileName);

    // 设置防 XSS、nosniff 与私有安全缓存响应头
    res.setHeader('Content-Type', mime);
    res.setHeader(
      'Content-Disposition',
      `${dispositionType}; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
    );
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    const stream = this.createFileStream(filePath);
    stream.pipe(res);
  }
}
