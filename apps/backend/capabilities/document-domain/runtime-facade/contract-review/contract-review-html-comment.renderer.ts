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
            class="px-2.5 py-1 text-xs font-semibold rounded border border-[#CBD5E1] bg-white text-[#2E5882] hover:bg-[#2E5882] hover:text-white transition flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            <span>返回清单</span>
          </button>
          <span class="text-xs font-bold text-[#1E293B]">
            📋 审阅批注底稿
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

      <!-- Formal Approval / Review Log Card Body -->
      <div class="bg-white rounded-lg border border-[#D9E1EC] p-3.5 shadow-card space-y-3">
        
        <!-- 1. Reviewer & Audit Trail Node Card -->
        <div class="bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] p-3 space-y-2.5">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div id="comment-detail-avatar" class="w-9 h-9 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-sm font-bold text-amber-900 shrink-0 select-none shadow-2xs">
                王
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span id="comment-detail-author-name" class="text-sm font-bold text-[#1E293B]">审阅人</span>
                  <span id="comment-detail-author-title" class="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">法务顾问</span>
                  <span id="comment-detail-badge" class="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-50 text-amber-900 border border-amber-200">Word 原生批注 #1</span>
                </div>
                <div id="comment-detail-date" class="text-[10px] text-[#64748B] font-mono mt-0.5 flex items-center gap-1">
                  <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <span>2026-09-29 10:15</span>
                </div>
              </div>
            </div>
            <span id="comment-detail-status-badge" class="px-2 py-0.5 text-[10px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
              待处理
            </span>
          </div>

          <!-- Clause affiliation -->
          <div class="pt-2 border-t border-[#EEF2F6] flex items-center gap-1.5 text-xs text-[#2E5882]">
            <svg class="w-3.5 h-3.5 text-[#2E5882] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <span class="text-[#64748B] text-[11px]">归属条款：</span>
            <span id="comment-detail-clause-tag" class="font-semibold text-xs text-[#1E293B]">第二条 合同价款与支付结算周期</span>
          </div>
        </div>

        <!-- 2. Quoted Original Text Section -->
        <div id="comment-detail-quote-container" class="bg-[#FFFBEB] rounded-lg border border-amber-200/90 p-3">
          <div class="flex items-center justify-between text-[11px] font-semibold text-amber-900 mb-1.5 select-none">
            <span class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
              <span>📑 关联引用合同原文</span>
            </span>
            <button
              type="button"
              id="comment-detail-locate-btn"
              onclick="locateCurrentDetailCommentInDoc()"
              class="text-[11px] text-amber-900 hover:text-amber-950 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
            >
              <span>定位正文 ↗</span>
            </button>
          </div>
          <blockquote id="comment-detail-quote" class="text-[#1E293B] text-xs font-normal italic select-text border-l-3 border-amber-400 pl-2.5 my-1 leading-relaxed">
          </blockquote>
        </div>

        <!-- 3. Review / Approval Finding Content (Collapsible) -->
        <div class="rounded-lg border border-[#D9E1EC] bg-white overflow-hidden shadow-2xs">
          <div class="px-3.5 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between select-none">
            <div class="flex items-center gap-1.5 text-xs font-bold text-[#1E293B]">
              <svg class="w-3.5 h-3.5 text-[#2E5882]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
              <span>💬 审阅审批意见与风险要求</span>
            </div>
            <button
              type="button"
              id="btn-toggle-comment-body"
              onclick="toggleCommentDetailBodyCollapse()"
              class="text-[11px] text-[#2E5882] hover:text-[#1A2D42] font-semibold flex items-center gap-0.5 cursor-pointer"
            >
              <span id="btn-toggle-comment-body-text">收起意见 ▲</span>
            </button>
          </div>
          <div id="comment-detail-body-wrapper" class="p-3 transition-all duration-200">
            <p id="comment-detail-body" class="text-xs text-[#1E293B] leading-relaxed select-text whitespace-pre-wrap font-normal"></p>
          </div>
        </div>

        <!-- 4. In-place Reply & Word Write-Back Desk -->
        ${
          canComment
            ? `
        <div class="p-3.5 rounded-lg border border-[#D9E1EC] bg-[#F8FAFC] space-y-2.5">
          <div class="flex items-center justify-between select-none">
            <span class="text-xs font-bold text-[#1E293B] flex items-center gap-1">
              <span>✍️ 追加审批答复 / 修改要求（回写 Word）</span>
            </span>
            <span class="text-[10px] text-[#64748B]">受控回写至后台 OpenXML</span>
          </div>

          <div class="space-y-2">
            <div>
              <label class="block text-[11px] font-semibold text-[#334155] mb-0.5">答复人 / 审阅者</label>
              <input
                type="text"
                id="comment-detail-reply-author"
                class="w-full px-2.5 py-1.5 rounded-md border border-[#D9E1EC] bg-white focus:border-[#2E5882] focus:ring-1 focus:ring-[#2E5882] text-xs text-[#1E293B]"
                value="法务审阅人"
              />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-[#334155] mb-0.5">答复意见 / 补充修改要求</label>
              <textarea
                id="comment-detail-reply-text"
                rows="3"
                class="w-full px-2.5 py-1.5 rounded-md border border-[#D9E1EC] bg-white focus:border-[#2E5882] focus:ring-1 focus:ring-[#2E5882] text-xs text-[#1E293B] leading-relaxed resize-none"
                placeholder="请输入针对此条审批批注的答复说明、修改方案或进一步风控指引..."
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
              <span>提交回写 Word →</span>
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
    <div id="comment-create-workspace" class="hidden flex flex-col space-y-3 font-sans">
      <!-- Top Action Bar -->
      <div class="flex items-center justify-between py-2 px-3 border border-[#D9E1EC] bg-slate-50 rounded-lg select-none">
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick="exitCommentCreateMode()"
            class="px-2.5 py-1 text-xs font-semibold rounded border border-[#CBD5E1] bg-white text-[#2E5882] hover:bg-[#2E5882] hover:text-white transition flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            <span>返回清单</span>
          </button>
          <span class="px-2 py-0.5 text-[11px] font-bold rounded bg-amber-100 text-amber-900 border border-amber-300">
            ✍️ 拟定新批注
          </span>
        </div>
        <span class="text-[10px] text-[#64748B]">侧边栏就地操作</span>
      </div>

      <!-- Creation Card -->
      <div class="bg-white rounded-lg border border-[#D9E1EC] p-4 shadow-card space-y-3.5">
        <!-- Quoted Context Card -->
        <div id="comment-create-quote-container" class="bg-[#FFFBEB] rounded-lg border border-amber-200/90 p-3">
          <div class="flex items-center justify-between text-[11px] font-semibold text-amber-900 mb-1 select-none">
            <span class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
              <span>📑 选中的原文字句</span>
            </span>
            <span id="comment-create-clause-label" class="text-[10px] font-medium text-[#2E5882]"></span>
          </div>
          <blockquote id="comment-create-quote-text" class="text-[#1E293B] text-xs font-normal italic select-text border-l-3 border-amber-400 pl-2.5 my-1 leading-relaxed">
          </blockquote>
          <input type="hidden" id="comment-create-clause-index" value="0" />
        </div>

        <!-- Form fields -->
        <div class="space-y-3">
          <div>
            <label class="block text-[11px] font-semibold text-[#334155] mb-1">
              批注人 / 审阅者姓名 <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="comment-create-author"
              class="w-full px-3 py-1.5 rounded-md border border-[#D9E1EC] focus:border-[#2E5882] focus:ring-1 focus:ring-[#2E5882] text-xs text-[#1E293B]"
              value="法务审阅人"
              placeholder="例如：张律师 (法务部)"
            />
          </div>

          <div>
            <label class="block text-[11px] font-semibold text-[#334155] mb-1">
              批注意见与修改要求 <span class="text-red-500">*</span>
            </label>
            <textarea
              id="comment-create-text"
              rows="5"
              class="w-full px-3 py-2 rounded-md border border-[#D9E1EC] focus:border-[#2E5882] focus:ring-1 focus:ring-[#2E5882] text-xs text-[#1E293B] leading-relaxed resize-none"
              placeholder="请输入针对选中文字的具体风控修改意见、增删要求或商务提示..."
            ></textarea>
          </div>

          <div class="p-2.5 rounded-md bg-[#EDF1F5] text-[10px] text-[#475569] leading-relaxed flex items-start gap-1.5">
            <span class="text-xs shrink-0">🛡️</span>
            <div>
              <strong>无状态安全回写</strong>：页面端不直接修改文件，提交后携带操作人身份向后台发起受控回写请求，自动在 Word OpenXML 中注入批注并派生新版本。
            </div>
          </div>
        </div>

        <!-- Action Footer -->
        <div class="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onclick="exitCommentCreateMode()"
            class="px-3 py-1.5 rounded-md border border-[#D9E1EC] bg-white text-xs font-medium text-[#475569] hover:bg-slate-50 transition cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            id="comment-create-submit-btn"
            onclick="submitCommentCreateFromSidebar()"
            class="px-4 py-1.5 rounded-md bg-[#1A2D42] text-xs font-semibold text-white hover:bg-[#243B53] shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <span>提交回写 Word →</span>
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
