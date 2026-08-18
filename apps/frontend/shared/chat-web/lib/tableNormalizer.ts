/**
 * Splits a tabular text line into column cells.
 * Supports:
 * 1. Pipe-separated Markdown table lines (| col1 | col2 |)
 * 2. Tab-separated lines (\t)
 * 3. Multi-space separated lines (\s{2,})
 */
export function splitTabularLine(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  // 1. Pipe table line: | col1 | col2 |
  if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
    const cells = trimmed
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    if (cells.length >= 2) {
      return cells;
    }
  }

  // 2. Tab separation
  if (trimmed.includes('\t')) {
    const cells = trimmed
      .split('\t')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length >= 2) {
      return cells;
    }
  }

  // 3. Multi-space separation (2+ spaces)
  const spaceCells = trimmed
    .split(/\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
  if (spaceCells.length >= 3) {
    return spaceCells;
  }

  return null;
}

/**
 * Normalizes plain text tables (multi-space separated, TSV tab-separated, or pipe tables without dividers)
 * into standard GFM Markdown table syntax (| Col 1 | Col 2 |\n| --- | --- |)
 * so ReactMarkdown with remarkGfm renders clean HTML <table> elements.
 */
export function normalizeTabSeparatedTable(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  const lines = text.split('\n');
  const resultLines: string[] = [];
  let tableBuffer: string[][] = [];

  const flushTableBuffer = () => {
    if (tableBuffer.length === 0) {
      return;
    }

    if (tableBuffer.length >= 2) {
      const maxCols = Math.max(...tableBuffer.map((row) => row.length));

      // Header row
      const headerRow = [...tableBuffer[0]];
      while (headerRow.length < maxCols) {
        headerRow.push('');
      }
      resultLines.push(`| ${headerRow.join(' | ')} |`);

      // Check if second line in buffer was already a divider line like |---|---|
      const hasDividerInSecondRow =
        tableBuffer.length > 1 &&
        tableBuffer[1].every((c) => /^:?-+:?$/.test(c.trim()));

      if (!hasDividerInSecondRow) {
        resultLines.push(`| ${headerRow.map(() => '---').join(' | ')} |`);
      }

      // Data rows
      for (let i = 1; i < tableBuffer.length; i++) {
        const row = [...tableBuffer[i]];
        if (i === 1 && hasDividerInSecondRow) {
          while (row.length < maxCols) {
            row.push('---');
          }
          resultLines.push(`| ${row.join(' | ')} |`);
          continue;
        }
        while (row.length < maxCols) {
          row.push('');
        }
        resultLines.push(`| ${row.join(' | ')} |`);
      }
    } else {
      for (const row of tableBuffer) {
        resultLines.push(row.join('  '));
      }
    }
    tableBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cells = splitTabularLine(line);

    if (cells) {
      tableBuffer.push(cells);
    } else {
      flushTableBuffer();
      resultLines.push(line);
    }
  }

  flushTableBuffer();
  return resultLines.join('\n');
}

export const normalizeTextTable = normalizeTabSeparatedTable;

const PERIOD_LABELS: Record<string, string> = {
  morning: '早晨',
  early_morning: '清晨',
  noon: '中午',
  afternoon: '下午',
  evening: '傍晚',
  night: '夜间',
  today: '今日',
};

const formatTime = (rawTime?: unknown): string => {
  if (typeof rawTime !== 'string' && typeof rawTime !== 'number') return '';
  const str = String(rawTime).padStart(4, '0');
  return `${str.slice(0, 2)}:${str.slice(2, 4)}`;
};

const extractWeatherDesc = (desc?: unknown): string => {
  if (typeof desc === 'string') return desc;
  if (Array.isArray(desc) && desc[0]) {
    if (typeof desc[0] === 'string') return desc[0];
    if (typeof desc[0] === 'object' && desc[0] !== null && 'value' in desc[0]) {
      return String((desc[0] as { value: unknown }).value);
    }
  }
  return '-';
};

const formatBytes = (bytes?: unknown): string => {
  const num = Number(bytes);
  if (Number.isNaN(num) || num <= 0) return '';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Automatically formats structured JSON objects (such as weather time-period objects,
 * document file artifacts, or list arrays) into clean GFM Markdown tables.
 */
export function formatStructuredDataToMarkdown(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const record = data as Record<string, unknown>;

  // 1. Weather time-period data (morning, noon, evening, etc.)
  const periodKeys = Object.keys(record).filter((k) => k in PERIOD_LABELS);
  if (periodKeys.length >= 1) {
    const dateStr = typeof record.date === 'string' ? record.date : '';
    const title = dateStr ? `**${dateStr} 天气情况**` : '**天气查询结果**';

    const rows: string[] = [
      title,
      '',
      '| 时段 | 天气 | 气温 | 体感温度 | 湿度 | 风速/风向 | 降水概率 | 紫外线 |',
      '|---|---|---|---|---|---|---|---|',
    ];

    // Order period keys properly
    const orderedKeys = ['early_morning', 'morning', 'noon', 'afternoon', 'evening', 'night', 'today'].filter(
      (k) => k in record
    );

    for (const key of orderedKeys) {
      const item = record[key] as Record<string, unknown> | undefined;
      if (!item || typeof item !== 'object') continue;

      const label = PERIOD_LABELS[key] || key;
      const timeStr = formatTime(item.time);
      const periodCol = timeStr ? `${label} ${timeStr}` : label;

      const weather = extractWeatherDesc(item.weatherDesc || item.weather || item.condition);
      const temp = item.tempC !== undefined ? `${item.tempC}°C` : item.temp ? `${item.temp}°C` : '-';
      const feelsLike = item.FeelsLikeC !== undefined ? `${item.FeelsLikeC}°C` : item.feelsLike ? `${item.feelsLike}°C` : '-';
      const humidity = item.humidity !== undefined ? `${item.humidity}%` : '-';

      const windSpeed = item.windspeedKmph || item.windSpeed;
      const windDir = item.winddir16Point || item.windDir || item.winddirDegree;
      const windCol = windSpeed ? `${windSpeed} km/h${windDir ? ` (${windDir})` : ''}` : '-';

      const precip = item.chanceofrain !== undefined ? `${item.chanceofrain}%` : item.precip !== undefined ? `${item.precip}%` : '-';
      const uv = item.uvIndex !== undefined ? String(item.uvIndex) : '-';

      rows.push(`| ${periodCol} | ${weather} | ${temp} | ${feelsLike} | ${humidity} | ${windCol} | ${precip} | ${uv} |`);
    }

    return rows.join('\n');
  }

  // 2. FinalOutputs / Document Artifact outputs (e.g. finalOutputs: [{ value: { url, name, sizeBytes } }])
  const extractArtifactOutputs = (obj: Record<string, unknown>): Array<{ name: string; url: string; size?: string }> => {
    const list: Array<{ name: string; url: string; size?: string }> = [];
    const searchQueue: unknown[] = [obj];
    const seen = new Set<unknown>();

    while (searchQueue.length > 0 && list.length < 5) {
      const curr = searchQueue.shift();
      if (!curr || typeof curr !== 'object' || seen.has(curr)) continue;
      seen.add(curr);

      if (Array.isArray(curr)) {
        curr.forEach((item) => searchQueue.push(item));
        continue;
      }

      const rec = curr as Record<string, unknown>;
      const url = typeof rec.url === 'string' ? rec.url : typeof rec.downloadUrl === 'string' ? rec.downloadUrl : undefined;
      const name = typeof rec.name === 'string' ? rec.name : typeof rec.label === 'string' ? rec.label : undefined;
      const sizeBytes = rec.sizeBytes || rec.size;

      if (url && name && (name.includes('.') || typeof rec.type === 'string' || typeof rec.artifactType === 'string')) {
        list.push({ name, url, size: formatBytes(sizeBytes) });
      } else {
        Object.values(rec).forEach((val) => {
          if (val && typeof val === 'object') searchQueue.push(val);
        });
      }
    }
    return list;
  };

  const artifactOutputs = extractArtifactOutputs(record);
  if (artifactOutputs.length > 0) {
    return '任务已成功完成，已为您生成结果文档。您可以直接点击下方按钮进行查看与下载。';
  }

  return undefined;
}

