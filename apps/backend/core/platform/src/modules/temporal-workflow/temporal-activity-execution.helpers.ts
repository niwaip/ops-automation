import { getCarboneExternalUrl } from '../../config/service-endpoints';

export const normalizeInputParams = (
  inputParams:
    | Array<{ key?: string; value?: string; required?: boolean }>
    | Record<string, string>
    | undefined
): Array<{ key: string; value: string; required: boolean }> => {
  if (!inputParams) {
    return [];
  }
  if (Array.isArray(inputParams)) {
    return inputParams.map((item) => ({
      key: item.key || '',
      value: item.value || '',
      required: Boolean(item.required),
    }));
  }
  return Object.entries(inputParams).map(([key, value]) => ({
    key,
    value: value || '',
    required: !value,
  }));
};

export const asRecord = (value: unknown): Record<string, any> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, any>;
};

export const toExternalDownloadUrl = (value?: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `${getCarboneExternalUrl()}${trimmed}`;
  }
  return `${getCarboneExternalUrl()}/${trimmed.replace(/^\/+/, '')}`;
};

export const extractNestedDownloadUrl = (value: unknown): string | undefined => {
  const queue: unknown[] = [value];
  const visited = new Set<unknown>();
  let inspected = 0;

  while (queue.length > 0 && inspected < 50) {
    const current = queue.shift();
    inspected += 1;

    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    const record = current as Record<string, unknown>;
    const downloadUrl =
      toExternalDownloadUrl(record.downloadUrl) ||
      toExternalDownloadUrl(record.download_url) ||
      toExternalDownloadUrl(record.url);

    if (downloadUrl) {
      return downloadUrl;
    }

    Object.values(record).forEach((item) => {
      if (item && typeof item === 'object') {
        queue.push(item);
      }
    });
  }

  return undefined;
};

export const normalizeDocumentExecutionResult = (value: unknown): unknown => {
  const record = asRecord(value);
  if (!record) {
    return value;
  }

  const downloadUrl = extractNestedDownloadUrl(record);

  if (!downloadUrl || record.downloadUrl === downloadUrl) {
    return value;
  }

  return {
    ...record,
    downloadUrl,
  };
};
