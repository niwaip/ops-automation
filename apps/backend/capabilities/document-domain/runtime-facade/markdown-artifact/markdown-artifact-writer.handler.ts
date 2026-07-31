import { Injectable, Logger } from '@nestjs/common';
import { BuiltinSkillHandler, BuiltinSkillContext, BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import { MarkdownArtifactService } from './markdown-artifact.service';

@Injectable()
export class MarkdownArtifactWriterHandler implements BuiltinSkillHandler {
  readonly handlerKey = 'document.markdown-artifact-writer';
  private readonly logger = new Logger(MarkdownArtifactWriterHandler.name);

  constructor(private readonly markdownArtifactService: MarkdownArtifactService) {}

  async execute(context: BuiltinSkillContext, input: Record<string, unknown>): Promise<BuiltinSkillHandlerResult> {
    this.logger.log(`Executing Built-in Handler [${this.handlerKey}] for step ${context.stepId} in execution ${context.executionId}`);

    const content = typeof input.content === 'string' ? input.content : String(input.content || '');
    const fileName = typeof input.fileName === 'string' ? input.fileName : undefined;

    const result = await this.markdownArtifactService.createMarkdownArtifact({
      content,
      fileName,
      idempotencyKey: context.idempotencyKey,
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
