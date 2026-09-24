import axios from 'axios';
import { TemporalWorkflowActivityResolutionService } from '@ops/workflow-registry/temporal/temporal-workflow-activity-resolution.service';
import { TemporalWorkflowBrowserDraftService } from '@ops/workflow-registry/temporal/browser-bridge/temporal-workflow-browser-draft.service';
import { TemporalWorkflowCodegenService } from '@ops/workflow-registry/temporal/temporal-workflow-codegen.service';
import { ActivityCodegenService } from '@ops/workflow-registry/temporal/temporal-activity-codegen.service';
import { TemporalWorkflowService } from '@ops/workflow-registry/temporal/temporal-workflow.service';
import { TemporalWorkflowArtifactService } from '@ops/workflow-registry/workflow-template/temporal-workflow-artifact.service';
import { TemporalWorkflowConfigOrchestrationService } from '@ops/workflow-registry/workflow-template/temporal-workflow-config-orchestration.service';
import { TemporalWorkflowConfigService } from '@ops/workflow-registry/workflow-template/temporal-workflow-config.service';
import { TemporalWorkflowDraftOrchestrationService } from '@ops/workflow-registry/workflow-template/temporal-workflow-draft-orchestration.service';
import { TemporalWorkflowManagementService } from '@ops/workflow-registry/workflow-template/temporal-workflow-management.service';
import { TemporalWorkflowSessionOrchestrationService } from '@ops/workflow-registry/workflow-template/temporal-workflow-session-orchestration.service';
import { TemporalWorkflowSessionSupportFactoryService } from '@ops/workflow-registry/workflow-template/temporal-workflow-session-support-factory.service';
import { TemporalWorkflowTemplateService } from '@ops/workflow-registry/workflow-template/temporal-workflow-template.service';
import { buildDeterministicWorkflowCodeForWorkflow } from '@ops/workflow-registry/temporal/temporal-workflow-deterministic-builder';
import { TemporalWorkflowAiDraftService } from '@ops/workflow-registry/temporal/temporal-workflow-draft.service';
import {
  buildGenericAiDraftSampleValue,
  inferWorkflowInputParamType,
  normalizeAiDraftStepInput,
  normalizeDraftInputParams,
} from '@ops/workflow-registry/temporal/temporal-workflow-draft.normalizers';
import { repairCommonDraftPlanIssues } from '@ops/workflow-registry/temporal/temporal-workflow-draft-plan.helpers';
import { TemporalWorkflowNormalizationService } from '@ops/workflow-registry/temporal/temporal-workflow-normalization.service';
import { pickFirstNonEmptyString } from '@ops/workflow-registry/temporal/temporal-workflow-json.utils';
import { TemporalWorkflowSessionService } from '@ops/workflow-registry/temporal/temporal-workflow-session.service';
import { TemporalWorkflowSupportService } from '@ops/workflow-registry/temporal/temporal-workflow-support.service';
import {
  buildTemplateWorkflowParamSeeds,
  normalizeWorkflowInputParamType,
  normalizeWorkflowInputRenderPath,
} from '@ops/workflow-registry/temporal/temporal-workflow-template.helpers';
import { TemporalWorkflowValidationFacadeService } from '@ops/workflow-registry/temporal/temporal-workflow-validation-facade.service';
import { TemporalWorkflowValidationService } from '@ops/workflow-registry/temporal/temporal-workflow-validation.service';
import { TemporalWorkflowArtifactValidationService } from '@ops/workflow-registry/validation/temporal-workflow-artifact-validation.service';
import { TemporalWorkflowValidationContractService } from '@ops/workflow-registry/validation/temporal-workflow-validation-contract.service';
import { TemporalWorkflowDslValidationService } from '@ops/workflow-registry/validation/temporal-workflow-dsl-validation.service';
import { TemporalWorkflowCodegenOrchestrationService } from '@ops/workflow-registry/codegen/temporal-workflow-codegen-orchestration.service';
import { BuiltinActivityRegistry } from '@ops/workflow-registry/temporal/builtin-activity.registry';
import { WorkflowSkeletonCompiler } from '@ops/workflow-registry/temporal/workflow-skeleton-compiler';

import { createService } from './temporal-workflow-codegen.test-helper';
jest.mock('axios');

describe('TemporalWorkflowCodegenService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Gate 1 AST static analysis (§10.2)', () => {
    const ENVELOPE_CLASS = `
from temporalio import workflow
from temporalio.exceptions import ApplicationError

@workflow.defn(name="Gate1Workflow")
class Gate1Workflow:
    @classmethod
    def _build_workflow_result(cls, raw_result):
        return {
            "execution": {"status": "success"},
            "trigger": {"type": "manual"},
            "result": {"resultType": "generic", "title": "ok", "summary": "ok", "businessData": raw_result},
            "artifacts": [],
            "presentation": {"preferAiSummary": True, "preferStructuredView": False, "summaryFormat": "plain_text", "detailFormat": "plain_text"},
        }
`;

    const gate1 = (code: string, workflowDsl?: any) => {
      const { codegenService } = createService();
      return (codegenService as any).validateGeneratedPythonCodeGate1(code, workflowDsl);
    };

    it('passes valid envelope-based workflow code', () => {
      const result = gate1(
        `${ENVELOPE_CLASS}
    async def run(self, params: dict):
        return self._build_workflow_result({"value": 1})
`
      );
      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('rejects workflow.unsafe in workflow code (AST is authoritative, not regex)', () => {
      const result = gate1(
        `${ENVELOPE_CLASS}
    async def run(self, params: dict):
        if workflow.unsafe.is_replaying():
            return self._build_workflow_result({"value": 1})
        return self._build_workflow_result({"value": 2})
`
      );
      expect(result.success).toBe(false);
      expect(result.violations.some((v: any) => v.code === 'WORKFLOW_UNSAFE')).toBe(true);
    });

    it('rejects network calls in workflow code but allows them inside @activity.defn', () => {
      const networkInRun = gate1(
        `${ENVELOPE_CLASS}
    async def run(self, params: dict):
        response = requests.get("https://example.com")
        return self._build_workflow_result(response.json())
`
      );
      expect(networkInRun.success).toBe(false);
      expect(networkInRun.violations.some((v: any) => v.code === 'WORKFLOW_NETWORK')).toBe(true);

      const networkInActivity = gate1(`
import requests

from temporalio import activity, workflow
from temporalio.exceptions import ApplicationError

@activity.defn(name="fetchActivity")
async def fetch_activity(input_data: dict) -> dict:
    response = requests.get("https://example.com", timeout=10)
    return response.json()

${ENVELOPE_CLASS}
    async def run(self, params: dict):
        result = await workflow.execute_activity(fetch_activity, params, start_to_close_timeout=timedelta(seconds=30))
        return self._build_workflow_result(result)
`);
      expect(networkInActivity.success).toBe(true);
    });

    it('rejects system time and random usage in workflow code', () => {
      const timeInRun = gate1(
        `${ENVELOPE_CLASS}
    async def run(self, params: dict):
        time.sleep(1)
        return self._build_workflow_result({"value": random.randint(1, 10)})
`
      );
      expect(timeInRun.success).toBe(false);
      const codes = timeInRun.violations.map((v: any) => v.code);
      expect(codes).toContain('WORKFLOW_NON_DETERMINISTIC');
    });

    it('rejects file system access in workflow code', () => {
      const result = gate1(
        `${ENVELOPE_CLASS}
    async def run(self, params: dict):
        with open("/tmp/out.txt", "w") as f:
            f.write("x")
        return self._build_workflow_result({"value": 1})
`
      );
      expect(result.success).toBe(false);
      expect(result.violations.some((v: any) => v.code === 'WORKFLOW_FILE_IO')).toBe(true);
    });

    it('rejects imports outside the whitelist', () => {
      const result = gate1(`
import flask

${ENVELOPE_CLASS}
    async def run(self, params: dict):
        return self._build_workflow_result({"value": 1})
`);
      expect(result.success).toBe(false);
      expect(result.violations.some((v: any) => v.code === 'IMPORT_BANNED')).toBe(true);
    });

    it('rejects run() that does not return through Result Builder or envelope', () => {
      const result = gate1(`
${ENVELOPE_CLASS}
    async def run(self, params: dict):
        return {"summary": "done"}
`);
      expect(result.success).toBe(false);
      expect(result.violations.some((v: any) => v.code === 'RETURN_NOT_ENVELOPE')).toBe(true);
    });

    it('rejects invalid Python syntax with SYNTAX_ERROR', () => {
      const result = gate1(`
${ENVELOPE_CLASS}
    async def run(self, params: dict):
        broken =
`);
      expect(result.success).toBe(false);
      expect(result.violations.some((v: any) => v.code === 'SYNTAX_ERROR')).toBe(true);
    });

    it('enforces v2Output required fields are mapped in the Result Builder', () => {
      const dsl = {
        v2Output: {
          fields: {
            temp: {
              type: 'number',
              required: true,
              source: { step: 'step_1', path: '$.temperature' },
            },
          },
        },
      };
      const missingMapping = gate1(
        `${ENVELOPE_CLASS}
    async def run(self, params: dict):
        return self._build_workflow_result({"value": 1})
`,
        dsl
      );
      expect(missingMapping.success).toBe(false);
      expect(missingMapping.violations.some((v: any) => v.code === 'MISSING_V2_OUTPUT_FIELD')).toBe(
        true
      );

      const mapped = gate1(
        `
from temporalio import workflow
from temporalio.exceptions import ApplicationError

@workflow.defn(name="V2Workflow")
class V2Workflow:
    @classmethod
    def _build_workflow_result(cls, step_results):
        business_data = {"temp": step_results.get("step_1", {}).get("temperature")}
        return {
            "execution": {"status": "success"},
            "trigger": {"type": "manual"},
            "result": {"resultType": "generic", "title": "ok", "summary": "ok", "businessData": business_data},
            "artifacts": [],
            "presentation": {"preferAiSummary": True, "preferStructuredView": False, "summaryFormat": "plain_text", "detailFormat": "plain_text"},
        }

    async def run(self, params: dict):
        return self._build_workflow_result({})
`,
        dsl
      );
      expect(mapped.success).toBe(true);
    });

    it('repair context maps error codes to actionable guidance', () => {
      const { codegenService } = createService();
      const context = (codegenService as any).buildAstGate1RepairContext([
        { line: 5, code: 'WORKFLOW_NETWORK', message: "Workflow 代码禁止使用 'requests.post'" },
        {
          line: 9,
          code: 'WORKFLOW_NON_DETERMINISTIC',
          message: 'Workflow 代码禁止使用 time.sleep',
        },
      ]);
      expect(context).toContain('Gate 1 静态分析');
      expect(context).toContain('requests.post');
      expect(context).toContain('time.sleep');
      expect(context).toContain('封装在 @activity.defn 装饰的 Activity 函数中');
    });
  });

  describe('WorkflowSkeletonCompiler', () => {
    it('compiles multi-step custom activity workflow deterministically when activity generatedCode is present', () => {
      const { workflowConfigService, workflowNormalizationService } = createService();
      const builtinActivityRegistry = new BuiltinActivityRegistry();
      const compiler = new WorkflowSkeletonCompiler(
        builtinActivityRegistry,
        workflowConfigService,
        workflowNormalizationService
      );

      const workflowDsl = {
        name: 'WebSearchSummaryWorkflow',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          query: { required: true, defaultValue: '' },
          topic: { required: false, defaultValue: 'general' },
        },
        steps: [
          {
            id: 'search_step',
            type: 'activity',
            activityName: 'webSearch',
            input: { query: '{query}', topic: '{topic}' },
            startToCloseTimeout: '5m',
          },
          {
            id: 'summary_step',
            type: 'activity',
            activityName: 'summarize',
            input: {
              content: '{{search_step.searchResults}}',
              context: '{{search_step.responseMetadata}}',
            },
            startToCloseTimeout: '3m',
          },
        ],
        v2Output: {
          fields: {
            searchResults: {
              required: true,
              source: { step: 'search_step', path: 'searchResults' },
            },
            responseMetadata: {
              required: true,
              source: { step: 'search_step', path: 'responseMetadata' },
            },
            summary: { required: false, source: { step: 'summary_step', path: 'result' } },
          },
        },
      };

      const activityDsl = {
        activities: [
          {
            name: 'webSearch',
            fn: 'webSearch',
            timeout: '5m',
            handler: 'api' as const,
            config: {},
            generatedCode: `from temporalio import activity\n@activity.defn(name="webSearch")\nasync def webSearch(input_data: dict) -> dict:\n    return {"status": "success", "searchResults": [], "responseMetadata": {}}`,
          },
          {
            name: 'summarize',
            fn: 'summarize',
            timeout: '3m',
            handler: 'api' as const,
            config: {},
            generatedCode: `from temporalio import activity\n@activity.defn(name="summarize")\nasync def summarize(input_data: dict) -> dict:\n    return {"status": "success", "result": "Summary ok"}`,
          },
        ],
      };

      const result = compiler.compile(workflowDsl as any, activityDsl as any);
      expect(result.success).toBe(true);
      expect(result.code).toContain('class WebSearchSummaryWorkflowWorkflow:');
      expect(result.code).toContain('_assert_required_path');
      expect(result.code).toContain('searchResults');
      expect(result.code).toContain('responseMetadata');
    });

    it('resolves $result and $.result paths correctly in v2Output and step input templates', () => {
      const { workflowConfigService, workflowNormalizationService } = createService();
      const builtinActivityRegistry = new BuiltinActivityRegistry();
      const compiler = new WorkflowSkeletonCompiler(
        builtinActivityRegistry,
        workflowConfigService,
        workflowNormalizationService
      );

      const workflowDsl = {
        name: 'ResultPathWorkflow',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {},
        steps: [
          {
            id: 'step_1',
            type: 'activity',
            activityName: 'fetchData',
            input: {},
            startToCloseTimeout: '1m',
          },
          {
            id: 'step_2',
            type: 'activity',
            activityName: 'processData',
            input: { content: '{$result}' },
            startToCloseTimeout: '1m',
          },
        ],
        v2Output: {
          fields: {
            data: { required: true, source: { step: 'step_1', path: '$.result' } },
            finalResult: { required: true, source: { step: 'step_2', path: '$result' } },
          },
        },
      };

      const activityDsl = {
        activities: [
          {
            name: 'fetchData',
            fn: 'fetchData',
            timeout: '1m',
            handler: 'api' as const,
            config: {},
            generatedCode: `from temporalio import activity\n@activity.defn(name="fetchData")\nasync def fetchData(input_data: dict) -> dict:\n    return {"status": "success", "data": "hello"}`,
          },
          {
            name: 'processData',
            fn: 'processData',
            timeout: '1m',
            handler: 'api' as const,
            config: {},
            generatedCode: `from temporalio import activity\n@activity.defn(name="processData")\nasync def processData(input_data: dict) -> dict:\n    return {"status": "success", "result": "processed"}`,
          },
        ],
      };

      const result = compiler.compile(workflowDsl as any, activityDsl as any);
      expect(result.success).toBe(true);
      expect(result.code).toContain('cls._extract_v2_path');
    });
  });
});
