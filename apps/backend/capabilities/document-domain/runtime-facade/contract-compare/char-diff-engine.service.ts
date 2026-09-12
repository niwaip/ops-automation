import { Injectable } from '@nestjs/common';
import type { DiffToken } from './contract-compare.types';

export interface DiffResult {
  tokens: DiffToken[];
  sourceHtml: string;
  targetHtml: string;
  similarity: number;
}

@Injectable()
export class CharDiffEngineService {
  /**
   * Escape HTML special characters
   */
  public escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Compute fine-grained character/token Myers-style LCS diff
   */
  public computeDiff(source: string, target: string, granularity: 'char' | 'token' = 'char'): DiffResult {
    if (source === target) {
      const safe = this.escapeHtml(source);
      return {
        tokens: [{ type: 'equal', text: source }],
        sourceHtml: safe,
        targetHtml: safe,
        similarity: 1.0,
      };
    }

    if (!source) {
      const safe = this.escapeHtml(target);
      return {
        tokens: [{ type: 'insert', text: target }],
        sourceHtml: '',
        targetHtml: `<ins class="diff-ins">${safe}</ins>`,
        similarity: 0.0,
      };
    }

    if (!target) {
      const safe = this.escapeHtml(source);
      return {
        tokens: [{ type: 'delete', text: source }],
        sourceHtml: `<del class="diff-del">${safe}</del>`,
        targetHtml: '',
        similarity: 0.0,
      };
    }

    const aElements = granularity === 'char' ? Array.from(source) : this.tokenize(source);
    const bElements = granularity === 'char' ? Array.from(target) : this.tokenize(target);

    const tokens = this.lcsDiff(aElements, bElements);

    let lcsCount = 0;
    let sourceHtml = '';
    let targetHtml = '';

    for (const token of tokens) {
      const escaped = this.escapeHtml(token.text);
      if (token.type === 'equal') {
        lcsCount += granularity === 'char' ? token.text.length : 1;
        sourceHtml += escaped;
        targetHtml += escaped;
      } else if (token.type === 'delete') {
        sourceHtml += `<del class="diff-del">${escaped}</del>`;
      } else if (token.type === 'insert') {
        targetHtml += `<ins class="diff-ins">${escaped}</ins>`;
      }
    }

    const totalLen = source.length + target.length;
    const similarity = totalLen > 0 ? Math.min(1.0, (2.0 * lcsCount) / totalLen) : 1.0;

    return {
      tokens,
      sourceHtml,
      targetHtml,
      similarity: Number(similarity.toFixed(4)),
    };
  }

  /**
   * Tokenize text into words/punctuations for token-level diff
   */
  private tokenize(text: string): string[] {
    // Splits English words, Chinese characters, numbers, and whitespaces
    const regex = /[\u4e00-\u9fa5]|[a-zA-Z0-9_]+|\s+|[^\s\w\u4e00-\u9fa5]/g;
    const tokens: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      tokens.push(match[0]);
    }
    return tokens.length > 0 ? tokens : [text];
  }

  /**
   * Classic dynamic programming LCS diff algorithm
   */
  private lcsDiff(a: string[], b: string[]): DiffToken[] {
    const n = a.length;
    const m = b.length;

    // For very long texts, optimize with prefix and suffix trimming
    let start = 0;
    while (start < n && start < m && a[start] === b[start]) {
      start++;
    }

    let endA = n - 1;
    let endB = m - 1;
    while (endA >= start && endB >= start && a[endA] === b[endB]) {
      endA--;
      endB--;
    }

    const trimmedA = a.slice(start, endA + 1);
    const trimmedB = b.slice(start, endB + 1);

    const subTokens = this.dpLcs(trimmedA, trimmedB);

    const result: DiffToken[] = [];
    if (start > 0) {
      result.push({ type: 'equal', text: a.slice(0, start).join('') });
    }
    result.push(...subTokens);
    if (endA < n - 1) {
      result.push({ type: 'equal', text: a.slice(endA + 1).join('') });
    }

    return this.coalesceTokens(result);
  }

  private dpLcs(a: string[], b: string[]): DiffToken[] {
    const n = a.length;
    const m = b.length;

    if (n === 0 && m === 0) return [];
    if (n === 0) return [{ type: 'insert', text: b.join('') }];
    if (m === 0) return [{ type: 'delete', text: a.join('') }];

    // Standard matrix DP for LCS
    // If matrix size is too large (> 4000x4000), fallback to chunked diff
    if (n * m > 16_000_000) {
      return [
        { type: 'delete', text: a.join('') },
        { type: 'insert', text: b.join('') },
      ];
    }

    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find diff
    const rawTokens: DiffToken[] = [];
    let i = n;
    let j = m;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
        rawTokens.push({ type: 'equal', text: a[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        rawTokens.push({ type: 'insert', text: b[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        rawTokens.push({ type: 'delete', text: a[i - 1] });
        i--;
      }
    }

    rawTokens.reverse();
    return this.coalesceTokens(rawTokens);
  }

  /**
   * Merge consecutive tokens of identical type
   */
  private coalesceTokens(tokens: DiffToken[]): DiffToken[] {
    if (tokens.length === 0) return [];
    const merged: DiffToken[] = [];
    let current = { ...tokens[0] };

    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i].type === current.type) {
        current.text += tokens[i].text;
      } else {
        merged.push(current);
        current = { ...tokens[i] };
      }
    }
    merged.push(current);
    return merged;
  }
}
