import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Response } from 'express';
import { getChatAudioMaxFileSize, getChatUploadMaxFileSize } from './chat-upload.constants';

@Catch()
export class ChatUploadExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ChatUploadExceptionFilter.name);

  constructor(private readonly uploadType: 'file' | 'audio' = 'file') {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const maxLimitBytes =
      this.uploadType === 'audio' ? getChatAudioMaxFileSize() : getChatUploadMaxFileSize();
    const maxMb = Math.round(maxLimitBytes / (1024 * 1024));

    const isMulterFileSizeError =
      (exception as { code?: string })?.code === 'LIMIT_FILE_SIZE' ||
      (exception instanceof Error &&
        (exception.message?.toLowerCase().includes('file too large') ||
          exception.message?.toLowerCase().includes('payload too large')));

    const isPayloadTooLarge =
      exception instanceof PayloadTooLargeException ||
      (exception instanceof HttpException && exception.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE) ||
      isMulterFileSizeError;

    if (isPayloadTooLarge) {
      this.logger.warn(
        `Chat ${this.uploadType} upload rejected: file size exceeds platform limit (${maxMb}MB)`
      );
      return response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        error: 'Payload Too Large',
        message: `文件体积超过上传限制（当前单文件最大允许 ${maxMb}MB）`,
      });
    }

    if (exception instanceof BadRequestException) {
      const res = exception.getResponse();
      const message =
        typeof res === 'object' && res !== null && 'message' in res
          ? (res as { message?: string | string[] }).message
          : exception.message;
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: Array.isArray(message) ? message.join(', ') : message,
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      return response.status(status).json(
        typeof res === 'object' && res !== null
          ? res
          : {
              statusCode: status,
              message: res || exception.message,
            }
      );
    }

    const errorMsg = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(`Chat ${this.uploadType} upload unexpected error: ${errorMsg}`);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: '附件上传处理失败，请稍后重试',
    });
  }
}
