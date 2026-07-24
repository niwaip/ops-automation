import { useCallback } from 'react';
import type { WorkflowDsl, ActivityDsl } from '@/api/temporal';
import {
  isHttpRequestActivity,
  isStructuredTransformActivity,
  HTTP_REQUEST_STEP_CONFIG_KEY,
  STRUCTURED_TRANSFORM_STEP_CONFIG_KEY,
  STEP_DURATION_DEFAULTS,
} from '../utils/workflowEditHelpers';
import type { WorkflowSelectableActivity } from './useWorkflowEditState';

export function useWorkflowStepMutations({
  setWorkflowDsl,
  setActivityDsl,
  selectingStepIndex,
  setSelectingStepIndex,
  setSelectActivityModalVisible,
  setSelectedStepIndexForConfig,
  getStepHttpRequestConfig,
  getStepStructuredTransformConfig,
}: {
  setWorkflowDsl: React.Dispatch<React.SetStateAction<WorkflowDsl>>;
  setActivityDsl: React.Dispatch<React.SetStateAction<ActivityDsl>>;
  selectingStepIndex: number | null;
  setSelectingStepIndex: (index: number | null) => void;
  setSelectActivityModalVisible: (visible: boolean) => void;
  setSelectedStepIndexForConfig: React.Dispatch<React.SetStateAction<number | null>>;
  getStepHttpRequestConfig: (step?: any, activity?: any) => any;
  getStepStructuredTransformConfig: (step?: any, activity?: any) => any;
}) {
  const handleAddStep = useCallback(() => {
    setWorkflowDsl((prev) => {
      const nextIndex = prev.steps.length;
      if (nextIndex === 0) {
        setSelectedStepIndexForConfig(0);
      }
      return {
        ...prev,
        steps: [
          ...prev.steps,
          {
            id: `step_${Date.now()}`,
            name: `步骤 ${prev.steps.length + 1}`,
            type: 'activity',
          },
        ],
      };
    });
  }, [setWorkflowDsl, setSelectedStepIndexForConfig]);

  const handleRemoveStep = useCallback(
    (index: number) => {
      setWorkflowDsl((prev) => ({
        ...prev,
        steps: prev.steps.filter((_, i) => i !== index),
      }));
    },
    [setWorkflowDsl]
  );

  const handleUpdateStep = useCallback(
    (index: number, field: string, value: unknown) => {
      setWorkflowDsl((prev) => {
        const updated = [...prev.steps];
        updated[index] = { ...updated[index], [field]: value };
        return { ...prev, steps: updated };
      });
    },
    [setWorkflowDsl]
  );

  const handleOpenActivitySelector = useCallback(
    (stepIndex: number) => {
      setSelectingStepIndex(stepIndex);
      setSelectActivityModalVisible(true);
    },
    [setSelectActivityModalVisible, setSelectingStepIndex]
  );

  const buildStepTimeoutsFromActivity = (activity?: WorkflowSelectableActivity) => ({
    startToCloseTimeout: activity?.timeout || STEP_DURATION_DEFAULTS.startToCloseTimeout,
    scheduleToCloseTimeout: undefined,
    heartbeatTimeout: undefined,
  });

  const buildActivityDslEntry = (activity: WorkflowSelectableActivity) => ({
    ...(activity.source === 'custom'
      ? {
          id: activity.id,
          activityRef: activity.ref,
        }
      : {}),
    name: activity.name,
    fn: activity.fn,
    timeout: activity.timeout,
    retryPolicy: activity.retryPolicy || undefined,
    handler: activity.handler,
    config: activity.config || {},
    generatedCode: activity.generatedCode,
  });

  const handleAddActivityFromPool = useCallback(
    (activity: WorkflowSelectableActivity) => {
      const stepId = `step_${Date.now()}`;
      const initialInput = isHttpRequestActivity(activity)
        ? { [HTTP_REQUEST_STEP_CONFIG_KEY]: getStepHttpRequestConfig(undefined, activity) }
        : isStructuredTransformActivity(activity)
          ? {
              [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: getStepStructuredTransformConfig(
                undefined,
                activity
              ),
            }
          : undefined;
      const newStep = {
        id: stepId,
        name: activity.name,
        type: 'activity' as const,
        activityRef: activity.ref,
        activityName: activity.name,
        input: initialInput,
        ...buildStepTimeoutsFromActivity(activity),
      };

      setWorkflowDsl((prev) => {
        const nextSteps = [...prev.steps, newStep];
        setSelectedStepIndexForConfig(prev.steps.length);
        return { ...prev, steps: nextSteps };
      });

      setActivityDsl((prev) => {
        const exists = prev.activities.some((a) => a.name === activity.name);
        if (!exists) {
          return {
            ...prev,
            activities: [...prev.activities, buildActivityDslEntry(activity)],
          };
        }
        return prev;
      });
    },
    [
      getStepHttpRequestConfig,
      getStepStructuredTransformConfig,
      setActivityDsl,
      setSelectedStepIndexForConfig,
      setWorkflowDsl,
    ]
  );

  const handleSelectActivity = useCallback(
    (activity: WorkflowSelectableActivity) => {
      if (selectingStepIndex !== null) {
        setWorkflowDsl((prev) => {
          const currentStep = prev.steps[selectingStepIndex];
          if (!currentStep) return prev;
          const nextInput = isHttpRequestActivity(activity)
            ? {
                ...(currentStep?.input || {}),
                [HTTP_REQUEST_STEP_CONFIG_KEY]: getStepHttpRequestConfig(currentStep, activity),
              }
            : isStructuredTransformActivity(activity)
              ? {
                  ...(currentStep?.input || {}),
                  [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: getStepStructuredTransformConfig(
                    currentStep,
                    activity
                  ),
                }
              : currentStep?.input;
          const nextStep = {
            ...currentStep,
            activityRef: activity.ref,
            activityName: activity.name,
            input: nextInput,
            startToCloseTimeout:
              currentStep?.startToCloseTimeout ||
              activity.timeout ||
              STEP_DURATION_DEFAULTS.startToCloseTimeout,
            scheduleToCloseTimeout: currentStep?.scheduleToCloseTimeout || undefined,
            heartbeatTimeout: currentStep?.heartbeatTimeout || undefined,
          };
          const updatedSteps = [...prev.steps];
          updatedSteps[selectingStepIndex] = nextStep;
          return { ...prev, steps: updatedSteps };
        });

        setActivityDsl((prev) => {
          const exists = prev.activities.some((a) => a.name === activity.name);
          if (!exists) {
            return {
              ...prev,
              activities: [...prev.activities, buildActivityDslEntry(activity)],
            };
          }
          return prev;
        });
      }
      setSelectActivityModalVisible(false);
      setSelectingStepIndex(null);
    },
    [
      getStepHttpRequestConfig,
      getStepStructuredTransformConfig,
      selectingStepIndex,
      setActivityDsl,
      setSelectActivityModalVisible,
      setSelectingStepIndex,
      setWorkflowDsl,
    ]
  );

  return {
    handleAddStep,
    handleRemoveStep,
    handleUpdateStep,
    handleOpenActivitySelector,
    handleAddActivityFromPool,
    handleSelectActivity,
  };
}
