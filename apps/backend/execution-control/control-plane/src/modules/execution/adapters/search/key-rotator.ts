export type KeyFailureReason =
  | 'invalid'
  | 'quota_exhausted'
  | 'rate_limited'
  | 'forbidden'
  | 'network'
  | 'unknown';

export type KeyState = {
  key: string;
  cooldownUntil: number;
  lastFailureReason?: KeyFailureReason;
  failureCount: number;
};

export class KeyRotator {
  private readonly providerName: string;
  private keys: string[] = [];
  private keyStates: Map<string, KeyState> = new Map();
  private currentIndex = 0;

  constructor(providerName: string) {
    this.providerName = providerName;
  }

  public setRawKeys(rawKeyStringOrArray?: string | string[]): void {
    const parsed: string[] = [];
    if (typeof rawKeyStringOrArray === 'string') {
      for (const item of rawKeyStringOrArray.split(',')) {
        const trimmed = item.trim();
        if (trimmed && !parsed.includes(trimmed)) {
          parsed.push(trimmed);
        }
      }
    } else if (Array.isArray(rawKeyStringOrArray)) {
      for (const item of rawKeyStringOrArray) {
        if (typeof item === 'string') {
          for (const part of item.split(',')) {
            const trimmed = part.trim();
            if (trimmed && !parsed.includes(trimmed)) {
              parsed.push(trimmed);
            }
          }
        }
      }
    }

    const currentKeySet = new Set(this.keys);
    const newKeySet = new Set(parsed);

    // Keep existing cooldown state if keys haven't changed
    const updatedStates = new Map<string, KeyState>();
    for (const key of parsed) {
      const existing = this.keyStates.get(key);
      if (existing) {
        updatedStates.set(key, existing);
      } else {
        updatedStates.set(key, { key, cooldownUntil: 0, failureCount: 0 });
      }
    }

    this.keys = parsed;
    this.keyStates = updatedStates;
    if (this.currentIndex >= this.keys.length) {
      this.currentIndex = 0;
    }
  }

  public hasKeys(): boolean {
    return this.keys.length > 0;
  }

  public getAllKeys(): string[] {
    return [...this.keys];
  }

  public getAvailableKey(): string | undefined {
    if (this.keys.length === 0) return undefined;
    const now = Date.now();

    // Check if any key is available (not in cooldown)
    for (let i = 0; i < this.keys.length; i++) {
      const index = (this.currentIndex + i) % this.keys.length;
      const key = this.keys[index];
      const state = this.keyStates.get(key);
      if (!state || state.cooldownUntil <= now) {
        this.currentIndex = index;
        return key;
      }
    }

    // If all are in cooldown, pick the one that expires earliest
    let earliestKey = this.keys[0];
    let earliestTime = this.keyStates.get(earliestKey)?.cooldownUntil || Infinity;

    for (const key of this.keys) {
      const state = this.keyStates.get(key);
      if (state && state.cooldownUntil < earliestTime) {
        earliestTime = state.cooldownUntil;
        earliestKey = key;
      }
    }

    return earliestKey;
  }

  public markFailure(
    key: string,
    reason: KeyFailureReason = 'unknown',
    customCooldownMs?: number
  ): string | undefined {
    const now = Date.now();
    let cooldownMs = customCooldownMs;

    if (cooldownMs === undefined) {
      switch (reason) {
        case 'invalid':
          // Invalid keys cool down for 2 hours
          cooldownMs = 2 * 3600 * 1000;
          break;
        case 'quota_exhausted':
          // Monthly or daily quota exhaustion: cool down for 1 hour
          cooldownMs = 3600 * 1000;
          break;
        case 'rate_limited':
          // Rate limit: 2 minutes
          cooldownMs = 2 * 60 * 1000;
          break;
        case 'forbidden':
          cooldownMs = 30 * 60 * 1000;
          break;
        default:
          cooldownMs = 60 * 1000;
          break;
      }
    }

    const state = this.keyStates.get(key) || { key, cooldownUntil: 0, failureCount: 0 };
    state.cooldownUntil = now + cooldownMs;
    state.lastFailureReason = reason;
    state.failureCount += 1;
    this.keyStates.set(key, state);

    // Advance index
    if (this.keys.length > 1) {
      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    }

    return this.getAvailableKey();
  }

  public markSuccess(key: string): void {
    const state = this.keyStates.get(key);
    if (state) {
      state.cooldownUntil = 0;
      state.failureCount = 0;
      delete state.lastFailureReason;
    }
  }

  public reset(): void {
    this.keyStates.clear();
    this.keys = [];
    this.currentIndex = 0;
  }
}
