import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import {
  ROUTING_CAPABILITY_ROLES,
  ROUTING_SIGNAL_GROUPS,
  type RoutingPolicyPatchV1,
  type RoutingPolicySnapshotV1,
} from './routing-policy.types';
import {
  calculateRoutingPolicyDigest,
  createBuiltinRoutingPolicySnapshot,
} from './routing-policy.matcher';

const REFRESH_INTERVAL_MS = 30_000;
const MAX_VALUES_PER_GROUP = 64;
const MAX_VALUE_LENGTH = 80;
const MAX_TERMINAL_ACTIONS = 32;

@Injectable()
export class RoutingPolicyService {
  private readonly logger = new Logger(RoutingPolicyService.name);
  private snapshot = createBuiltinRoutingPolicySnapshot();
  private lastRefreshAt = 0;
  private lastConfigIdentity = 'builtin';

  constructor() {
    this.refreshNow();
  }

  public getSnapshot(): RoutingPolicySnapshotV1 {
    if (Date.now() - this.lastRefreshAt >= REFRESH_INTERVAL_MS) {
      this.refreshNow();
    }
    return this.snapshot;
  }

  /** Re-read the managed patch. Invalid updates fail closed on the last valid snapshot. */
  public refreshNow(): RoutingPolicySnapshotV1 {
    this.lastRefreshAt = Date.now();
    let configured: { raw: string; source: 'environment' | 'file'; identity: string } | null;
    try {
      configured = this.readConfiguredPatch();
    } catch (error) {
      this.logger.warn(`Routing policy source is unavailable; keeping last valid policy: ${this.errorMessage(error)}`);
      return this.snapshot;
    }

    if (!configured) {
      if (this.lastConfigIdentity !== 'builtin') {
        this.snapshot = createBuiltinRoutingPolicySnapshot();
        this.lastConfigIdentity = 'builtin';
        this.logger.log(`Routing policy reset to ${this.snapshot.version}`);
      }
      return this.snapshot;
    }
    if (configured.identity === this.lastConfigIdentity) return this.snapshot;

    try {
      const patch = this.parseAndValidatePatch(configured.raw);
      this.snapshot = this.applyPatch(patch, configured.source);
      this.lastConfigIdentity = configured.identity;
      this.logger.log(
        `Loaded routing policy ${this.snapshot.version} from ${configured.source} (${this.snapshot.digest.slice(0, 12)})`,
      );
    } catch (error) {
      this.logger.warn(`Rejected routing policy update; keeping last valid policy: ${this.errorMessage(error)}`);
    }
    return this.snapshot;
  }

  private readConfiguredPatch(): {
    raw: string;
    source: 'environment' | 'file';
    identity: string;
  } | null {
    const inline = process.env.ROUTING_POLICY_JSON?.trim();
    if (inline) {
      return { raw: inline, source: 'environment', identity: `env:${this.hash(inline)}` };
    }

    const configuredPath = process.env.ROUTING_POLICY_FILE?.trim();
    if (!configuredPath) return null;
    const absolutePath = resolve(configuredPath);
    const stat = statSync(absolutePath);
    if (!stat.isFile()) throw new Error(`${absolutePath} is not a regular file`);
    const raw = readFileSync(absolutePath, 'utf8');
    return {
      raw,
      source: 'file',
      identity: `file:${absolutePath}:${stat.mtimeMs}:${stat.size}:${this.hash(raw)}`,
    };
  }

  private parseAndValidatePatch(raw: string): RoutingPolicyPatchV1 {
    const value = JSON.parse(raw) as RoutingPolicyPatchV1;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('policy patch must be an object');
    }
    if (value.schemaVersion !== 'routing-policy-patch/v1') {
      throw new Error(`unsupported schemaVersion '${String(value.schemaVersion)}'`);
    }
    if (!this.isPolicyVersion(value.version)) {
      throw new Error('version must contain 1-64 letters, numbers, dots, underscores, or hyphens');
    }

    const additions = value.additions || {};
    this.assertKnownKeys(value, ['schemaVersion', 'version', 'additions'], 'policy');
    this.assertKnownKeys(
      additions,
      ['signals', 'terminalActions', 'capabilityRoles', 'intentNormalization'],
      'additions',
    );
    this.assertKnownKeys(
      additions.intentNormalization,
      ['equivalences', 'stopWords'],
      'intentNormalization',
    );
    this.assertKnownKeys(additions.signals, ROUTING_SIGNAL_GROUPS, 'signals');
    this.assertKnownKeys(additions.capabilityRoles, ROUTING_CAPABILITY_ROLES, 'capabilityRoles');
    for (const [group, values] of Object.entries(additions.signals || {})) {
      this.validateValues(values, `signals.${group}`);
    }
    const terminalActions = Object.entries(additions.terminalActions || {});
    if (terminalActions.length > MAX_TERMINAL_ACTIONS) {
      throw new Error(`terminalActions may define at most ${MAX_TERMINAL_ACTIONS} actions`);
    }
    for (const [action, values] of terminalActions) {
      if (!/^[a-z0-9_.-]{1,64}$/.test(action)) {
        throw new Error(`terminalActions key '${action}' is invalid`);
      }
      this.validateValues(values, `terminalActions.${action}`);
    }
    for (const [role, values] of Object.entries(additions.capabilityRoles || {})) {
      this.validateValues(values, `capabilityRoles.${role}`);
    }
    for (const [canonical, aliases] of Object.entries(
      additions.intentNormalization?.equivalences || {},
    )) {
      this.validateValue(canonical, 'intentNormalization equivalence key');
      this.validateValues(aliases, `intentNormalization.equivalences.${canonical}`);
    }
    if (additions.intentNormalization?.stopWords) {
      this.validateValues(
        additions.intentNormalization.stopWords,
        'intentNormalization.stopWords',
      );
    }
    return value;
  }

  private applyPatch(
    patch: RoutingPolicyPatchV1,
    source: 'environment' | 'file',
  ): RoutingPolicySnapshotV1 {
    const baseline = createBuiltinRoutingPolicySnapshot();
    const additions = patch.additions || {};
    const policy: Omit<RoutingPolicySnapshotV1, 'digest'> = {
      ...baseline,
      version: patch.version,
      source,
      signals: { ...baseline.signals },
      terminalActions: { ...baseline.terminalActions },
      capabilityRoles: { ...baseline.capabilityRoles },
      intentNormalization: {
        equivalences: baseline.intentNormalization.equivalences.map((item) => ({
          canonical: item.canonical,
          aliases: [...item.aliases],
        })),
        stopWords: [...baseline.intentNormalization.stopWords],
      },
    };

    for (const group of ROUTING_SIGNAL_GROUPS) {
      policy.signals[group] = this.mergeValues(
        policy.signals[group],
        additions.signals?.[group],
      );
    }
    for (const [action, aliases] of Object.entries(additions.terminalActions || {})) {
      policy.terminalActions[action] = this.mergeValues(
        policy.terminalActions[action] || [],
        aliases,
      );
    }
    for (const role of ROUTING_CAPABILITY_ROLES) {
      policy.capabilityRoles[role] = this.mergeValues(
        policy.capabilityRoles[role],
        additions.capabilityRoles?.[role],
      );
    }
    for (const [canonical, aliases] of Object.entries(
      additions.intentNormalization?.equivalences || {},
    )) {
      const existing = policy.intentNormalization.equivalences.find(
        (item) => item.canonical === canonical,
      );
      if (existing) existing.aliases = this.mergeValues(existing.aliases, aliases);
      else policy.intentNormalization.equivalences.push({ canonical, aliases: [...aliases] });
    }
    policy.intentNormalization.stopWords = this.mergeValues(
      policy.intentNormalization.stopWords,
      additions.intentNormalization?.stopWords,
    );

    return { ...policy, digest: calculateRoutingPolicyDigest(policy) };
  }

  private validateValues(value: unknown, field: string): asserts value is string[] {
    if (!Array.isArray(value) || value.length > MAX_VALUES_PER_GROUP) {
      throw new Error(`${field} must be an array with at most ${MAX_VALUES_PER_GROUP} values`);
    }
    for (const item of value) this.validateValue(item, field);
  }

  private validateValue(value: unknown, field: string): asserts value is string {
    if (typeof value !== 'string' || !value.trim() || value.length > MAX_VALUE_LENGTH) {
      throw new Error(`${field} contains an invalid value`);
    }
  }

  private assertKnownKeys(
    value: object | undefined,
    allowed: readonly string[],
    field: string,
  ): void {
    for (const key of Object.keys(value || {})) {
      if (!allowed.includes(key)) throw new Error(`${field} contains unknown key '${key}'`);
    }
  }

  private mergeValues(baseline: string[], additions: string[] | undefined): string[] {
    return [...new Set([...baseline, ...(additions || [])].map((value) => value.trim()))];
  }

  private isPolicyVersion(value: unknown): value is string {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value);
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
