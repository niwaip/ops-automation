import type { BrowserCommand } from '../../intent';
import type {
  BrowserExecuteResponse,
  RecorderDebugObservation,
  RecorderGroundedTarget,
  RecorderGrounding,
  RecorderIntent,
  RecorderObservedNode,
  RecorderObservationDiff,
  RecorderVerification,
  RecorderVerificationCheck,
  RecorderVerifierType,
} from '../recorder-debug.types';

type RecorderDebugStatus = 'executed' | 'answer' | 'question' | 'completed';

export interface RecorderVerificationContext {
  kind: 'action' | 'answer' | 'question';
  status: RecorderDebugStatus;
  intent: RecorderIntent;
  commands: BrowserCommand[];
  execution?: BrowserExecuteResponse;
  beforeObservation?: RecorderDebugObservation;
  observation?: RecorderDebugObservation;
  diff?: RecorderObservationDiff;
  grounding?: RecorderGrounding;
}

export function buildRecorderVerification(
  input: RecorderVerificationContext
): RecorderVerification {
  const routed = routeVerifier(input.intent, input.commands, input.kind);
  const checks = buildChecks(routed.verifier, input);
  const confidence = calculateConfidence(checks);
  const hasRequiredFailure = checks.some((check) => check.required && check.passed === false);
  const { success, level } = resolveVerificationSuccess(input.kind, input.status, checks);

  return {
    verifier: routed.verifier,
    routeReason: routed.routeReason,
    level,
    success,
    confidence: hasRequiredFailure ? Math.min(confidence, 0.49) : confidence,
    checks,
    ...(resolveFailureReason(checks, success)
      ? { failureReason: resolveFailureReason(checks, success) }
      : {}),
  };
}

function routeVerifier(
  intent: RecorderIntent,
  commands: BrowserCommand[],
  kind: 'action' | 'answer' | 'question'
): { verifier: RecorderVerifierType; routeReason: RecorderVerification['routeReason'] } {
  if (kind !== 'action') {
    return { verifier: 'observation-answer', routeReason: 'fallback' };
  }
  if (intent.actionType === 'navigate') {
    return { verifier: 'navigate', routeReason: 'actionType' };
  }
  if (intent.actionType === 'fill') {
    return { verifier: 'fill', routeReason: 'actionType' };
  }
  if (shouldUseDetailOpenVerifier(intent, commands)) {
    return { verifier: 'detail-open', routeReason: 'goal-pattern' };
  }
  if (intent.actionType === 'select') {
    return { verifier: 'select', routeReason: 'goal-pattern' };
  }
  if (commands[0]?.tool === 'click') {
    return { verifier: 'click', routeReason: 'command-family' };
  }
  return { verifier: 'observation-answer', routeReason: 'fallback' };
}

function buildChecks(
  verifier: RecorderVerifierType,
  input: RecorderVerificationContext
): RecorderVerificationCheck[] {
  const changed = Boolean(
    input.diff?.urlChanged ||
      input.diff?.titleChanged ||
      input.diff?.interactiveNodeChanges?.length ||
      input.diff?.regionChanges?.length ||
      input.diff?.salientTextChanges?.length
  );
  const targetVisible = input.grounding?.chosenTarget
    ? isGroundedTargetVisible(
        input.grounding.chosenTarget,
        input.beforeObservation,
        input.observation
      )
    : undefined;
  const inputWriteState = evaluateRequestedValueWrite(input);
  const targetSelectedState = evaluateTargetSelection(input);
  const detailChanged = didDetailViewChange(input.diff);
  const checks: RecorderVerificationCheck[] = [
    {
      code: 'tool_command_succeeded',
      level: 'tool',
      passed: Boolean(input.execution?.success),
      message: input.execution?.success ? '浏览器命令执行成功。' : '浏览器命令未成功执行。',
      required: true,
      weight: 3,
      evidencePath: 'evidence.toolExecution.success',
    },
  ];

  if (verifier === 'navigate') {
    checks.push({
      code: 'url_changed',
      level: 'page',
      passed: Boolean(input.diff?.urlChanged || input.diff?.titleChanged),
      message: input.diff?.urlChanged ? '页面 URL 已变化。' : '页面 URL 未变化或变化不明确。',
      required: true,
      weight: 3,
      evidencePath: 'evidence.diff.urlChanged',
    });
    return checks;
  }

  if (verifier === 'fill') {
    checks.push({
      code: 'target_visible',
      level: 'page',
      passed: typeof targetVisible === 'boolean' ? targetVisible : 'unknown',
      message: targetVisible ? '输入目标仍可见。' : '输入目标可见性不明确。',
      weight: 1,
      evidencePath: 'grounding.chosenTarget',
    });
    checks.push({
      code: 'input_value_written',
      level: 'page',
      passed: inputWriteState,
      message:
        inputWriteState === true
          ? '已在目标输入框中观察到请求值。'
          : inputWriteState === false
            ? '请求值出现在非目标输入框，或目标输入框未写入该值。'
            : '尚未可靠观察到目标输入框的值变化。',
      required: true,
      weight: 3,
      evidencePath: 'evidence.diff.interactiveNodeChanges',
    });
    return checks;
  }

  if (verifier === 'detail-open') {
    checks.push({
      code: 'target_visible',
      level: 'page',
      passed: typeof targetVisible === 'boolean' ? targetVisible : 'unknown',
      message: targetVisible ? '详情入口在执行前后可被定位。' : '详情入口可见性不明确。',
      weight: 1,
      evidencePath: 'grounding.chosenTarget',
    });
    checks.push({
      code: 'url_changed',
      level: 'page',
      passed:
        typeof input.diff?.urlChanged === 'boolean' || typeof input.diff?.titleChanged === 'boolean'
          ? Boolean(input.diff?.urlChanged || input.diff?.titleChanged)
          : 'unknown',
      message:
        input.diff?.urlChanged || input.diff?.titleChanged
          ? '已观察到详情页路由变化。'
          : '未观察到明确的详情页路由变化。',
      weight: 2,
      evidencePath: 'evidence.diff.urlChanged',
    });
    checks.push({
      code: 'detail_panel_changed',
      level: 'page',
      passed: detailChanged ? true : input.observation ? false : 'unknown',
      message: detailChanged ? '详情区域或详情页关键信息已变化。' : '尚未观察到明确的详情区域变化。',
      required: true,
      weight: 3,
      evidencePath: 'evidence.diff',
    });
    return checks;
  }

  if (verifier === 'select') {
    checks.push({
      code: 'target_visible',
      level: 'page',
      passed: typeof targetVisible === 'boolean' ? targetVisible : 'unknown',
      message: targetVisible ? '候选目标仍可见。' : '候选目标可见性不明确。',
      weight: 1,
    });
    checks.push({
      code: 'target_selected',
      level: 'page',
      passed: targetSelectedState,
      message:
        targetSelectedState === true
          ? '观察到目标进入选中态。'
          : targetSelectedState === false
            ? '观察到其他节点变化，但目标本身未进入选中态。'
            : '尚未观察到明确的目标选中态变化。',
      required: true,
      weight: 3,
      evidencePath: 'evidence.diff.interactiveNodeChanges',
    });
    checks.push({
      code: 'detail_panel_changed',
      level: 'page',
      passed: detailChanged ? true : 'unknown',
      message: detailChanged ? '详情区域或关键信息已变化。' : '详情区域变化不明确。',
      weight: 2,
      evidencePath: 'evidence.diff.regionChanges',
    });
    return checks;
  }

  if (verifier === 'click') {
    checks.push({
      code: 'target_visible',
      level: 'page',
      passed: typeof targetVisible === 'boolean' ? targetVisible : 'unknown',
      message: targetVisible ? '点击目标可见。' : '点击目标可见性不明确。',
      weight: 1,
    });
    checks.push({
      code: 'node_state_changed',
      level: 'page',
      passed: changed ? true : input.execution?.success ? 'unknown' : false,
      message: changed ? '页面已观察到状态变化。' : '尚未观察到明确的页面变化。',
      required: true,
      weight: 2,
      evidencePath: 'evidence.diff',
    });
    return checks;
  }

  checks.push({
    code: 'intent_alignment',
    level: 'goal',
    passed: input.observation ? true : 'unknown',
    message: input.observation ? '当前回答基于最新 observation。' : '缺少最新 observation 作为回答依据。',
    weight: 2,
    evidencePath: 'evidence.after',
  });
  return checks;
}

function resolveVerificationSuccess(
  kind: 'action' | 'answer' | 'question',
  status: RecorderDebugStatus,
  checks: RecorderVerificationCheck[]
): { success: RecorderVerification['success']; level: RecorderVerification['level'] } {
  if (kind === 'question') {
    return { success: 'unknown', level: 'goal' };
  }
  if (status === 'question') {
    return { success: false, level: 'goal' };
  }

  const layers: Array<RecorderVerification['level']> = ['tool', 'page', 'goal'];
  for (const layer of layers) {
    const layerChecks = checks.filter((check) => (check.level || 'goal') === layer);
    if (layerChecks.length === 0) {
      continue;
    }
    const layerHasRequiredFailure = layerChecks.some(
      (check) => check.required && check.passed === false
    );
    const layerAllPassed = layerChecks.every((check) => check.passed === true);
    const layerHasUnknown = layerChecks.some(
      (check) => check.passed === 'unknown' || check.passed === 'partial'
    );

    if (layerHasRequiredFailure) {
      return { success: false, level: layer };
    }
    if (!layerAllPassed && layerHasUnknown) {
      return { success: 'partial', level: layer };
    }
    if (!layerAllPassed) {
      return { success: false, level: layer };
    }
  }

  return { success: true, level: 'goal' };
}

function calculateConfidence(checks: RecorderVerificationCheck[]): number {
  const totalWeight = checks.reduce((sum, check) => sum + (check.weight || 1), 0);
  if (totalWeight <= 0) {
    return 0;
  }
  const score = checks.reduce((sum, check) => {
    const weight = check.weight || 1;
    const value =
      check.passed === true ? 1 : check.passed === 'partial' ? 0.5 : check.passed === 'unknown' ? 0.25 : 0;
    return sum + value * weight;
  }, 0);
  return Number((score / totalWeight).toFixed(2));
}

function resolveFailureReason(
  checks: RecorderVerificationCheck[],
  success: RecorderVerification['success']
): string | undefined {
  if (success === true) {
    return undefined;
  }
  return checks.find((check) => check.required && check.passed === false)?.message;
}

function evaluateRequestedValueWrite(
  input: RecorderVerificationContext
): boolean | 'unknown' {
  const requestedValue = extractRequestedValue(input.commands);
  if (!requestedValue) {
    return input.execution?.success ? 'unknown' : false;
  }

  const target = input.grounding?.chosenTarget;
  const targetNodeAfter = target ? findObservedTargetNode(input.observation, target) : undefined;
  const targetChange = target ? findGroundedTargetChange(input.diff, target) : undefined;

  if (matchesRequestedValue(targetNodeAfter?.value, requestedValue)) {
    return true;
  }
  if (targetChange?.fieldsChanged.includes('value')) {
    return matchesRequestedValue(targetChange.after?.value, requestedValue);
  }
  if (didOtherNodeReceiveRequestedValue(input.diff, target, requestedValue)) {
    return false;
  }
  if (!target) {
    return didAnyNodeReceiveRequestedValue(input.diff, requestedValue)
      ? true
      : input.execution?.success
        ? 'unknown'
        : false;
  }

  return input.execution?.success ? 'unknown' : false;
}

function evaluateTargetSelection(
  input: RecorderVerificationContext
): boolean | 'unknown' {
  const target = input.grounding?.chosenTarget;
  const anySelectedChange = Boolean(
    input.diff?.interactiveNodeChanges?.some((change) => change.fieldsChanged.includes('selected'))
  );

  if (!target) {
    return anySelectedChange ? true : input.execution?.success ? 'unknown' : false;
  }

  const afterNode = findObservedTargetNode(input.observation, target);
  const beforeNode = findObservedTargetNode(input.beforeObservation, target);
  if (resolveSelectedState(afterNode) === true) {
    return true;
  }
  if (afterNode && resolveSelectedState(beforeNode) === false && resolveSelectedState(afterNode) === false) {
    return false;
  }

  const targetChange = findGroundedTargetChange(input.diff, target);
  if (targetChange?.fieldsChanged.includes('selected')) {
    return resolveSelectedState(targetChange.after) === true;
  }

  return anySelectedChange ? false : input.execution?.success ? 'unknown' : false;
}

function extractRequestedValue(commands: BrowserCommand[]): string | undefined {
  const fillCommand = commands.find((command) => command.tool === 'fill' || command.tool === 'type_text');
  const rawValue =
    typeof fillCommand?.params?.value === 'string'
      ? fillCommand.params.value
      : typeof fillCommand?.params?.text === 'string'
        ? fillCommand.params.text
        : undefined;
  return rawValue?.trim() || undefined;
}

function matchesRequestedValue(value: unknown, requestedValue: string): boolean {
  return typeof value === 'string' && value.includes(requestedValue);
}

function didAnyNodeReceiveRequestedValue(
  diff: RecorderObservationDiff | undefined,
  requestedValue: string
): boolean {
  return Boolean(
    diff?.interactiveNodeChanges?.some(
      (change) =>
        change.fieldsChanged.includes('value') && matchesRequestedValue(change.after?.value, requestedValue)
    )
  );
}

function didOtherNodeReceiveRequestedValue(
  diff: RecorderObservationDiff | undefined,
  target: RecorderGroundedTarget | undefined,
  requestedValue: string
): boolean {
  return Boolean(
    diff?.interactiveNodeChanges?.some((change) => {
      if (!change.fieldsChanged.includes('value')) {
        return false;
      }
      if (!matchesRequestedValue(change.after?.value, requestedValue)) {
        return false;
      }
      return !matchesGroundedTargetChange(change, target);
    })
  );
}

function didDetailViewChange(diff: RecorderObservationDiff | undefined): boolean {
  return Boolean(
    diff?.urlChanged || diff?.titleChanged || diff?.regionChanges?.length || diff?.salientTextChanges?.length
  );
}

function shouldUseDetailOpenVerifier(intent: RecorderIntent, commands: BrowserCommand[]): boolean {
  if (commands[0]?.tool !== 'click') {
    return false;
  }
  const detailSignals = [
    intent.userGoal,
    intent.normalizedGoal,
    commands[0]?.description,
    typeof commands[0]?.params?.target === 'string' ? commands[0].params.target : undefined,
    typeof commands[0]?.params?.text === 'string' ? commands[0].params.text : undefined,
    typeof commands[0]?.locator?.value === 'string' ? commands[0].locator.value : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');
  return isDetailOpenGoal(detailSignals);
}

function isDetailOpenGoal(value: string | undefined): boolean {
  return /(详情|詳細|detail|明细)/i.test(value || '');
}

function isGroundedTargetVisible(
  target: RecorderGroundedTarget,
  beforeObservation?: RecorderDebugObservation,
  afterObservation?: RecorderDebugObservation
): boolean {
  return hasGroundedTarget(beforeObservation, target) || hasGroundedTarget(afterObservation, target);
}

function hasGroundedTarget(
  observation: RecorderDebugObservation | undefined,
  target: RecorderGroundedTarget
): boolean {
  return Boolean(findObservedTargetNode(observation, target));
}

function findObservedTargetNode(
  observation: RecorderDebugObservation | undefined,
  target: RecorderGroundedTarget
): RecorderObservedNode | undefined {
  if (!observation) {
    return undefined;
  }
  return getObservedNodes(observation).find((node) => matchesGroundedTarget(node, target));
}

function getObservedNodes(observation: RecorderDebugObservation): RecorderObservedNode[] {
  return [
    ...(observation.interactiveState?.inputs || []),
    ...(observation.interactiveState?.buttons || []),
    ...(observation.interactiveState?.candidates || []),
  ];
}

function findGroundedTargetChange(
  diff: RecorderObservationDiff | undefined,
  target: RecorderGroundedTarget
): NonNullable<RecorderObservationDiff['interactiveNodeChanges']>[number] | undefined {
  return diff?.interactiveNodeChanges?.find((change) => matchesGroundedTargetChange(change, target));
}

function matchesGroundedTargetChange(
  change: NonNullable<RecorderObservationDiff['interactiveNodeChanges']>[number],
  target: RecorderGroundedTarget | undefined
): boolean {
  if (!target) {
    return false;
  }

  const beforeNode: Partial<RecorderObservedNode> = {
    diffKey: change.diffKey,
    ...(change.refBefore ? { ref: change.refBefore } : {}),
    ...(change.before || {}),
  };
  const afterNode: Partial<RecorderObservedNode> = {
    diffKey: change.diffKey,
    ...(change.refAfter ? { ref: change.refAfter } : {}),
    ...(change.after || {}),
  };

  return matchesGroundedTarget(beforeNode, target) || matchesGroundedTarget(afterNode, target);
}

function matchesGroundedTarget(
  node: Partial<RecorderObservedNode>,
  target: RecorderGroundedTarget
): boolean {
  if (target.ref && (node.ref === target.ref || node.diffKey === target.ref)) {
    return true;
  }
  if (target.regionId && node.regionId && target.regionId === node.regionId) {
    const targetName = normalizeValue(target.name || target.text || target.locator?.value);
    const nodeName = normalizeValue(node.name || node.text || node.contextLabel);
    if (!targetName || !nodeName) {
      return true;
    }
  }

  const needles = [target.locator?.value, target.text, target.name, target.contextLabel]
    .filter((value): value is string => Boolean(value))
    .map(normalizeValue)
    .filter(Boolean);
  if (!needles.length) {
    return false;
  }
  const haystack = [node.ref, node.diffKey, node.text, node.name, node.contextLabel]
    .filter((value): value is string => Boolean(value))
    .map(normalizeValue)
    .filter(Boolean);

  return needles.some((needle) =>
    haystack.some((value) => value === needle || value.includes(needle) || needle.includes(value))
  );
}

function resolveSelectedState(node: Partial<RecorderObservedNode> | undefined): boolean | undefined {
  if (!node) {
    return undefined;
  }
  if (typeof node.selected === 'boolean') {
    return node.selected;
  }

  const ariaSelected = node.attributes?.ariaSelected;
  if (typeof ariaSelected === 'boolean') {
    return ariaSelected;
  }
  const checked = node.attributes?.checked;
  if (typeof checked === 'boolean') {
    return checked;
  }
  const ariaPressed = node.attributes?.ariaPressed;
  if (typeof ariaPressed === 'boolean') {
    return ariaPressed;
  }
  const dataState = node.attributes?.dataState;
  if (typeof dataState === 'string') {
    const normalized = dataState.trim().toLowerCase();
    if (['selected', 'active', 'checked', 'open', 'expanded'].includes(normalized)) {
      return true;
    }
    if (['inactive', 'unselected', 'unchecked', 'closed'].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function normalizeValue(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}
