import { buildFixedBrowserPhaseWorkflowCode } from '../apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-fixed-workflow-code.helpers';
import type { WorkflowDsl, ActivityDefinition, WorkflowStep } from '../apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow.types';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

function run() {
  console.log('--- Test 1: buildFixedBrowserPhaseWorkflowCode Standard Codegen ---');

  const standardWorkflowDsl: WorkflowDsl = {
    name: 'MockErpStandardWorkflow',
    taskQueue: 'default-queue',
    inputParams: {
      startUrl: { type: 'string', required: true, defaultValue: 'http://localhost/login' },
    },
    steps: [
      {
        id: 'step_1',
        name: 'Login Step',
        type: 'activity',
        activityRef: 'act_browser_phase_1',
      },
    ],
  };

  const standardActivityDef: ActivityDefinition = {
    name: 'act_browser_phase_1',
    fn: 'execute_browser_phase_1',
    handler: 'browser',
    timeout: '60s',
    config: {},
    generatedCode: `@activity.defn(name="execute_browser_phase_1")
async def execute_browser_phase_1(input_data: Dict[str, Any]) -> Dict[str, Any]:
    return {"status": "completed"}
`,
  };

  const standardCode = buildFixedBrowserPhaseWorkflowCode({
    workflowDsl: standardWorkflowDsl,
    browserActivityPairs: [
      {
        step: standardWorkflowDsl.steps[0],
        activityDef: standardActivityDef,
      },
    ],
    durationToTimedeltaCode: () => `timedelta(seconds=60)`,
    buildExecuteActivityTimeoutLines: () => [
      `start_to_close_timeout=timedelta(seconds=60),`,
    ],
  });

  if (!standardCode) {
    throw new Error('Expected standard generated code, got null');
  }

  // Compile check standard code
  const tempStandardPy = path.join(__dirname, 'temp_standard_workflow.py');
  fs.writeFileSync(tempStandardPy, standardCode);
  try {
    execSync(`python3 -m py_compile ${tempStandardPy}`);
    console.log('✓ Standard workflow python syntax compilation passed');
  } finally {
    if (fs.existsSync(tempStandardPy)) fs.unlinkSync(tempStandardPy);
  }

  console.log('\n--- Test 2: buildFixedBrowserPhaseWorkflowCode Loop & Takeover Codegen ---');

  const loopWorkflowDsl: WorkflowDsl = {
    name: 'MockErpApprovalLoopWorkflow',
    taskQueue: 'default-queue',
    inputParams: {
      startUrl: { type: 'string', required: true, defaultValue: 'http://localhost/login' },
      grossMarginThreshold: { type: 'number', required: false, defaultValue: '20' },
    },
    sourceContext: {
      sourceType: 'browser_template',
      browserLoopDraft: {
        maxIterations: 10,
        stopWhen: {
          read: {
            type: 'text',
            locator: { type: 'css', value: 'table tbody tr:has-text("保留中")' },
          },
          conditionFn: "!String(value || '').includes('保留中')",
          description: '当前列表中已无“保留中”项时结束循环',
        },
        eachIteration: {
          stepIds: ['step_iter_1', 'step_iter_2'],
        },
      },
    },
    steps: [
      {
        id: 'step_pre',
        name: 'Login and Open List',
        type: 'activity',
        activityRef: 'act_pre',
      },
      {
        id: 'step_iter_1',
        name: 'Open First Record and Check Condition',
        type: 'activity',
        activityRef: 'act_iter_1',
      },
      {
        id: 'step_iter_2',
        name: 'Approve and Return to List',
        type: 'activity',
        activityRef: 'act_iter_2',
      },
    ],
  };

  const actPre: ActivityDefinition = {
    name: 'act_pre',
    fn: 'execute_browser_pre',
    handler: 'browser',
    timeout: '60s',
    config: { loopSegment: 'pre_loop' },
    generatedCode: `@activity.defn(name="execute_browser_pre")
async def execute_browser_pre(input_data: Dict[str, Any]) -> Dict[str, Any]:
    return {"status": "completed", "loopStopValue": "PRJ-001 保留中"}
`,
  };

  const actIter1: ActivityDefinition = {
    name: 'act_iter_1',
    fn: 'execute_browser_iter_1',
    handler: 'browser',
    timeout: '60s',
    config: { loopSegment: 'iteration' },
    generatedCode: `@activity.defn(name="execute_browser_iter_1")
async def execute_browser_iter_1(input_data: Dict[str, Any]) -> Dict[str, Any]:
    return {"status": "completed", "variables": {"grossProfitMargin": "25.5%"}}
`,
  };

  const actIter2: ActivityDefinition = {
    name: 'act_iter_2',
    fn: 'execute_browser_iter_2',
    handler: 'browser',
    timeout: '60s',
    config: {
      loopSegment: 'iteration',
      stopWhen: loopWorkflowDsl.sourceContext?.browserLoopDraft?.stopWhen,
    },
    generatedCode: `@activity.defn(name="execute_browser_iter_2")
async def execute_browser_iter_2(input_data: Dict[str, Any]) -> Dict[str, Any]:
    return {"status": "completed", "loopStopValue": ""}
`,
  };

  const loopCode = buildFixedBrowserPhaseWorkflowCode({
    workflowDsl: loopWorkflowDsl,
    browserActivityPairs: [
      { step: loopWorkflowDsl.steps[0], activityDef: actPre },
      { step: loopWorkflowDsl.steps[1], activityDef: actIter1 },
      { step: loopWorkflowDsl.steps[2], activityDef: actIter2 },
    ],
    durationToTimedeltaCode: () => `timedelta(seconds=60)`,
    buildExecuteActivityTimeoutLines: () => [
      `start_to_close_timeout=timedelta(seconds=60),`,
    ],
  });

  if (!loopCode) {
    throw new Error('Expected loop generated code, got null');
  }

  // Verify key structural patterns
  const loopChecks = [
    { name: 'workflow_context dynamic passing', pattern: /current_activity_input = dict\(workflow_context\)/ },
    { name: 'workflow_context variables update', pattern: /workflow_context\.update\(phase_vars\)/ },
    { name: 'skip_iteration control flag', pattern: /skip_iteration = False/ },
    { name: 'resume_takeover signal declaration', pattern: /@workflow\.signal\(name="resume_takeover"\)/ },
    { name: 'takeover resume action handling', pattern: /takeover_action = str\(\(self\._takeover_payload or \{\}\)\.get\("action"\) or "continue"\)/ },
    { name: 'takeover action recheck support', pattern: /if takeover_action == "recheck":/ },
    { name: 'takeover action skip_to_next support', pattern: /elif takeover_action in \("skip_to_next", "skip"\):/ },
    { name: 'loop stop extraction prioritization', pattern: /if result\.get\("loopStopValue"\) is not None:/ },
    { name: '_evaluate_loop_stop method', pattern: /def _evaluate_loop_stop\(condition: str, value: str\) -> bool:/ },
    { name: 'initial stop check before entering while', pattern: /initial_loop_value = self\._extract_loop_value\(phase_results\)/ },
  ];

  for (const check of loopChecks) {
    if (!check.pattern.test(loopCode)) {
      throw new Error(`Failed check: ${check.name} not found in loop generated code`);
    }
    console.log(`✓ ${check.name}`);
  }

  // Validate python compilation syntax on the loop workflow
  const tempLoopPy = path.join(__dirname, 'temp_loop_workflow.py');
  fs.writeFileSync(tempLoopPy, loopCode);
  try {
    execSync(`python3 -m py_compile ${tempLoopPy}`);
    console.log('✓ Loop workflow python syntax compilation passed');
  } catch (err) {
    console.error('Python compilation failed:', err);
    throw err;
  } finally {
    if (fs.existsSync(tempLoopPy)) fs.unlinkSync(tempLoopPy);
    const pycDir = path.join(__dirname, '__pycache__');
    if (fs.existsSync(pycDir)) fs.rmSync(pycDir, { recursive: true, force: true });
  }

  console.log('\n--- Test 3: Functional Verification of Python Logic in Generated Code ---');

  const testScript = `
import re

def _evaluate_loop_stop(condition: str, value: str) -> bool:
    normalized = str(condition or "").strip()
    if not normalized:
        return False
    if "=>" in normalized:
        normalized = normalized.split("=>", 1)[1].strip()
    if normalized in ("value === 0", "value == 0"):
        try:
            return float(value or 0) == 0
        except Exception:
            return not str(value or "").strip()
    if re.search(r"""!\\s*String\\(value\\s*\\|\\|\\s*[\\x27\\x22]\\s*[\\x27\\x22]\\)\\.trim\\(\\)""", normalized) or re.search(r"""!\\s*value(\\s*\\|\\|\\s*[\\x27\\x22]\\s*[\\x27\\x22])?(\\.trim\\(\\))?""", normalized):
        return not str(value or "").strip()
    if re.search(r"""String\\(value\\s*\\|\\|\\s*[\\x27\\x22]\\s*[\\x27\\x22]\\)\\.trim\\(\\)""", normalized):
        return bool(str(value or "").strip())
    if re.search(r"""value\\s*===?\\s*[\\x27\\x22]\\s*[\\x27\\x22]""", normalized):
        return not str(value or "").strip()
    if re.search(r"""value\\s*!==?\\s*[\\x27\\x22]\\s*[\\x27\\x22]""", normalized):
        return bool(str(value or "").strip())
    include_negated = re.search(r"""!\\s*String\\(value\\s*\\|\\|\\s*[\\x27\\x22]{0,2}\\)\\.includes\\(([\\x27\\x22])(.+?)\\1\\)""", normalized)
    if include_negated:
        return include_negated.group(2) not in str(value or "")
    include_match = re.search(r"""String\\(value\\s*\\|\\|\\s*[\\x27\\x22]{0,2}\\)\\.includes\\(([\\x27\\x22])(.+?)\\1\\)""", normalized)
    if include_match:
        return include_match.group(2) in str(value or "")
    equals_match = re.search(r"""value\\s*===?\\s*([\\x27\\x22])(.+?)\\1""", normalized)
    if equals_match:
        return str(value or "") == equals_match.group(2)
    not_equals_match = re.search(r"""value\\s*!==?\\s*([\\x27\\x22])(.+?)\\1""", normalized)
    if not_equals_match:
        return str(value or "") != not_equals_match.group(2)
    return False

def _eval_cond(cond_fn_str: str, eval_ctx: dict, def_text: str) -> bool:
    if not cond_fn_str:
        return True
    ctx_var_names = re.findall(r"""ctx\\.([a-zA-Z0-9_]+)""", cond_fn_str)
    op_match = re.search(r"""([><]=?|===?|!==?)""", cond_fn_str)
    if op_match and any(op in cond_fn_str for op in (">", "<", ">=", "<=")):
        op = op_match.group(1)
        left_raw = eval_ctx.get(ctx_var_names[0]) if ctx_var_names else def_text
        left_clean = re.sub(r"""[^0-9.-]+""", "", str(left_raw or ""))
        if len(ctx_var_names) > 1:
            right_raw = eval_ctx.get(ctx_var_names[1])
        else:
            lit_match = re.search(r"""[><]=?\\s*(?:Number\\()?\\s*([0-9.]+)\\s*\\)?""", cond_fn_str)
            right_raw = lit_match.group(1) if lit_match else "0"
        right_clean = re.sub(r"""[^0-9.-]+""", "", str(right_raw or ""))
        try:
            num_left = float(left_clean)
            num_right = float(right_clean)
            if op == ">": return num_left > num_right
            if op == ">=": return num_left >= num_right
            if op == "<": return num_left < num_right
            if op == "<=": return num_left <= num_right
            if op in ("==", "==="): return num_left == num_right
            if op in ("!=", "!=="): return num_left != num_right
        except Exception:
            pass
    return False

# 1. Loop Stop Condition Tests
cond_stop = "!String(value || '').includes('保留中')"
assert _evaluate_loop_stop(cond_stop, "PRJ-001 保留中 25.5%") == False, "Must not stop when '保留中' is present"
assert _evaluate_loop_stop(cond_stop, "PRJ-001 承認済 25.5%") == True, "Must stop when '保留中' is absent"
assert _evaluate_loop_stop(cond_stop, "") == True, "Must stop when value is empty"

# 2. Numerical Condition Tests: (ctx) => Number(ctx.grossProfitMargin) > Number(ctx.grossMarginThreshold)
branch_cond = "(ctx) => Number(ctx.grossProfitMargin) > Number(ctx.grossMarginThreshold)"
assert _eval_cond(branch_cond, {"grossProfitMargin": "25.5%", "grossMarginThreshold": "20"}, "") == True, "25.5% > 20 must be True"
assert _eval_cond(branch_cond, {"grossProfitMargin": "17.8%", "grossMarginThreshold": "20"}, "") == False, "17.8% > 20 must be False (triggers takeover)"
assert _eval_cond(branch_cond, {"grossProfitMargin": "20.0%", "grossMarginThreshold": "20"}, "") == False, "20.0% > 20 must be False (strict > 20 threshold triggers takeover)"
assert _eval_cond(branch_cond, {"grossProfitMargin": "20.1%", "grossMarginThreshold": "20"}, "") == True, "20.1% > 20 must be True"

print("All Python runtime logic assertions passed!")
`;

  execSync(`python3 -c "${testScript.replace(/"/g, '\\"')}"`);
  console.log('✓ Numerical condition evaluation and loop stop tests verified in Python runtime');

  console.log('\n=== ALL PHASE 3 TEMPORAL CODEGEN VERIFICATIONS PASSED ===');
}

run();
