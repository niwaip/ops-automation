import { asRecord } from './browser-recording-runtime.types';

export const pickFirstNonEmptyString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

export const resolveRuntimeValue = (
  value: unknown,
  runtimeInput: Record<string, unknown>
): unknown => {
  if (typeof value === 'string') {
    const exactMatch = value.match(/^\$\{([^}]+)\}$/);
    if (exactMatch) {
      const varName = exactMatch[1] as string;
      const directValue = runtimeInput[varName];
      if (directValue !== undefined && directValue !== null && directValue !== '') {
        return directValue;
      }
      if (varName === 'startUrl' && runtimeInput.url) {
        return runtimeInput.url;
      }
      if (varName === 'url' && runtimeInput.startUrl) {
        return runtimeInput.startUrl;
      }
      return directValue !== undefined ? directValue : value;
    }
    return value.replace(/\$\{([^}]+)\}/g, (_match, key: string) => {
      const resolved = runtimeInput[key];
      if (resolved !== undefined && resolved !== null && String(resolved).trim()) {
        return String(resolved);
      }
      if (key === 'startUrl' && runtimeInput.url) {
        return String(runtimeInput.url);
      }
      if (key === 'url' && runtimeInput.startUrl) {
        return String(runtimeInput.startUrl);
      }
      return resolved === undefined || resolved === null ? '' : String(resolved);
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveRuntimeValue(item, runtimeInput));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, current]) => {
        acc[key] = resolveRuntimeValue(current, runtimeInput);
        return acc;
      },
      {}
    );
  }
  return value;
};

export const buildTargetFromLocator = (locator?: Record<string, unknown>): string | undefined => {
  if (!locator) {
    return undefined;
  }

  const locatorType = pickFirstNonEmptyString(locator.type)?.toLowerCase();
  const locatorValue = pickFirstNonEmptyString(locator.value);
  if (!locatorType || !locatorValue) {
    return undefined;
  }

  switch (locatorType) {
    case 'ref':
      return locatorValue;
    case 'role':
      return `role=${locatorValue}`;
    case 'text':
      return `text=${locatorValue}`;
    case 'label':
      return `internal:label="${locatorValue}"`;
    case 'test-id':
      return `[data-testid="${locatorValue}"]`;
    case 'xpath':
      return `xpath=${locatorValue}`;
    default:
      return locatorValue;
  }
};

export const normalizeTarget = (target?: string): string | undefined => {
  const value = typeof target === 'string' ? target.trim() : '';
  if (!value) {
    return undefined;
  }

  if (/^[a-zA-Z-]+\[name=.*\]$/.test(value) && !value.split('[', 1)[0]?.includes('=')) {
    return `role=${value}`;
  }

  return value;
};

export const looksLikeSelector = (target: string): boolean => {
  const value = target.trim();
  if (!value) {
    return false;
  }

  return (
    /^e\d+$/i.test(value) ||
    /^(role|text|xpath)=/i.test(value) ||
    /^(#|\.|\[|\/\/)/.test(value) ||
    /[a-zA-Z-]+\[name=/.test(value) ||
    value.includes('>>') ||
    value.includes(':has') ||
    value.includes('[data-testid=')
  );
};

export const isSuspiciousTarget = (
  action: string,
  target: string,
  resolvedPayload: Record<string, unknown>,
  resolvedParams: Record<string, unknown>
): boolean => {
  if (!['fill', 'click', 'hover', 'press_key', 'type_text'].includes(action)) {
    return false;
  }

  if (looksLikeSelector(target)) {
    return false;
  }

  const valueCandidates = [
    resolvedPayload.value,
    resolvedPayload.text,
    resolvedPayload.query,
    resolvedPayload.url,
    resolvedPayload.key,
    resolvedParams.value,
    resolvedParams.text,
    resolvedParams.query,
    resolvedParams.url,
    resolvedParams.key,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());

  return valueCandidates.includes(target);
};

export const normalizeStepAction = (action: string | undefined): string | undefined => {
  if (!action) {
    return undefined;
  }
  const normalized = action.trim().toLowerCase();
  switch (normalized) {
    case 'navigate':
      return 'goto';
    case 'waitforselector':
      return 'wait';
    case 'press':
      return 'press_key';
    case 'type':
      return 'type_text';
    default:
      return normalized;
  }
};

export const buildRuntimeArgs = (
  action: string,
  resolvedPayload: Record<string, unknown>,
  resolvedParams: Record<string, unknown>
): Record<string, unknown> => {
  const pick = (...values: unknown[]) => values.find((value) => value !== undefined);

  switch (action) {
    case 'goto':
      return Object.fromEntries(
        Object.entries({
          url: pick(resolvedPayload.url, resolvedParams.url),
        }).filter(([, value]) => value !== undefined)
      );
    case 'fill':
      return Object.fromEntries(
        Object.entries({
          value: pick(
            resolvedParams.value,
            resolvedPayload.value,
            resolvedPayload.text,
            resolvedPayload.query
          ),
        }).filter(([, value]) => value !== undefined)
      );
    case 'type_text':
      return Object.fromEntries(
        Object.entries({
          text: pick(resolvedParams.text, resolvedPayload.text, resolvedPayload.value),
          submit_key: pick(resolvedParams.submit_key, resolvedPayload.submit_key),
        }).filter(([, value]) => value !== undefined)
      );
    case 'press_key':
      return Object.fromEntries(
        Object.entries({
          key: pick(resolvedParams.key, resolvedPayload.key, resolvedPayload.value),
        }).filter(([, value]) => value !== undefined)
      );
    case 'wait':
      return Object.fromEntries(
        Object.entries({
          duration: pick(
            resolvedParams.duration,
            resolvedParams.timeoutMs,
            resolvedPayload.duration,
            resolvedPayload.timeoutMs
          ),
          selector: pick(resolvedParams.selector, resolvedPayload.selector),
        }).filter(([, value]) => value !== undefined)
      );
    case 'smart_search':
    case 'search':
      return Object.fromEntries(
        Object.entries({
          query: pick(
            resolvedParams.query,
            resolvedPayload.query,
            resolvedPayload.text,
            resolvedPayload.value
          ),
        }).filter(([, value]) => value !== undefined)
      );
    case 'click_result':
      return Object.fromEntries(
        Object.entries({
          index: pick(resolvedParams.index, resolvedPayload.index),
        }).filter(([, value]) => value !== undefined)
      );
    case 'screenshot':
    case 'snapshot':
    case 'read_page':
    case 'get_text':
    case 'switch_latest_tab':
    case 'close_tab':
    case 'hover':
    case 'click':
      return {};
    default:
      return { ...resolvedParams };
  }
};

export const resolveRuntimeTarget = (
  action: string,
  resolvedPayload: Record<string, unknown>,
  resolvedParams: Record<string, unknown>
): string | undefined => {
  const locatorTarget = buildTargetFromLocator(
    asRecord(resolvedPayload.locator) || asRecord(resolvedParams.locator)
  );
  if (locatorTarget) {
    return locatorTarget;
  }

  const selectorTarget = normalizeTarget(
    pickFirstNonEmptyString(resolvedPayload.selector, resolvedParams.selector)
  );
  if (selectorTarget) {
    return selectorTarget;
  }

  const explicitTarget = normalizeTarget(
    pickFirstNonEmptyString(
      resolvedPayload.target,
      resolvedParams.target,
      action === 'goto' ? resolvedPayload.url : undefined,
      action === 'goto' ? resolvedParams.url : undefined
    )
  );
  if (!explicitTarget) {
    return undefined;
  }

  if (isSuspiciousTarget(action, explicitTarget, resolvedPayload, resolvedParams)) {
    return undefined;
  }

  return explicitTarget;
};

export const asFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const formatThresholdNumber = (value: number): string => {
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, '');
};
