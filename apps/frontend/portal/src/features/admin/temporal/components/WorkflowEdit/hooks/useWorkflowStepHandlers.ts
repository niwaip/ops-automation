import { useCallback } from 'react';
import type { WorkflowDsl } from '@/api/temporal';
import {
  HttpRequestStepConfig,
  StructuredTransformStepConfig,
  DEFAULT_HTTP_REQUEST_STEP_CONFIG,
  DEFAULT_STRUCTURED_TRANSFORM_STEP_CONFIG,
  asPlainRecord,
} from '../utils/workflowEditHelpers';

const HTTP_REQUEST_STEP_CONFIG_KEY = '__httpRequest';
const STRUCTURED_TRANSFORM_STEP_CONFIG_KEY = '__structuredTransform';

export const useWorkflowStepHandlers = (
  _workflowDsl: WorkflowDsl,
  setWorkflowDsl: React.Dispatch<React.SetStateAction<WorkflowDsl>>,
  setSelectedStepIndexForConfig: React.Dispatch<React.SetStateAction<number | null>>
) => {
  const getStepHttpRequestConfig = useCallback(
    (step?: WorkflowDsl['steps'][number], activity?: any): HttpRequestStepConfig => {
      const activityDefaults = asPlainRecord(activity?.config?.defaultStepConfig);
      const stepInput = asPlainRecord(step?.input);
      const rawConfig = asPlainRecord(stepInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
      return {
        ...DEFAULT_HTTP_REQUEST_STEP_CONFIG,
        ...activityDefaults,
        ...rawConfig,
        queryTemplate: {
          ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.queryTemplate),
          ...asPlainRecord(activityDefaults.queryTemplate),
          ...asPlainRecord(rawConfig.queryTemplate),
        },
        headersTemplate: {
          ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.headersTemplate),
          ...asPlainRecord(activityDefaults.headersTemplate),
          ...asPlainRecord(rawConfig.headersTemplate),
        },
        jsonTemplate: {
          ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.jsonTemplate),
          ...asPlainRecord(activityDefaults.jsonTemplate),
          ...asPlainRecord(rawConfig.jsonTemplate),
        },
        dataTemplate: {
          ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.dataTemplate),
          ...asPlainRecord(activityDefaults.dataTemplate),
          ...asPlainRecord(rawConfig.dataTemplate),
        },
        responseFieldMappings: {
          ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.responseFieldMappings),
          ...asPlainRecord(activityDefaults.responseFieldMappings),
          ...asPlainRecord(rawConfig.responseFieldMappings),
        },
      };
    },
    []
  );

  const updateStepHttpRequestConfig = useCallback(
    (stepIndex: number, patch: Partial<HttpRequestStepConfig>) => {
      setWorkflowDsl((prev) => {
        if (!prev?.steps || stepIndex < 0 || stepIndex >= prev.steps.length) {
          return prev;
        }
        const currentStep = prev.steps[stepIndex];
        const currentInput = asPlainRecord(currentStep.input);
        const currentConfig = getStepHttpRequestConfig(currentStep);
        const updatedConfig: HttpRequestStepConfig = {
          ...currentConfig,
          ...patch,
          queryTemplate: {
            ...asPlainRecord(currentConfig.queryTemplate),
            ...asPlainRecord(patch.queryTemplate),
          },
          headersTemplate: {
            ...asPlainRecord(currentConfig.headersTemplate),
            ...asPlainRecord(patch.headersTemplate),
          },
          jsonTemplate: {
            ...asPlainRecord(currentConfig.jsonTemplate),
            ...asPlainRecord(patch.jsonTemplate),
          },
          dataTemplate: {
            ...asPlainRecord(currentConfig.dataTemplate),
            ...asPlainRecord(patch.dataTemplate),
          },
          responseFieldMappings: {
            ...asPlainRecord(currentConfig.responseFieldMappings),
            ...asPlainRecord(patch.responseFieldMappings),
          },
        };
        const nextSteps = [...prev.steps];
        nextSteps[stepIndex] = {
          ...currentStep,
          input: {
            ...currentInput,
            [HTTP_REQUEST_STEP_CONFIG_KEY]: updatedConfig,
          },
        };
        return {
          ...prev,
          steps: nextSteps,
        };
      });
    },
    [getStepHttpRequestConfig, setWorkflowDsl]
  );

  const getStepStructuredTransformConfig = useCallback(
    (step?: WorkflowDsl['steps'][number], activity?: any): StructuredTransformStepConfig => {
      const activityDefaults = asPlainRecord(activity?.config?.defaultStepConfig);
      const stepInput = asPlainRecord(step?.input);
      const rawConfig = asPlainRecord(stepInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
      return {
        ...DEFAULT_STRUCTURED_TRANSFORM_STEP_CONFIG,
        ...activityDefaults,
        ...rawConfig,
        outputSchema:
          rawConfig.outputSchema && typeof rawConfig.outputSchema === 'object'
            ? rawConfig.outputSchema
            : activityDefaults.outputSchema && typeof activityDefaults.outputSchema === 'object'
              ? activityDefaults.outputSchema
              : DEFAULT_STRUCTURED_TRANSFORM_STEP_CONFIG.outputSchema,
        fieldMappings: {
          ...asPlainRecord(DEFAULT_STRUCTURED_TRANSFORM_STEP_CONFIG.fieldMappings),
          ...asPlainRecord(activityDefaults.fieldMappings),
          ...asPlainRecord(rawConfig.fieldMappings),
        },
      };
    },
    []
  );

  const updateStepStructuredTransformConfig = useCallback(
    (stepIndex: number, patch: Partial<StructuredTransformStepConfig>) => {
      setWorkflowDsl((prev) => {
        if (!prev?.steps || stepIndex < 0 || stepIndex >= prev.steps.length) {
          return prev;
        }
        const currentStep = prev.steps[stepIndex];
        const currentInput = asPlainRecord(currentStep.input);
        const currentConfig = getStepStructuredTransformConfig(currentStep);
        const updatedConfig: StructuredTransformStepConfig = {
          ...currentConfig,
          ...patch,
          outputSchema:
            patch.outputSchema !== undefined
              ? patch.outputSchema
              : currentConfig.outputSchema,
          fieldMappings: {
            ...asPlainRecord(currentConfig.fieldMappings),
            ...asPlainRecord(patch.fieldMappings),
          },
        };
        const nextSteps = [...prev.steps];
        nextSteps[stepIndex] = {
          ...currentStep,
          input: {
            ...currentInput,
            [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: updatedConfig,
          },
        };
        return {
          ...prev,
          steps: nextSteps,
        };
      });
    },
    [getStepStructuredTransformConfig, setWorkflowDsl]
  );

  const handleRemoveStep = useCallback(
    (index: number) => {
      setWorkflowDsl((prev) => {
        const nextSteps = [...(prev?.steps || [])];
        nextSteps.splice(index, 1);
        return {
          ...prev,
          steps: nextSteps,
        };
      });
      setSelectedStepIndexForConfig((prev) => {
        if (prev === null) return null;
        if (prev === index) return null;
        if (prev > index) return prev - 1;
        return prev;
      });
    },
    [setSelectedStepIndexForConfig, setWorkflowDsl]
  );

  return {
    getStepHttpRequestConfig,
    updateStepHttpRequestConfig,
    getStepStructuredTransformConfig,
    updateStepStructuredTransformConfig,
    handleRemoveStep,
  };
};
