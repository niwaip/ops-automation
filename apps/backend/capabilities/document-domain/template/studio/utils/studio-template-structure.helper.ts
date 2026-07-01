import { HttpException, HttpStatus } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { DocumentStructure, DocumentStructureService } from '../../workflow-authoring/document-structure.service';

export async function readStudioTemplateDocumentStructure(input: {
  id: string;
  templatesDir: string;
  meta: { format: string };
  documentStructureService: Pick<DocumentStructureService, 'parseDocx'>;
}): Promise<DocumentStructure> {
  const templatePath = path.join(input.templatesDir, `${input.id}.${input.meta.format}`);

  if (!fs.existsSync(templatePath)) {
    throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
  }

  if (input.meta.format !== 'docx') {
    throw new HttpException(
      'Structure parsing is only supported for DOCX files',
      HttpStatus.BAD_REQUEST
    );
  }

  try {
    const buffer = fs.readFileSync(templatePath);
    return await input.documentStructureService.parseDocx(buffer);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpException(
      `Failed to parse document structure: ${message}`,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}
