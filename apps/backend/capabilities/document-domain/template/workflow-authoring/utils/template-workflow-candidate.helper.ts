import {
  WorkflowAnalyzeFieldResult,
  WorkflowCompareCandidateBuildResult,
  WorkflowDocumentIR,
  WorkflowFieldCandidate,
  WorkflowResolvedAssets,
} from './workflow-assets';
import { buildCompareCandidates } from './workflow-compare';
import { matchFieldDictionary } from './workflow-discover';
import { extractFieldValue } from './workflow-input-helper';

export async function resolveTemplateWorkflowCandidates(input: {
  templateDocumentIr: WorkflowDocumentIR;
  fields: WorkflowAnalyzeFieldResult[];
  sampleDocument: { fileName?: string; contentBase64?: string } | undefined;
  sourceLanguage: string;
  assets: WorkflowResolvedAssets;
  candidateFields?: WorkflowFieldCandidate[];
}): Promise<{
  compareCandidates: WorkflowFieldCandidate[];
  compareCandidateBuildResult?: WorkflowCompareCandidateBuildResult;
}> {
  if (input.candidateFields && input.candidateFields.length > 0) {
    return {
      compareCandidates: input.candidateFields,
      compareCandidateBuildResult: undefined,
    };
  }

  const compareCandidateBuildResult = await buildCompareCandidates(
    input.templateDocumentIr,
    input.fields,
    input.sampleDocument,
    input.sourceLanguage,
    input.assets,
    matchFieldDictionary,
    extractFieldValue
  );

  return {
    compareCandidates: compareCandidateBuildResult.candidates,
    compareCandidateBuildResult,
  };
}
