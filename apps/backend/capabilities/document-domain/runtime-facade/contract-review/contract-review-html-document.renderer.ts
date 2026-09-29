import type {
  ClauseReviewItem,
  DocumentBlock,
  ReviewChapterGroup,
} from './contract-review.types';
import { getLegalHierarchyIndentEm } from '../contract-compare/contract-markdown-formatter.util';

export class ContractReviewHtmlDocumentRenderer {
  /**
   * Render the complete continuous white document paper (60% left column).
   */
  renderDocumentPaper(params: {
    fileName: string;
    contractTypeName: string;
    clauses: ClauseReviewItem[];
    chapters: ReviewChapterGroup[];
  }): string {
    const { fileName, clauses, chapters } = params;

    // Render continuous clauses organized by chapter or sequentially
    const bodyContentHtml =
      chapters && chapters.length > 0
        ? chapters
            .map((ch, idx) => this.renderChapterSection(ch, idx))
            .join('\n')
        : clauses.map((c) => this.renderClause(c)).join('\n');

    return `
    <article id="document-paper-container" class="bg-white border border-[#D9E1EC] shadow-paper rounded-md p-6 sm:p-10 md:p-14 text-[#1E293B] font-sans selection:bg-slate-200 transition-colors">
      <!-- Document Title & Header Area -->
      <header class="border-b border-[#E2E8F0] pb-6 mb-8 text-center">
        <div class="inline-block px-3 py-1 mb-2 rounded bg-slate-100 text-[#475569] text-[11px] font-mono tracking-wider border border-slate-200">
          合同原文底稿 · ${this.escapeHtml(fileName)}
        </div>
        <h1 class="text-xl sm:text-2xl font-bold text-[#1E293B] tracking-tight">
          ${this.escapeHtml(fileName.replace(/\.(docx|pdf|doc|txt)$/i, ''))}
        </h1>
        <p class="text-xs text-[#64748B] mt-2 font-mono">
          全合同共 ${clauses.length} 条款 · 经结构化解析与合规锚点定位
        </p>
      </header>

      <!-- Document Continuous Body -->
      <div id="document-body" class="space-y-6 text-sm leading-relaxed">
        ${bodyContentHtml}
      </div>

      <!-- Document Sign-off / Footer -->
      <footer class="mt-14 pt-8 border-t border-[#E2E8F0] text-center text-xs text-[#64748B] font-mono">
        —— 合同文本结束 ——
      </footer>
    </article>
    `;
  }

  private renderChapterSection(ch: ReviewChapterGroup, chIdx: number): string {
    const chapterLabel = ch.chapterTitle.startsWith(ch.chapterNumber)
      ? ch.chapterTitle
      : ch.chapterNumber === '正文' || ch.chapterNumber === '前言' || ch.chapterNumber === '附件'
      ? ch.chapterTitle
      : `${ch.chapterNumber} ${ch.chapterTitle}`;

    const isBilingualChapter = chapterLabel.includes('/') || chapterLabel.includes('／');
    let chapterTitleZh = chapterLabel;
    let chapterTitleJa = '';
    if (isBilingualChapter) {
      const parts = chapterLabel.split(/[/／]/);
      chapterTitleZh = parts[0].trim();
      chapterTitleJa = parts.slice(1).join(' / ').trim();
    }

    const clausesHtml = ch.clauses.map((c) => this.renderClause(c)).join('\n');

    return `
    <section id="chapter-${ch.chapterIndex || chIdx}" class="chapter-block pt-2">
      <!-- Chapter Section Header -->
      <div class="chapter-header mb-4 pb-2 border-b-2 border-[#CBD5E1] flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 class="text-base sm:text-lg font-bold text-[#1E293B] tracking-tight chapter-title-zh">
            ${this.escapeHtml(chapterTitleZh)}
          </h2>
          ${
            chapterTitleJa
              ? `<div class="text-[12px] text-[#64748B] font-normal mt-0.5 chapter-title-ja">${this.escapeHtml(chapterTitleJa)}</div>`
              : ''
          }
        </div>
        <span class="text-[11px] font-mono text-[#64748B]">共 ${ch.clauses.length} 条</span>
      </div>

      <!-- Clauses in this Chapter -->
      <div class="chapter-clauses space-y-5">
        ${clausesHtml}
      </div>
    </section>
    `;
  }

  private renderClause(c: ClauseReviewItem): string {
    const isPreamble = c.clauseIndex === 0 || c.clauseNumber === '前言';
    const isAnnex = c.clauseNumber?.includes('附件') || (c.title && c.title.includes('附件'));

    const { headingZh, headingJa } = this.normalizeHeading(
      c.clauseNumber,
      c.title,
      isPreamble,
      !!isAnnex
    );

    // Build clause body
    let contentHtml = '';
    if (c.blocks && c.blocks.length > 0) {
      contentHtml = this.renderBlocks(c.blocks, c);
    } else {
      contentHtml = this.renderParagraphText(c.originalContent, c);
    }

    // Has risk / issue indicator on clause level
    const hasHighRisk = c.riskLevel === 'HIGH';
    const hasMediumRisk = c.riskLevel === 'MEDIUM';
    const hasComments = c.comments && c.comments.length > 0;

    return `
    <div id="clause-node-${c.clauseIndex}" class="clause-node relative pt-1 group" data-clause-index="${c.clauseIndex}">
      <!-- Clause Title Row -->
      <div id="clause-heading-${c.clauseIndex}" class="clause-heading flex items-baseline justify-between gap-2 pb-1.5 mb-2 border-b border-[#E2E8F0]">
        <div class="flex items-baseline gap-2 truncate">
          <span class="font-bold text-sm text-[#1E293B] select-text heading-zh">
            ${this.escapeHtml(headingZh)}
          </span>
          ${
            headingJa
              ? `<span class="text-xs text-[#64748B] select-text heading-ja truncate">${this.escapeHtml(headingJa)}</span>`
              : ''
          }
        </div>
        <div class="flex items-center gap-1.5 shrink-0 select-none">
          ${
            hasHighRisk
              ? `<span class="inline-block w-2 h-2 rounded-full bg-[#B42318]" title="存在高风险项"></span>`
              : hasMediumRisk
              ? `<span class="inline-block w-2 h-2 rounded-full bg-[#D97706]" title="存在中风险项"></span>`
              : ''
          }
          ${
            hasComments
              ? `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300" title="包含 ${c.comments!.length} 条 Word 批注">💬 ${c.comments!.length}</span>`
              : ''
          }
          <button
            type="button"
            onclick="openClauseCommentModal(${c.clauseIndex}, '${this.escapeHtml(headingZh)}', event)"
            class="inline-flex items-center text-[11px] text-[#2E5882] hover:text-[#1A2D42] px-2 py-0.5 rounded border border-[#CBD5E1] bg-white hover:bg-slate-100 transition cursor-pointer font-semibold shadow-2xs"
            title="针对该条款追加批注"
          >
            + 批注
          </button>
          <span class="text-[10px] font-mono text-[#667085]">#${c.clauseIndex}</span>
        </div>
      </div>

      <!-- Clause Body Text / Blocks (Clean document body without interrupting banners) -->
      <div class="clause-content pl-0 text-sm leading-relaxed text-[#202833] space-y-2.5">
        ${contentHtml}
      </div>
    </div>
    `;
  }

  private renderBlocks(blocks: DocumentBlock[], clause: ClauseReviewItem): string {
    return blocks
      .map((b, blockIdx) => {
        // 1. Bilingual Pair Block
        if (b.type === 'bilingual_pair') {
          const indent = getLegalHierarchyIndentEm(b.prefix || b.primaryText || '');
          const primaryText = this.formatInlineBlanks(b.primaryHtml || this.escapeHtml(b.primaryText || ''), clause);
          const secondaryText = b.secondaryHtml || b.secondaryText
            ? this.formatInlineBlanks(b.secondaryHtml || this.escapeHtml(b.secondaryText || ''), clause)
            : '';

          return `
          <div class="bilingual-pair mb-2.5" data-block-id="${b.id || blockIdx}" style="${indent > 0 ? `padding-left: ${indent}em; ` : ''}line-height: 1.7;">
            <div class="lang-primary text-sm leading-relaxed text-[#202833] flex items-start gap-2">
              ${b.prefix ? `<span class="font-mono text-xs text-[#667085] font-semibold shrink-0 select-none">${this.escapeHtml(b.prefix)}</span>` : ''}
              <div class="flex-1 select-text">${primaryText}</div>
            </div>
            ${
              secondaryText
                ? `
            <div class="lang-secondary text-[12px] leading-normal text-[#667085] mt-1 pl-4 border-l border-slate-200 select-text">
              ${secondaryText}
            </div>`
                : ''
            }
          </div>
          `;
        }

        // 2. Key-Value Metadata Grid (Clause 0 or contract properties)
        if (b.type === 'key_value_grid' && b.metadata && b.metadata.length > 0) {
          return `
          <div class="metadata-grid my-3 p-3 bg-[#F9FAFB] border border-[#E2E5EA] rounded text-xs">
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              ${b.metadata
                .map(
                  (m) => `
                <div class="flex items-baseline gap-2">
                  <dt class="text-[#667085] font-medium shrink-0">${this.escapeHtml(m.key)}：</dt>
                  <dd class="text-[#202833] font-semibold flex-1 break-words">${this.formatInlineBlanks(this.escapeHtml(m.value), clause)}</dd>
                </div>
              `
                )
                .join('')}
            </dl>
          </div>
          `;
        }

        // 3. Table Block
        if (b.type === 'table' && b.tableData && b.tableData.rows.length > 0) {
          return `
          <div class="table-container my-3 overflow-x-auto border border-[#E2E5EA] rounded-xs">
            <table class="min-w-full text-xs text-left divide-y divide-[#E2E5EA]">
              <tbody class="divide-y divide-[#F0F2F5] bg-white">
                ${b.tableData.rows
                  .map(
                    (row, rIdx) => `
                  <tr class="${rIdx % 2 === 0 ? 'bg-white' : 'bg-[#F9FAFB]'}">
                    ${row
                      .map(
                        (cell) => `
                      <td class="px-3 py-2 text-[#202833] align-top leading-relaxed select-text">${this.formatInlineBlanks(this.escapeHtml(cell), clause)}</td>
                    `
                      )
                      .join('')}
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          `;
        }

        // 4. Heading Block inside Clause
        if (b.type === 'heading') {
          return `
          <h3 class="text-sm font-bold text-[#202833] mt-2 mb-1">
            <span class="heading-primary">${b.primaryHtml || this.escapeHtml(b.primaryText || '')}</span>
            ${b.secondaryText ? `<span class="text-xs font-normal text-[#667085] ml-2 heading-secondary">/ ${this.escapeHtml(b.secondaryText)}</span>` : ''}
          </h3>
          `;
        }

        // 5. List Item Block
        if (b.type === 'list_item') {
          const indent = getLegalHierarchyIndentEm(b.prefix || b.primaryText || '');
          const content = this.formatInlineBlanks(b.primaryHtml || this.escapeHtml(b.primaryText || ''), clause);
          return `
          <div class="list-item flex items-start gap-2 mb-2" style="padding-left: ${Math.max(0.5, indent)}em; line-height: 1.7;">
            ${
              b.prefix
                ? `<span class="font-mono text-xs font-semibold text-[#667085] shrink-0 select-none">${this.escapeHtml(b.prefix)}</span>`
                : `<span class="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0"></span>`
            }
            <div class="text-sm leading-relaxed text-[#202833] flex-1 select-text ${b.isBold ? 'font-semibold' : ''}">
              ${content}
            </div>
          </div>
          `;
        }

        // 6. Standard Paragraph Block
        const indent = getLegalHierarchyIndentEm(b.prefix || b.primaryText || '');
        const pContent = this.formatInlineBlanks(b.primaryHtml || this.escapeHtml(b.primaryText || ''), clause);
        return `
        <p class="paragraph mb-2 text-sm leading-relaxed text-[#202833] select-text ${b.alignment === 'center' ? 'text-center font-bold' : ''} ${b.isBold ? 'font-semibold' : ''}" style="${indent > 0 ? `padding-left: ${indent}em; ` : ''}line-height: 1.7;">
          ${b.prefix ? `<span class="font-mono text-xs font-semibold text-[#667085] mr-1.5 select-none">${this.escapeHtml(b.prefix)}</span>` : ''}${pContent}
        </p>
        `;
      })
      .join('\n');
  }

  private renderParagraphText(text: string, clause: ClauseReviewItem): string {
    const rawParagraphs = (text || '').split(/\n\n+/);
    return rawParagraphs
      .map((p) => {
        const trimmed = p.trim();
        if (!trimmed) return '';
        const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const mergedItems: string[] = [];
        let currentItem = '';

        for (const line of lines) {
          const isItemStart = /^(\d+(?:\.\d+)+|[（(](?:[0-9一二三四五六七八九十a-zA-Z]+)[）)]|[一二三四五六七八九十]+[、.]|[0-9a-zA-Z][)）.、]|#{1,6}\s+|[-—_*]{3,})/.test(line);
          if (isItemStart || !currentItem) {
            if (currentItem) mergedItems.push(currentItem);
            currentItem = line;
          } else {
            const prevChar = currentItem.slice(-1);
            const nextChar = line.slice(0, 1);
            const isCjk = /[\u4e00-\u9fa5\u3040-\u30ff]/.test(prevChar) || /[\u4e00-\u9fa5\u3040-\u30ff]/.test(nextChar);
            currentItem += (isCjk ? '' : ' ') + line;
          }
        }
        if (currentItem) mergedItems.push(currentItem);

        const formattedLines = mergedItems.map((item) => {
          const indent = getLegalHierarchyIndentEm(item);
          const formatted = this.formatInlineBlanks(this.escapeHtml(item), clause);
          if (indent > 0) {
            return `<div class="clause-hierarchical-line" style="padding-left: ${indent}em; margin-bottom: 0.375rem; line-height: 1.7;">${formatted}</div>`;
          }
          return `<div class="clause-hierarchical-line" style="margin-bottom: 0.375rem; line-height: 1.7;">${formatted}</div>`;
        });
        return `<div class="paragraph mb-2.5 text-sm leading-relaxed text-[#202833] select-text">${formattedLines.join('')}</div>`;
      })
      .join('\n');
  }

  /**
   * Highlights inline draft blanks (____), placeholder brackets ([____], <待填...>),
   * and wraps matched evidence quotes with <mark> tags for interactive selection.
   */
  private formatInlineBlanks(escapedText: string, clause: ClauseReviewItem): string {
    if (!escapedText) return '';

    // 防御性清理可能残留的双重转义字符实体（如 &amp;#160; 或 &#160;），替换为标准 HTML 不换行空格
    const sanitizedText = escapedText.replace(/&amp;#160;|&amp;nbsp;|&#160;|&nbsp;/g, '&nbsp;');

    // 1. Highlight blanks: consecutive underlines, empty brackets, or unfilled markers
    let formatted = sanitizedText.replace(
      /([_＿]{2,}|\[[_＿\s]+\]|\[待填[^\]]*\]|&lt;待填[^&]*&gt;|\{[^}]+\})/g,
      '<span class="inline-blank px-1 py-0.2 bg-[#FEF3C7] text-[#9A6700] border-b border-[#F59E0B] rounded-xs font-mono text-xs font-semibold select-all" title="待填报要素/空白">$1</span>'
    );

    // 2. Inject evidence marks if findings quote specific phrases (Distinct legal risk markings)
    if (clause.findings && clause.findings.length > 0) {
      for (const f of clause.findings) {
        if (f.evidenceQuote && f.evidenceQuote.trim().length >= 4) {
          const quoteEscaped = this.escapeHtml(f.evidenceQuote.trim());
          if (formatted.includes(quoteEscaped)) {
            const findingId = f.id || `clause-${clause.clauseIndex}`;
            const isHigh = f.severity === 'HIGH' || clause.riskLevel === 'HIGH';
            const riskBadgeClass = isHigh ? 'evidence-risk-badge-high' : 'evidence-risk-badge-medium';
            const markClass = isHigh ? 'evidence-mark-high' : 'evidence-mark-medium';
            const markTitle = `【审查检出风险】${this.escapeHtml(f.title || '条款合规预警')}（点击在右侧查看审查意见）`;
            const markHtml = `<mark id="evidence-target-${findingId}" class="evidence-mark ${markClass} transition-all cursor-pointer select-text" data-finding-id="${findingId}" onclick="selectFinding('${findingId}')" title="${markTitle}">${quoteEscaped}<span class="evidence-risk-badge ${riskBadgeClass}" onclick="selectFinding('${findingId}', true)">⚠️ 审查风险</span></mark>`;
            formatted = formatted.replace(quoteEscaped, markHtml);
          }
        }
      }
    }

    // 3. Inject Word comment highlights and badge markers (Distinct Word comment markings)
    if (clause.comments && clause.comments.length > 0) {
      for (const comment of clause.comments) {
        if (comment.selectedText && comment.selectedText.trim().length >= 2) {
          const commentEscaped = this.escapeHtml(comment.selectedText.trim());
          if (formatted.includes(commentEscaped)) {
            const commentTitle = `【Word 原生批注】${this.escapeHtml(comment.author || '审阅人')}：${this.escapeHtml(comment.text || '')}（点击在右侧查看详情与回复）`;
            const commentMarkHtml = `<mark id="comment-target-${comment.id}" class="docx-comment-highlight rounded-xs px-0.5 transition-all cursor-pointer hover:bg-amber-200 select-text" data-comment-id="${comment.id}" onclick="handleCommentClick('${comment.id}', ${clause.clauseIndex}, event)" title="${commentTitle}">${commentEscaped}<span class="docx-comment-badge" onclick="handleCommentClick('${comment.id}', ${clause.clauseIndex}, event)">💬 批注 #${comment.id}</span></mark>`;
            formatted = formatted.replace(commentEscaped, commentMarkHtml);
          }
        }
      }
    }

    return formatted;
  }

  private normalizeHeading(
    clauseNumber: string,
    rawTitle: string,
    isPreamble: boolean,
    isAnnex: boolean
  ): { headingZh: string; headingJa: string } {
    const title = (rawTitle || '').trim();
    if (!title) {
      return { headingZh: clauseNumber || '', headingJa: '' };
    }

    let zhPart = title;
    let jaPart = '';
    if (title.includes('/') || title.includes('／')) {
      const parts = title.split(/[/／]/);
      zhPart = parts[0].trim();
      jaPart = parts.slice(1).join(' / ').trim();
    }

    if (isPreamble || isAnnex) {
      return { headingZh: zhPart, headingJa: jaPart };
    }

    // Generic numeral prefix stripper: strips "1. ", "1、", "第1条 ", "第二条 ", "1.0 "
    const genericNumberPrefix = /^(第\s*(\d+|[一二三四五六七八九十百]+)\s*条\s*[.、:：\s]?|(\d+|[一二三四五六七八九十百]+)\s*[.、:：\s])\s*/i;

    if (clauseNumber) {
      zhPart = zhPart.replace(genericNumberPrefix, '').trim();
      if (clauseNumber && zhPart.startsWith(clauseNumber)) {
        zhPart = zhPart.slice(clauseNumber.length).replace(/^[.、:：\s]+/, '').trim();
      }
      if (jaPart) {
        jaPart = jaPart.replace(genericNumberPrefix, '').trim();
      }
    }

    const finalZh =
      clauseNumber && zhPart
        ? `${clauseNumber} ${zhPart}`
        : clauseNumber || zhPart;

    return { headingZh: finalZh, headingJa: jaPart };
  }

  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

