import {
  buildWordLoadSectionProps,
  buildWordQuerySectionProps,
  buildWordWorkflowDebugPanelProps,
} from './word-workflow.panel-props';
import {
  buildWordRecognitionFollowupProps,
  buildWordWorkflowStepStatus,
} from './word-workflow.presenter';

export function buildWordWorkflowPanelView(args: {
  sampleUploaded: boolean;
  hasCompare: boolean;
  recognitionReady: boolean;
  followup: Parameters<typeof buildWordRecognitionFollowupProps>[0];
  loadSection: Parameters<typeof buildWordLoadSectionProps>[0];
  querySection: Omit<
    Parameters<typeof buildWordQuerySectionProps>[0],
    'stepStatus' | 'followupProps'
  >;
  debugPanel: Parameters<typeof buildWordWorkflowDebugPanelProps>[0];
}) {
  const stepStatus = buildWordWorkflowStepStatus({
    sampleUploaded: args.sampleUploaded,
    hasCompare: args.hasCompare,
    recognitionReady: args.recognitionReady,
  });
  const followupProps = buildWordRecognitionFollowupProps(args.followup);

  return {
    loadSectionProps: buildWordLoadSectionProps(args.loadSection),
    querySectionProps: buildWordQuerySectionProps({
      ...args.querySection,
      stepStatus,
      followupProps,
    }),
    debugPanelProps: buildWordWorkflowDebugPanelProps(args.debugPanel),
  };
}
