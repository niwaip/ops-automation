const BOX_BORDER_LINE_REGEX = /^[┌┐└┘├┤┬┴┼─━═╔╗╚╝╠╣╦╩╬\-\+\= \t|│┃║]+$/;
const BOX_CELL_SPLIT_REGEX = /[│┃║]/;

/**
 * Converts a code block containing an ASCII/Unicode box-drawing table into standard GFM Markdown.
 */
export function convertBoxDrawingCodeBlock(codeText: string): string | null {
  if (!codeText || typeof codeText !== 'string') {
    return null;
  }

  // 严禁对 HTML、XML、脚本或代码文件进行伪表格解构
  if (
    /<!doctype\s+html/i.test(codeText) ||
    /<html/i.test(codeText) ||
    /<\/html>/i.test(codeText) ||
    /<script/i.test(codeText) ||
    /<style/i.test(codeText) ||
    /def\s+\w+\s*\(/.test(codeText) ||
    /import\s+[\w\{\*]/.test(codeText) ||
    /function\s+\w*\s*\(/.test(codeText)
  ) {
    return null;
  }

  // 必须包含真实的盒线绘图字符 (┌ ┬ ┐ ├ ┼ ┤ └ ┴ ┘ ─ │ 等) 或明确的 +----+----+ 边框
  const hasBoxDrawingChars = /[┌┐└┘├┤┬┴┼─━═╔╗╚╝╠╣╦╩╬│┃║]/.test(codeText);
  const hasAsciiTableBorders = /^\+[\-]{2,}\+/m.test(codeText);
  if (!hasBoxDrawingChars && !hasAsciiTableBorders) {
    return null; // Not a box-drawing table at all!
  }

  const lines = codeText.split('\n');
  const tableRows: string[][] = [];
  const leadingNotes: string[] = [];
  const trailingNotes: string[] = [];
  let foundTable = false;
  let finishedTable = false;
  let borderLineCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (foundTable && tableRows.length > 0) {
        finishedTable = true;
      }
      continue;
    }

    if (finishedTable) {
      trailingNotes.push(rawLine);
      continue;
    }

    // Check if it's a border/divider line (e.g. ┌───┬───┐ or ├───┼───┤ or +---+---+)
    const isBorder =
      BOX_BORDER_LINE_REGEX.test(line) &&
      (/[─━═\-\=]{2,}/.test(line) || /[┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬\+]/.test(line));

    if (isBorder) {
      borderLineCount++;
      foundTable = true;
      continue;
    }

    // Check if it's a table row containing vertical separators (│, ┃, ║, or | with borders)
    const isBoxRow =
      BOX_CELL_SPLIT_REGEX.test(line) ||
      (hasAsciiTableBorders && line.startsWith('|') && line.endsWith('|'));
    if (isBoxRow && !line.includes('||')) {
      const splitRegex = BOX_CELL_SPLIT_REGEX.test(line) ? BOX_CELL_SPLIT_REGEX : /\|/;
      const rawCells = line.split(splitRegex).map((c) => c.trim());
      // Trim empty edge cells from leading/trailing border characters
      if (rawCells.length > 0 && rawCells[0] === '') {
        rawCells.shift();
      }
      if (rawCells.length > 0 && rawCells[rawCells.length - 1] === '') {
        rawCells.pop();
      }

      if (rawCells.length >= 2) {
        foundTable = true;
        tableRows.push(rawCells);
        continue;
      }
    }

    if (!foundTable) {
      leadingNotes.push(rawLine);
    } else {
      trailingNotes.push(rawLine);
    }
  }

  // 必须具有真正的边框线以及至少两行数据
  if (borderLineCount === 0 || tableRows.length < 2) {
    return null;
  }

  // 表头前置说明不能是一整篇文档（最多前置 5 行说明）
  if (leadingNotes.length > 5) {
    return null;
  }

  const maxCols = Math.max(...tableRows.map((r) => r.length));
  const header = [...tableRows[0]];
  while (header.length < maxCols) {
    header.push(header.length === maxCols - 1 ? '备注' : `列${header.length + 1}`);
  }

  const mdLines: string[] = [];
  if (leadingNotes.length > 0) {
    const titleText = leadingNotes.join('\n').trim();
    if (titleText) {
      mdLines.push(`**${titleText}**\n`);
    }
  }

  mdLines.push(`| ${header.join(' | ')} |`);
  mdLines.push(`| ${header.map(() => '---').join(' | ')} |`);

  for (let i = 1; i < tableRows.length; i++) {
    const row = [...tableRows[i]];
    while (row.length < maxCols) {
      row.push('');
    }
    mdLines.push(`| ${row.join(' | ')} |`);
  }

  if (trailingNotes.length > 0) {
    mdLines.push(`\n${trailingNotes.join('\n')}`);
  }

  return mdLines.join('\n');
}

/**
 * Splits a tabular text line into column cells.
 * Supports:
 * 1. Pipe or Box-drawing lines (| col1 | col2 | or │ col1 │ col2 │)
 * 2. Tab-separated lines (\t)
 * 3. Multi-space separated lines (\s{2,})
 */
export function splitTabularLine(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  // 1. Pipe or Box-drawing line: | col1 | col2 | or │ col1 │ col2 │
  const isPipeOrBox =
    (trimmed.startsWith('|') && trimmed.endsWith('|')) ||
    /[│┃║]/.test(trimmed);

  if (isPipeOrBox) {
    const isBorder =
      BOX_BORDER_LINE_REGEX.test(trimmed) &&
      (/[─━═]{2,}/.test(trimmed) || /[┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬]/.test(trimmed));
    if (isBorder) {
      return null;
    }

    const rawCells = trimmed.split(/[│┃║|]/).map((c) => c.trim());
    if (rawCells.length > 0 && rawCells[0] === '') rawCells.shift();
    if (rawCells.length > 0 && rawCells[rawCells.length - 1] === '') rawCells.pop();

    if (rawCells.length >= 2) {
      return rawCells;
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
 * Normalizes plain text tables (multi-space separated, TSV tab-separated, ASCII/Unicode box tables, or pipe tables without dividers)
 * into standard GFM Markdown table syntax (| Col 1 | Col 2 |\n| --- | --- |)
 * so ReactMarkdown with remarkGfm renders clean HTML <table> elements.
 */
export function normalizeTabSeparatedTable(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // 1. Unpack code blocks containing box-drawing tables
  // ONLY match untagged code blocks or blocks tagged with text/txt/ascii/table
  const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)\n```/g;
  let normalizedText = text.replace(codeBlockRegex, (match, lang, codeContent) => {
    const cleanLang = (lang || '').trim().toLowerCase();
    // 绝不对标记了具体编程语言（如 html, js, py, sh, css, json 等）的代码块进行表格解构
    if (cleanLang && !['text', 'txt', 'ascii', 'table'].includes(cleanLang)) {
      return match;
    }
    const converted = convertBoxDrawingCodeBlock(codeContent);
    return converted !== null ? converted : match;
  });

  // Also handle unclosed streaming code blocks containing a box table
  const unclosedMatch = /```([^\n]*)\n([\s\S]+)$/.exec(normalizedText);
  if (unclosedMatch && unclosedMatch[2]) {
    const cleanLang = (unclosedMatch[1] || '').trim().toLowerCase();
    if (!cleanLang || ['text', 'txt', 'ascii', 'table'].includes(cleanLang)) {
      const converted = convertBoxDrawingCodeBlock(unclosedMatch[2]);
      if (converted !== null) {
        normalizedText = normalizedText.slice(0, unclosedMatch.index) + converted;
      }
    }
  }

  const lines = normalizedText.split('\n');
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
        headerRow.push(headerRow.length === maxCols - 1 ? '备注' : `列${headerRow.length + 1}`);
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

  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      flushTableBuffer();
      inCodeBlock = !inCodeBlock;
      resultLines.push(line);
      continue;
    }

    if (inCodeBlock) {
      resultLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    const isBoxBorder =
      BOX_BORDER_LINE_REGEX.test(trimmed) &&
      (/[─━═]{2,}/.test(trimmed) || /[┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬]/.test(trimmed) || /^\+[\-]{2,}\+/.test(trimmed));

    if (isBoxBorder) {
      // Box drawing border or ASCII border: keep tableBuffer intact
      continue;
    }

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

