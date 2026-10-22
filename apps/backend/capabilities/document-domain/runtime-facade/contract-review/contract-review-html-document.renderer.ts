import type {
  ClauseReviewItem,
  DocumentBlock,
  ReviewChapterGroup,
} from './contract-review.types';
import { getLegalHierarchyIndentEm } from '../contract-compare/contract-markdown-formatter.util';
import { ReviewIcons } from './contract-review-html-icons.util';

export class ContractReviewHtmlDocumentRenderer {
  /**
   * Render the complete continuous white document paper (60% left column).
   */
  renderDocumentPaper(params: {
    fileName: string;
    contractTypeName: string;
    clauses: ClauseReviewItem[];
    chapters: ReviewChapterGroup[];
    secondaryLang?: string;
  }): string {
    const { fileName, clauses, chapters, secondaryLang } = params;

    // Render continuous clauses organized by chapter or sequentially
    const bodyContentHtml =
      chapters && chapters.length > 0
        ? chapters
            .map((ch, idx) => this.renderChapterSection(ch, idx, secondaryLang))
            .join('\n')
        : clauses.map((c) => this.renderClause(c)).join('\n');

    return `
    <article id="document-paper-container" class="bg-[#FAFAFA] border border-[#D9E1EC] shadow-paper rounded-md p-6 sm:p-10 md:p-14 text-[#1E293B] font-sans selection:bg-slate-200 transition-colors">
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
      <div id="document-body" class="space-y-6 text-[15px] leading-[1.8]">
        ${bodyContentHtml}
      </div>

      <!-- Document Sign-off / Footer -->
      <footer class="mt-14 pt-8 border-t border-[#E2E8F0] text-center text-xs text-[#64748B] font-mono">
        —— 合同文本结束 ——
      </footer>
    </article>
    `;
  }

  private renderChapterSection(
    ch: ReviewChapterGroup,
    chIdx: number,
    secondaryLang?: string
  ): string {
    const chapterLabel = ch.chapterTitle.startsWith(ch.chapterNumber)
      ? ch.chapterTitle
      : ch.chapterNumber === '正文' || ch.chapterNumber === '前言' || ch.chapterNumber === '附件'
      ? ch.chapterTitle
      : `${ch.chapterNumber} ${ch.chapterTitle}`;

    const isBilingualChapter = chapterLabel.includes('/') || chapterLabel.includes('／');
    let chapterTitleZh = chapterLabel;
    let chapterTitleJa = '';

    const DEFAULT_CHAPTER_TRANSLATIONS: Record<string, { ja: string; en: string }> = {
      '合同正文条款': { ja: '契約本文条項', en: 'Contract Terms & Conditions' },
      '合同引言与签约主体': { ja: '契約前文および当事者情報', en: 'Preamble & Parties' },
      '合同附件与补充协议': { ja: '付属文書および追加合意', en: 'Annexes & Addenda' },
    };

    if (isBilingualChapter) {
      const parts = chapterLabel.split(/[/／]/);
      chapterTitleZh = parts[0].trim();
      chapterTitleJa = parts.slice(1).join(' / ').trim();
    } else if (secondaryLang && DEFAULT_CHAPTER_TRANSLATIONS[chapterTitleZh]) {
      const translation = DEFAULT_CHAPTER_TRANSLATIONS[chapterTitleZh];
      chapterTitleJa = secondaryLang === 'en' ? translation.en : translation.ja;
    }

    const clausesHtml = ch.clauses.map((c) => this.renderClause(c)).join('\n');

    // Only apply language-specific CSS classes when both languages exist;
    // otherwise use a neutral class so the title stays visible in all language modes.
    const hasBothChapterLangs = Boolean(chapterTitleZh && chapterTitleJa);
    const chTitleZhClass = hasBothChapterLangs ? 'chapter-title-zh' : '';
    const chTitleJaClass = 'chapter-title-ja';

    return `
    <section id="chapter-${ch.chapterIndex || chIdx}" class="chapter-block pt-2">
      <!-- Chapter Section Header -->
      <div class="chapter-header mb-4 pb-2 border-b-2 border-[#CBD5E1] flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 class="text-base sm:text-lg font-bold text-[#1E293B] tracking-tight ${chTitleZhClass}">
            ${this.escapeHtml(chapterTitleZh)}
          </h2>
          ${
            chapterTitleJa
              ? `<div class="text-[12px] text-[#64748B] font-normal mt-0.5 ${chTitleJaClass}">${this.escapeHtml(chapterTitleJa)}</div>`
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

    const normalized = this.normalizeHeading(
      c.clauseNumber,
      c.title,
      isPreamble,
      !!isAnnex
    );
    const headingZh = normalized.headingZh;
    let headingSecondary = (c.titleJa || normalized.headingJa || '').trim();

    // Fallback: If titleJa is not explicitly populated, check if the first block is a heading with secondaryText
    if (!headingSecondary && c.blocks && c.blocks[0]?.type === 'heading' && c.blocks[0].secondaryText) {
      headingSecondary = c.blocks[0].secondaryText.replace(/^[:：\s]+|[:：\s]+$/g, '').trim();
    }

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

    // Only apply language-specific CSS classes when both languages exist;
    // otherwise the heading stays visible regardless of language mode.
    const headingZhClass = headingSecondary ? 'heading-zh' : '';

    return `
    <div id="clause-node-${c.clauseIndex}" class="clause-node relative pt-1 group" data-clause-index="${c.clauseIndex}">
      <!-- Clause Title Row -->
      <div id="clause-heading-${c.clauseIndex}" class="clause-heading flex items-baseline justify-between gap-2 pb-1.5 mb-2 border-b border-[#E2E8F0]">
        <div class="flex items-baseline gap-2 truncate">
          <span class="font-bold text-sm text-[#1E293B] select-text ${headingZhClass}">
            ${this.escapeHtml(headingZh)}
          </span>
          ${
            headingSecondary
              ? `<span class="text-xs text-[#64748B] select-text heading-ja truncate">${this.escapeHtml(headingSecondary)}</span>`
              : ''
          }
        </div>
        <div class="flex items-center gap-1.5 shrink-0 select-none">
          ${(() => {
            const primaryFinding = c.findings && c.findings.length > 0 ? c.findings[0] : null;
            const primaryFindingId = primaryFinding
              ? (primaryFinding.id?.startsWith('finding-') ? primaryFinding.id : `finding-${primaryFinding.id}`)
              : (hasHighRisk || hasMediumRisk ? `finding-clause-${c.clauseIndex}` : '');
            if (hasHighRisk) {
              return `<span class="inline-block w-2 h-2 rounded-full bg-[#B42318] cursor-pointer" data-finding-id="${primaryFindingId}" onclick="selectFinding('${primaryFindingId}')" title="存在高风险项 (审查风险预警)"></span>`;
            }
            if (hasMediumRisk) {
              return `<span class="inline-block w-2 h-2 rounded-full bg-[#D97706] cursor-pointer" data-finding-id="${primaryFindingId}" onclick="selectFinding('${primaryFindingId}')" title="存在中风险项 (审查风险预警)"></span>`;
            }
            return '';
          })()}
          ${
            hasComments
              ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300" title="包含 ${c.comments!.length} 条 Word 批注">${ReviewIcons.comment('w-3.5 h-3.5 text-amber-800')}<span>${c.comments!.length}</span></span>`
              : ''
          }
          <span class="text-xs font-mono text-[#667085]">#${c.clauseIndex}</span>
        </div>
      </div>

      <!-- Clause Body Text / Blocks (Clean document body without interrupting banners) -->
      <div class="clause-content pl-0 text-[15px] leading-[1.75] text-[#202833] space-y-3">
        ${contentHtml}
      </div>
    </div>
    `;
  }

  private renderBlocks(blocks: DocumentBlock[], clause: ClauseReviewItem): string {
    return blocks
      .map((b, blockIdx) => {
        // Suppress the first heading block if it duplicates the clause-level title
        // (which is already rendered with both languages in the clause heading row above).
        // Never suppress in preamble (clauseIndex === 0) or if it represents the centered contract title.
        const isDocMainTitle = clause.clauseIndex === 0 || b.alignment === 'center';
        if (blockIdx === 0 && b.type === 'heading' && !isDocMainTitle) {
          const title = (clause.title || '').trim();
          const heading = (b.primaryText || '').trim();
          if (title.includes(heading) || (heading && title && heading.includes(title))) {
            return '';
          }
        }

        // 1. Bilingual Pair Block
        if (b.type === 'bilingual_pair') {
          const indent = getLegalHierarchyIndentEm(b.prefix || b.primaryText || '');
          const cleanPrimary = this.stripDuplicatePrefix(b.primaryHtml || this.escapeHtml(b.primaryText || ''), b.prefix);
          const primaryText = this.formatInlineBlanks(cleanPrimary, clause);
          const cleanSecondary = this.stripDuplicatePrefix(b.secondaryHtml || this.escapeHtml(b.secondaryText || ''), b.prefix);
          const secondaryText = cleanSecondary ? this.formatInlineBlanks(cleanSecondary, clause) : '';

          return `
          <div class="bilingual-pair mb-3.5" data-block-id="${b.id || blockIdx}" style="${indent > 0 ? `padding-left: ${indent}em; ` : ''}line-height: 1.8;">
            <div class="lang-primary text-[15px] leading-[1.8] text-[#202833] flex items-start gap-2.5">
              ${b.prefix ? `<span class="font-mono text-xs text-[#667085] font-semibold shrink-0 select-none">${this.escapeHtml(b.prefix)}</span>` : ''}
              <div class="flex-1 select-text">${primaryText}</div>
            </div>
            ${
              secondaryText
                ? `
            <div class="lang-secondary text-xs leading-normal text-[#667085] mt-1.5 pl-4 border-l border-slate-200 select-text">
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
        if (
          b.type === 'table' &&
          b.tableData &&
          ((b.tableData.rows && b.tableData.rows.length > 0) ||
            (b.tableData.headers && b.tableData.headers.length > 0))
        ) {
          const headers = b.tableData.headers || [];
          const rows = b.tableData.rows || [];
          return `
          <div class="table-container my-3 overflow-x-auto border border-[#E2E5EA] rounded-xs shadow-xs">
            <table class="w-full min-w-full text-xs text-left divide-y divide-[#E2E5EA] border-collapse" style="width: 100%;">
              ${
                headers.length > 0
                  ? `
              <thead class="bg-[#F1F5F9] text-[#334155] font-semibold border-b border-[#E2E5EA]">
                <tr>
                  ${headers
                    .map((headerCell, hIdx) => {
                      const text = typeof headerCell === 'string' ? headerCell : headerCell?.text || '';
                      const colSpan =
                        typeof headerCell === 'object' && headerCell?.colSpan && headerCell.colSpan > 1
                          ? ` colspan="${headerCell.colSpan}"`
                          : '';
                      const rowSpan =
                        typeof headerCell === 'object' && headerCell?.rowSpan && headerCell.rowSpan > 1
                          ? ` rowspan="${headerCell.rowSpan}"`
                          : '';
                      const widthStyle = headers.length === 3
                        ? (hIdx === 0 ? ' style="width: 20%;"' : ' style="width: 40%;"')
                        : (headers.length === 2 ? ' style="width: 50%;"' : '');
                      return `<th class="px-3 py-2 text-[#334155] font-semibold align-top leading-relaxed select-text bg-[#F1F5F9] border-r border-[#E2E5EA] last:border-r-0"${colSpan}${rowSpan}${widthStyle}>${this.formatInlineBlanks(this.escapeHtml(text), clause)}</th>`;
                    })
                    .join('')}
                </tr>
              </thead>
              `
                  : ''
              }
              <tbody class="divide-y divide-[#F0F2F5] bg-white">
                ${rows
                  .map(
                    (row, rIdx) => `
                  <tr class="${rIdx % 2 === 0 ? 'bg-white' : 'bg-[#F9FAFB]'}">
                    ${row
                      .map((cell) => {
                        const text = typeof cell === 'string' ? cell : cell?.text || '';
                        const colSpan =
                          typeof cell === 'object' && cell?.colSpan && cell.colSpan > 1
                            ? ` colspan="${cell.colSpan}"`
                            : '';
                        const rowSpan =
                          typeof cell === 'object' && cell?.rowSpan && cell.rowSpan > 1
                            ? ` rowspan="${cell.rowSpan}"`
                            : '';
                        return `<td class="px-3 py-2 text-[#202833] align-top leading-relaxed select-text border-r border-[#F0F2F5] last:border-r-0"${colSpan}${rowSpan}>${this.formatInlineBlanks(this.escapeHtml(text), clause)}</td>`;
                      })
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

        // 3.5. Image Card Block (visual snapshot / high-res original table / attachment)
        if (b.type === 'image' && b.imageUrl) {
          const captionHtml = b.caption
            ? `<div class="text-xs font-semibold text-[#475569] mb-2 flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-[#2563EB]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                <span>${this.escapeHtml(b.caption)}</span>
              </div>`
            : '';
          return `
          <div class="figure-block my-3.5 p-3 bg-white border border-[#E2E5EA] rounded shadow-xs">
            ${captionHtml}
            <div class="overflow-hidden rounded border border-slate-200 bg-slate-50 flex justify-center">
              <img src="${b.imageUrl}" alt="${this.escapeHtml(b.caption || '合同原件图表')}" class="w-full h-auto max-h-[850px] object-contain cursor-zoom-in hover:opacity-95 transition" onclick="window.open(this.src, '_blank')" title="点击查看高清大图" />
            </div>
          </div>
          `;
        }

        // 4. Heading Block inside Clause
        if (b.type === 'heading') {
          const isCenteredTitle = b.alignment === 'center' || (clause.clauseIndex === 0 && blockIdx === 0);
          if (isCenteredTitle) {
            return `
            <div class="document-main-title text-center my-4 py-2 border-b border-[#E2E8F0]">
              <h1 class="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-wider select-text">
                ${b.primaryHtml || this.escapeHtml(b.primaryText || '')}
              </h1>
              ${b.secondaryText ? `<div class="text-xs sm:text-sm font-medium text-[#64748B] mt-1 select-text">${b.secondaryHtml || this.escapeHtml(b.secondaryText)}</div>` : ''}
            </div>
            `;
          }
          const hasBothLangs = Boolean(b.primaryText && b.secondaryText);
          const primaryClass = hasBothLangs ? 'heading-primary' : '';
          const secondaryClass = hasBothLangs ? 'heading-secondary' : '';
          return `
          <h3 class="text-sm font-bold text-[#202833] mt-2 mb-1 flex items-baseline flex-wrap gap-2">
            <span class="${primaryClass}">${b.primaryHtml || this.escapeHtml(b.primaryText || '')}</span>
            ${b.secondaryText ? `<span class="text-xs font-normal text-[#667085] ${secondaryClass}">${b.secondaryHtml || this.escapeHtml(b.secondaryText)}</span>` : ''}
          </h3>
          `;
        }

        // 5. List Item Block
        if (b.type === 'list_item') {
          const indent = getLegalHierarchyIndentEm(b.prefix || b.primaryText || '');
          const cleanHtml = this.stripDuplicatePrefix(b.primaryHtml || this.escapeHtml(b.primaryText || ''), b.prefix);
          const isJp = (b as any).isJp || /[\u3040-\u309F\u30A0-\u30FF]/.test(b.primaryText || '');
          const fontSizeClass = isJp ? 'text-[13.5px] leading-[1.75] text-[#334155]' : 'text-[15px] leading-[1.75] text-[#202833]';

          const subLines = cleanHtml.split('\n').map((l) => l.trim()).filter(Boolean);
          const content = subLines
            .map((line, lIdx) => {
              const formatted = this.formatInlineBlanks(line, clause);
              if (lIdx === 0) {
                return `<div>${formatted}</div>`;
              }
              return `<div class="mt-1.5 text-[#334155] leading-relaxed">${formatted}</div>`;
            })
            .join('');

          return `
          <div class="list-item flex items-start gap-2.5 mb-2.5" style="padding-left: ${Math.max(0.5, indent)}em; line-height: 1.75;">
            ${
              b.prefix
                ? `<span class="font-mono text-xs font-semibold text-[#667085] shrink-0 select-none">${this.escapeHtml(b.prefix)}</span>`
                : `<span class="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0"></span>`
            }
            <div class="${fontSizeClass} flex-1 select-text ${b.isBold ? 'font-semibold' : ''}">
              ${content}
            </div>
          </div>
          `;
        }

        // 6. Standard Paragraph Block
        const indent = getLegalHierarchyIndentEm(b.prefix || b.primaryText || '');
        const cleanHtml = this.stripDuplicatePrefix(b.primaryHtml || this.escapeHtml(b.primaryText || ''), b.prefix);
        const pContent = this.formatInlineBlanks(cleanHtml, clause);
        const isJp = (b as any).isJp || /[\u3040-\u309F\u30A0-\u30FF]/.test(b.primaryText || '');
        const fontSizeClass = isJp ? 'text-[13.5px] leading-[1.75] text-[#334155]' : 'text-[15px] leading-[1.8] text-[#202833]';
        return `
        <p class="paragraph mb-3.5 ${fontSizeClass} select-text ${b.alignment === 'center' ? 'text-center font-bold' : ''} ${b.isBold ? 'font-semibold' : ''}" style="${indent > 0 ? `padding-left: ${indent}em; ` : ''}line-height: ${isJp ? '1.75' : '1.8'};">
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
            return `<div class="clause-hierarchical-line" style="padding-left: ${indent}em; margin-bottom: 0.45rem; line-height: 1.8;">${formatted}</div>`;
          }
          return `<div class="clause-hierarchical-line" style="margin-bottom: 0.45rem; line-height: 1.8;">${formatted}</div>`;
        });
        const isJp = /[\u3040-\u309F\u30A0-\u30FF]/.test(trimmed);
        const fontSizeClass = isJp ? 'text-[13.5px] leading-[1.75] text-[#334155]' : 'text-[15px] leading-[1.8] text-[#202833]';
        return `<div class="paragraph mb-3.5 ${fontSizeClass} select-text">${formattedLines.join('')}</div>`;
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

    // 1. Support semantic underline tags (&lt;u&gt;...&lt;/u&gt;)
    let formatted = sanitizedText.replace(
      /&lt;u&gt;(.*?)&lt;\/u&gt;/g,
      '<u class="contract-underlined-term text-[#0F172A] font-medium border-b-2 border-[#2563EB] px-0.5 select-text" style="text-decoration: none;">$1</u>'
    );

    // 2. Highlight blanks: consecutive underlines, empty brackets, or unfilled markers
    formatted = formatted.replace(
      /([_＿]{2,}|\[[_＿\s]{2,}\]|（\s*[_＿]{2,}\s*）|\(\s*[_＿]{2,}\s*\)|\[待填[^\]]*\]|&lt;待填[^&]*&gt;|\{[^}]+\})/g,
      '<span class="inline-blank px-1.5 py-0.5 bg-[#FEF3C7] text-[#9A6700] border-b-2 border-dashed border-[#F59E0B] rounded-xs font-mono text-xs font-semibold select-all" title="待填报要素/空白">$1</span>'
    );

    // 3. Highlight template variable slots with clean legal underline (e.g. 就 [项目名称] 项目)
    formatted = formatted.replace(
      /(就\s+)([^，。\n]{2,40}?)(\s+项目)/g,
      '$1<span class="contract-variable-term border-b-2 border-[#2563EB] text-[#0F172A] font-medium px-1 select-text" title="合同标的/定制变量">$2</span>$3'
    );

    // 2. Inject evidence marks if findings quote specific phrases (Distinct legal risk markings)
    if (clause.findings && clause.findings.length > 0) {
      for (const f of clause.findings) {
        if (f.evidenceQuote && f.evidenceQuote.trim().length >= 4) {
          const rawQuote = f.evidenceQuote.trim().replace(/^["“'‘]|["”'’]$/g, '').trim();
          const quoteEscaped = this.escapeHtml(rawQuote);
          if (formatted.includes(quoteEscaped)) {
            const rawFindingId = f.id || `clause-${clause.clauseIndex}`;
            const findingId = rawFindingId.startsWith('finding-') ? rawFindingId : `finding-${rawFindingId}`;
            const isHigh = f.severity === 'HIGH' || clause.riskLevel === 'HIGH';
            const riskBadgeClass = isHigh ? 'evidence-risk-badge-high' : 'evidence-risk-badge-medium';
            const markClass = isHigh ? 'evidence-mark-high' : 'evidence-mark-medium';
            const markHtml = `<mark id="evidence-target-${findingId}" class="evidence-mark ${markClass} transition-all cursor-pointer select-text" data-finding-id="${findingId}" onclick="selectFinding('${findingId}')">${quoteEscaped}<span class="evidence-risk-badge ${riskBadgeClass}" data-finding-id="${findingId}" onclick="selectFinding('${findingId}', true)"><span class="inline-flex items-center gap-0.5">${ReviewIcons.riskHigh('w-3 h-3 text-current')}<span>审查风险</span></span></span></mark>`;
            formatted = formatted.replace(quoteEscaped, markHtml);
          }
        }
      }
    }

    // 3. Inject Word comment highlights and badge markers (Distinct Word comment markings)
    // Group comments by their selectedText to gracefully support multiple comments on the exact same phrase
    if (clause.comments && clause.comments.length > 0) {
      const commentsByText = new Map<string, typeof clause.comments>();
      for (const comment of clause.comments) {
        if (comment.selectedText && comment.selectedText.trim().length >= 2) {
          const textKey = comment.selectedText.trim();
          const existing = commentsByText.get(textKey) || [];
          existing.push(comment);
          commentsByText.set(textKey, existing);
        }
      }

      for (const [textKey, commentGroup] of commentsByText.entries()) {
        commentGroup.sort((a, b) => {
          if (a.date && b.date) {
            const tA = new Date(a.date).getTime();
            const tB = new Date(b.date).getTime();
            if (!isNaN(tA) && !isNaN(tB)) return tA - tB;
          }
          return Number(a.id) - Number(b.id);
        });
        const commentEscaped = this.escapeHtml(textKey);
        if (formatted.includes(commentEscaped)) {
          const primaryComment = commentGroup[0];
          const allIds = commentGroup.map((c) => c.id).join(',');
          const badgeText =
            commentGroup.length > 1
              ? `<span class="inline-flex items-center gap-1">${ReviewIcons.comment('w-3 h-3 text-amber-900')}<span>批注 (${commentGroup.length}条) #${commentGroup.map((c) => c.id).join('/')}</span></span>`
              : `<span class="inline-flex items-center gap-1">${ReviewIcons.comment('w-3 h-3 text-amber-900')}<span>批注 #${primaryComment.id}</span></span>`;

          const commentMarkHtml = `<mark id="comment-target-${primaryComment.id}" class="docx-comment-highlight rounded-xs px-0.5 transition-all cursor-pointer select-text" data-comment-id="${primaryComment.id}" data-comment-ids="${allIds}" onclick="handleCommentClick('${primaryComment.id}', ${clause.clauseIndex}, event)">${commentEscaped}<span class="docx-comment-badge" data-comment-id="${primaryComment.id}" data-comment-ids="${allIds}" onclick="handleCommentClick('${primaryComment.id}', ${clause.clauseIndex}, event)">${badgeText}</span></mark>`;
          formatted = formatted.replace(commentEscaped, commentMarkHtml);
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

  private stripDuplicatePrefix(html: string, prefix?: string): string {
    if (!html || !prefix) return html;
    const cleanPrefix = prefix.trim();
    if (!cleanPrefix) return html;
    const escaped = cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^(?:<strong[^>]*>\\s*${escaped}\\s*<\\/strong>|<b[^>]*>\\s*${escaped}\\s*<\\/b>|${escaped})\\s*`, 'i');
    return html.replace(regex, '');
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

