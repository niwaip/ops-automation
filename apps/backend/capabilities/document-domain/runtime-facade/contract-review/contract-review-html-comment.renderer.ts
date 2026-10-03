import type { DocxCommentItem, ClauseReviewItem } from './contract-review.types';
import { ReviewIcons } from './contract-review-html-icons.util';

export interface DocxCommentGroup {
  groupKey: string;
  clauseIndex: number;
  clauseNumber?: string;
  selectedText?: string;
  comments: DocxCommentItem[];
  latestComment: DocxCommentItem;
  isResolved: boolean;
}

export class ContractReviewHtmlCommentRenderer {
  /**
   * Group comments by clause & text anchor location.
   */
  groupCommentsByLocation(comments: DocxCommentItem[]): DocxCommentGroup[] {
    const groups: DocxCommentGroup[] = [];
    const map = new Map<string, DocxCommentGroup>();

    for (const c of comments) {
      const clauseIdx = c.clauseIndex ?? 0;
      const cleanQuote = (c.selectedText || '').trim();
      const key = cleanQuote
        ? `${clauseIdx}::${cleanQuote}`
        : `${clauseIdx}::single::${c.id}`;

      let grp = map.get(key);
      if (!grp) {
        grp = {
          groupKey: key,
          clauseIndex: clauseIdx,
          clauseNumber: c.clauseNumber,
          selectedText: cleanQuote || undefined,
          comments: [],
          latestComment: c,
          isResolved: false,
        };
        map.set(key, grp);
        groups.push(grp);
      }
      grp.comments.push(c);
    }

    for (const grp of groups) {
      grp.comments.sort((a, b) => {
        if (a.date && b.date) {
          const tA = new Date(a.date).getTime();
          const tB = new Date(b.date).getTime();
          if (!isNaN(tA) && !isNaN(tB)) return tA - tB;
        }
        return Number(a.id) - Number(b.id);
      });
      grp.latestComment = grp.comments[grp.comments.length - 1];
      grp.isResolved = grp.comments.every((c) => c.isResolved);
    }

    return groups;
  }

  /**
   * Render compact, grouped Word comment cards in the workbench stream.
   * Comments targeting the exact same anchor/location are merged into a single card.
   */
  renderGroupedCommentCards(comments: DocxCommentItem[], canComment = true): string {
    const groups = this.groupCommentsByLocation(comments);
    return groups.map((g, idx) => this.renderCommentGroupCard(g, idx, canComment)).join('\n');
  }

  /**
   * Render a unified, compact grouped comment card.
   */
  renderCommentGroupCard(group: DocxCommentGroup, index: number, canComment = true): string {
    const isResolved = group.isResolved;
    const latest = group.latestComment;
    const commentsCount = group.comments.length;
    const allIds = group.comments.map((c) => c.id).join(',');
    const firstId = group.comments[0].id;
    const lastId = latest.id;
    const clauseLabel = group.clauseNumber
      ? `第 ${group.clauseNumber.replace(/^[第.]+|[条.]+$/g, '').trim()} 条`
      : `条款 #${group.clauseIndex + 1}`;
    const latestDate = latest.date ? this.formatDate(latest.date) : '';

    const renderedItems = group.comments
      .map((c) => {
        let rawAuthor = c.author || '审阅人';
        let authorName = rawAuthor;
        let authorTitle = '法务合规';
        const titleMatch = rawAuthor.match(/^([^(（]+)[(（]([^)）]+)[)）]$/);
        if (titleMatch) {
          authorName = titleMatch[1].trim();
          authorTitle = titleMatch[2].trim();
        }
        const initials = this.getInitials(authorName);
        const dateStr = c.date ? this.formatDate(c.date) : '';

        return `
        <div id="comment-card-${c.id}" class="comment-item px-2.5 py-1.5 rounded-md bg-[#F8FAFC] border border-slate-200/80">
          <div class="flex items-center justify-between gap-1 mb-0.5 select-none">
            <div class="flex items-center gap-1.5 min-w-0">
              <div class="w-5 h-5 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-[10px] font-bold text-amber-900 shrink-0 shadow-2xs">
                ${initials}
              </div>
              <span class="text-xs font-bold text-[#1E293B] truncate">${this.escapeHtml(authorName)}</span>
              <span class="text-[9px] px-1 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">${this.escapeHtml(authorTitle)}</span>
              <span class="text-[10px] text-slate-400 font-mono">#${c.id}</span>
            </div>
            ${dateStr ? `<span class="text-[10px] text-slate-400 font-mono">${dateStr}</span>` : ''}
          </div>
          <p class="text-xs font-normal text-[#1E293B] leading-relaxed select-text whitespace-pre-wrap pl-6">
            ${this.escapeHtml(c.text || '')}
          </p>
        </div>`;
      })
      .join('\n');

    return `
    <article
      id="comment-group-card-${latest.id}"
      class="comment-card comment-group-card bg-white rounded-lg border border-[#D9E1EC] p-3 shadow-card transition-all hover:border-amber-500/70 hover:shadow-card-hover border-l-4 border-l-amber-500 cursor-pointer"
      data-comment-id="${latest.id}"
      data-comment-ids="${allIds}"
      data-clause-index="${group.clauseIndex}"
      onclick="handleCommentClick('${latest.id}', ${group.clauseIndex}, event)"
    >
      <!-- Card Header: Clause, ID range & Latest Status -->
      <header class="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-[#E2E8F0] select-none">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="px-2 py-0.5 text-[11px] font-bold rounded bg-amber-50 text-amber-900 border border-amber-200">
            ${clauseLabel}
          </span>
          <span class="text-[11px] text-[#64748B] font-medium">
            ${commentsCount > 1 ? `共 ${commentsCount} 条批注` : 'Word 批注'}
          </span>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="px-1.5 py-0.5 text-[10px] font-mono rounded bg-amber-50 text-amber-800 border border-amber-200">
            ${commentsCount > 1 ? `#${firstId}~#${lastId}` : `#${firstId}`}
          </span>
          <span class="px-1.5 py-0.5 text-[10px] font-medium rounded ${isResolved ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
            ${isResolved ? '已解决' : '待处理'}
          </span>
        </div>
      </header>

      <!-- 原文锚定引句 (Quoted Anchor) - 单一展示，避免重复 -->
      ${
        group.selectedText
          ? `
      <div class="comment-quote bg-[#FFFBEB] rounded-md border border-amber-200/80 px-2.5 py-1.5 mb-2 flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 min-w-0 text-xs text-[#1E293B]">
          <svg class="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
          <span class="font-normal italic truncate border-l-2 border-amber-400 pl-1.5 select-text">"${this.escapeHtml(group.selectedText)}"</span>
        </div>
        <button
          type="button"
          onclick="event.stopPropagation(); scrollToCommentAnchor('${firstId}', ${group.clauseIndex}, event)"
          class="text-[11px] text-amber-800 hover:text-amber-950 hover:underline flex items-center gap-0.5 font-medium cursor-pointer shrink-0 ml-1"
          title="在底稿中定位高亮"
        >
          <span>定位原文</span>
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        </button>
      </div>`
          : ''
      }

      <!-- 批注意见流转列表 (Compact Comments Stream) -->
      <div class="space-y-1.5 mb-2">
        ${renderedItems}
      </div>

      <!-- Action Footer: Single clean footer -->
      <footer class="pt-1.5 border-t border-[#E2E8F0] flex items-center justify-between select-none">
        <div class="text-[11px] text-[#64748B] flex items-center gap-1 font-mono">
          <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>${latestDate ? `最新：${latestDate}` : '流转中'}</span>
        </div>
        <button
          type="button"
          onclick="event.stopPropagation(); handleCommentClick('${firstId}', ${group.clauseIndex}, event)"
          class="text-xs text-[#2E5882] hover:text-[#1A2D42] font-semibold px-2 py-0.5 rounded border border-[#D9E1EC] bg-white hover:bg-slate-50 transition flex items-center gap-1 cursor-pointer shadow-2xs"
        >
          ${ReviewIcons.comment('w-3 h-3 text-[#2E5882]')}
          <span>${commentsCount > 1 ? `查看 ${commentsCount} 条批注 →` : '查看批注详情 →'}</span>
        </button>
      </footer>
    </article>
    `;
  }

  /**
   * Backward compatibility: Render individual Word comment card.
   */
  renderCommentCard(comment: DocxCommentItem, index: number, canComment = true): string {
    const singleGroup: DocxCommentGroup = {
      groupKey: `${comment.clauseIndex ?? 0}::${comment.id}`,
      clauseIndex: comment.clauseIndex ?? 0,
      clauseNumber: comment.clauseNumber,
      selectedText: comment.selectedText,
      comments: [comment],
      latestComment: comment,
      isResolved: comment.isResolved ?? false,
    };
    return this.renderCommentGroupCard(singleGroup, index, canComment);
  }

  /**
   * Render the dedicated right-hand Comment Detail & In-Place Reply Workspace.
   * Structured as a formal corporate Approval / Review Log Card with collapsible content.
   */
  renderCommentDetailWorkspace(params: { canComment?: boolean; commentApiUrl?: string }): string {
    const { canComment = true } = params;

    return `
    <div id="comment-detail-workspace" class="hidden flex flex-col space-y-3 font-sans">
      <!-- Top Navigation & Action Bar -->
      <div class="flex items-center justify-between py-2 px-3 border border-[#D9E1EC] bg-slate-50 rounded-lg select-none">
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick="exitCommentDetailMode()"
            class="px-3 py-1.5 text-xs font-semibold rounded border border-[#CBD5E1] bg-white text-[#2E5882] hover:bg-[#2E5882] hover:text-white transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            <span>返回清单</span>
          </button>
          <span class="text-xs font-bold text-[#1E293B] flex items-center gap-1.5">
            ${ReviewIcons.comment('w-4 h-4 text-indigo-700')}
            <span>批注详情</span>
          </span>
        </div>

        <div class="flex items-center gap-2 text-xs text-[#64748B]">
          <span id="comment-detail-stepper-label" class="font-mono text-xs font-semibold text-slate-700">1 / 1</span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              onclick="stepCommentInDetail(-1)"
              class="p-1.5 rounded border border-[#CBD5E1] bg-white hover:bg-slate-100 text-slate-700 transition cursor-pointer"
              title="上一条批注"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
            </button>
            <button
              type="button"
              onclick="stepCommentInDetail(1)"
              class="p-1.5 rounded border border-[#CBD5E1] bg-white hover:bg-slate-100 text-slate-700 transition cursor-pointer"
              title="下一条批注"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Formal Approval / Review Log Card Body -->
      <div class="bg-white rounded-lg border border-[#D9E1EC] p-3.5 shadow-card space-y-3">
        
        <!-- 1. Compact Clause & Quoted Text Context Bar -->
        <div id="comment-detail-quote-container" class="bg-amber-50/80 rounded-lg border border-amber-200/90 p-3 space-y-1.5 shadow-2xs">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5 text-slate-700 min-w-0">
              <span class="text-amber-800 font-bold shrink-0 flex items-center gap-1">${ReviewIcons.focusDoc('w-3.5 h-3.5 text-amber-800')}<span>条款：</span></span>
              <span id="comment-detail-clause-tag" class="font-bold text-slate-900 truncate">第二条 合同价款与支付结算周期</span>
            </div>
            <button
              type="button"
              id="comment-detail-locate-btn"
              onclick="locateCurrentDetailCommentInDoc()"
              class="text-xs text-amber-800 hover:text-amber-950 hover:underline flex items-center gap-1 font-bold cursor-pointer shrink-0 ml-2"
              title="在正文中定位并高亮此句"
            >
              <span>定位正文</span>
              ${ReviewIcons.locate('w-3 h-3 text-amber-800')}
            </button>
          </div>
          <blockquote id="comment-detail-quote" class="text-sm text-slate-700 italic border-l-2 border-amber-400 pl-2.5 py-0.5 leading-relaxed bg-white/70 rounded-r px-1 select-text">
          </blockquote>
        </div>

        <!-- 2. Integrated Approval / Comment Timeline Stream (Strictly Chronological, Time-ordered) -->
        <div id="comment-detail-thread-container" class="space-y-3"></div>

        <!-- 4. In-place Reply & Word Write-Back Desk -->
        ${
          canComment
            ? `
        <div class="p-3 rounded-lg border border-[#D9E1EC] bg-[#F8FAFC] space-y-2.5 mode-review-only">
          <div class="flex items-center justify-between text-xs select-none">
            <span class="font-bold text-[#1E293B] flex items-center gap-1.5">
              ${ReviewIcons.pencilSquare('w-4 h-4 text-slate-800')}
              <span>追加批注 / 更新意见</span>
            </span>
            <!-- Default identity row: click to expand & modify -->
            <div class="flex items-center gap-1 text-xs text-[#64748B]">
              <span>批注人:</span>
              <span id="comment-reply-author-label" class="font-semibold text-slate-800">法务批注人</span>
              <button
                type="button"
                id="btn-toggle-reply-author-edit"
                onclick="toggleReplyAuthorEdit()"
                class="text-xs text-[#2E5882] hover:underline cursor-pointer ml-0.5"
                title="点击展开修改批注人姓名"
              >
                [修改 ✎]
              </button>
            </div>
          </div>

          <!-- Hidden by default: author input that expands on click -->
          <div id="comment-reply-author-container" class="hidden">
            <label class="block text-xs font-semibold text-slate-600 mb-0.5">修改批注人姓名 / 职务：</label>
            <input
              type="text"
              id="comment-detail-reply-author"
              class="w-full px-2.5 py-1 rounded border border-[#CBD5E1] bg-white text-xs text-slate-800 focus:border-[#2E5882] focus:ring-1 focus:ring-[#2E5882]"
              value="法务批注人"
              oninput="document.getElementById('comment-reply-author-label').textContent = this.value || '法务批注人'"
            />
          </div>

          <!-- Textarea is primary and immediately visible -->
          <div>
            <textarea
              id="comment-detail-reply-text"
              rows="3"
              class="w-full px-3 py-2 rounded-md border border-[#D9E1EC] bg-white focus:border-[#2E5882] focus:ring-1 focus:ring-[#2E5882] text-sm text-[#1E293B] leading-relaxed resize-none"
              placeholder="输入针对此条批注的修改方案、答复意见或进一步风控指引..."
            ></textarea>
          </div>

          <input type="hidden" id="comment-detail-current-id" value="" />
          <input type="hidden" id="comment-detail-current-clause" value="0" />

          <div class="flex items-center justify-between pt-0.5">
            <div class="text-xs text-[#64748B] flex items-center gap-1.5">
              <span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>暂存批注并保留流转记录</span>
            </div>
            <button
              type="button"
              id="comment-detail-submit-btn"
              onclick="submitCommentDetailReply()"
              class="px-4 py-1.5 rounded-md bg-[#1A2D42] text-xs font-semibold text-white hover:bg-[#243B53] shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>暂存此批注 →</span>
            </button>
          </div>
        </div>`
            : ''
        }
      </div>
    </div>
    `;
  }

  /**
   * Render the dedicated Sidebar Workspace for adding a new comment (No modal popups!).
   */
  renderCommentCreateWorkspace(): string {
    return `
    <div id="comment-create-workspace" class="hidden flex flex-col space-y-3 font-sans mode-review-only">
      <!-- Top Action Bar -->
      <div class="flex items-center justify-between py-2 px-3 border border-[#D9E1EC] bg-slate-50 rounded-lg select-none">
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick="exitCommentCreateMode()"
            class="px-3 py-1.5 text-xs font-semibold rounded border border-[#CBD5E1] bg-white text-[#2E5882] hover:bg-[#2E5882] hover:text-white transition flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            <span>返回清单</span>
          </button>
          <span class="px-2.5 py-0.5 text-xs font-bold rounded bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
            ${ReviewIcons.pencilSquare('w-3.5 h-3.5 text-amber-900')}
            <span>拟定新批注</span>
          </span>
        </div>
        <span class="text-xs text-[#64748B]">侧边栏就地操作</span>
      </div>

      <!-- Creation Card -->
      <div class="bg-white rounded-lg border border-[#D9E1EC] p-4 shadow-card space-y-3.5">
        <!-- Quoted Context Card -->
        <div id="comment-create-quote-container" class="bg-[#FFFBEB] rounded-lg border border-amber-200/90 p-3">
          <div class="flex items-center justify-between text-xs font-semibold text-amber-900 mb-1 select-none">
            <span class="flex items-center gap-1.5">
              ${ReviewIcons.commentQuote('w-3.5 h-3.5 text-amber-600')}
              <span>选中的原文字句</span>
            </span>
            <span id="comment-create-clause-label" class="text-xs font-medium text-[#2E5882]"></span>
          </div>
          <blockquote id="comment-create-quote-text" class="text-[#1E293B] text-sm font-normal italic select-text border-l-3 border-amber-400 pl-2.5 my-1 leading-relaxed">
          </blockquote>
          <input type="hidden" id="comment-create-clause-index" value="0" />
        </div>

        <!-- Form fields -->
        <div class="space-y-2.5">
          <!-- Collapsible identity: default to logged-in user, click to expand & modify -->
          <div class="flex items-center justify-between text-xs select-none">
            <label class="block text-xs font-semibold text-[#334155]">
              批注意见与修改要求 <span class="text-red-500">*</span>
            </label>
            <div class="flex items-center gap-1 text-xs text-[#64748B]">
              <span>批注人:</span>
              <span id="comment-create-author-label" class="font-semibold text-slate-800">法务批注人</span>
              <button
                type="button"
                onclick="toggleCreateAuthorEdit()"
                class="text-xs text-[#2E5882] hover:underline cursor-pointer ml-0.5"
                title="点击展开修改批注人姓名"
              >
                [修改 ✎]
              </button>
            </div>
          </div>

          <!-- Hidden by default: author input that expands on click -->
          <div id="comment-create-author-container" class="hidden">
            <label class="block text-xs font-semibold text-slate-600 mb-0.5">修改批注人姓名 / 职务：</label>
            <input
              type="text"
              id="comment-create-author"
              class="w-full px-2.5 py-1.5 rounded-md border border-[#CBD5E1] bg-white text-xs text-slate-800 focus:border-[#2E5882] focus:ring-1 focus:ring-[#2E5882]"
              value="法务批注人"
              placeholder="例如：张律师 (法务合规)"
              oninput="document.getElementById('comment-create-author-label').textContent = this.value || '法务批注人'"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-[#334155] mb-1">
              批注意见与修改要求 <span class="text-red-500">*</span>
            </label>
            <textarea
              id="comment-create-text"
              rows="5"
              class="w-full px-3 py-2 rounded-md border border-[#D9E1EC] focus:border-[#2E5882] focus:ring-1 focus:ring-[#2E5882] text-sm text-[#1E293B] leading-relaxed resize-none"
              placeholder="请输入针对选中文字的具体风控修改意见、增删要求或商务提示..."
            ></textarea>
          </div>

          <div class="p-2.5 rounded-md bg-[#EDF1F5] text-xs text-[#475569] leading-relaxed flex items-start gap-2">
            ${ReviewIcons.shieldCheck('w-4 h-4 text-emerald-700 shrink-0 mt-0.5')}
            <div>
              <strong>安全批注暂存</strong>：弹窗内轻量草拟暂存，完成审阅并返回主页面流转时，统一原子生成 Word 修订稿，防止脏数据污染。
            </div>
          </div>
        </div>

        <!-- Action Footer -->
        <div class="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onclick="exitCommentCreateMode()"
            class="px-3.5 py-1.5 rounded-md border border-[#D9E1EC] bg-white text-xs font-medium text-[#475569] hover:bg-slate-50 transition cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            id="comment-create-submit-btn"
            onclick="submitCommentCreateFromSidebar()"
            class="px-4 py-1.5 rounded-md bg-[#1A2D42] text-xs font-semibold text-white hover:bg-[#243B53] shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <span>写入 Word 批注 →</span>
          </button>
        </div>
      </div>
    </div>
    `;
  }

  /**
   * Stub for backward compatibility. Modals are now deprecated in favor of sidebar workspace.
   */
  renderAppendCommentModal(params?: unknown): string {
    return '';
  }

  private formatDate(isoDate: string): string {
    try {
      const d = new Date(isoDate);
      if (isNaN(d.getTime())) return isoDate;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${h}:${min}`;
    } catch {
      return isoDate;
    }
  }

  private getInitials(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return '批';
    return trimmed.slice(0, 1);
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

  private escapeQuote(text: string): string {
    if (!text) return '';
    return text.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
  }
}
