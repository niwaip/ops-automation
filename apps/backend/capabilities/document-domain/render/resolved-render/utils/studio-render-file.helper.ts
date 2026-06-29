import { HttpException, HttpStatus, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

type FilePreviewService = {
  generatePreview: (
    templatePath: string,
    format: string
  ) => Promise<{ html: string; format: string }>;
};

export function getStudioRenderContentType(format: string): string {
  switch (format) {
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'pdf':
      return 'application/pdf';
    case 'html':
      return 'text/html';
    default:
      return 'application/octet-stream';
  }
}

export function streamStoredRenderFile(input: {
  id: string;
  metaDir: string;
  fileDir: string;
  res: Response;
  disposition: 'inline' | 'attachment';
  missingMetaMessage: string;
  missingFileMessage: string;
  getContentType: (format: string) => string;
}): StreamableFile {
  const metaPath = path.join(input.metaDir, `${input.id}.json`);
  if (!fs.existsSync(metaPath)) {
    throw new HttpException(input.missingMetaMessage, HttpStatus.NOT_FOUND);
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  const filePath = path.join(input.fileDir, `${input.id}.${meta.format}`);
  if (!fs.existsSync(filePath)) {
    throw new HttpException(input.missingFileMessage, HttpStatus.NOT_FOUND);
  }

  input.res.setHeader('Content-Type', input.getContentType(meta.format));
  const encodedFileName = encodeURIComponent(meta.fileName);
  input.res.setHeader(
    'Content-Disposition',
    `${input.disposition}; filename*=UTF-8''${encodedFileName}`
  );

  return new StreamableFile(fs.createReadStream(filePath));
}

export async function loadTemplateHtmlPreview(input: {
  id: string;
  templatesDir: string;
  previewService: FilePreviewService;
  getTemplateMeta: (id: string) => { format: string };
}): Promise<{ html: string; format: string }> {
  const meta = input.getTemplateMeta(input.id);
  const templatePath = path.join(input.templatesDir, `${input.id}.${meta.format}`);

  if (!fs.existsSync(templatePath)) {
    throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
  }

  try {
    return await input.previewService.generatePreview(templatePath, meta.format);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpException(
      `Failed to generate preview: ${message}`,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}
