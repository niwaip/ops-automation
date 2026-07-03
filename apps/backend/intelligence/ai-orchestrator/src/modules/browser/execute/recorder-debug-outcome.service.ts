import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { BrowserCommand } from '../intent';
import type {
  BrowserExecuteResponse,
  RecorderArtifacts,
  RecorderBrowserExecutionSummary,
  RecorderDebugObservation,
  RecorderEvidence,
  RecorderGroundedTarget,
  RecorderGrounding,
  RecorderIntent,
  RecorderObservedNode,
  RecorderObservationDiff,
  RecorderOutcome,
  RecorderOutcomeKind,
  RecorderOutcomeStatus,
  RecorderSummary,
  RecorderVerification,
  RecorderVerificationCheck,
  RecorderVerifierType,
} from './recorder-debug.types';

type RecorderDebugStatus = 'executed' | 'answer' | 'question' | 'completed';

@Injectable()
export class RecorderDebugOutcomeService {
  buildOutcome(input: {
    status: RecorderDebugStatus;
    reply: string;
    userGoal?: string;
    beforeObservation?: RecorderDebugObservation;
    observation?: RecorderDebugObservation;
    commands?: BrowserCommand[];
    execution?: BrowserExecuteResponse;
  }): RecorderOutcome {
    const kind = this.resolveOutcomeKind(input.status);
    const intent = this.buildIntent(input.userGoal, input.commands, kind);
    const diff = this.buildObservationDiff(input.beforeObservation, input.observation);
    const grounding = this.buildGrounding(input.commands, input.beforeObservation, input.observation);
    const verification = this.buildVerification({
      kind,
      status: input.status,
      intent,
      commands: input.commands || [],
      execution: input.execution,
      beforeObservation: input.beforeObservation,
      observation: input.observation,
      diff,
      grounding,
    });
    const outcomeStatus = this.resolveOutcomeStatus(kind, input.status, verification);

    return {
      kind,
      status: outcomeStatus,
      intent,
      evidence: this.buildEvidence(
        input.beforeObservation,
        input.observation,
        diff,
        input.execution,
        input.commands || []
      ),
      ...(grounding ? { grounding } : {}),
      verification,
      summary: this.buildSummary(input.reply, verification),
      artifacts: this.buildArtifacts(input.beforeObservation, input.observation),
    };
  }

  private resolveOutcomeKind(status: RecorderDebugStatus): RecorderOutcomeKind {
    if (status === 'question') {
      return 'question';
    }
    if (status === 'answer') {
      return 'answer';
    }
    return 'action';
  }

  private buildIntent(
    userGoal: string | undefined,
    commands: BrowserCommand[] | undefined,
    kind: RecorderOutcomeKind
  ): RecorderIntent {
    const actionType = this.resolveActionType(commands, userGoal, kind);
    const firstCommand = commands?.[0];
    const targetHint =
      typeof firstCommand?.params?.target === 'string'
        ? firstCommand.params.target
        : typeof firstCommand?.params?.text === 'string'
          ? firstCommand.params.text
          : typeof firstCommand?.locator?.value === 'string'
            ? firstCommand.locator.value
            : undefined;

    return {
      userGoal: userGoal?.trim() || '浏览器调试任务',
      normalizedGoal: userGoal?.trim() || '浏览器调试任务',
      ...(actionType ? { actionType } : {}),
      ...(targetHint ? { targetHint } : {}),
    };
  }

  private resolveActionType(
    commands: BrowserCommand[] | undefined,
    userGoal: string | undefined,
    kind: RecorderOutcomeKind
  ): RecorderIntent['actionType'] {
    const firstTool = commands?.[0]?.tool;
    if (firstTool === 'navigate') {
      return 'navigate';
    }
    if (firstTool === 'fill' || firstTool === 'type_text') {
      return 'fill';
    }
    if (firstTool === 'click' || firstTool === 'hover' || firstTool === 'press_key') {
      if (this.isDetailOpenGoal(userGoal)) {
        return 'click';
      }
      if (/(选中|选择|第二条|第\d+条|切换到)/.test(userGoal || '')) {
        return 'select';
      }
      return 'click';
    }
    if (kind === 'answer') {
      return 'observe';
    }
    return undefined;
  }

  private buildEvidence(
    beforeObservation: RecorderDebugObservation | undefined,
    observation: RecorderDebugObservation | undefined,
    diff: RecorderObservationDiff | undefined,
    execution: BrowserExecuteResponse | undefined,
    commands: BrowserCommand[]
  ): RecorderEvidence {
    return {
      ...(beforeObservation ? { before: beforeObservation } : {}),
      ...(observation ? { after: observation } : {}),
      ...(diff ? { diff } : {}),
      ...(execution ? { toolExecution: this.buildToolExecutionSummary(execution, commands) } : {}),
    };
  }

  private buildToolExecutionSummary(
    execution: BrowserExecuteResponse,
    commands: BrowserCommand[]
  ): RecorderBrowserExecutionSummary {
    return {
      success: Boolean(execution.success),
      ...(execution.message ? { message: execution.message } : {}),
      commandCount: commands.length,
      executedCommandCount: execution.executedCommands?.length || 0,
      ...(execution.executedCommands?.length ? { commands: execution.executedCommands } : {}),
      ...(execution.results?.length ? { results: execution.results } : {}),
    };
  }

  private buildGrounding(
    commands: BrowserCommand[] | undefined,
    beforeObservation?: RecorderDebugObservation,
    afterObservation?: RecorderDebugObservation
  ): RecorderGrounding | undefined {
    const firstCommand = commands?.[0];
    if (!firstCommand) {
      return undefined;
    }

    const candidateTarget =
      typeof firstCommand.params?.target === 'string'
        ? firstCommand.params.target
        : typeof firstCommand.params?.text === 'string'
          ? firstCommand.params.text
          : typeof firstCommand.locator?.value === 'string'
            ? firstCommand.locator.value
            : undefined;
    if (!candidateTarget) {
      return undefined;
    }

    const observedNodes = [
      ...(beforeObservation?.interactiveState?.inputs || []),
      ...(beforeObservation?.interactiveState?.buttons || []),
      ...(afterObservation?.interactiveState?.inputs || []),
      ...(afterObservation?.interactiveState?.buttons || []),
    ];
    const chosenTarget = this.findGroundedTarget(candidateTarget, firstCommand, observedNodes);
    const grounding: RecorderGrounding = {
      ...(chosenTarget ? { chosenTarget } : {}),
      targetCandidates: chosenTarget ? [chosenTarget] : [],
      targetResolution:
        chosenTarget?.ref && chosenTarget.ref === candidateTarget
          ? 'snapshot-ref'
          : firstCommand.locator?.strategy === 'ref'
            ? 'snapshot-ref'
            : 'semantic-match',
    };

    return grounding;
  }

  private findGroundedTarget(
    candidateTarget: string,
    command: BrowserCommand,
    observedNodes: RecorderObservedNode[]
  ): RecorderGroundedTarget | undefined {
    const directRefMatch = observedNodes.find((node) => node.ref === candidateTarget);
    const semanticMatch =
      directRefMatch ||
      observedNodes.find((node) => {
        const haystack = [node.text, node.name, node.contextLabel, node.diffKey]
          .filter((item): item is string => Boolean(item))
          .join(' ')
          .toLowerCase();
        return haystack.includes(candidateTarget.toLowerCase());
      });
    if (!semanticMatch && !command.locator) {
      return undefined;
    }

    return {
      ...(semanticMatch?.ref ? { ref: semanticMatch.ref } : {}),
      ...(semanticMatch?.role ? { role: semanticMatch.role } : {}),
      ...(semanticMatch?.name ? { name: semanticMatch.name } : {}),
      ...(semanticMatch?.text ? { text: semanticMatch.text } : {}),
      ...(semanticMatch?.contextLabel ? { contextLabel: semanticMatch.contextLabel } : {}),
      ...(semanticMatch?.regionId ? { regionId: semanticMatch.regionId } : {}),
      ...(command.locator
        ? {
            locator: {
              strategy: command.locator.strategy,
              value:
                typeof command.locator.value === 'string' ? command.locator.value : candidateTarget,
            },
          }
        : {}),
      confidence: semanticMatch ? 0.9 : 0.5,
    };
  }

  private buildObservationDiff(
    beforeObservation?: RecorderDebugObservation,
    afterObservation?: RecorderDebugObservation
  ): RecorderObservationDiff | undefined {
    if (!beforeObservation || !afterObservation) {
      return undefined;
    }

    const interactiveNodeChanges = this.buildInteractiveNodeChanges(beforeObservation, afterObservation);
    const salientTextChanges = this.buildSalientTextChanges(beforeObservation, afterObservation);
    const regionChanges = this.buildRegionChanges(beforeObservation, afterObservation);
    const diff: RecorderObservationDiff = {
      urlChanged: beforeObservation.currentPageUrl !== afterObservation.currentPageUrl,
      titleChanged: beforeObservation.title !== afterObservation.title,
      ...(interactiveNodeChanges.length ? { interactiveNodeChanges } : {}),
      ...(salientTextChanges.length ? { salientTextChanges } : {}),
      ...(regionChanges.length ? { regionChanges } : {}),
    };

    return Object.values(diff).some((value) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value)
    )
      ? diff
      : undefined;
  }

  private buildInteractiveNodeChanges(
    beforeObservation: RecorderDebugObservation,
    afterObservation: RecorderDebugObservation
  ): NonNullable<RecorderObservationDiff['interactiveNodeChanges']> {
    const beforeNodes = this.indexObservedNodes(beforeObservation);
    const afterNodes = this.indexObservedNodes(afterObservation);
    const keys = new Set<string>([...beforeNodes.keys(), ...afterNodes.keys()]);

    return [...keys]
      .map((key) => {
        const beforeNode = beforeNodes.get(key);
        const afterNode = afterNodes.get(key);
        const fieldsChanged: Array<'selected' | 'disabled' | 'value' | 'visible' | 'text'> = [];
        if ((beforeNode?.selected ?? false) !== (afterNode?.selected ?? false)) {
          fieldsChanged.push('selected');
        }
        if ((beforeNode?.disabled ?? false) !== (afterNode?.disabled ?? false)) {
          fieldsChanged.push('disabled');
        }
        if ((beforeNode?.visible ?? true) !== (afterNode?.visible ?? true)) {
          fieldsChanged.push('visible');
        }
        if ((beforeNode?.value || '') !== (afterNode?.value || '')) {
          fieldsChanged.push('value');
        }
        if ((beforeNode?.text || '') !== (afterNode?.text || '')) {
          fieldsChanged.push('text');
        }
        if (!fieldsChanged.length) {
          return null;
        }
        return {
          diffKey: key,
          ...(beforeNode?.ref ? { refBefore: beforeNode.ref } : {}),
          ...(afterNode?.ref ? { refAfter: afterNode.ref } : {}),
          fieldsChanged,
          ...(beforeNode ? { before: beforeNode } : {}),
          ...(afterNode ? { after: afterNode } : {}),
        };
      })
      .filter(Boolean) as NonNullable<RecorderObservationDiff['interactiveNodeChanges']>;
  }

  private buildSalientTextChanges(
    beforeObservation: RecorderDebugObservation,
    afterObservation: RecorderDebugObservation
  ): NonNullable<RecorderObservationDiff['salientTextChanges']> {
    const keys: Array<keyof Pick<RecorderDebugObservation, 'title' | 'text'>> = ['title', 'text'];
    return keys
      .filter((key) => (beforeObservation[key] || '') !== (afterObservation[key] || ''))
      .map((key) => ({
        key,
        before: beforeObservation[key],
        after: afterObservation[key],
      }));
  }

  private buildRegionChanges(
    beforeObservation: RecorderDebugObservation,
    afterObservation: RecorderDebugObservation
  ): NonNullable<RecorderObservationDiff['regionChanges']> {
    const beforeRegions = Array.isArray(beforeObservation.regions) ? beforeObservation.regions : [];
    const afterRegions = Array.isArray(afterObservation.regions) ? afterObservation.regions : [];
    const changes: NonNullable<RecorderObservationDiff['regionChanges']> = [];

    const maxLength = Math.max(beforeRegions.length, afterRegions.length);
    for (let index = 0; index < maxLength; index += 1) {
      const beforeRegion = beforeRegions[index] || {};
      const afterRegion = afterRegions[index] || {};
      const beforeText = typeof beforeRegion.text === 'string' ? beforeRegion.text : undefined;
      const afterText = typeof afterRegion.text === 'string' ? afterRegion.text : undefined;
      if ((beforeText || '') === (afterText || '')) {
        continue;
      }
      changes.push({
        regionId: this.resolveRegionId(afterRegion, index) || this.resolveRegionId(beforeRegion, index),
        changeType: 'content',
        before: beforeText,
        after: afterText,
      });
    }

    return changes;
  }

  private buildVerification(input: {
    kind: RecorderOutcomeKind;
    status: RecorderDebugStatus;
    intent: RecorderIntent;
    commands: BrowserCommand[];
    execution?: BrowserExecuteResponse;
    beforeObservation?: RecorderDebugObservation;
    observation?: RecorderDebugObservation;
    diff?: RecorderObservationDiff;
    grounding?: RecorderGrounding;
  }): RecorderVerification {
    const routed = this.routeVerifier(input.intent, input.commands, input.kind);
    const checks = this.buildChecks(routed.verifier, input);
    const confidence = this.calculateConfidence(checks);
    const hasRequiredFailure = checks.some((check) => check.required && check.passed === false);
    const success = this.resolveVerificationSuccess(input.kind, input.status, checks, hasRequiredFailure);
    return {
      verifier: routed.verifier,
      routeReason: routed.routeReason,
      level: input.kind === 'action' ? 'goal' : 'page',
      success,
      confidence: hasRequiredFailure ? Math.min(confidence, 0.49) : confidence,
      checks,
      ...(this.resolveFailureReason(checks, success) ? { failureReason: this.resolveFailureReason(checks, success) } : {}),
    };
  }

  private routeVerifier(
    intent: RecorderIntent,
    commands: BrowserCommand[],
    kind: RecorderOutcomeKind
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
    if (this.shouldUseDetailOpenVerifier(intent, commands)) {
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

  private buildChecks(
    verifier: RecorderVerifierType,
    input: {
      kind: RecorderOutcomeKind;
      status: RecorderDebugStatus;
      intent: RecorderIntent;
      commands: BrowserCommand[];
      execution?: BrowserExecuteResponse;
      beforeObservation?: RecorderDebugObservation;
      observation?: RecorderDebugObservation;
      diff?: RecorderObservationDiff;
      grounding?: RecorderGrounding;
    }
  ): RecorderVerificationCheck[] {
    const changed = Boolean(
      input.diff?.urlChanged ||
        input.diff?.titleChanged ||
        input.diff?.interactiveNodeChanges?.length ||
        input.diff?.regionChanges?.length ||
        input.diff?.salientTextChanges?.length
    );
    const targetVisible = input.grounding?.chosenTarget
      ? this.isGroundedTargetVisible(
          input.grounding.chosenTarget,
          input.beforeObservation,
          input.observation
        )
      : undefined;
    const valueWritten = this.didWriteRequestedValue(input.commands, input.diff);
    const targetSelected = Boolean(
      input.diff?.interactiveNodeChanges?.some((change) => change.fieldsChanged.includes('selected'))
    );
    const detailChanged = this.didDetailViewChange(input.diff);
    const checks: RecorderVerificationCheck[] = [
      {
        code: 'tool_command_succeeded',
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
        passed: input.grounding?.chosenTarget ? targetVisible : 'unknown',
        message: targetVisible ? '输入目标仍可见。' : '输入目标可见性不明确。',
        weight: 1,
        evidencePath: 'grounding.chosenTarget',
      });
      checks.push({
        code: 'input_value_written',
        passed: valueWritten ? true : input.execution?.success ? 'unknown' : false,
        message: valueWritten ? '已观察到输入值变化。' : '尚未可靠观察到输入值变化。',
        required: true,
        weight: 3,
        evidencePath: 'evidence.diff.interactiveNodeChanges',
      });
      return checks;
    }

    if (verifier === 'detail-open') {
      checks.push({
        code: 'target_visible',
        passed: typeof targetVisible === 'boolean' ? targetVisible : 'unknown',
        message: targetVisible ? '详情入口在执行前后可被定位。' : '详情入口可见性不明确。',
        weight: 1,
        evidencePath: 'grounding.chosenTarget',
      });
      checks.push({
        code: 'url_changed',
        passed:
          typeof input.diff?.urlChanged === 'boolean' || typeof input.diff?.titleChanged === 'boolean'
            ? Boolean(input.diff?.urlChanged || input.diff?.titleChanged)
            : 'unknown',
        message: input.diff?.urlChanged || input.diff?.titleChanged ? '已观察到详情页路由变化。' : '未观察到明确的详情页路由变化。',
        weight: 2,
        evidencePath: 'evidence.diff.urlChanged',
      });
      checks.push({
        code: 'detail_panel_changed',
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
        passed: typeof targetVisible === 'boolean' ? targetVisible : 'unknown',
        message: targetVisible ? '候选目标仍可见。' : '候选目标可见性不明确。',
        weight: 1,
      });
      checks.push({
        code: 'target_selected',
        passed: targetSelected ? true : input.execution?.success ? 'unknown' : false,
        message: targetSelected ? '观察到目标选中态变化。' : '尚未观察到明确的选中态变化。',
        required: true,
        weight: 3,
        evidencePath: 'evidence.diff.interactiveNodeChanges',
      });
      checks.push({
        code: 'detail_panel_changed',
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
        passed: typeof targetVisible === 'boolean' ? targetVisible : 'unknown',
        message: targetVisible ? '点击目标可见。' : '点击目标可见性不明确。',
        weight: 1,
      });
      checks.push({
        code: 'node_state_changed',
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
      passed: input.observation ? true : 'unknown',
      message: input.observation ? '当前回答基于最新 observation。' : '缺少最新 observation 作为回答依据。',
      weight: 2,
      evidencePath: 'evidence.after',
    });
    return checks;
  }

  private resolveVerificationSuccess(
    kind: RecorderOutcomeKind,
    status: RecorderDebugStatus,
    checks: RecorderVerificationCheck[],
    hasRequiredFailure: boolean
  ): RecorderVerification['success'] {
    if (kind === 'question') {
      return 'unknown';
    }
    if (status === 'question') {
      return false;
    }
    if (hasRequiredFailure) {
      return false;
    }
    if (checks.every((check) => check.passed === true)) {
      return true;
    }
    if (checks.some((check) => check.passed === 'unknown' || check.passed === 'partial')) {
      return 'partial';
    }
    return true;
  }

  private calculateConfidence(checks: RecorderVerificationCheck[]): number {
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

  private resolveFailureReason(
    checks: RecorderVerificationCheck[],
    success: RecorderVerification['success']
  ): string | undefined {
    if (success === true) {
      return undefined;
    }
    return checks.find((check) => check.required && check.passed === false)?.message;
  }

  private resolveOutcomeStatus(
    kind: RecorderOutcomeKind,
    status: RecorderDebugStatus,
    verification: RecorderVerification
  ): RecorderOutcomeStatus {
    if (kind === 'question') {
      return status === 'question' ? 'blocked' : 'unknown';
    }
    if (verification.success === true) {
      return 'succeeded';
    }
    if (verification.success === 'partial') {
      return 'partial';
    }
    if (verification.success === false) {
      return status === 'executed' || status === 'completed' ? 'failed' : 'blocked';
    }
    return 'unknown';
  }

  private buildSummary(reply: string, verification: RecorderVerification): RecorderSummary {
    const compact = reply.split('\n').map((item) => item.trim()).filter(Boolean)[0] || reply.trim();
    return {
      userVisible: reply,
      compact,
      ...(verification.failureReason ? { nextHint: verification.failureReason } : {}),
    };
  }

  private buildArtifacts(
    beforeObservation?: RecorderDebugObservation,
    afterObservation?: RecorderDebugObservation
  ): RecorderArtifacts {
    return {
      ...(beforeObservation?.snapshotId ? { snapshotIdBefore: beforeObservation.snapshotId } : {}),
      ...(afterObservation?.snapshotId ? { snapshotIdAfter: afterObservation.snapshotId } : {}),
      ...(beforeObservation?.snapshotPath ? { snapshotPathBefore: beforeObservation.snapshotPath } : {}),
      ...(afterObservation?.snapshotPath ? { snapshotPathAfter: afterObservation.snapshotPath } : {}),
    };
  }

  private indexObservedNodes(observation?: RecorderDebugObservation): Map<string, RecorderObservedNode> {
    const nodes = [
      ...(observation?.interactiveState?.inputs || []),
      ...(observation?.interactiveState?.buttons || []),
    ];
    return new Map(
      nodes
        .map((node) => [node.diffKey || node.ref || this.fallbackNodeKey(node), node] as const)
        .filter((entry) => Boolean(entry[0]))
    );
  }

  private fallbackNodeKey(node: RecorderObservedNode): string {
    const raw = [node.role, node.name, node.text, node.contextLabel, node.regionId, node.ordinal]
      .filter((item) => item !== undefined && item !== null)
      .join('|');
    return createHash('sha1').update(raw || 'node').digest('hex').slice(0, 12);
  }

  private resolveRegionId(region: Record<string, unknown>, index: number): string {
    const raw = [
      typeof region.regionId === 'string' ? region.regionId : undefined,
      typeof region.region === 'string' ? region.region : undefined,
      typeof region.regionType === 'string' ? region.regionType : undefined,
    ].find((item) => Boolean(item));
    return raw || `region-${index + 1}`;
  }

  private didWriteRequestedValue(
    commands: BrowserCommand[],
    diff: RecorderObservationDiff | undefined
  ): boolean {
    const requestedValue = commands.find((command) => command.tool === 'fill' || command.tool === 'type_text')
      ?.params?.value;
    if (typeof requestedValue !== 'string' || !requestedValue.trim()) {
      return false;
    }
    return Boolean(
      diff?.interactiveNodeChanges?.some(
        (change) =>
          change.fieldsChanged.includes('value') &&
          typeof change.after?.value === 'string' &&
          change.after.value.includes(requestedValue)
      )
    );
  }

  private shouldUseDetailOpenVerifier(intent: RecorderIntent, commands: BrowserCommand[]): boolean {
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
    return this.isDetailOpenGoal(detailSignals);
  }

  private isDetailOpenGoal(value: string | undefined): boolean {
    return /(详情|詳細|detail|明细)/i.test(value || '');
  }

  private didDetailViewChange(diff: RecorderObservationDiff | undefined): boolean {
    return Boolean(
      diff?.urlChanged ||
        diff?.titleChanged ||
        diff?.regionChanges?.length ||
        diff?.salientTextChanges?.length
    );
  }

  private isGroundedTargetVisible(
    target: RecorderGroundedTarget,
    beforeObservation?: RecorderDebugObservation,
    afterObservation?: RecorderDebugObservation
  ): boolean {
    return (
      this.hasGroundedTarget(beforeObservation, target) || this.hasGroundedTarget(afterObservation, target)
    );
  }

  private hasGroundedTarget(
    observation: RecorderDebugObservation | undefined,
    target: RecorderGroundedTarget
  ): boolean {
    if (!observation) {
      return false;
    }
    const nodes = [
      ...(observation.interactiveState?.inputs || []),
      ...(observation.interactiveState?.buttons || []),
    ];
    return nodes.some((node) => this.matchesGroundedTarget(node, target));
  }

  private matchesGroundedTarget(
    node: RecorderObservedNode,
    target: RecorderGroundedTarget
  ): boolean {
    if (target.ref && (node.ref === target.ref || node.diffKey === target.ref)) {
      return true;
    }
    const needles = [target.locator?.value, target.text, target.name, target.contextLabel]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());
    if (!needles.length) {
      return false;
    }
    const haystack = [node.ref, node.diffKey, node.text, node.name, node.contextLabel]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());
    return needles.some((needle) =>
      haystack.some((value) => value === needle || value.includes(needle) || needle.includes(value))
    );
  }
}
