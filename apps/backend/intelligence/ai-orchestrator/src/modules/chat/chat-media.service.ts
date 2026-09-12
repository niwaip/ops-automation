import { HttpException, HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import type { ContentBlock } from '../../interfaces';
import { ModelService } from '../model/model.service';
import { StorageConfigService } from '../storage/storage-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { inspectBinaryMimeType } from '../../common/utils/mime-inspector.util';
import { fixFilenameEncoding } from '../../common/utils/filename-encoding.util';
import type {
  ChatAudioTranscriptionResponseDTO,
  ChatUploadedFileDTO,
  ChatUploadFileResponseDTO,
} from './chat.dto';

export interface AuthenticatedUserContext {
  userId?: string;
  organizationId?: string | null;
  role?: string;
}

@Injectable()
export class ChatMediaService {
  private readonly logger = new Logger(ChatMediaService.name);
  private readonly fileStore = new Map<
    string,
    {
      fileName: string;
      mimeType: string;
      size: number;
      content: string;
      filePath?: string;
      extractedText?: string;
      ownerUserId?: string | null;
      organizationId?: string | null;
    }
  >();

  constructor(
    private readonly modelService: ModelService,
    @Optional() private readonly storageConfigService?: StorageConfigService,
    @Optional() private readonly prisma?: PrismaService
  ) {}

  /**
   * Resolve and ensure the durable storage directory for chat uploads.
   */
  getUploadStorageDir(): string {
    if (this.storageConfigService) {
      const cfg = this.storageConfigService.getConfig();
      if (cfg.localRoot && cfg.localRoot.trim()) {
        const configuredRoot = cfg.localRoot.trim();
        try {
          if (!fs.existsSync(configuredRoot)) {
            fs.mkdirSync(configuredRoot, { recursive: true });
          }
          return configuredRoot;
        } catch {
          // ignore fallback
        }
      }
    }

    const candidateRoots = [
      process.env.CHAT_UPLOAD_STORAGE_ROOT,
      process.env.WORKSPACE_STORAGE_ROOT ? path.join(process.env.WORKSPACE_STORAGE_ROOT, 'uploads') : '',
      '/workspace/data/storage/uploads',
      path.join(process.cwd(), 'data/storage/uploads'),
      path.resolve(__dirname, '../../../../../../../data/storage/uploads'),
    ].filter(Boolean) as string[];

    const chosen =
      candidateRoots.find((dir) => fs.existsSync(dir)) ||
      candidateRoots[0] ||
      path.join(process.cwd(), 'data/storage/uploads');

    try {
      if (!fs.existsSync(chosen)) {
        fs.mkdirSync(chosen, { recursive: true });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to create upload storage directory ${chosen}: ${err.message}`);
    }

    return chosen;
  }

  /**
   * Hydrate upload references from the server-side store or workspace storage.
   * FAILS CLOSED: Requires authenticated user context. Enforces ownership and tenant checks.
   */
  async resolveUploadedFiles(
    files: ChatUploadedFileDTO[] | undefined,
    contextUser: AuthenticatedUserContext
  ): Promise<ChatUploadedFileDTO[]> {
    const VALID_FILE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
    const resolved: ChatUploadedFileDTO[] = [];

    // CRITICAL: Fail-closed if contextUser is missing or unauthenticated
    if (!contextUser || (!contextUser.userId && contextUser.role !== 'admin')) {
      this.logger.warn('resolveUploadedFiles rejected: missing authenticated user context');
      return [];
    }
    const isAdmin = contextUser.role === 'admin';

    for (const file of (files || [])) {
      if (!file) continue;

      // Reject path traversal attempts in fileId immediately
      if (file.fileId && !VALID_FILE_ID_REGEX.test(file.fileId)) {
        this.logger.warn(`Rejected invalid fileId: ${file.fileId}`);
        continue;
      }

      // 1. Check in-memory upload store
      if (file.fileId && this.fileStore.has(file.fileId)) {
        const storedFile = this.fileStore.get(file.fileId)!;
        if (!isAdmin) {
          const hasOwnerMatch = Boolean(
            storedFile.ownerUserId &&
            contextUser.userId &&
            storedFile.ownerUserId === contextUser.userId
          );
          const hasOrgMatch = Boolean(
            storedFile.organizationId &&
            contextUser.organizationId &&
            storedFile.organizationId === contextUser.organizationId
          );
          if (!hasOwnerMatch && !hasOrgMatch) {
            this.logger.warn(
              `Access denied to in-memory file ${file.fileId}: owned by ${storedFile.ownerUserId || 'unknown'}, org ${storedFile.organizationId || 'none'}, requested by user ${contextUser.userId}, org ${contextUser.organizationId || 'none'}`
            );
            continue;
          }
        }

        resolved.push({
          ...file,
          fileId: file.fileId,
          fileName: storedFile.fileName,
          mimeType: storedFile.mimeType,
          size: storedFile.size,
          content: storedFile.content,
          filePath: storedFile.filePath,
          extractedText: storedFile.extractedText,
        });
        continue;
      }

      // 2. Check disk-backed upload storage with strict UUID, realpath, and tenant checks
      if (file.fileId && VALID_FILE_ID_REGEX.test(file.fileId)) {
        try {
          const uploadDir = path.resolve(this.getUploadStorageDir());
          let realUploadDir = uploadDir;
          try {
            if (fs.existsSync(uploadDir)) {
              realUploadDir = fs.realpathSync(uploadDir);
            }
          } catch {
            // fallback
          }

          const metaPath = path.resolve(uploadDir, `${file.fileId}.meta.json`);

          if (fs.existsSync(metaPath)) {
            let realMetaPath = metaPath;
            try {
              realMetaPath = fs.realpathSync(metaPath);
            } catch {
              continue;
            }

            if (!realMetaPath.startsWith(realUploadDir + path.sep)) {
              this.logger.warn(`Symlink or path traversal blocked for meta file: ${metaPath}`);
              continue;
            }

            const meta = JSON.parse(fs.readFileSync(realMetaPath, 'utf-8'));

            // Multi-tenant check against meta owner
            if (!isAdmin) {
              const hasOwnerMatch = Boolean(
                meta.ownerUserId &&
                contextUser.userId &&
                meta.ownerUserId === contextUser.userId
              );
              const hasOrgMatch = Boolean(
                meta.organizationId &&
                contextUser.organizationId &&
                meta.organizationId === contextUser.organizationId
              );
              if (!hasOwnerMatch && !hasOrgMatch) {
                this.logger.warn(
                  `Access denied to disk file ${file.fileId}: owned by ${meta.ownerUserId || 'unknown'}, org ${meta.organizationId || 'none'}, requested by user ${contextUser.userId}, org ${contextUser.organizationId || 'none'}`
                );
                continue;
              }
            }

            let content = file.content;
            let buf: Buffer | undefined;

            if (meta.filePath && typeof meta.filePath === 'string') {
              const resolvedFilePath = path.resolve(meta.filePath);
              if (fs.existsSync(resolvedFilePath)) {
                let realFilePath = resolvedFilePath;
                try {
                  realFilePath = fs.realpathSync(resolvedFilePath);
                } catch {
                  continue;
                }
                // CRITICAL: Ensure realFilePath is strictly contained within realUploadDir (symlink defense)
                if (realFilePath.startsWith(realUploadDir + path.sep)) {
                  buf = fs.readFileSync(realFilePath);
                  content = buf.toString('base64');
                } else {
                  this.logger.warn(`Symlink escape or path traversal blocked for filePath: ${meta.filePath}`);
                  continue;
                }
              } else {
                this.logger.warn(`Target file does not exist: ${resolvedFilePath}`);
              }
            }

            const item: ChatUploadedFileDTO = {
              ...file,
              fileId: file.fileId,
              fileName: meta.fileName || file.fileName,
              mimeType: meta.mimeType || file.mimeType,
              size: meta.size || file.size || (buf ? buf.length : 0),
              content,
              filePath: meta.filePath,
            };
            this.fileStore.set(file.fileId, {
              fileName: item.fileName,
              mimeType: item.mimeType,
              size: item.size,
              content: content || '',
              filePath: meta.filePath,
              ownerUserId: meta.ownerUserId,
              organizationId: meta.organizationId,
            });
            resolved.push(item);
            continue;
          }
        } catch (err: any) {
          this.logger.warn(`Failed to recover upload file from disk ${file.fileId}: ${err.message}`);
        }
      }

      // 3. Check workspace file storage with strict realpath containment and DB ownership verification
      if (file.source === 'workspace' && file.storagePath) {
        try {
          const normalizedStoragePath = path.normalize(file.storagePath).replace(/^(\.\.[/\\])+/, '');
          const segments = normalizedStoragePath.split(/[/\\]/).filter(Boolean);

          if (segments.length < 2) {
            this.logger.warn(`Rejected invalid workspace storagePath structure: ${file.storagePath}`);
            continue;
          }

          const firstSegment = segments[0] || '';
          let workspaceId = firstSegment;
          if (['personal', 'company', 'department', 'workspaces'].includes(firstSegment) && segments.length >= 3) {
            workspaceId = segments[1] || '';
          }

          // Database ownership verification for workspace files
          if (!isAdmin) {
            if (!this.prisma) {
              this.logger.warn(`Workspace access denied: PrismaService not available for ownership verification`);
              continue;
            }

            const rows = await this.prisma.$queryRaw<
              Array<{ id: string; type: string; owner_user_id: string | null; department_id: string | null }>
            >`
              SELECT id, type, owner_user_id, department_id FROM workspaces WHERE id::text = ${workspaceId} LIMIT 1
            `;

            if (!rows || rows.length === 0) {
              this.logger.warn(`Workspace ${workspaceId} not found in database for storagePath: ${file.storagePath}`);
              continue;
            }

            const ws = rows[0];
            if (!ws) continue;
            if (ws.type === 'personal') {
              if (!ws.owner_user_id || ws.owner_user_id !== contextUser.userId) {
                this.logger.warn(
                  `Access denied to personal workspace ${workspaceId}: owned by ${ws.owner_user_id}, requested by user ${contextUser.userId}`
                );
                continue;
              }
            } else if (ws.type === 'company') {
              if (!contextUser.organizationId) {
                this.logger.warn(
                  `Access denied to company workspace ${workspaceId}: caller has no organization context`
                );
                continue;
              }
            } else if (ws.type === 'department') {
              if (!contextUser.userId) {
                this.logger.warn(
                  `Access denied to department workspace ${workspaceId}: caller has no user context`
                );
                continue;
              }
            }
          }

          const candidateRoots = [
            process.env.WORKSPACE_STORAGE_ROOT,
            '/workspace/data/storage/workspaces',
            path.join(process.cwd(), 'data/storage/workspaces'),
            path.resolve(__dirname, '../../../../../../../data/storage/workspaces'),
          ].filter(Boolean) as string[];

          const rootDir = path.resolve(
            candidateRoots.find((dir) => fs.existsSync(dir)) ||
            candidateRoots[0] ||
            '/workspace/data/storage/workspaces'
          );

          let realRootDir = rootDir;
          try {
            if (fs.existsSync(rootDir)) {
              realRootDir = fs.realpathSync(rootDir);
            }
          } catch {
            // ignore
          }

          const fullPath = path.resolve(rootDir, normalizedStoragePath);

          // Path containment check
          if (!fullPath.startsWith(rootDir + path.sep)) {
            this.logger.warn(`Path traversal blocked in workspace storagePath: ${file.storagePath}`);
            continue;
          }

          // Direct path lookup only - no recursive fuzzy directory scanning
          if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            let realFullPath = fullPath;
            try {
              realFullPath = fs.realpathSync(fullPath);
            } catch {
              continue;
            }

            if (!realFullPath.startsWith(realRootDir + path.sep)) {
              this.logger.warn(`Symlink traversal blocked in workspace file: ${file.storagePath}`);
              continue;
            }

            const buf = fs.readFileSync(realFullPath);
            let extractedText: string | undefined;
            const extractedPath = `${fullPath}.extracted.txt`;
            if (fs.existsSync(extractedPath)) {
              try {
                extractedText = fs.readFileSync(extractedPath, 'utf-8');
              } catch {
                // ignore
              }
            }

            const hydratedItem: ChatUploadedFileDTO = {
              ...file,
              fileId: file.fileId,
              fileName: file.fileName,
              mimeType: file.mimeType || 'application/octet-stream',
              size: file.size || buf.length,
              content: buf.toString('base64'),
              filePath: fullPath,
              extractedText,
            };

            this.fileStore.set(file.fileId, {
              fileName: file.fileName,
              mimeType: hydratedItem.mimeType,
              size: hydratedItem.size,
              content: hydratedItem.content!,
              filePath: fullPath,
              extractedText,
              ownerUserId: contextUser.userId,
              organizationId: contextUser.organizationId,
            });

            resolved.push(hydratedItem);
            continue;
          }
        } catch (err: any) {
          this.logger.warn(`Failed to hydrate workspace file ${file.fileName}: ${err.message}`);
        }
      }

      // Drop unverified file references that attempt to access disk/storage without inline content or extractedText
      if (file.storagePath || (!file.content && !file.extractedText)) {
        this.logger.warn(
          `Dropping unverified file reference: fileId=${file.fileId}, storagePath=${file.storagePath}`
        );
        continue;
      }

      // Allow raw inline content or extractedText provided directly by client without external storage reference
      resolved.push({
        ...file,
        fileId: file.fileId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        content: file.content,
        filePath: file.filePath,
        extractedText: file.extractedText,
      });
    }

    return resolved;
  }

  async buildMessageContent(
    message: string,
    files: ChatUploadedFileDTO[] | undefined,
    contextUser?: AuthenticatedUserContext
  ): Promise<string | ContentBlock[]> {
    if (!files?.length) {
      return message;
    }

    const resolvedFiles = await this.resolveUploadedFiles(files, contextUser || { userId: 'anonymous' });
    const contentBlocks: ContentBlock[] = [{ type: 'text', text: message }];

    for (const file of resolvedFiles) {
      const storedFile = this.fileStore.get(file.fileId);
      const content = file.content || storedFile?.content;
      const extractedText = file.extractedText || storedFile?.extractedText;
      const mimeType = file.mimeType || storedFile?.mimeType || '';

      // 1. 如果有预提取的全文（如 PDF / 文档提取），直接注入文本供大模型研读
      if (extractedText && extractedText.trim()) {
        contentBlocks.push({
          type: 'text',
          text: `\n【文件: ${file.fileName}（文档文本提取内容）】\n${extractedText}`,
        });
        continue;
      }

      if (!content) {
        contentBlocks.push({
          type: 'text',
          text: `\n【文件: ${file.fileName}】\n(文件内容未找到)`,
        });
        continue;
      }

      // 2. 图片格式
      const isImage = mimeType.startsWith('image/');
      if (isImage) {
        contentBlocks.push({
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${content}`,
            detail: 'auto',
          },
        });
        continue;
      }

      // 3. 文本类文件解码
      try {
        const rawBuffer = Buffer.from(content, 'base64');
        const isBinary = rawBuffer.slice(0, 512).includes(0);
        if (!isBinary) {
          const decodedContent = rawBuffer.toString('utf-8');
          contentBlocks.push({
            type: 'text',
            text: `\n【文件: ${file.fileName}】\n${decodedContent}`,
          });
          continue;
        }
      } catch {
        // ignore
      }

      // 4. 二进制文件
      contentBlocks.push({
        type: 'text',
        text: `\n【文件: ${file.fileName} (${mimeType || '二进制文件'}, ${file.size}字节)】\n(二进制文档，已挂载至工作区)`,
      });
    }

    return contentBlocks;
  }

  normalizeContentToText(content: string | ContentBlock[]): string {
    if (typeof content === 'string') {
      return content;
    }

    return content
      .map((block) => {
        if (block.type === 'text') {
          return block.text || '';
        }
        if (block.type === 'image_url') {
          return '[图片]';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  uploadChatFile(
    file: Express.Multer.File,
    user?: AuthenticatedUserContext
  ): ChatUploadFileResponseDTO {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const rawOriginalName = fixFilenameEncoding(file.originalname || 'unnamed-file');
    const sanitizedFileName = path
      .basename(rawOriginalName)
      .replace(/[^\w.\-\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, '_');
    const uploadDir = path.resolve(this.getUploadStorageDir());
    const diskFileName = `${fileId}-${sanitizedFileName}`;
    const filePath = path.resolve(uploadDir, diskFileName);
    const metaPath = path.resolve(uploadDir, `${fileId}.meta.json`);

    let verifiedMime = file.mimetype;
    if (file.buffer && file.buffer.length > 0) {
      const inspected = inspectBinaryMimeType(file.buffer, rawOriginalName, file.mimetype);
      verifiedMime = inspected.mimeType;
    }

    try {
      if (file.buffer) {
        fs.writeFileSync(filePath, file.buffer, { mode: 0o600 });
        try {
          fs.chmodSync(filePath, 0o600);
        } catch {
          // ignore
        }
        const meta = {
          fileId,
          fileName: rawOriginalName,
          mimeType: verifiedMime,
          size: file.size,
          filePath,
          ownerUserId: user?.userId || null,
          organizationId: user?.organizationId || null,
          createdAt: new Date().toISOString(),
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), { mode: 0o600, encoding: 'utf-8' });
        try {
          fs.chmodSync(metaPath, 0o600);
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to persist uploaded file ${rawOriginalName} to disk: ${err.message}`);
    }

    this.fileStore.set(fileId, {
      fileName: rawOriginalName,
      mimeType: verifiedMime,
      size: file.size,
      content: file.buffer ? file.buffer.toString('base64') : '',
      filePath,
      ownerUserId: user?.userId || null,
      organizationId: user?.organizationId || null,
    });

    if (this.fileStore.size > 100) {
      const keys = Array.from(this.fileStore.keys());
      keys.slice(0, keys.length - 100).forEach((key) => this.fileStore.delete(key));
    }

    if (this.storageConfigService && file.buffer) {
      this.storageConfigService
        .saveFile(fileId, rawOriginalName, file.buffer, verifiedMime)
        .catch((err) => this.logger.warn(`StorageConfigService saveFile warning: ${err.message}`));
    }

    return {
      fileId,
      fileName: rawOriginalName,
      mimeType: verifiedMime,
      size: file.size,
      filePath,
    };
  }

  async transcribeAudio(
    file: Express.Multer.File,
    modelId: string
  ): Promise<ChatAudioTranscriptionResponseDTO> {
    this.logger.log(`transcribeAudio called with modelId: ${modelId}`);
    if (!file) {
      throw new HttpException('No audio file uploaded', HttpStatus.BAD_REQUEST);
    }

    let actualModelId = modelId;
    if (!actualModelId || actualModelId === 'default' || actualModelId === 'undefined') {
      const preferredModel = this.modelService.getPreferredDefaultModel({
        mode: 'audio_transcription',
      });
      if (preferredModel) {
        actualModelId = preferredModel.id;
        this.logger.log(`Resolved actualModelId to preferred model: ${actualModelId}`);
      } else {
        throw new HttpException(
          'No default audio transcription model found',
          HttpStatus.BAD_REQUEST
        );
      }
    }

    this.logger.log(`Fetching model with actualModelId: ${actualModelId}`);
    const model = await this.modelService.getModel(actualModelId);
    if (!model) {
      this.logger.error(`Model not found for actualModelId: ${actualModelId}`);
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }

    const client = this.modelService.getClient(actualModelId);
    if (!client) {
      throw new HttpException('Model client not initialized', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const config = client.getConfig();
    const baseURL = config.baseURL.replace(/\/chat\/completions$/, '').replace(/\/$/, '');
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
    formData.append('file', blob, file.originalname);
    formData.append('model', model.name);

    this.logger.log(
      `Transcribing audio with URL: ${baseURL}/audio/transcriptions and model: ${model.name}`
    );
    try {
      const response = await axios.post(`${baseURL}/audio/transcriptions`, formData, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      } as any);

      const resData = response.data as any;
      let text = '';
      if (typeof resData === 'string') {
        text = resData;
      } else if (resData && typeof resData.text === 'string') {
        text = resData.text;
      } else if (resData && typeof resData.result === 'string') {
        text = resData.result;
      } else if (resData?.data && typeof resData.data.text === 'string') {
        text = resData.data.text;
      } else {
        this.logger.warn(
          `Unexpected transcription response format: ${JSON.stringify(response.data)}`
        );
        text = JSON.stringify(response.data);
      }

      return { text };
    } catch (error: any) {
      this.logger.error(`Audio transcription failed: ${error.message}`, error.response?.data);
      throw new HttpException(
        error.response?.data?.error?.message ||
          error.response?.data?.message ||
          'Audio transcription failed',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
