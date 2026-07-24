import { useState } from 'react';
import type { WorkflowDsl } from '@/api/temporal';
import type { HttpRequestStepConfig, StructuredTransformStepConfig } from '../utils/workflowEditHelpers';
import { resolveApiErrorMessage } from '../utils/workflowEditHelpers';

export interface UseWorkflowStepEditorsProps {
  selectedStep: any;
  selectedStepIndexForConfig: number | null;
  selectedStepHttpConfig: Record<string, any>;
  selectedStepStructuredTransformConfig: Record<string, any>;
  updateStepHttpRequestConfig: (stepIndex: number, config: Partial<HttpRequestStepConfig>) => void;
  updateStepStructuredTransformConfig: (stepIndex: number, config: Partial<StructuredTransformStepConfig>) => void;
  setWorkflowDsl: React.Dispatch<React.SetStateAction<WorkflowDsl>>;
  setHttpAiSelectedLeafPaths: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setHttpAiLeafAliases: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
  setHttpAiErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setHttpAiSuggestedJsonDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setHttpAiApplySummaries: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  selectedStepAiSelectedLeafPaths: string[];
  selectedStepAiLeafAliases: Record<string, string>;
}

export function useWorkflowStepEditors({
  selectedStep,
  selectedStepIndexForConfig,
  selectedStepHttpConfig,
  selectedStepStructuredTransformConfig,
  updateStepHttpRequestConfig,
  updateStepStructuredTransformConfig,
  setWorkflowDsl,
  setHttpAiSelectedLeafPaths,
  setHttpAiLeafAliases,
  setHttpAiErrors,
  setHttpAiSuggestedJsonDrafts,
  setHttpAiApplySummaries,
  selectedStepAiSelectedLeafPaths,
  selectedStepAiLeafAliases,
}: UseWorkflowStepEditorsProps) {
  const [structuredTransformSchemaDrafts, setStructuredTransformSchemaDrafts] = useState<
    Record<string, string>
  >({});
  const [structuredTransformSchemaErrors, setStructuredTransformSchemaErrors] = useState<
    Record<string, string>
  >({});

  const selectedStructuredTransformSchemaDraft = selectedStep?.id
    ? (structuredTransformSchemaDrafts[selectedStep.id] ??
      JSON.stringify(selectedStepStructuredTransformConfig.outputSchema || {}, null, 2))
    : '{}';
  const selectedStructuredTransformSchemaError = selectedStep?.id
    ? structuredTransformSchemaErrors[selectedStep.id] || ''
    : '';

  const updateStructuredTransformSchemaDraft = (stepId: string, rawValue: string) => {
    setStructuredTransformSchemaDrafts((prev) => ({
      ...prev,
      [stepId]: rawValue,
    }));
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setStructuredTransformSchemaErrors((prev) => ({
        ...prev,
        [stepId]: '',
      }));
      if (selectedStepIndexForConfig !== null) {
        updateStepStructuredTransformConfig(selectedStepIndexForConfig, { outputSchema: {} });
      }
      return;
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('需要输入 JSON 对象');
      }
      setStructuredTransformSchemaErrors((prev) => ({
        ...prev,
        [stepId]: '',
      }));
      if (selectedStepIndexForConfig !== null) {
        updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
          outputSchema: parsed as Record<string, any>,
        });
      }
    } catch (error: unknown) {
      setStructuredTransformSchemaErrors((prev) => ({
        ...prev,
        [stepId]: resolveApiErrorMessage(error, 'JSON 解析失败'),
      }));
    }
  };

  const applySuggestedResponsePath = (path: string) => {
    if (selectedStepIndexForConfig === null) {
      return;
    }
    updateStepHttpRequestConfig(selectedStepIndexForConfig, {
      responseMode: 'bodyPath',
      responseBodyPath: path,
    });
  };

  const buildOutputKeyFromPath = (path: string) => {
    const segments = path.split('.').filter(Boolean);
    const meaningfulSegments = segments.filter((segment) => !/^\d+$/.test(segment));
    const source = meaningfulSegments.length > 0 ? meaningfulSegments : segments;
    const normalized = source
      .slice(-2)
      .join('_')
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized || 'field';
  };

  const toggleAiLeafPathSelection = (path: string) => {
    if (!selectedStep?.id) {
      return;
    }
    const stepId = selectedStep.id;
    const exists = selectedStepAiSelectedLeafPaths.includes(path);
    const nextPaths = exists
      ? selectedStepAiSelectedLeafPaths.filter((item) => item !== path)
      : [...selectedStepAiSelectedLeafPaths, path];
    setHttpAiSelectedLeafPaths((prev) => ({
      ...prev,
      [stepId]: nextPaths,
    }));
    if (!exists) {
      setHttpAiLeafAliases((prev) => ({
        ...prev,
        [stepId]: {
          ...(prev[stepId] || {}),
          [path]: prev[stepId]?.[path] || buildOutputKeyFromPath(path),
        },
      }));
    }
  };

  const updateAiLeafAlias = (path: string, alias: string) => {
    if (!selectedStep?.id) {
      return;
    }
    const stepId = selectedStep.id;
    setHttpAiLeafAliases((prev) => ({
      ...prev,
      [stepId]: {
        ...(prev[stepId] || {}),
        [path]: alias,
      },
    }));
  };

  const handleGenerateMultiFieldOutputParams = () => {
    if (!selectedStep?.id || selectedStepIndexForConfig === null) {
      return;
    }
    if (selectedStepAiSelectedLeafPaths.length === 0) {
      setHttpAiErrors((prev) => ({
        ...prev,
        [selectedStep.id as string]: '请先从当前响应字段建议中选择至少一个字段',
      }));
      return;
    }
    const outputEntries = selectedStepAiSelectedLeafPaths.map((path) => {
      const alias =
        (selectedStepAiLeafAliases[path] || buildOutputKeyFromPath(path)).trim() ||
        buildOutputKeyFromPath(path);
      return { alias, path };
    });
    const responseFieldMappings = outputEntries.reduce<Record<string, string>>((acc, item) => {
      acc[item.alias] = item.path;
      return acc;
    }, {});
    setWorkflowDsl((prev: WorkflowDsl) => ({
      ...prev,
      outputParams: {
        ...(prev.outputParams || {}),
        ...outputEntries.reduce<Record<string, { description?: string; sourceStep?: string }>>(
          (acc, item) => {
            acc[item.alias] = {
              description: `多字段提取草稿，来源 ${item.path}`,
              sourceStep: selectedStep.id,
            };
            return acc;
          },
          {}
        ),
      },
    }));
    updateStepHttpRequestConfig(selectedStepIndexForConfig, {
      responseMode: 'bodyMap',
      responseBodyPath: '',
      responseFieldMappings,
    });
    setHttpAiSuggestedJsonDrafts((prev) => ({
      ...prev,
      [selectedStep.id as string]: JSON.stringify(
        {
          ...selectedStepHttpConfig,
          responseMode: 'bodyMap',
          responseBodyPath: '',
          responseFieldMappings,
        },
        null,
        2
      ),
    }));
    setHttpAiErrors((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    setHttpAiApplySummaries((prev) => ({
      ...prev,
      [selectedStep.id as string]: [
        'responseMode: "bodyMap"',
        'responseBodyPath: ""',
        ...Object.entries(responseFieldMappings).map(
          ([key, path]) => `responseFieldMappings.${key} <- ${path}`
        ),
        ...outputEntries.map((item) => `outputParams.${item.alias} <- ${item.path}`),
      ],
    }));
  };

  return {
    structuredTransformSchemaDrafts,
    structuredTransformSchemaErrors,
    setStructuredTransformSchemaDrafts,
    selectedStructuredTransformSchemaDraft,
    selectedStructuredTransformSchemaError,
    updateStructuredTransformSchemaDraft,
    applySuggestedResponsePath,
    buildOutputKeyFromPath,
    toggleAiLeafPathSelection,
    updateAiLeafAlias,
    handleGenerateMultiFieldOutputParams,
  };
}
