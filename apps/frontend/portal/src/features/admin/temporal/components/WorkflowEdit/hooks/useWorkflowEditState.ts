import { useState, useReducer, useRef } from 'react';
import { Form } from 'antd';
import type {
  WorkflowDsl,
  ActivityDsl,
  WorkflowRealValidationResult,
  WorkflowCodeResult,
  TemporalWorkflowDTO,
  TemporalValidationResult,
} from '@/api/temporal';

export interface WorkflowSelectableActivity {
  id: string;
  source: 'builtin' | 'custom';
  ref: string;
  name: string;
  fn: string;
  timeout: string;
  retryPolicy?: { maxRetries?: number; backoffMs?: number } | null;
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
  generatedCode?: string;
  isActive: boolean;
  readonly?: boolean;
  version?: string;
  description?: string;
}

export interface UseWorkflowEditStateProps {
  visible?: boolean;
  onCancel?: () => void;
  onSave?: (workflowDsl: WorkflowDsl, activityDsl: ActivityDsl, rawDslCode?: string) => void;
  initialWorkflow?: any;
  initialDraftDsl?: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl } | null;
  openTemplatePickerOnOpen?: boolean;
  initialTemplatePickerMode?: 'document' | 'skill';
}

const MAX_LOG_LINES = 1000;

export interface RealValidationState {
  visible: boolean;
  isStreaming: boolean;
  logs: string[];
  result: WorkflowRealValidationResult | null;
  inputParams: Record<string, string>;
}

export interface CodeGenerationState {
  visible: boolean;
  isStreaming: boolean;
  logs: string[];
  result: WorkflowCodeResult | null;
}

export type RealValidationAction =
  | { type: 'START' }
  | { type: 'OPEN'; payload?: Record<string, string> }
  | { type: 'APPEND_LOG'; payload: string }
  | { type: 'SET_RESULT'; payload: WorkflowRealValidationResult }
  | {
      type: 'RESTORE';
      payload: {
        result: WorkflowRealValidationResult;
        logs: string[];
        inputParams: Record<string, string>;
      };
    }
  | { type: 'SET_INPUT_PARAMS'; payload: Record<string, string> }
  | { type: 'CLOSE' };

export type CodeGenerationAction =
  | { type: 'START' }
  | { type: 'APPEND_LOG'; payload: string }
  | { type: 'SET_RESULT'; payload: WorkflowCodeResult }
  | { type: 'CLOSE' };

const initialRealValidationState: RealValidationState = {
  visible: false,
  isStreaming: false,
  logs: [],
  result: null,
  inputParams: {},
};

const initialCodeGenerationState: CodeGenerationState = {
  visible: false,
  isStreaming: false,
  logs: [],
  result: null,
};

const realValidationReducer = (
  state: RealValidationState,
  action: RealValidationAction
): RealValidationState => {
  switch (action.type) {
    case 'START':
      return {
        ...state,
        visible: true,
        isStreaming: true,
        logs: [],
        result: null,
      };
    case 'OPEN':
      return {
        ...state,
        visible: true,
        inputParams: action.payload || {},
      };
    case 'APPEND_LOG':
      return {
        ...state,
        logs: [...state.logs.slice(-(MAX_LOG_LINES - 1)), action.payload],
      };
    case 'SET_RESULT':
      return {
        ...state,
        isStreaming: false,
        result: action.payload,
      };
    case 'RESTORE':
      return {
        visible: false,
        isStreaming: false,
        logs: action.payload.logs,
        result: action.payload.result,
        inputParams: action.payload.inputParams,
      };
    case 'SET_INPUT_PARAMS':
      return {
        ...state,
        inputParams: action.payload,
      };
    case 'CLOSE':
      return {
        ...initialRealValidationState,
      };
    default:
      return state;
  }
};

const codeGenerationReducer = (
  state: CodeGenerationState,
  action: CodeGenerationAction
): CodeGenerationState => {
  switch (action.type) {
    case 'START':
      return {
        visible: true,
        isStreaming: true,
        logs: [],
        result: null,
      };
    case 'APPEND_LOG':
      return {
        ...state,
        logs: [...state.logs.slice(-(MAX_LOG_LINES - 1)), action.payload],
      };
    case 'SET_RESULT':
      return {
        ...state,
        isStreaming: false,
        result: action.payload,
      };
    case 'CLOSE':
      return {
        ...initialCodeGenerationState,
      };
    default:
      return state;
  }
};

export const useWorkflowEditState = (_props?: UseWorkflowEditStateProps) => {
  const [form] = Form.useForm();
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [validateModalVisible, setValidateModalVisible] = useState(false);
  const [saveSubmitting, setSaveSubmitting] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  const [validationResult, setValidationResult] = useState<TemporalValidationResult | null>(null);
  const [workflowDsl, setWorkflowDsl] = useState<WorkflowDsl>({
    name: '',
    steps: [],
    inputParams: {},
    outputParams: {},
  } as any);
  const [activityDsl, setActivityDsl] = useState<ActivityDsl>({ activities: [] });
  const [selectActivityModalVisible, setSelectActivityModalVisible] = useState(false);
  const [selectingStepIndex, setSelectingStepIndex] = useState<number | null>(null);
  const [selectedStepIndexForConfig, setSelectedStepIndexForConfig] = useState<number | null>(null);
  const [stepConfigActiveKeys, setStepConfigActiveKeys] = useState<string[]>([
    'execution-control',
    'activity-input',
    'result-processing',
  ]);
  const [httpAiOptimizePrompts, setHttpAiOptimizePrompts] = useState<Record<string, string>>({});
  const [httpAiPreviewResponses, setHttpAiPreviewResponses] = useState<
    Record<string, Record<string, any>>
  >({});
  const [httpAiSuggestedConfigs, setHttpAiSuggestedConfigs] = useState<
    Record<string, Record<string, any>>
  >({});
  const [httpAiSuggestedJsonDrafts, setHttpAiSuggestedJsonDrafts] = useState<
    Record<string, string>
  >({});
  const [httpAiExplanations, setHttpAiExplanations] = useState<Record<string, string>>({});
  const [httpAiErrors, setHttpAiErrors] = useState<Record<string, string>>({});
  const [httpAiApplySummaries, setHttpAiApplySummaries] = useState<Record<string, string[]>>({});
  const [httpAiSelectedLeafPaths, setHttpAiSelectedLeafPaths] = useState<Record<string, string[]>>(
    {}
  );
  const [httpAiLeafAliases, setHttpAiLeafAliases] = useState<
    Record<string, Record<string, string>>
  >({});
  const [activeHttpAiStepId, setActiveHttpAiStepId] = useState<string | null>(null);
  const [resourceSidebarCollapsed, setResourceSidebarCollapsed] = useState(false);
  const [stepsSidebarCollapsed, setStepsSidebarCollapsed] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [lastGeneratedSignature, setLastGeneratedSignature] = useState<string | null>(null);
  const [isGeneratedCodeStale, setIsGeneratedCodeStale] = useState(false);
  const [forceAiGeneration, setForceAiGeneration] = useState(false);
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [realValidationInputParams, setRealValidationInputParams] = useState<
    Record<string, string>
  >({});
  const didInitializeCodeSignatureRef = useRef(false);

  const [realValidationState, dispatchRealValidation] = useReducer(
    realValidationReducer,
    initialRealValidationState
  );
  const [codeGenerationState, dispatchCodeGeneration] = useReducer(
    codeGenerationReducer,
    initialCodeGenerationState
  );

  return {
    form,
    detailModalVisible,
    setDetailModalVisible,
    validateModalVisible,
    setValidateModalVisible,
    saveSubmitting,
    setSaveSubmitting,
    editingWorkflow,
    setEditingWorkflow,
    selectedWorkflow,
    setSelectedWorkflow,
    validationResult,
    setValidationResult,
    workflowDsl,
    setWorkflowDsl,
    activityDsl,
    setActivityDsl,
    selectActivityModalVisible,
    setSelectActivityModalVisible,
    selectingStepIndex,
    setSelectingStepIndex,
    selectedStepIndexForConfig,
    setSelectedStepIndexForConfig,
    stepConfigActiveKeys,
    setStepConfigActiveKeys,
    httpAiOptimizePrompts,
    setHttpAiOptimizePrompts,
    httpAiPreviewResponses,
    setHttpAiPreviewResponses,
    httpAiSuggestedConfigs,
    setHttpAiSuggestedConfigs,
    httpAiSuggestedJsonDrafts,
    setHttpAiSuggestedJsonDrafts,
    httpAiExplanations,
    setHttpAiExplanations,
    httpAiErrors,
    setHttpAiErrors,
    httpAiApplySummaries,
    setHttpAiApplySummaries,
    httpAiSelectedLeafPaths,
    setHttpAiSelectedLeafPaths,
    httpAiLeafAliases,
    setHttpAiLeafAliases,
    activeHttpAiStepId,
    setActiveHttpAiStepId,
    resourceSidebarCollapsed,
    setResourceSidebarCollapsed,
    stepsSidebarCollapsed,
    setStepsSidebarCollapsed,
    generatedCode,
    setGeneratedCode,
    lastGeneratedSignature,
    setLastGeneratedSignature,
    isGeneratedCodeStale,
    setIsGeneratedCodeStale,
    forceAiGeneration,
    setForceAiGeneration,
    codeModalVisible,
    setCodeModalVisible,
    realValidationInputParams,
    setRealValidationInputParams,
    didInitializeCodeSignatureRef,
    realValidationState,
    dispatchRealValidation,
    codeGenerationState,
    dispatchCodeGeneration,
  };
};
