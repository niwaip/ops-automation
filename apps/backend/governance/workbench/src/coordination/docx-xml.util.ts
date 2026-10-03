/**
 * OpenXML & XML Entity Encoding/Decoding Utilities
 */

export function escapeXml(unsafe: string = ''): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function unescapeXml(safe: string = ''): string {
  if (!safe) return '';
  return String(safe)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function toChineseNumber(num: number): string {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (num <= 10) return digits[num] || String(num);
  if (num < 20) return `十${digits[num % 10] || ''}`;
  const tens = Math.floor(num / 10);
  const ones = num % 10;
  return `${digits[tens]}十${ones > 0 ? digits[ones] : ''}`;
}

/**
 * 解析中文或阿拉伯数字序号（例如 "2", "第二条", "七", "十二", "第23条" -> 2, 2, 7, 12, 23）
 */
export function parseClauseNumber(input?: string | number): number | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input === 'number') return isNaN(input) ? undefined : input;

  const str = String(input).trim();
  if (!str) return undefined;

  // 1. 若包含阿拉伯数字，如 "第2条", "2.", "2"
  const arabicMatch = str.match(/\d+/);
  if (arabicMatch) {
    const parsed = parseInt(arabicMatch[0], 10);
    if (!isNaN(parsed)) return parsed;
  }

  // 2. 若为中文数字，如 "第二条", "二", "十二", "二十一"
  const cnMatch = str.match(/[一二三四五六七八九十百]+/);
  if (cnMatch) {
    const cnStr = cnMatch[0];
    const cnDigits: Record<string, number> = {
      '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
      '五': 5, '六': 6, '七': 7, '八': 8, '九': 9
    };

    let total = 0;
    let current = 0;
    for (let i = 0; i < cnStr.length; i++) {
      const ch = cnStr[i];
      if (cnDigits[ch] !== undefined) {
        current = cnDigits[ch];
      } else if (ch === '十') {
        total += (current === 0 ? 1 : current) * 10;
        current = 0;
      } else if (ch === '百') {
        total += (current === 0 ? 1 : current) * 100;
        current = 0;
      }
    }
    total += current;
    if (total > 0) return total;
  }

  return undefined;
}

export function deduplicateRejectionText(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.trim();

  // 1. 若整段内容被重复追加了一遍（前一半与后一半完全一致）
  const half = Math.floor(text.length / 2);
  const part1 = text.slice(0, half).trim();
  const part2 = text.slice(half).trim();
  if (part1 && part1 === part2) {
    text = part1;
  }

  // 2. 若存在重复的大标题标记（如【合同智能审阅结论与审批意见】出现了两次）
  const marker = '【合同智能审阅结论与审批意见】';
  const firstIdx = text.indexOf(marker);
  if (firstIdx !== -1) {
    const secondIdx = text.indexOf(marker, firstIdx + marker.length);
    if (secondIdx !== -1) {
      const firstSection = text.slice(firstIdx, secondIdx).trim();
      const secondSection = text.slice(secondIdx).trim();
      if (firstSection === secondSection || secondSection.startsWith(firstSection.slice(0, 40))) {
        text = text.slice(0, secondIdx).trim();
      }
    }
  }

  // 3. 若存在重复的【法务审查处理意见与修改要求】
  const opinionMarker = '【法务审查处理意见与修改要求】';
  const fOpIdx = text.indexOf(opinionMarker);
  if (fOpIdx !== -1) {
    const sOpIdx = text.indexOf(opinionMarker, fOpIdx + opinionMarker.length);
    if (sOpIdx !== -1) {
      text = text.slice(0, sOpIdx).trim();
    }
  }

  return text;
}

import * as JSZipModule from 'jszip';

export function getJSZip(): any {
  const lib: any = JSZipModule;
  if (typeof lib === 'function') return lib;
  if (typeof lib?.default === 'function') return lib.default;
  return lib;
}

/**
 * 确保 XML 根元素声明了指定的命名空间（杜绝 unbound prefix 错误）
 */
export function ensureRootNamespaces(
  xml: string,
  namespaces: Record<string, string>
): string {
  if (!xml) return xml;
  const rootTagMatch = xml.match(/<([a-zA-Z0-9_\-:]+)([\s\S]*?)>/);
  if (!rootTagMatch) return xml;

  const fullTag = rootTagMatch[0];
  const tagName = rootTagMatch[1];
  const tagAttrs = rootTagMatch[2];

  let addedAttrs = '';
  for (const [prefix, uri] of Object.entries(namespaces)) {
    const attrPattern = prefix === '' ? /\bxmlns=/ : new RegExp(`\\bxmlns:${prefix}=`);
    if (!attrPattern.test(tagAttrs)) {
      const attrName = prefix === '' ? 'xmlns' : `xmlns:${prefix}`;
      addedAttrs += ` ${attrName}="${uri}"`;
    }
  }

  if (!addedAttrs) return xml;

  if (fullTag.endsWith('/>')) {
    const newTag = `<${tagName}${tagAttrs.slice(0, -2)}${addedAttrs}/>`;
    return xml.replace(fullTag, newTag);
  } else {
    const newTag = `<${tagName}${tagAttrs}${addedAttrs}>`;
    return xml.replace(fullTag, newTag);
  }
}

interface ParsedRunInfo {
  fullRunXml: string;
  rPrXml: string;
  plainText: string;
  startOffset: number;
  endOffset: number;
  runXmlStart: number;
  runXmlEnd: number;
}

/**
 * 将 commentRangeStart 与 commentRangeEnd 精确包装到目标选区外层，生成完全合规的 WordprocessingML
 * 严格保证：
 * 1. 原地切片替换目标 Run，完整保留段落内所有书签、超链接、既有批注标记与格式属性
 * 2. commentRangeStart/End 与 w:r 同为 w:p 或 w:hyperlink 的直接子元素，严禁嵌套在 w:r 内部
 * 3. 严格保留段落首部包含前导换行空白的 w:pPr
 */
export function injectCommentRangeIntoParagraph(
  paragraphXml: string,
  commentId: string,
  targetSnippet?: string
): string {
  const startTag = `<w:commentRangeStart w:id="${commentId}"/>`;
  const endTag = `<w:commentRangeEnd w:id="${commentId}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${commentId}"/></w:r>`;

  // 1. 若提供了划词片段，尝试在段落 run 文本中精确切分并包裹选区
  if (targetSnippet && targetSnippet.length >= 2) {
    const cleanSnippet = unescapeXml(targetSnippet).trim();
    const runs: ParsedRunInfo[] = [];
    const runRegex = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
    let rm: RegExpExecArray | null;
    let totalText = '';

    while ((rm = runRegex.exec(paragraphXml)) !== null) {
      const fullRunXml = rm[0];
      const rBody = rm[1];
      const runXmlStart = rm.index;
      const runXmlEnd = rm.index + fullRunXml.length;

      const rPrMatch = rBody.match(/<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/);
      const rPrXml = rPrMatch ? rPrMatch[0] : '';

      // 提取本 run 中的所有文本内容
      let runText = '';
      const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
      let tm: RegExpExecArray | null;
      while ((tm = tRegex.exec(rBody)) !== null) {
        runText += unescapeXml(tm[1]);
      }

      const startOffset = totalText.length;
      totalText += runText;
      const endOffset = totalText.length;

      runs.push({
        fullRunXml,
        rPrXml,
        plainText: runText,
        startOffset,
        endOffset,
        runXmlStart,
        runXmlEnd,
      });
    }

    let matchStart = totalText.indexOf(cleanSnippet);
    let matchEnd = matchStart !== -1 ? matchStart + cleanSnippet.length : -1;

    if (matchStart === -1) {
      // 容错：去空格去标点再次尝试定位字符偏移
      const normTotal = totalText.replace(/[\s\r\n“”"''《》,，。；;：:]/g, '');
      const normSnippet = cleanSnippet.replace(/[\s\r\n“”"''《》,，。；;：:]/g, '');
      const normIdx = normTotal.indexOf(normSnippet);
      if (normIdx !== -1 && normSnippet.length >= 2) {
        // 反查在原始 totalText 中的起止位置
        let normCount = 0;
        let origStart = -1;
        let origEnd = -1;
        for (let i = 0; i < totalText.length; i++) {
          if (!/[\s\r\n“”"''《》,，。；;：:]/.test(totalText[i])) {
            if (normCount === normIdx && origStart === -1) origStart = i;
            normCount++;
            if (normCount === normIdx + normSnippet.length) {
              origEnd = i + 1;
              break;
            }
          }
        }
        if (origStart !== -1 && origEnd !== -1) {
          matchStart = origStart;
          matchEnd = origEnd;
        }
      }
    }

    if (matchStart !== -1 && matchEnd > matchStart) {
      const matchedRuns = runs.filter(
        (r) => r.plainText.length > 0 && r.startOffset < matchEnd && r.endOffset > matchStart
      );

      if (matchedRuns.length === 1) {
        const run = matchedRuns[0];
        const relativeStart = Math.max(0, matchStart - run.startOffset);
        const relativeEnd = Math.min(run.plainText.length, matchEnd - run.startOffset);

        const before = run.plainText.slice(0, relativeStart);
        const selected = run.plainText.slice(relativeStart, relativeEnd);
        const after = run.plainText.slice(relativeEnd);
        const rPr = run.rPrXml;

        let replacement = '';
        if (before) {
          replacement += `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(before)}</w:t></w:r>`;
        }
        replacement += startTag;
        if (selected) {
          replacement += `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(selected)}</w:t></w:r>`;
        }
        replacement += endTag;
        if (after) {
          replacement += `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(after)}</w:t></w:r>`;
        }

        return paragraphXml.slice(0, run.runXmlStart) + replacement + paragraphXml.slice(run.runXmlEnd);
      } else if (matchedRuns.length > 1) {
        const firstRun = matchedRuns[0];
        const lastRun = matchedRuns[matchedRuns.length - 1];

        // 倒序切片替换：先替换 lastRun，再替换 firstRun，保证 firstRun 偏移下标不发生漂移
        const lastRelEnd = Math.min(lastRun.plainText.length, matchEnd - lastRun.startOffset);
        const lastSelected = lastRun.plainText.slice(0, lastRelEnd);
        const lastAfter = lastRun.plainText.slice(lastRelEnd);
        let lastReplacement = '';
        if (lastSelected) {
          lastReplacement += `<w:r>${lastRun.rPrXml}<w:t xml:space="preserve">${escapeXml(lastSelected)}</w:t></w:r>`;
        }
        lastReplacement += endTag;
        if (lastAfter) {
          lastReplacement += `<w:r>${lastRun.rPrXml}<w:t xml:space="preserve">${escapeXml(lastAfter)}</w:t></w:r>`;
        }

        const firstRelStart = Math.max(0, matchStart - firstRun.startOffset);
        const firstBefore = firstRun.plainText.slice(0, firstRelStart);
        const firstSelected = firstRun.plainText.slice(firstRelStart);
        let firstReplacement = '';
        if (firstBefore) {
          firstReplacement += `<w:r>${firstRun.rPrXml}<w:t xml:space="preserve">${escapeXml(firstBefore)}</w:t></w:r>`;
        }
        firstReplacement += startTag;
        if (firstSelected) {
          firstReplacement += `<w:r>${firstRun.rPrXml}<w:t xml:space="preserve">${escapeXml(firstSelected)}</w:t></w:r>`;
        }

        // 仅原地替换首尾 run，中间 run 及其它结构（如书签、超链接、既有批注标记）完全保持原位
        let updatedXml = paragraphXml.slice(0, lastRun.runXmlStart) + lastReplacement + paragraphXml.slice(lastRun.runXmlEnd);
        updatedXml = updatedXml.slice(0, firstRun.runXmlStart) + firstReplacement + updatedXml.slice(firstRun.runXmlEnd);
        return updatedXml;
      }
    }
  }

  // 2. 兜底方案：未匹配到特定 run 选区时，将批注范围安全插入段落级，严格保留前导换行与 w:pPr
  const pPrMatch = paragraphXml.match(/<w:pPr(?:\s[^>]*)?>[\s\S]*?<\/w:pPr>/);
  let insertStartPos: number;
  if (pPrMatch && pPrMatch.index !== undefined) {
    insertStartPos = pPrMatch.index + pPrMatch[0].length;
  } else {
    const pOpenMatch = paragraphXml.match(/^<w:p(?:\s[^>]*)?>/);
    insertStartPos = pOpenMatch ? pOpenMatch[0].length : 0;
  }

  const pCloseIdx = paragraphXml.lastIndexOf('</w:p>');
  if (pCloseIdx !== -1) {
    return (
      paragraphXml.slice(0, insertStartPos) +
      startTag +
      paragraphXml.slice(insertStartPos, pCloseIdx) +
      endTag +
      paragraphXml.slice(pCloseIdx)
    );
  }

  return `${startTag}${paragraphXml}${endTag}`;
}
