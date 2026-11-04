import { BadRequestException, HttpException, HttpStatus, PayloadTooLargeException } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { ChatUploadExceptionFilter } from './chat-upload.filter';
import { getChatUploadMaxFileSize, getChatAudioMaxFileSize } from './chat-upload.constants';

describe('ChatUploadExceptionFilter', () => {
  let filter: ChatUploadExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new ChatUploadExceptionFilter('file');
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => ({
          status: mockStatus,
        }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('handles PayloadTooLargeException with 413 and user-friendly message', () => {
    const error = new PayloadTooLargeException('File too large');
    filter.catch(error, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 413,
        error: 'Payload Too Large',
        message: expect.stringContaining('文件体积超过上传限制'),
      })
    );
  });

  it('handles Multer LIMIT_FILE_SIZE error code with 413', () => {
    const multerError = { code: 'LIMIT_FILE_SIZE', message: 'File too large' };
    filter.catch(multerError, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 413,
        error: 'Payload Too Large',
      })
    );
  });

  it('handles BadRequestException with 400 and validation message', () => {
    const error = new BadRequestException('Unsupported file type extension: .exe');
    filter.catch(error, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Unsupported file type extension: .exe',
      })
    );
  });

  it('handles unexpected errors with 500', () => {
    const error = new Error('Disk failure');
    filter.catch(error, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: '附件上传处理失败，请稍后重试',
      })
    );
  });
});

describe('ChatUploadConstants', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...origEnv };
  });

  afterAll(() => {
    process.env = origEnv;
  });

  it('defaults chat upload max size to 100MB when env is not set', () => {
    delete process.env.CHAT_UPLOAD_MAX_FILE_SIZE_BYTES;
    delete process.env.CHAT_UPLOAD_MAX_FILE_SIZE_MB;
    expect(getChatUploadMaxFileSize()).toBe(100 * 1024 * 1024);
  });

  it('honors CHAT_UPLOAD_MAX_FILE_SIZE_MB', () => {
    process.env.CHAT_UPLOAD_MAX_FILE_SIZE_MB = '50';
    expect(getChatUploadMaxFileSize()).toBe(50 * 1024 * 1024);
  });

  it('honors CHAT_AUDIO_MAX_FILE_SIZE_MB', () => {
    process.env.CHAT_AUDIO_MAX_FILE_SIZE_MB = '30';
    expect(getChatAudioMaxFileSize()).toBe(30 * 1024 * 1024);
  });
});
