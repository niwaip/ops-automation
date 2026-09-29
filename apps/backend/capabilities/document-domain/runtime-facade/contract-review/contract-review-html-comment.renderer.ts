import type { DocxCommentItem, ClauseReviewItem } from './contract-review.types';

export class ContractReviewHtmlCommentRenderer {
  /**
   * Render individual Word comment cards in the workbench stream.
   */
  renderCommentCard(comment: DocxCommentItem, index: number, canComment = true): string {
    const isResolved = comment.isResolved ?? false;
    const author = this.escapeHtml(comment.author || '审阅人');
    const dateFormatted = comment.date ? this.formatDate(comment.date) : '';
    const quoteText = comment.selectedText ? this.escapeHtml(comment.selectedText) : '';
    const commentBody = this.escapeHtml(comment.text || '');
    const cardId = `comment-card-${comment.id}`;
    const targetMarkId = `comment-target-${comment.id}`;

    return `
    <article
      id="${cardId}"
      class="comment-card bg-white rounded-lg border border-[#D9E1EC] p-3.5 shadow-card transition-all hover:border-amber-500/70 hover:shadow-card-hover border-l-4 border-l-amber-500"
      data-comment-id="${comment.id}"
      data-clause-index="${comment.clauseIndex ?? 0}"
      onclick="handleCommentClick('${comment.id}', ${comment.clauseIndex ?? 0}, event)"
    >
      <!-- Card Header: Author, Date & Status -->
      <header class="flex items-start justify-between gap-2 pb-2 mb-2 border-b border-[#E2E8F0]">
        <div class="flex items-center gap-2 min-w-0 pr-2">
          <!-- Avatar Icon -->
          <div class="w-6 h-6 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-[11px] font-bold text-amber-800 shrink-0 select-none">
            ${this.getInitials(comment.author || comment.initials || '阅')}
          </div>
          <div class="truncate">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-[#1E293B]">${author}</span>
              ${comment.clauseNumber ? `<span class="text-[11px] font-semibold text-[#2E5882]">${this.escapeHtml(comment.clauseNumber)}</span>` : ''}
            </div>
            ${dateFormatted ? `<div class="text-[10px] text-[#64748B] font-mono">${dateFormatted}</div>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0 select-none">
          <span class="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-50 text-amber-700 border border-amber-200">
            Word 批注 · #${comment.id}
          </span>
          <span class="px-1.5 py-0.5 text-[10px] font-medium rounded ${isResolved ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
            ${isResolved ? '已解决' : '待处理'}
          </span>
        </div>
      </header>

      <div class="space-y-2 text-xs leading-relaxed text-[#1E293B]">
        <!-- 原文锚定引用 (Quoted Anchor) -->
        ${
          quoteText
            ? `
        <div class="comment-quote bg-[#FFFBEB] rounded-md border border-amber-200/80 p-2">
          <div class="flex items-center justify-between text-[10px] font-semibold text-amber-800 mb-1 select-none">
            <span class="flex items-center gap-1">
              <svg class="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
              原文锚定引句
            </span>
            <button
              type="button"
              onclick="scrollToCommentAnchor('${comment.id}', ${comment.clauseIndex ?? 0}, event)"
              class="text-[11px] text-amber-800 hover:text-amber-900 hover:underline flex items-center gap-0.5 font-medium cursor-pointer"
            >
              <span>定位原文</span>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
            </button>
          </div>
          <blockquote class="text-[#1E293B] text-[11px] font-normal italic select-text border-l-2 border-amber-400 pl-2 my-0.5 leading-relaxed">
            "${quoteText}"
          </blockquote>
        </div>`
            : ''
        }

        <!-- 批注意见主体 (Comment Body) -->
        <div class="comment-body p-2.5 rounded-md bg-[#F4F6F9] border-l-3 border-l-[#2E5882]">
          <div class="text-[10px] font-bold text-[#2E5882] mb-0.5 flex items-center gap-1 uppercase tracking-wider select-none">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
            <span>批注意见与建议</span>
          </div>
          <p class="text-xs font-normal text-[#1E293B] leading-relaxed select-text whitespace-pre-wrap">
            ${commentBody}
          </p>
        </div>

        <!-- Action Footer -->
        <div class="pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
          <div class="text-[10px] text-[#64748B] flex items-center gap-1">
            <span class="inline-block w-1.5 h-1.5 rounded-full ${isResolved ? 'bg-slate-400' : 'bg-emerald-500'}"></span>
            <span>${isResolved ? '已解决' : '待处理'}</span>
          </div>
          <button
            type="button"
            onclick="handleCommentClick('${comment.id}', ${comment.clauseIndex ?? 0}, event)"
            class="text-[11px] text-[#2E5882] hover:text-[#1A2D42] font-semibold px-2 py-0.5 rounded border border-[#D9E1EC] bg-white hover:bg-slate-50 transition flex items-center gap-1 cursor-pointer"
          >
            <span>💬 查看详情与回复 →</span>
          </button>
        </div>
      </div>
    </article>
    `;
  }

  /**
   * Render the dedicated right-hand Comment Detail & In-Place Reply Workspace.
   * When any comment is selected, this workspace replaces the overview list.
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
            class="px-2.5 py-1 text-xs font-semibold rounded border border-[#CBD5E1] bg-white text-[#2E5882] hover:bg-[#2E5882] hover:text-white transition flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            <span>返回清单</span>
          </button>
          <span id="comment-detail-badge" class="px-2 py-0.5 text-[11px] font-bold rounded bg-amber-100 text-amber-900 border border-amber-300">
            Word 批注
          </span>
          <span id="comment-detail-status-badge" class="px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            待处理
          </span>
        </div>

        <div class="flex items-center gap-2 text-xs text-[#64748B]">
          <span id="comment-detail-stepper-label" class="font-mono text-[11px] font-semibold text-slate-700">1 / 1</span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              onclick="stepCommentInDetail(-1)"
              class="p-1 rounded border border-[#CBD5E1] bg-white hover:bg-slate-100 text-slate-700 transition cursor-pointer"
              title="上一条批注"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
            </button>
            <button
              type="button"
              onclick="stepCommentInDetail(1)"
              class="p-1 rounded border border-[#CBD5E1] bg-white hover:bg-slate-100 text-slate-700 transition cursor-pointer"
              title="下一条批注"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Detail Content Card -->
      <div class="bg-white rounded-lg border border-[#D9E1EC] p-4 shadow-card space-y-3.5">
        <!-- Comment Author & Meta -->
        <div class="flex items-start justify-between gap-2 pb-2.5 border-b border-[#E2E8F0]">
          <div class="flex items-center gap-2.5">
            <div id="comment-detail-avatar" class="w-8 h-8 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-xs font-bold text-amber-900 shrink-0 select-none">
              审
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span id="comment-detail-author" class="text-sm font-bold text-[#1E293B]">审阅人</span>
                <span id="comment-detail-clause-tag" class="text-xs font-semibold text-[#2E5882]"></span>
              </div>
              <div id="comment-detail-date" class="text-[10px] text-[#64748B] font-mono mt-0.5"></div>
            </div>
          </div>
        </div>

        <!-- Quoted Text Section -->
        <div id="comment-detail-quote-container" class="bg-[#FFFBEB] rounded-md border border-amber-200/90 p-2.5">
          <div class="flex items-center justify-between text-[11px] font-semibold text-amber-900 mb-1 select-none">
            <span class="flex items-center gap-1">
              <svg class="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
              <span>原文锚定引句</span>
            </span>
            <button
              type="button"
              id="comment-detail-locate-btn"
              onclick="locateCurrentDetailCommentInDoc()"
              class="text-[11px] text-amber-900 hover:text-amber-950 hover:underline flex items-center gap-0.5 font-semibold cursor-pointer"
            >
              <span>定位正文</span>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
            </button>
          </div>
          <blockquote id="comment-detail-quote" class="text-[#1E293B] text-xs font-normal italic select-text border-l-2 border-amber-400 pl-2.5 my-1 leading-relaxed">
          </blockquote>
        </div>

        <!-- Original Comment Body -->
        <div class="p-3 rounded-md bg-[#F4F6F9] border-l-3 border-l-[#2E5882]">
          <div class="text-[10px] font-bold text-[#2E5882] mb-1 flex items-center gap-1 uppercase tracking-wider select-none">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
            <span>批注意见与修改要求</span>
          </div>
          <p id="comment-detail-body" class="text-xs text-[#1E293B] leading-relaxed select-text whitespace-pre-wrap font-normal"></p>
        </div>

        <!-- Inline Reply & Word Write-Back Desk -->
        ${
          canComment
            ? `
        <div class="pt-3 border-t border-[#E2E8F0] space-y-2.5">
          <div class="flex items-center justify-between select-none">
            <span class="text-xs font-bold text-[#1E293B] flex items-center gap-1">
              <span>✍️ 追加答复 / 新批注（回写 Word）</span>
            </span>
            <span class="text-[10px] text-[#64748B]">受控回写至后台 OpenXML</span>
          </div>

          <div class="grid grid-cols-1 gap-2">
            <div>
              <label class="block text-[11px] font-semibold text-[#334155] mb-0.5">答复人 / 审阅者</label>
              <input
                type="text"
                id="comment-detail-reply-author"
                class="w-full px-2.5 py-1.5 rounded-md border border-[#D9E1EC] focus:border-[#2E5882] focus:ring-1 focus:ring-[#2E5882] text-xs text-[#1E293B]"
                value="法务审阅人"
              />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-[#334155] mb-0.5">答复意见 / 补充修改批注</label>
              <textarea
                id="comment-detail-reply-text"
                rows="3"
                class="w-full px-2.5 py-1.5 rounded-md border border-[#D9E1EC] focus:border-[#2E5882] focus:ring-1 focus:ring-[#2E5882] text-xs text-[#1E293B] leading-relaxed resize-none"
                placeholder="请输入针对此条批注的答复说明、修改方案或进一步风控指引..."
              ></textarea>
            </div>
          </div>

          <input type="hidden" id="comment-detail-current-id" value="" />
          <input type="hidden" id="comment-detail-current-clause" value="0" />

          <div class="flex items-center justify-between pt-1">
            <div class="text-[10px] text-[#64748B] flex items-center gap-1">
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>提交将派生新版 Word 文档</span>
            </div>
            <button
              type="button"
              id="comment-detail-submit-btn"
              onclick="submitCommentDetailReply()"
              class="px-3.5 py-1.5 rounded-md bg-[#1A2D42] text-xs font-semibold text-white hover:bg-[#243B53] shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>提交回写 Word</span>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
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
   * Render the floating modal dialog for appending new comments back into Word OpenXML.
   */
  renderAppendCommentModal(params: {
    canComment?: boolean;
    commentApiUrl?: string;
    clauses?: ClauseReviewItem[];
  }): string {
    const { canComment = true, commentApiUrl = '', clauses = [] } = params;
    if (!canComment) return '';

    const clauseOptionsHtml = clauses
      .map((c) => {
        const title = c.title ? `${c.clauseNumber || ''} ${c.title}`.trim() : c.clauseNumber || `条款 #${c.clauseIndex}`;
        return `<option value="${c.clauseIndex}">#${c.clauseIndex} ${this.escapeHtml(title)}</option>`;
      })
      .join('\n');

    return `
    <!-- 追加 Word 批注弹窗 (Append Word Comment Modal) -->
    <div
      id="append-comment-modal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs opacity-0 pointer-events-none transition-all duration-200"
      aria-hidden="true"
    >
      <div
        id="append-comment-modal-box"
        class="bg-white w-full max-w-lg rounded-xl shadow-2xl border border-[#D9E1EC] overflow-hidden transform scale-95 transition-all duration-200"
      >
        <!-- Modal Top Bar (Style A Deep Navy) -->
        <div class="bg-[#1A2D42] px-5 py-3.5 text-white flex items-center justify-between border-b border-[#243B53]">
          <div class="flex items-center gap-2">
            <span class="text-base">✍️</span>
            <div>
              <h3 class="text-sm font-bold leading-tight">追加 Word 批注（回写后台文档）</h3>
              <p class="text-[10px] text-slate-300">通过业务控制面 API 回写至 Word OpenXML 批注流</p>
            </div>
          </div>
          <button
            type="button"
            onclick="closeCommentModal()"
            class="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10 transition cursor-pointer"
            title="关闭 (Esc)"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <!-- Modal Form Content -->
        <div class="p-5 space-y-3.5 text-xs">
          <!-- Quoted Context / Clause (Optional reference) -->
          <div>
            <label class="block text-[11px] font-semibold text-[#334155] mb-1">
              关联条款 <span class="text-red-500">*</span>
            </label>
            <select
              id="comment-modal-clause-select"
              class="w-full px-3 py-1.5 rounded-md border border-[#D9E1EC] bg-[#F8FAFC] text-[#1E293B] text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2E5882] cursor-pointer"
            >
              <option value="0">【通用】全合同通用批注 / 未限定特定段落</option>
              ${clauseOptionsHtml}
            </select>
            <input type="hidden" id="comment-modal-target-id" value="" />
          </div>

          <!-- Quoted Text Field -->
          <div>
            <label class="block text-[11px] font-semibold text-[#334155] mb-1">
              引用的原文字句（可选）
            </label>
            <input
              type="text"
              id="comment-modal-quote"
              placeholder="可手动输入或通过在正文中划选文字自动填入"
              class="w-full px-3 py-1.5 rounded-md border border-[#D9E1EC] focus:border-[#2E5882] focus:ring-1 focus:ring-[#2E5882] text-xs text-[#1E293B]"
            />
          </div>

          <!-- Author Field -->
          <div>
            <label class="block text-[11px] font-semibold text-[#334155] mb-1">
              批注人 / 审阅者姓名 <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="comment-modal-author"
              class="w-full px-3 py-1.5 rounded-md border border-[#D9E1EC] focus:border-[#2E5882] focus:ring-1 focus:ring-[#2E5882] text-xs text-[#1E293B]"
              placeholder="例如：张律师 (法务部)"
              value="法务审阅人"
            />
          </div>

          <!-- Comment Textarea -->
          <div>
            <label class="block text-[11px] font-semibold text-[#334155] mb-1">
              批注意见与修改建议 <span class="text-red-500">*</span>
            </label>
            <textarea
              id="comment-modal-text"
              rows="4"
              class="w-full px-3 py-2 rounded-md border border-[#D9E1EC] focus:border-[#2E5882] focus:ring-1 focus:ring-[#2E5882] text-xs text-[#1E293B] leading-relaxed resize-none"
              placeholder="请输入针对该条款的具体风控修改意见、增删要求或商业提示..."
            ></textarea>
          </div>

          <!-- Architecture & Security Note -->
          <div class="p-2.5 rounded-md bg-[#EDF1F5] text-[10px] text-[#475569] leading-relaxed flex items-start gap-1.5">
            <span class="text-xs shrink-0">🛡️</span>
            <div>
              <strong>无状态安全回写</strong>：页面端不直接修改文件，提交后将携带当前操作人身份向后台业务控制面发起受控回写请求，自动派生新版 Word 文档并同步 OpenXML 批注流。
            </div>
          </div>
        </div>

        <!-- Modal Footer Actions -->
        <div class="px-5 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onclick="closeCommentModal()"
            class="px-3 py-1.5 rounded-md border border-[#D9E1EC] bg-white text-xs font-medium text-[#475569] hover:bg-slate-50 transition cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            id="comment-modal-submit-btn"
            onclick="submitAppendComment()"
            class="px-4 py-1.5 rounded-md bg-[#1A2D42] text-xs font-semibold text-white hover:bg-[#243B53] shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <span>提交回写 Word</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
          </button>
        </div>
      </div>
    </div>
    `;
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
