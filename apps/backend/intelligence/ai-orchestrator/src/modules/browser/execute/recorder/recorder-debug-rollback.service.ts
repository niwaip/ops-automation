import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type { BrowserCommand } from '../../intent';
import type {
  RecorderDebugSession,
  RecorderLoopDraft,
} from '../recorder-debug.types';
import { RecorderStateStoreService } from './recorder-state-store.service';

/**
 * v4.1 P0 (doc §4.3.4 + §5.1.5): orchestrates single-step recorder rollback.
 *
 * rollbackLastStep semantics:
 * 1. Compute target = nextExecutionIndex - 1 (default 1 if session predates P0)
 * 2. Scan executedCommands with executionIndex in [target, current-1] for `persist` level
 *    side effects (rule-classifier + default-to-persist for untagged commands, doc §2.5)
 * 3. If persist side effects exist and confirmation is missing/mismatched → return requires_confirmation
 * 4. Otherwise: filter history + executedCommands by executionIndex, restore browser state
 *    via worker, cleanup state files, clear loop state, set nextExecutionIndex=target,
 *    increment revision
 *
 * The caller (RecorderDebugService) handles session load/save — this service mutates
 * the passed session in place and returns the result.
 */

export type RollbackSideEffect = {
  executionIndex: number;
  command: BrowserCommand;
  matchedKeyword?: string;
  classifiedLevel: 'none' | 'read' | 'mutate' | 'persist';
  description: string;
};

export type RollbackResult =
  | {
      status: 'succeeded';
      targetExecutionIndex: number;
      browserRestore: {
        restored: boolean;
        partial?: boolean;
        reason?: string;
        url?: string;
      };
      rolledBackTurnCount: number;
      rolledBackCommandCount: number;
    }
  | {
      status: 'requires_confirmation';
      targetExecutionIndex: number;
      sessionRevision: number;
      sideEffectDigest: string;
      sideEffects: RollbackSideEffect[];
      message: string;
    }
  | {
      status: 'noop';
      reason: string;
      targetExecutionIndex: number;
    }
  | {
      status: 'failed';
      reason: string;
      targetExecutionIndex: number;
      browserRestore?: {
        restored: boolean;
        partial?: boolean;
        reason?: string;
        url?: string;
      };
    };

const PERSIST_KEYWORDS =
  /(提交|审批|审批通过|审批驳回|保存|删除|发起|发布|确认|退出登录|审核|approve|reject|submit|save|delete|remove|publish|confirm|sign\s*out|log\s*out|logout)/i;

const MUTATE_KEYWORDS =
  /(填写|输入|展开|折叠|切换|勾选|取消勾选|选择|选中|fill|type|toggle|expand|collapse|check|uncheck|select)/i;

const READ_KEYWORDS = /(查询|查看|浏览|navigate|hover|goto|open|visit|read|inspect|observe|snapshot|get_text)/i;

const READ_ONLY_CLICK_KEYWORDS =
  /(筛选|过滤|filter|tab|标签页|页签|切换到|切到|查看全部|全部|保留中|待处理|待审批|待审核|承認済み|却下済み|已审批|已审核|已通过|未批准|未审批|未审核|排序|升序|降序|上一页|下一页|分页|page\s*\d+)/i;

@Injectable()
export class RecorderDebugRollbackService {
  private readonly logger = new Logger(RecorderDebugRollbackService.name);

  constructor(
    private readonly recorderStateStoreService: RecorderStateStoreService
  ) {}

  async rollbackLastStep(input: {
    session: RecorderDebugSession;
    confirmation?: {
      targetExecutionIndex: number;
      sessionRevision: number;
      sideEffectDigest: string;
      confirmedSideEffects?: string[];
    };
  }): Promise<RollbackResult> {
    const session = input.session;
    const currentIndex = this.readCurrentExecutionIndex(session);
    const targetIndex =
      input.confirmation?.targetExecutionIndex ?? Math.max(1, currentIndex - 1);

    if (targetIndex >= currentIndex) {
      return {
        status: 'noop',
        reason: 'target-at-or-after-current',
        targetExecutionIndex: targetIndex,
      };
    }
    if (targetIndex < 1) {
      return {
        status: 'noop',
        reason: 'target-before-first-execution',
        targetExecutionIndex: targetIndex,
      };
    }

    // 1. Side-effect scan between target (inclusive) and currentIndex (exclusive)
    const sideEffects = this.findPersistSideEffectsBetween(session, targetIndex, currentIndex - 1);
    if (sideEffects.length > 0) {
      const digest = this.hashSideEffects(sideEffects);
      const sessionRevision = session.revision || 0;
      const confirmation = input.confirmation;
      const confirmationMatches =
        confirmation &&
        confirmation.sessionRevision === sessionRevision &&
        confirmation.sideEffectDigest === digest;
      if (!confirmationMatches) {
        return {
          status: 'requires_confirmation',
          targetExecutionIndex: targetIndex,
          sessionRevision,
          sideEffectDigest: digest,
          sideEffects,
          message: `回退将跨越 ${sideEffects.length} 个后端持久化操作，浏览器回退不会撤销这些操作。后端状态需手动处理或联系管理员。是否继续回退？`,
        };
      }
      this.logger.warn(
        `Rollback proceeding with user-confirmed ${sideEffects.length} persist-level side effects (digest=${digest.slice(0, 12)})`
      );
    }

    // 2. Filter history by executionIndex (assistant turns only; user/system turns survive)
    const originalHistoryLength = session.history.length;
    session.history = session.history.filter((turn) => {
      if (turn.role !== 'assistant') return true;
      if (typeof turn.executionIndex !== 'number') return true;
      return turn.executionIndex < targetIndex;
    });
    const rolledBackTurnCount = originalHistoryLength - session.history.length;

    // 3. Filter executedCommands by executionIndex
    const originalCommandCount = session.executedCommands.length;
    session.executedCommands = session.executedCommands.filter(
      (cmd) => (cmd.executionIndex || 0) < targetIndex
    );
    const rolledBackCommandCount = originalCommandCount - session.executedCommands.length;

    // 4. Clear loop state that depends on rolled-back executions
    this.cleanupLoopStateAfterExecution(session, targetIndex);

    // 5. Restore browser state via worker (history is already rolled back — restore
    //    failure is reported but does NOT undo the history rollback, per doc §5.1 降级处理)
    let browserRestore;
    try {
      browserRestore = await this.recorderStateStoreService.restoreState(session, targetIndex);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `restoreState threw during rollback to ${targetIndex}: ${errorMessage}`
      );
      browserRestore = { restored: false, reason: `restore-threw: ${errorMessage}` };
    }

    // 6. Cleanup state files >= target (worker owns the files; orchestrator only triggers)
    await this.recorderStateStoreService.cleanupAfter(session, targetIndex);

    // 7. Reset execution cursor so the next execution re-uses slot `target`
    session.nextExecutionIndex = targetIndex;

    // 8. Increment revision (rollback commit invalidates stale pendingRecoverySuggestion)
    session.revision = (session.revision || 0) + 1;
    session.updatedAt = new Date().toISOString();

    // 9. Invalidate stale observation so the next chat() re-observes the restored page.
    //    Without this, tryReuseRecentObservation would return the pre-rollback observation
    //    (which describes the page state AFTER the rolled-back step) within the 5s TTL
    //    window, causing the AI to plan commands against a stale page snapshot.
    //    Also sync currentPageUrl from the restore result so the URL baseline matches the
    //    actual restored page — this prevents the URL-mismatch check from masking the
    //    stale observation in subsequent turns. Clear pending disambiguation / risk
    //    confirmation as well: both are derived from the rolled-back page state and
    //    must not survive into the next turn.
    session.lastObservation = undefined;
    session.pendingDisambiguation = undefined;
    session.pendingRiskConfirmation = undefined;
    if (browserRestore?.url) {
      session.currentPageUrl = browserRestore.url;
    }

    if (!browserRestore.restored) {
      return {
        status: 'failed',
        reason: browserRestore.reason || 'browser-restore-failed',
        targetExecutionIndex: targetIndex,
        browserRestore,
      };
    }

    return {
      status: 'succeeded',
      targetExecutionIndex: targetIndex,
      browserRestore,
      rolledBackTurnCount,
      rolledBackCommandCount,
    };
  }

  /**
   * Scan executedCommands with executionIndex in [fromIndex, toIndex] for persist-level
   * side effects. Per doc §2.5: rule-layer classifier + default-to-persist for untagged.
   */
  findPersistSideEffectsBetween(
    session: RecorderDebugSession,
    fromIndex: number,
    toIndex: number
  ): RollbackSideEffect[] {
    const effects: RollbackSideEffect[] = [];
    for (const cmd of session.executedCommands) {
      const idx = typeof cmd.executionIndex === 'number' ? cmd.executionIndex : -1;
      if (idx < fromIndex || idx > toIndex) continue;
      const classification = this.classifySideEffectLevel(cmd);
      if (classification.classifiedLevel === 'persist') {
        effects.push({
          executionIndex: idx,
          command: cmd,
          ...(classification.matchedKeyword
            ? { matchedKeyword: classification.matchedKeyword }
            : {}),
          classifiedLevel: 'persist',
          description: this.describeCommand(cmd),
        });
      }
    }
    return effects;
  }

  classifySideEffectLevel(command: BrowserCommand): {
    classifiedLevel: 'none' | 'read' | 'mutate' | 'persist';
    matchedKeyword?: string;
  } {
    // Explicit tag wins (set by AI planner or retrospective classifier earlier)
    if (
      command.sideEffectLevel === 'none' ||
      command.sideEffectLevel === 'read' ||
      command.sideEffectLevel === 'mutate' ||
      command.sideEffectLevel === 'persist'
    ) {
      return { classifiedLevel: command.sideEffectLevel };
    }

    // Rule layer: keyword match on description + params + locator
    const haystack = this.describeCommand(command);
    const readOnlyClickMatch =
      (command.tool === 'click' ||
        command.tool === 'press_key' ||
        command.tool === 'switch_latest_tab' ||
        command.tool === 'close_tab') &&
      haystack.match(READ_ONLY_CLICK_KEYWORDS);
    if (readOnlyClickMatch) {
      return { classifiedLevel: 'read', matchedKeyword: readOnlyClickMatch[0] };
    }
    const persistMatch = haystack.match(PERSIST_KEYWORDS);
    if (persistMatch) {
      return { classifiedLevel: 'persist', matchedKeyword: persistMatch[0] };
    }
    const mutateMatch = haystack.match(MUTATE_KEYWORDS);
    if (mutateMatch) {
      return { classifiedLevel: 'mutate', matchedKeyword: mutateMatch[0] };
    }
    const readMatch = haystack.match(READ_KEYWORDS);
    if (readMatch) {
      return { classifiedLevel: 'read', matchedKeyword: readMatch[0] };
    }

    // Default: persist (conservative — better to false-positive a confirmation
    // than to silently roll back past a real backend mutation)
    return { classifiedLevel: 'persist' };
  }

  private describeCommand(command: BrowserCommand): string {
    const parts: string[] = [command.tool];
    if (typeof command.description === 'string' && command.description) {
      parts.push(command.description);
    }
    if (command.params) {
      for (const value of Object.values(command.params)) {
        if (typeof value === 'string' && value) {
          parts.push(value);
        }
      }
    }
    if (command.locator) {
      const loc = command.locator;
      for (const key of ['value', 'name', 'expression', 'contextLabel'] as const) {
        const v = loc[key];
        if (typeof v === 'string' && v) {
          parts.push(v);
        }
      }
    }
    return parts.join(' ');
  }

  private hashSideEffects(effects: RollbackSideEffect[]): string {
    // Stable ordering by executionIndex, then by command description
    const sorted = [...effects].sort((a, b) => {
      if (a.executionIndex !== b.executionIndex) return a.executionIndex - b.executionIndex;
      return a.description.localeCompare(b.description);
    });
    const payload = sorted.map((e) => ({
      i: e.executionIndex,
      c: e.classifiedLevel,
      d: e.description,
      ...(e.matchedKeyword ? { k: e.matchedKeyword } : {}),
    }));
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private readCurrentExecutionIndex(session: RecorderDebugSession): number {
    const idx = session.nextExecutionIndex;
    return typeof idx === 'number' && Number.isFinite(idx) && idx >= 1 ? Math.floor(idx) : 1;
  }

  /**
   * Clear loop-related session state that depends on rolled-back executions.
   * - pendingLoopCaptureStartCommandIndex: if >= target, clear it (capture was for a rolled-back step)
   * - loopDraft.eachIteration: if capturedToIndex >= target, the draft references rolled-back steps
   *   → clear the draft entirely (safer than partial patching for P0)
   */
  private cleanupLoopStateAfterExecution(
    session: RecorderDebugSession,
    targetIndex: number
  ): void {
    if (
      typeof session.pendingLoopCaptureStartCommandIndex === 'number' &&
      session.pendingLoopCaptureStartCommandIndex >= targetIndex
    ) {
      session.pendingLoopCaptureStartCommandIndex = undefined;
    }
    const draft = session.loopDraft;
    if (draft && this.loopDraftReferencesRollback(draft, targetIndex)) {
      session.loopDraft = undefined;
    }
  }

  private loopDraftReferencesRollback(
    draft: RecorderLoopDraft,
    targetIndex: number
  ): boolean {
    const each = draft.eachIteration;
    if (!each) return false;
    const capturedTo = typeof each.capturedToIndex === 'number' ? each.capturedToIndex : -1;
    const capturedFrom = typeof each.capturedFromIndex === 'number' ? each.capturedFromIndex : -1;
    if (capturedTo >= targetIndex) return true;
    if (capturedFrom >= 0 && capturedFrom >= targetIndex) return true;
    return false;
  }
}

/**
 * Helper for callers that want to know whether a session has any rollback target
 * available. Used by RecorderDebugService to short-circuit before loading.
 */
export function hasRollbackTarget(session: RecorderDebugSession): boolean {
  const idx = session.nextExecutionIndex;
  return typeof idx === 'number' && idx > 1;
}

/**
 * The turn type used by the rollback filter. Re-exported for test convenience.
 */
export type { RecorderDebugTurn } from '../recorder-debug.types';
