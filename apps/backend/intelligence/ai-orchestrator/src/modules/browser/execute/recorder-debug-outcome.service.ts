import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { BrowserCommand } from '../intent';
import { buildRecorderVerification } from './recorder/recorder-debug-verification';
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
    exportArtifacts?: unknown;
  }): RecorderOutcome {
    const kind = this.resolveOutcomeKind(input.status);
    const intent = this.buildIntent(input.userGoal, input.commands, kind);
    const diff = this.buildObservationDiff(input.beforeObservation, input.observation);
    const grounding = this.buildGrounding(input.commands, input.beforeObservation, input.observation);
    const verification = buildRecorderVerification({
      kind,
      status: input.status,
      intent,
      commands: input.commands || [],
      execution: input.execution,
      beforeObservation: input.beforeObservation,
      observation: input.observation,
      diff,
      grounding,
      exportArtifacts: Boolean(input.exportArtifacts),
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
      ...(execution.recovered ? { recovered: true, recovery: execution.recovery } : {}),
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
    const intentSignals = this.collectGroundingIntentSignals(command);
    if (directRefMatch && intentSignals && !this.isRefNodeConsistentWithIntent(directRefMatch, intentSignals)) {
      // directRefMatch collided with command intent. This means observation's
      // ref namespace produced a node that the user-visible command was not
      // referring to (off-namespace collision). Fall back to a semantic
      // match only when an observed node actually satisfies the intent.
      const intentMatch = observedNodes.find((node) =>
        this.isRefNodeConsistentWithIntent(node, intentSignals)
      );
      if (intentMatch) {
        return this.buildGroundedTargetRecord(intentMatch, command, candidateTarget, true);
      }
      return undefined;
    }
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

    return this.buildGroundedTargetRecord(semanticMatch, command, candidateTarget, false);
  }

  // Strong, user-intent-bearing signals extracted from the recorded command.
  // When present, an observation ref node must match these to be trusted.
  // Without intent signals we cannot disambiguate observation-vs-cli ref
  // namespaces, so the legacy behavior is preserved.
  private collectGroundingIntentSignals(
    command: BrowserCommand
  ): { role?: string; name?: string; labels: string[] } | undefined {
    const labels: string[] = [];
    const pushLabel = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        labels.push(value.trim());
      }
    };
    pushLabel(command.params?.text);
    pushLabel(command.locator?.name);
    if (typeof command.description === 'string') {
      const quoted = command.description.match(/[「“"'『'](.*?)[」”"』']/);
      pushLabel(quoted?.[1]);
      const buttonHint = command.description.match(/点击\s*(.+?)\s*按钮/);
      pushLabel(buttonHint?.[1]);
      const navigateLabel = command.description.match(/^(?:打开|进入|跳转到|导航到)\s*(.+)/);
      pushLabel(navigateLabel?.[1]);
    }
    const role =
      typeof command.locator?.role === 'string' && command.locator.role.trim()
        ? command.locator.role.trim().toLowerCase()
        : undefined;
    const name =
      typeof command.locator?.name === 'string' && command.locator.name.trim()
        ? command.locator.name.trim()
        : undefined;
    if (!role && labels.length === 0) {
      return undefined;
    }
    return { role, name, labels: labels.filter((label, index) => labels.indexOf(label) === index) };
  }

  private isRefNodeConsistentWithIntent(
    node: RecorderObservedNode,
    intent: { role?: string; name?: string; labels: string[] }
  ): boolean {
    const nodeRole = typeof node.role === 'string' && node.role.trim() ? node.role.trim().toLowerCase() : '';
    const nodeName =
      typeof node.name === 'string' && node.name.trim()
        ? node.name.trim().toLowerCase()
        : typeof node.text === 'string' && node.text.trim()
          ? node.text.trim().toLowerCase()
          : '';
    if (intent.role && nodeRole && intent.role !== nodeRole) {
      // Roles known to be interchangeable click containers; reject only when
      // they are genuinely incompatible (e.g. button vs cell vs row).
      const interchangeable = new Set(['button', 'link', 'menuitem', 'option']);
      if (!(interchangeable.has(intent.role) && interchangeable.has(nodeRole))) {
        return false;
      }
    }
    if (intent.name && nodeName && intent.name !== nodeName) {
      return false;
    }
    if (intent.labels.length > 0) {
      const haystack = [node.name, node.text, node.contextLabel, node.diffKey]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim().toLowerCase())
        .join(' ');
      const anyLabelMatches = intent.labels.some((label) => {
        const normalized = label.trim().toLowerCase();
        return (
          normalized.length > 0 &&
          (haystack.includes(normalized) ||
            normalized.includes(nodeName) ||
            nodeName.includes(normalized))
        );
      });
      if (!anyLabelMatches) {
        return false;
      }
    }
    return true;
  }

  private buildGroundedTargetRecord(
    node: RecorderObservedNode | undefined,
    command: BrowserCommand,
    candidateTarget: string,
    forcedIntentMatch: boolean
  ): RecorderGroundedTarget {
    return {
      ...(node?.ref ? { ref: node.ref } : {}),
      ...(node?.role ? { role: node.role } : {}),
      ...(node?.name ? { name: node.name } : {}),
      ...(node?.text ? { text: node.text } : {}),
      ...(node?.contextLabel ? { contextLabel: node.contextLabel } : {}),
      ...(node?.regionId ? { regionId: node.regionId } : {}),
      ...(command.locator
        ? {
            locator: {
              strategy: command.locator.strategy,
              value:
                typeof command.locator.value === 'string' ? command.locator.value : candidateTarget,
            },
          }
        : {}),
      confidence: forcedIntentMatch ? 0.95 : node ? 0.9 : 0.5,
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
    const beforeByRegionId = new Map(
      beforeRegions.map((region) => [region.regionId, region] as const)
    );
    const afterByRegionId = new Map(
      afterRegions.map((region) => [region.regionId, region] as const)
    );
    const regionIds = new Set([...beforeByRegionId.keys(), ...afterByRegionId.keys()]);
    const changes: NonNullable<RecorderObservationDiff['regionChanges']> = [];

    for (const regionId of regionIds) {
      const before = beforeByRegionId.get(regionId);
      const after = afterByRegionId.get(regionId);
      const beforeVisible = before?.visible ?? true;
      const afterVisible = after?.visible ?? true;
      const beforeText = before?.text || '';
      const afterText = after?.text || '';
      const beforeEntryCount = before?.entryCount;
      const afterEntryCount = after?.entryCount;

      if (beforeVisible !== afterVisible) {
        changes.push({
          regionId,
          changeType: 'visibility',
          before: beforeVisible,
          after: afterVisible,
        });
      }
      if (beforeText !== afterText) {
        changes.push({
          regionId,
          changeType: 'content',
          ...(beforeText ? { before: beforeText } : {}),
          ...(afterText ? { after: afterText } : {}),
        });
      }
      if (
        (beforeEntryCount !== undefined || afterEntryCount !== undefined) &&
        (beforeEntryCount ?? 0) !== (afterEntryCount ?? 0)
      ) {
        changes.push({
          regionId,
          changeType: 'entry-count',
          ...(beforeEntryCount !== undefined ? { before: beforeEntryCount } : {}),
          ...(afterEntryCount !== undefined ? { after: afterEntryCount } : {}),
        });
      }
    }

    return changes;
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

  private isDetailOpenGoal(value: string | undefined): boolean {
    return /(详情|詳細|detail|明细)/i.test(value || '');
  }
}
