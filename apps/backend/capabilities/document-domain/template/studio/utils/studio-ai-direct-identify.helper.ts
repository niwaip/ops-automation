import { HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import type {
  AIIdentifierService,
  AIIdentifyResponse,
} from '../../workflow-authoring/ai-identifier.service';
import { createAiIdentifyProgressEmitter, loadStoredSkill } from './studio-ai-controller.helper';

type DirectIdentifyDto = {
  documentContent: string;
  documentType: string;
  templateType?: string;
  context?: string;
  customRules?: Array<{ pattern: string; targetPath: string; description?: string }>;
  underlineInfo?: Array<{
    text: string;
    underlineType: string;
    paragraphText: string;
    paragraphIndex?: number;
    position: { start: number; end: number };
  }>;
  paragraphFormats?: Array<{
    text: string;
    index: number;
    format: {
      fontSize?: number;
      isBold?: boolean;
      alignment?: string;
      isTitle?: boolean;
    };
  }>;
  skill?: any;
  skillId?: string;
};

type DirectIdentifyDeps = {
  templatesDir: string;
  verboseDebugEnabled: boolean;
  logger: {
    debug: (message: string) => void;
    warn: (message: string) => void;
  };
  aiIdentifierService: Pick<
    AIIdentifierService,
    'identifyFromContent' | 'identifyFromContentMultiStage'
  >;
};

async function resolveDirectIdentifySkill(
  deps: Pick<DirectIdentifyDeps, 'templatesDir' | 'logger'>,
  dto: Pick<DirectIdentifyDto, 'skill' | 'skillId'>
): Promise<any> {
  return dto.skill || loadStoredSkill(deps.templatesDir, dto.skillId, deps.logger);
}

export async function executeDirectAiIdentify(
  deps: DirectIdentifyDeps,
  dto: DirectIdentifyDto
): Promise<AIIdentifyResponse> {
  try {
    const skill = await resolveDirectIdentifySkill(deps, dto);
    return await deps.aiIdentifierService.identifyFromContent(
      dto.documentContent,
      dto.documentType,
      dto.templateType || 'report',
      dto.context,
      dto.customRules,
      skill
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpException(
      `Failed to identify variables: ${message}`,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}

export async function executeDirectAiIdentifyMultistage(
  deps: DirectIdentifyDeps,
  dto: DirectIdentifyDto
): Promise<AIIdentifyResponse> {
  try {
    const skill = await resolveDirectIdentifySkill(deps, dto);
    return await deps.aiIdentifierService.identifyFromContentMultiStage(
      dto.documentContent,
      dto.documentType,
      dto.templateType || 'contract',
      dto.context,
      (progress) => {
        if (deps.verboseDebugEnabled) {
          deps.logger.debug(
            `[MultiStage Progress] ${progress.stageName}: ${progress.progress}% - ${progress.message}`
          );
        }
      },
      dto.underlineInfo,
      dto.paragraphFormats,
      skill
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpException(
      `Failed to identify variables: ${message}`,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}

export async function executeDirectAiIdentifyWithProgress(
  deps: DirectIdentifyDeps,
  input: {
    documentContent: string;
    documentType: string;
    templateType?: string;
    context?: string;
    res: Response;
  }
): Promise<void> {
  const emitter = createAiIdentifyProgressEmitter(input.res);

  try {
    const result = await deps.aiIdentifierService.identifyFromContentMultiStage(
      input.documentContent,
      input.documentType,
      input.templateType || 'contract',
      input.context,
      emitter.progress
    );
    emitter.result(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    emitter.error(message);
  }
}
