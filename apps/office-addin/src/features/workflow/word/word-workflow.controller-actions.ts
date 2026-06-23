import { createWordIdentifyRecognitionController } from '../../parameter-identify/word/identify-recognition.controller';
import {
  createWordQueryCompareController,
  createWordQueryHighlightController,
  createWordQueryStepController,
} from '../../parameter-query/word';

export function createWordWorkflowActionControllers(args: {
  compare: Parameters<typeof createWordQueryCompareController>[0];
  step: Parameters<typeof createWordQueryStepController>[0];
  highlight: Parameters<typeof createWordQueryHighlightController>[0];
  recognition: Parameters<typeof createWordIdentifyRecognitionController>[0];
}) {
  const { handleStartCompare } = createWordQueryCompareController(args.compare);
  const {
    handleCompareDocumentTypeChange,
    handleCompareHeadingLanguageToggle,
    toggleCompareSectionCollapse,
    toggleRecognitionSectionCollapse,
    toggleCompareSectionSelection,
    setAllCompareSectionsSelected,
    handleSampleUploadStateChange,
  } = createWordQueryStepController(args.step);
  const { handleHighlightCompareCandidates, handleClearCompareHighlights } =
    createWordQueryHighlightController(args.highlight);
  const { handleStartUnderstanding, handleStartRecognition } =
    createWordIdentifyRecognitionController(args.recognition);

  return {
    handleStartCompare,
    handleCompareDocumentTypeChange,
    handleCompareHeadingLanguageToggle,
    toggleCompareSectionCollapse,
    toggleRecognitionSectionCollapse,
    toggleCompareSectionSelection,
    setAllCompareSectionsSelected,
    handleSampleUploadStateChange,
    handleHighlightCompareCandidates,
    handleClearCompareHighlights,
    handleStartUnderstanding,
    handleStartRecognition,
  };
}
