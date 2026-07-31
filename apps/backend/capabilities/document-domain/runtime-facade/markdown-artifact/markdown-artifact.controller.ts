import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { MarkdownArtifactService } from './markdown-artifact.service';

export interface CreateMarkdownArtifactDto {
  content: string;
  fileName?: string;
  skillId?: string;
  publishedSkillId?: string;
  idempotencyKey?: string;
}

export interface BuiltinInvokeDto {
  executionId: string;
  stepId: string;
  capabilityKey: string;
  definitionVersion: string;
  idempotencyKey: string;
  input: Record<string, unknown>;
}

@Controller('internal/document/markdown-artifacts')
export class MarkdownArtifactController {
  constructor(private readonly markdownArtifactService: MarkdownArtifactService) {}

  @Post('create')
  @HttpCode(HttpStatus.OK)
  async create(@Body() dto: CreateMarkdownArtifactDto) {
    const result = await this.markdownArtifactService.createMarkdownArtifact(dto);
    return {
      success: true,
      artifact: result.artifact,
      sizeBytes: result.sizeBytes,
      sha256: result.sha256,
    };
  }

  @Post('invoke')
  @HttpCode(HttpStatus.OK)
  async invokeBuiltinHandler(@Body() dto: BuiltinInvokeDto) {
    const content = typeof dto.input?.content === 'string' ? dto.input.content : String(dto.input?.content || '');
    const fileName = typeof dto.input?.fileName === 'string' ? dto.input.fileName : undefined;

    const result = await this.markdownArtifactService.createMarkdownArtifact({
      content,
      fileName,
      idempotencyKey: dto.idempotencyKey,
    });

    return {
      success: true,
      output: {
        artifact: result.artifact,
        artifacts: [result.artifact],
        artifact_ref: result.artifact,
        sha256: result.sha256,
        sizeBytes: result.sizeBytes,
      },
      artifacts: [result.artifact],
    };
  }
}
