import { Injectable } from '@nestjs/common';

export type LegacyGraceMode = 'reject_not_started' | 'allow_all' | 'reject_all';

export interface GracePolicyConfig {
  /**
   * ISO deadline; executions relying on legacy contract semantics are gated
   * after it. Undefined when the operator has not configured a deadline —
   * the gate is then inactive (design doc §17.1 rule 5: the date comes from
   * environment config / release announcement, never a fabricated default).
   */
  graceDeadline?: Date;
  /** Coarse kill switch: both false → reject every pending deterministic execution. */
  allowInFlightRecovery: boolean;
  allowNewPlans: boolean;
  /** Fine-grained post-grace policy (default rejects only not-yet-started executions). */
  onGraceExpired: LegacyGraceMode;
}

const NOT_STARTED_STATUSES = new Set(['draft', 'queued']);

/**
 * Legacy grace period policy (design doc §17.1).
 *
 * Migration guard for plans frozen BEFORE authoritative schema arbitration
 * existed. After the grace deadline, queued (never-started) legacy executions
 * are rejected with `LEGACY_GRACE_EXPIRED` while already-started executions
 * are protected and allowed to finish — unless the operator escalates to
 * `reject_all` or flips both coarse allow switches off.
 *
 * The deadline comes EXCLUSIVELY from `LEGACY_GRACE_DEADLINE` (env). When it
 * is unset (or invalid) the gate is inactive — `isPastGrace()` is false — so
 * a process restart can never silently roll a fabricated 30-day window
 * forward and keep the gate from ever firing, and no execution is ever
 * rejected on an invented date. The countdown begins when the operator
 * announces it (fix ⑩).
 *
 * Config (env):
 * - LEGACY_GRACE_DEADLINE        ISO date; required to activate the gate
 * - LEGACY_ALLOW_IN_FLIGHT_RECOVERY  "true" | "false" (default "true")
 * - LEGACY_ALLOW_NEW_PLANS           "true" | "false" (default "true")
 * - LEGACY_ON_GRACE_EXPIRED          reject_not_started | allow_all | reject_all
 *                                    (default "reject_not_started")
 */
@Injectable()
export class GracePolicyService {
  private readonly config: GracePolicyConfig;

  constructor() {
    this.config = {
      graceDeadline: this.resolveDeadline(),
      allowInFlightRecovery: process.env.LEGACY_ALLOW_IN_FLIGHT_RECOVERY !== 'false',
      allowNewPlans: process.env.LEGACY_ALLOW_NEW_PLANS !== 'false',
      onGraceExpired: this.resolveMode(),
    };
  }

  public getConfig(): GracePolicyConfig {
    return this.config;
  }

  public isPastGrace(): boolean {
    return this.config.graceDeadline ? new Date() > this.config.graceDeadline : false;
  }

  /**
   * Whether a pending execution should be rejected by the legacy grace gate.
   * Only meaningful for non-terminal statuses; callers gate after their own
   * terminal-status check.
   */
  public shouldReject(status: string): boolean {
    if (!this.isPastGrace()) return false;

    // Coarse kill switch: both allow flags off → stop everything pending.
    if (!this.config.allowNewPlans && !this.config.allowInFlightRecovery) return true;

    switch (this.config.onGraceExpired) {
      case 'allow_all':
        return false;
      case 'reject_all':
        return true;
      case 'reject_not_started':
      default:
        // Protect already-started executions; reject only never-started ones.
        return NOT_STARTED_STATUSES.has(status);
    }
  }

  private resolveDeadline(): Date | undefined {
    const raw = process.env.LEGACY_GRACE_DEADLINE;
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) return parsed;
      console.warn(
        '[GracePolicyService] Invalid LEGACY_GRACE_DEADLINE — grace gate left inactive until a valid ISO date is configured'
      );
    }
    return undefined;
  }

  private resolveMode(): LegacyGraceMode {
    const mode = process.env.LEGACY_ON_GRACE_EXPIRED;
    if (mode === 'allow_all' || mode === 'reject_all' || mode === 'reject_not_started') {
      return mode;
    }
    return 'reject_not_started';
  }
}
