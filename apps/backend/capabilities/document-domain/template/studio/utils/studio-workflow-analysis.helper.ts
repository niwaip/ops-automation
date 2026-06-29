import { HttpException, HttpStatus } from '@nestjs/common';
import type {
  TemplateAnalyzeDto,
  TemplateCompareDto,
  TemplateUnderstandDto,
} from '../studio.dto';
import type {
  TemplateWorkflowService,
  WorkflowAnalyzeResult,
  WorkflowCompareResult,
  WorkflowRecognizeResult,
  WorkflowUnderstandResult,
} from '../../workflow-authoring/template-workflow.service';

type WorkflowAnalysisDeps = {
  isPlainObject: (value: unknown) => value is Record<string, any>;
  templateWorkflowService: Pick<
    TemplateWorkflowService,
    'analyzeTemplate' | 'compareTemplate' | 'understandTemplate' | 'recognizeTemplate'
  >;
};

function assertTemplateDocumentIr(
  isPlainObject: (value: unknown) => value is Record<string, any>,
  templateDocumentIr: unknown
): asserts templateDocumentIr is Record<string, any> {
  if (!isPlainObject(templateDocumentIr)) {
    throw new HttpException('templateDocumentIr 不能为空', HttpStatus.BAD_REQUEST);
  }
}

export function analyzeStudioTemplateWorkflow(
  deps: WorkflowAnalysisDeps,
  dto: TemplateAnalyzeDto
): WorkflowAnalyzeResult {
  assertTemplateDocumentIr(deps.isPlainObject, dto.templateDocumentIr);
  return deps.templateWorkflowService.analyzeTemplate(
    dto.templateDocumentIr,
    dto.sampleDocument,
    dto.sourceLanguage || 'zh',
    dto.targetLanguages || [],
    dto.termAssets
  );
}

export async function compareStudioTemplateWorkflow(
  deps: WorkflowAnalysisDeps,
  dto: TemplateCompareDto
): Promise<WorkflowCompareResult> {
  assertTemplateDocumentIr(deps.isPlainObject, dto.templateDocumentIr);
  return deps.templateWorkflowService.compareTemplate(
    dto.templateDocumentIr,
    dto.sampleDocument,
    dto.sourceLanguage || 'zh',
    dto.targetLanguages || [],
    dto.termAssets,
    dto.workflowId
  );
}

export async function understandStudioTemplateWorkflow(
  deps: WorkflowAnalysisDeps,
  dto: TemplateUnderstandDto
): Promise<WorkflowUnderstandResult> {
  assertTemplateDocumentIr(deps.isPlainObject, dto.templateDocumentIr);
  return deps.templateWorkflowService.understandTemplate(
    dto.templateDocumentIr,
    dto.sampleDocument,
    dto.sourceLanguage || 'zh',
    dto.targetLanguages || [],
    dto.termAssets,
    dto.candidateFields
  );
}

export async function recognizeStudioTemplateWorkflow(
  deps: WorkflowAnalysisDeps & {
    getSkillWithDbFallback: (id: string) => Promise<any>;
  },
  dto: TemplateAnalyzeDto
): Promise<WorkflowRecognizeResult> {
  assertTemplateDocumentIr(deps.isPlainObject, dto.templateDocumentIr);

  let skill = dto.skill;
  if (!skill && dto.skillId) {
    skill = await deps.getSkillWithDbFallback(dto.skillId);
  }

  return deps.templateWorkflowService.recognizeTemplate(
    dto.templateDocumentIr,
    dto.sampleDocument,
    dto.sourceLanguage || 'zh',
    dto.targetLanguages || [],
    dto.termAssets,
    dto.candidateFields,
    dto.prefetchedUnderstanding,
    skill
  );
}
