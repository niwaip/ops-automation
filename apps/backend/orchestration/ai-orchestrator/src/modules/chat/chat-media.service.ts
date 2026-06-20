import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
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
    }
  >();

  constructor(private readonly modelService: ModelService) {}

  async buildMessageContent(
    message: string,
    files?: ChatUploadedFileDTO[]
  ): Promise<string | ContentBlock[]> {
    if (!files?.length) {
      return message;
    }

    const contentBlocks: ContentBlock[] = [{ type: 'text', text: message }];

    for (const file of files) {
      const storedFile = this.fileStore.get(file.fileId);
      if (!storedFile?.content) {
        contentBlocks.push({
          type: 'text',
          text: `\n【文件: ${file.fileName}】\n(文件内容未找到，可能已过期)`,
        });
        continue;
      }

      const isImage = storedFile.mimeType.startsWith('image/');
      if (isImage) {
        contentBlocks.push({
          type: 'image_url',
          image_url: {
            url: `data:${storedFile.mimeType};base64,${storedFile.content}`,
            detail: 'auto',
          },
        });
        continue;
      }

      try {
        const decodedContent = Buffer.from(storedFile.content, 'base64').toString('utf-8');
        contentBlocks.push({
          type: 'text',
          text: `\n【文件: ${storedFile.fileName}】\n${decodedContent}`,
        });
      } catch {
        contentBlocks.push({
          type: 'text',
          text: `\n【文件: ${storedFile.fileName} (${storedFile.mimeType}, ${storedFile.size}字节)】\n(二进制文件，无法直接显示内容)`,
        });
      }
    }

    return contentBlocks;
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
    const blob = new Blob([file.buffer], { type: file.mimetype });
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
      });

      let text = '';
      if (typeof response.data === 'string') {
        text = response.data;
      } else if (response.data && typeof response.data.text === 'string') {
        text = response.data.text;
      } else if (response.data && typeof response.data.result === 'string') {
        text = response.data.result;
      } else if (response.data?.data && typeof response.data.data.text === 'string') {
        text = response.data.data.text;
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
