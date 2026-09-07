import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import type { ContentBlock } from '../../interfaces';
import { ModelService } from '../model/model.service';
import type {
  ChatAudioTranscriptionResponseDTO,
  ChatUploadedFileDTO,
  ChatUploadFileResponseDTO,
} from './chat.dto';

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
    }
  >();

  constructor(private readonly modelService: ModelService) {}

  /**
   * Hydrate upload references from the server-side store or workspace storage.
   */
  resolveUploadedFiles(files?: ChatUploadedFileDTO[]): ChatUploadedFileDTO[] {
    return (files || []).map((file) => {
      // 1. Check in-memory upload store
      const storedFile = this.fileStore.get(file.fileId);
      if (storedFile) {
        return {
          ...file,
          fileId: file.fileId,
          fileName: storedFile.fileName,
          mimeType: storedFile.mimeType,
          size: storedFile.size,
          content: storedFile.content,
          filePath: storedFile.filePath,
          extractedText: storedFile.extractedText,
        };
      }

      // 2. Check workspace file storage
      if (file.source === 'workspace' || file.workspaceNodeId || file.storagePath || file.fileId) {
        try {
          const candidateRoots = [
            process.env.WORKSPACE_STORAGE_ROOT,
            '/workspace/data/storage/workspaces',
            path.join(process.cwd(), 'data/storage/workspaces'),
            path.resolve(__dirname, '../../../../../../../data/storage/workspaces'),
          ].filter(Boolean) as string[];

          const rootDir = candidateRoots.find((dir) => fs.existsSync(dir)) || candidateRoots[0] || '/workspace/data/storage/workspaces';
          let fullPath = file.storagePath ? path.join(rootDir, file.storagePath) : '';
          if (!fullPath || !fs.existsSync(fullPath)) {
            const targetId = file.workspaceNodeId || file.fileId;
            const findFile = (dir: string): string | null => {
              if (!fs.existsSync(dir)) return null;
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                const sub = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                  const res = findFile(sub);
                  if (res) return res;
                } else if (
                  entry.name.includes(targetId) &&
                  !entry.name.endsWith('.digest.json') &&
                  !entry.name.endsWith('.extracted.txt')
                ) {
                  return sub;
                }
              }
              return null;
            };
            const found = findFile(rootDir);
            if (found) fullPath = found;
          }

          if (fullPath && fs.existsSync(fullPath)) {
            const buf = fs.readFileSync(fullPath);
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
            });

            return hydratedItem;
          }
        } catch (err: any) {
          this.logger.warn(`Failed to hydrate workspace file ${file.fileName}: ${err.message}`);
        }
      }

      return {
        fileId: file.fileId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        content: file.content,
      };
    });
  }

  async buildMessageContent(
    message: string,
    files?: ChatUploadedFileDTO[]
  ): Promise<string | ContentBlock[]> {
    if (!files?.length) {
      return message;
    }

    const resolvedFiles = this.resolveUploadedFiles(files);
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

  uploadChatFile(file: Express.Multer.File): ChatUploadFileResponseDTO {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    this.fileStore.set(fileId, {
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      content: file.buffer.toString('base64'),
    });

    if (this.fileStore.size > 100) {
      const keys = Array.from(this.fileStore.keys());
      keys.slice(0, keys.length - 100).forEach((key) => this.fileStore.delete(key));
    }

    return {
      fileId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
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
