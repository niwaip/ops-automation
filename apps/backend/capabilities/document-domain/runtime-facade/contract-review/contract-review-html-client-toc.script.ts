/**
 * Client-side script for Outline Drawer (TOC) and Language/Bilingual toggles.
 */
export function buildTocAndLangScript(): string {
  return `
    function scrollTargetToUpperMiddle(el) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
      const unifiedBar = document.getElementById('unified-top-bar') || document.querySelector('header');
      const barHeight = unifiedBar ? unifiedBar.offsetHeight : 52;
      const targetViewportOffset = Math.max(barHeight + 20, Math.floor(window.innerHeight * 0.22));
      const destinationY = currentScrollY + rect.top - targetViewportOffset;
      window.scrollTo({
        top: Math.max(0, destinationY),
        behavior: 'smooth'
      });
    }

    function toggleTocDrawer(open) {
      const drawer = document.getElementById('toc-drawer');
      const backdrop = document.getElementById('toc-backdrop');
      if (!drawer || !backdrop) return;
      const isOpen = !drawer.classList.contains('-translate-x-full');
      const target = typeof open === 'boolean' ? open : !isOpen;
      if (target) {
        drawer.classList.remove('-translate-x-full');
        drawer.classList.add('translate-x-0');
        backdrop.classList.remove('opacity-0', 'pointer-events-none');
        backdrop.classList.add('opacity-100', 'pointer-events-auto');
        const searchInput = document.getElementById('toc-search');
        if (searchInput) setTimeout(() => searchInput.focus(), 150);
      } else {
        drawer.classList.add('-translate-x-full');
        drawer.classList.remove('translate-x-0');
        backdrop.classList.add('opacity-0', 'pointer-events-none');
        backdrop.classList.remove('opacity-100', 'pointer-events-auto');
      }
    }

    function toggleTocGroup(headerEl) {
      const group = headerEl.parentElement;
      const sub = group.querySelector('.toc-sub-list');
      if (!sub) return;
      if (sub.classList.contains('hidden')) {
        sub.classList.remove('hidden');
      } else {
        sub.classList.add('hidden');
      }
    }

    function filterTocItems(query) {
      const q = query.trim().toLowerCase();
      document.querySelectorAll('.toc-link').forEach(link => {
        const text = link.textContent.toLowerCase();
        if (!q || text.includes(q)) {
          link.classList.remove('hidden');
        } else {
          link.classList.add('hidden');
        }
      });
      document.querySelectorAll('.toc-chapter-group').forEach(grp => {
        const visibleSub = grp.querySelectorAll('.toc-link:not(.hidden)');
        if (visibleSub.length === 0 && q) {
          grp.classList.add('hidden');
        } else {
          grp.classList.remove('hidden');
        }
      });
    }

    function jumpToClauseNode(clauseIndex, event) {
      if (event) event.preventDefault();
      const node = document.getElementById('clause-node-' + clauseIndex);
      if (node) {
        scrollTargetToUpperMiddle(node);
        node.classList.add('evidence-highlight-active');
        setTimeout(() => node.classList.remove('evidence-highlight-active'), 2000);
      }
      toggleTocDrawer(false);
    }

    function setBilingualMode(mode) {
      const container = document.getElementById('document-paper-container');
      const btnBoth = document.getElementById('btn-lang-both') || document.getElementById('lang-btn-both');
      const btnZh = document.getElementById('btn-lang-zh') || document.getElementById('lang-btn-zh');
      const btnJa = document.getElementById('btn-lang-ja') || document.getElementById('lang-btn-ja');

      if (!container || !btnBoth || !btnZh || !btnJa) return;

      container.classList.remove('lang-bilingual', 'lang-zh-only', 'lang-ja-only');
      [btnBoth, btnZh, btnJa].forEach(b => {
        b.classList.remove('bg-[#2E5882]', 'text-white', 'font-semibold', 'shadow-2xs');
        b.classList.add('text-slate-300');
      });

      if (mode === 'zh') {
        container.classList.add('lang-zh-only');
        btnZh.classList.add('bg-[#2E5882]', 'text-white', 'font-semibold', 'shadow-2xs');
        btnZh.classList.remove('text-slate-300');
      } else if (mode === 'ja') {
        container.classList.add('lang-ja-only');
        btnJa.classList.add('bg-[#2E5882]', 'text-white', 'font-semibold', 'shadow-2xs');
        btnJa.classList.remove('text-slate-300');
      } else {
        container.classList.add('lang-bilingual');
        btnBoth.classList.add('bg-[#2E5882]', 'text-white', 'font-semibold', 'shadow-2xs');
        btnBoth.classList.remove('text-slate-300');
      }
    }
  `;
}
