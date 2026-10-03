/**
 * Self-contained offline CSS utilities for generated contract reports.
 * Replaces remote Tailwind Play CDN / external scripts to support
 * air-gapped environments, offline viewing, and zero third-party DOM execution risks.
 */
export const CONTRACT_REPORT_STANDALONE_CSS = `
/* Reset & Base */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
button { font-family: inherit; font-size: inherit; line-height: inherit; color: inherit; background: transparent; border: none; cursor: pointer; }
input, select, textarea { font-family: inherit; font-size: inherit; line-height: inherit; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.65; -webkit-font-smoothing: antialiased; background-color: #EEF2F6; color: #1E293B; }

/* Display & Layout */
.hidden { display: none !important; }
.block { display: block; }
.inline-block { display: inline-block; }
.inline { display: inline; }
.flex { display: flex; }
.inline-flex { display: inline-flex; }
.grid { display: grid; }
.flex-1 { flex: 1 1 0%; }
.flex-row { flex-direction: row; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.justify-between { justify-content: space-between; }
.justify-center { justify-content: center; }
.shrink-0 { flex-shrink: 0; }
.min-w-0 { min-width: 0px; }
.min-h-screen { min-height: 100vh; }
.w-full { width: 100%; }
.w-px { width: 1px; }
.w-1\\.5 { width: 0.375rem; }
.w-3 { width: 0.75rem; }
.w-3\\.5 { width: 0.875rem; }
.w-4 { width: 1rem; }
.w-6 { width: 1.5rem; }
.w-7 { width: 1.75rem; }
.w-8 { width: 2rem; }
.w-64 { width: 16rem; }
.w-72 { width: 18rem; }
.w-80 { width: 20rem; }
.h-1\\.5 { height: 0.375rem; }
.h-3 { height: 0.75rem; }
.h-3\\.5 { height: 0.875rem; }
.h-4 { height: 1rem; }
.h-6 { height: 1.5rem; }
.h-7 { height: 1.75rem; }
.h-8 { height: 2rem; }

/* Grid columns & gaps */
.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.gap-0\\.5 { gap: 0.125rem; }
.gap-1 { gap: 0.25rem; }
.gap-1\\.5 { gap: 0.375rem; }
.gap-2 { gap: 0.5rem; }
.gap-2\\.5 { gap: 0.625rem; }
.gap-3 { gap: 0.75rem; }
.gap-4 { gap: 1rem; }
.gap-5 { gap: 1.25rem; }
.gap-6 { gap: 1.5rem; }
.gap-y-1 { row-gap: 0.25rem; }
.gap-y-2 { row-gap: 0.5rem; }

/* Spacing */
.space-x-1 > * + * { margin-left: 0.25rem; }
.space-x-1\\.5 > * + * { margin-left: 0.375rem; }
.space-x-2 > * + * { margin-left: 0.5rem; }
.space-x-2\\.5 > * + * { margin-left: 0.625rem; }
.space-x-3 > * + * { margin-left: 0.75rem; }
.space-y-0\\.5 > * + * { margin-top: 0.125rem; }
.space-y-1 > * + * { margin-top: 0.25rem; }
.space-y-1\\.5 > * + * { margin-top: 0.375rem; }
.space-y-2 { margin-top: 0.5rem; }
.space-y-2\\.5 > * + * { margin-top: 0.625rem; }
.space-y-3 > * + * { margin-top: 0.75rem; }
.space-y-4 > * + * { margin-top: 1rem; }
.space-y-5 > * + * { margin-top: 1.25rem; }
.space-y-6 > * + * { margin-top: 1.5rem; }

.p-0\\.5 { padding: 0.125rem; }
.p-1 { padding: 0.25rem; }
.p-1\\.5 { padding: 0.375rem; }
.p-2 { padding: 0.5rem; }
.p-2\\.5 { padding: 0.625rem; }
.p-3 { padding: 0.75rem; }
.p-3\\.5 { padding: 0.875rem; }
.p-4 { padding: 1rem; }
.p-6 { padding: 1.5rem; }
.p-8 { padding: 2rem; }
.px-1 { padding-left: 0.25rem; padding-right: 0.25rem; }
.px-1\\.5 { padding-left: 0.375rem; padding-right: 0.375rem; }
.px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
.px-2\\.5 { padding-left: 0.625rem; padding-right: 0.625rem; }
.px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
.px-3\\.5 { padding-left: 0.875rem; padding-right: 0.875rem; }
.px-4 { padding-left: 1rem; padding-right: 1rem; }
.py-0\\.5 { padding-top: 0.125rem; padding-bottom: 0.125rem; }
.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
.py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.py-2\\.5 { padding-top: 0.625rem; padding-bottom: 0.625rem; }
.py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
.py-4 { padding-top: 1rem; padding-bottom: 1rem; }
.pt-1 { padding-top: 0.25rem; }
.pt-2 { padding-top: 0.5rem; }
.pt-3 { padding-top: 0.75rem; }
.pt-4 { padding-top: 1rem; }
.pt-8 { padding-top: 2rem; }
.pb-1\\.5 { padding-bottom: 0.375rem; }
.pb-2 { padding-bottom: 0.5rem; }
.pb-2\\.5 { padding-bottom: 0.625rem; }
.pb-6 { padding-bottom: 1.5rem; }
.pb-12 { padding-bottom: 3rem; }
.pl-0 { padding-left: 0px; }
.pl-1 { padding-left: 0.25rem; }
.pl-2 { padding-left: 0.5rem; }
.pl-3 { padding-left: 0.75rem; }
.pr-1 { padding-right: 0.25rem; }
.pr-2 { padding-right: 0.5rem; }
.pr-3 { padding-right: 0.75rem; }

.m-0 { margin: 0; }
.mx-auto { margin-left: auto; margin-right: auto; }
.my-0\\.5 { margin-top: 0.125rem; margin-bottom: 0.125rem; }
.mt-0\\.5 { margin-top: 0.125rem; }
.mt-1 { margin-top: 0.25rem; }
.mt-2 { margin-top: 0.5rem; }
.mt-2\\.5 { margin-top: 0.625rem; }
.mt-14 { margin-top: 3.5rem; }
.mb-0\\.5 { margin-bottom: 0.125rem; }
.mb-1 { margin-bottom: 0.25rem; }
.mb-1\\.5 { margin-bottom: 0.375rem; }
.mb-2 { margin-bottom: 0.5rem; }
.mb-4 { margin-bottom: 1rem; }
.mb-8 { margin-bottom: 2rem; }
.ml-1 { margin-left: 0.25rem; }
.ml-2 { margin-left: 0.5rem; }

/* Typography */
.text-\\[10px\\] { font-size: 10px; }
.text-\\[11px\\] { font-size: 11px; }
.text-\\[12px\\] { font-size: 12px; }
.text-\\[13px\\] { font-size: 13px; }
.text-\\[14px\\] { font-size: 14px; }
.text-\\[15px\\] { font-size: 15px; }
.text-\\[17px\\] { font-size: 17px; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-base { font-size: 1rem; line-height: 1.5rem; }
.text-xl { font-size: 1.25rem; line-height: 1.75rem; }
.font-normal { font-weight: 400; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.text-center { text-align: center; }
.text-left { text-align: left; }
.text-right { text-align: right; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.break-words { overflow-wrap: break-word; }
.uppercase { text-transform: uppercase; }
.select-none { user-select: none; }
.select-text { user-select: text; }
.cursor-pointer { cursor: pointer; }
.leading-tight { line-height: 1.25; }
.leading-snug { line-height: 1.375; }
.leading-normal { line-height: 1.5; }
.leading-relaxed { line-height: 1.65; }
.leading-loose { line-height: 2; }
.leading-\\[1\\.5\\] { line-height: 1.5; }
.leading-\\[1\\.6\\] { line-height: 1.6; }
.leading-\\[1\\.65\\] { line-height: 1.65; }
.leading-\\[1\\.7\\] { line-height: 1.7; }
.leading-\\[1\\.75\\] { line-height: 1.75; }
.leading-\\[1\\.8\\] { line-height: 1.8; }
.tracking-tight { letter-spacing: -0.025em; }
.tracking-wider { letter-spacing: 0.05em; }

/* Colors - Background */
.bg-white { background-color: #ffffff; }
.bg-white\\/95 { background-color: rgba(255, 255, 255, 0.95); }
.bg-slate-50 { background-color: #f8fafc; }
.bg-slate-100 { background-color: #f1f5f9; }
.bg-slate-200 { background-color: #e2e8f0; }
.bg-slate-300 { background-color: #cbd5e1; }
.bg-slate-900\\/30 { background-color: rgba(15, 23, 42, 0.3); }
.bg-slate-950\\/40 { background-color: rgba(2, 6, 23, 0.4); }
.bg-\\[\\#1A2D42\\] { background-color: #1A2D42; }
.bg-\\[\\#1E293B\\] { background-color: #1E293B; }
.bg-\\[\\#202833\\] { background-color: #202833; }
.bg-\\[\\#243B53\\] { background-color: #243B53; }
.bg-\\[\\#294766\\] { background-color: #294766; }
.bg-\\[\\#2E5882\\] { background-color: #2E5882; }
.bg-\\[\\#386A9E\\] { background-color: #386A9E; }
.bg-\\[\\#315A7D\\] { background-color: #315A7D; }
.bg-\\[\\#334E68\\] { background-color: #334E68; }
.bg-\\[\\#EDF1F5\\] { background-color: #EDF1F5; }
.bg-\\[\\#F4F6F9\\] { background-color: #F4F6F9; }
.bg-\\[\\#F8FAFC\\] { background-color: #F8FAFC; }
.bg-\\[\\#F9FAFB\\] { background-color: #F9FAFB; }
.bg-\\[\\#F0FDF4\\] { background-color: #f0fdf4; }
.bg-\\[\\#FEF2F2\\] { background-color: #fef2f2; }
.bg-\\[\\#FEF3F2\\] { background-color: #fef3f2; }
.bg-\\[\\#FFFAEB\\] { background-color: #fffaeb; }
.bg-\\[\\#FFFBEB\\] { background-color: #fffbeb; }
.bg-red-50 { background-color: #fef2f2; }
.bg-red-50\\/70 { background-color: rgba(254, 242, 242, 0.7); }
.bg-amber-50 { background-color: #fffbeb; }
.bg-amber-50\\/70 { background-color: rgba(255, 251, 235, 0.7); }
.bg-emerald-50 { background-color: #ecfdf5; }
.bg-emerald-50\\/70 { background-color: rgba(236, 253, 245, 0.7); }
.bg-blue-50 { background-color: #eff6ff; }
.bg-purple-50 { background-color: #faf5ff; }
.bg-rose-50 { background-color: #fff1f2; }

/* Colors - Text */
.text-white { color: #ffffff; }
.text-slate-100 { color: #f1f5f9; }
.text-slate-200 { color: #e2e8f0; }
.text-slate-300 { color: #cbd5e1; }
.text-slate-400 { color: #94a3b8; }
.text-slate-500 { color: #64748b; }
.text-slate-600 { color: #475569; }
.text-slate-700 { color: #334155; }
.text-slate-800 { color: #1e293b; }
.text-slate-900 { color: #0f172a; }
.text-\\[\\#166534\\] { color: #166534; }
.text-\\[\\#1E293B\\] { color: #1E293B; }
.text-\\[\\#202833\\] { color: #202833; }
.text-\\[\\#243041\\] { color: #243041; }
.text-\\[\\#294766\\] { color: #294766; }
.text-\\[\\#315A7D\\] { color: #315A7D; }
.text-\\[\\#667085\\] { color: #667085; }
.text-\\[\\#92400E\\] { color: #92400e; }
.text-\\[\\#991B1B\\] { color: #991b1b; }
.text-\\[\\#9A6700\\] { color: #9a6700; }
.text-\\[\\#B42318\\] { color: #b42318; }
.text-\\[\\#B45309\\] { color: #b45309; }
.text-\\[\\#D97706\\] { color: #d97706; }
.text-\\[\\#93C5FD\\] { color: #93C5FD; }
.text-rose-600 { color: #e11d48; }
.text-rose-800 { color: #9f1239; }
.text-emerald-400 { color: #34d399; }
.text-emerald-700 { color: #047857; }
.text-emerald-800 { color: #065f46; }
.text-blue-800 { color: #1e40af; }
.text-purple-800 { color: #6b21a8; }
.text-red-200 { color: #fecaca; }
.text-amber-200 { color: #fde68a; }

/* Borders */
.border { border: 1px solid #e2e8f0; }
.border-b { border-bottom: 1px solid #e2e8f0; }
.border-b-2 { border-bottom-width: 2px; border-bottom-style: solid; }
.border-t { border-top: 1px solid #e2e8f0; }
.border-r { border-right: 1px solid #e2e8f0; }
.border-l-2 { border-left-width: 2px; border-left-style: solid; }
.border-l-3 { border-left-width: 3px; border-left-style: solid; }
.border-l-4 { border-left-width: 4px; border-left-style: solid; }
.border-transparent { border-color: transparent; }
.border-slate-100 { border-color: #f1f5f9; }
.border-slate-200 { border-color: #e2e8f0; }
.border-slate-300 { border-color: #cbd5e1; }
.border-slate-700 { border-color: #334155; }
.border-red-100 { border-color: #fee2e2; }
.border-red-200 { border-color: #fecaca; }
.border-amber-100 { border-color: #fef3c7; }
.border-amber-200 { border-color: #fde68a; }
.border-emerald-100 { border-color: #d1fae5; }
.border-emerald-200 { border-color: #a7f3d0; }
.border-blue-200 { border-color: #bfdbfe; }
.border-purple-200 { border-color: #e9d5ff; }
.border-rose-200 { border-color: #fecdd3; }
.border-\\[\\#E2E5EA\\] { border-color: #E2E5EA; }
.border-\\[\\#E2E8F0\\] { border-color: #E2E8F0; }
.border-\\[\\#D9E1EC\\] { border-color: #D9E1EC; }
.border-\\[\\#CBD5E1\\] { border-color: #CBD5E1; }
.border-\\[\\#294766\\] { border-color: #294766; }
.border-\\[\\#2B4663\\] { border-color: #2B4663; }
.border-\\[\\#334E68\\] { border-color: #334E68; }
.border-\\[\\#4B79A6\\] { border-color: #4B79A6; }
.border-\\[\\#386A9E\\] { border-color: #386A9E; }
.border-\\[\\#F59E0B\\] { border-color: #f59e0b; }
.border-\\[\\#FCD34D\\] { border-color: #fcd34d; }
.border-\\[\\#FCA5A5\\] { border-color: #fca5a5; }
.border-\\[\\#FECDCA\\] { border-color: #fecdca; }
.border-\\[\\#FEDF89\\] { border-color: #fedf89; }
.border-\\[\\#86EFAC\\] { border-color: #86efac; }
.rounded-xs { border-radius: 0.125rem; }
.rounded-sm { border-radius: 0.125rem; }
.rounded { border-radius: 0.25rem; }
.rounded-md { border-radius: 0.375rem; }
.rounded-lg { border-radius: 0.5rem; }
.rounded-xl { border-radius: 0.75rem; }
.rounded-full { border-radius: 9999px; }
.rounded-r-md { border-top-right-radius: 0.375rem; border-bottom-right-radius: 0.375rem; }

/* Positioning & Shadows */
.sticky { position: sticky; }
.fixed { position: fixed; }
.relative { position: relative; }
.absolute { position: absolute; }
.top-0 { top: 0px; }
.top-4 { top: 1rem; }
.top-full { top: 100%; }
.top-\\[56px\\] { top: 56px; }
.top-\\[72px\\] { top: 72px; }
.inset-0 { inset: 0px; }
.inset-y-0 { top: 0px; bottom: 0px; }
.left-0 { left: 0px; }
.right-0 { right: 0px; }
.right-6 { right: 1.5rem; }
.z-20 { z-index: 20; }
.z-30 { z-index: 30; }
.z-40 { z-index: 40; }
.z-50 { z-index: 50; }
.overflow-hidden { overflow: hidden; }
.overflow-y-auto { overflow-y: auto; }
.overflow-x-auto { overflow-x: auto; }
.shadow-xs { box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
.shadow-2xs { box-shadow: 0 1px 1px 0 rgba(0, 0, 0, 0.05); }
.shadow-md { box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1); }
.shadow-lg { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1); }
.shadow-xl { box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); }
.shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
.shadow-paper { box-shadow: 0 4px 24px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04); }
.shadow-card { box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.06), 0 1px 2px -1px rgba(15, 23, 42, 0.04); }
.shadow-card-hover { box-shadow: 0 4px 14px -2px rgba(15, 23, 42, 0.1), 0 2px 4px -1px rgba(15, 23, 42, 0.05); }
.backdrop-blur-xs { backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); }
.backdrop-blur-sm { backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
.backdrop-blur-md { backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.pointer-events-none { pointer-events: none; }
.pointer-events-auto { pointer-events: auto; }
.opacity-0 { opacity: 0; }
.opacity-100 { opacity: 1; }
.transform { transform: translate(var(--tw-translate-x, 0), var(--tw-translate-y, 0)); }
.-translate-x-full { --tw-translate-x: -100%; transform: translateX(-100%); }
.translate-x-0 { --tw-translate-x: 0px; transform: translateX(0px); }
.-translate-y-2 { --tw-translate-y: -0.5rem; transform: translateY(-0.5rem); }
.translate-y-0 { --tw-translate-y: 0px; transform: translateY(0px); }
.transition { transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1); }
.transition-all { transition: all 200ms ease-in-out; }
.transition-opacity { transition: opacity 200ms ease-in-out; }
.transition-transform { transition: transform 200ms ease-in-out; }

/* Responsive */
@media (min-width: 640px) {
  .sm\\:block { display: block; }
  .sm\\:inline { display: inline; }
  .sm\\:hidden { display: none; }
  .sm\\:gap-3 { gap: 0.75rem; }
  .sm\\:gap-4 { gap: 1rem; }
  .sm\\:px-4 { padding-left: 1rem; padding-right: 1rem; }
  .sm\\:px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
  .sm\\:p-10 { padding: 2.5rem; }
  .sm\\:text-sm { font-size: 0.875rem; line-height: 1.25rem; }
  .sm\\:text-lg { font-size: 1.125rem; line-height: 1.75rem; }
  .sm\\:text-2xl { font-size: 1.5rem; line-height: 2rem; }
}
@media (min-width: 768px) {
  .md\\:inline-block { display: inline-block; }
  .md\\:grid-cols-10 { grid-template-columns: repeat(10, minmax(0, 1fr)); }
  .md\\:col-span-4 { grid-column: span 4 / span 4; }
  .md\\:col-span-6 { grid-column: span 6 / span 6; }
  .md\\:p-14 { padding: 3.5rem; }
}
@media (min-width: 1024px) {
  .lg\\:block { display: block; }
  .lg\\:inline { display: inline; }
  .lg\\:px-8 { padding-left: 2rem; padding-right: 2rem; }
}
@media (min-width: 1280px) {
  .xl\\:block { display: block; }
  .xl\\:inline-block { display: inline-block; }
}

/* Word Comments & Interaction Modal Styles */
.bg-amber-100 { background-color: #fef3c7; }
.bg-amber-100\\/80 { background-color: rgba(254, 243, 199, 0.8); }
.bg-amber-100\\/90 { background-color: rgba(254, 243, 199, 0.9); }
.bg-amber-200 { background-color: #fde68a; }
.bg-amber-500 { background-color: #f59e0b; }
.bg-amber-500\\/10 { background-color: rgba(245, 158, 11, 0.1); }
.bg-amber-500\\/20 { background-color: rgba(245, 158, 11, 0.2); }
.bg-slate-950\\/50 { background-color: rgba(2, 6, 23, 0.5); }
.text-amber-300 { color: #fcd34d; }
.text-amber-600 { color: #d97706; }
.text-amber-700 { color: #b45309; }
.text-amber-800 { color: #92400e; }
.text-amber-900 { color: #78350f; }
.border-amber-200\\/80 { border-color: rgba(253, 230, 138, 0.8); }
.border-amber-300 { border-color: #fcd34d; }
.border-amber-400 { border-color: #fbbf24; }
.border-amber-500 { border-color: #f59e0b; }
.border-amber-500\\/30 { border-color: rgba(245, 158, 11, 0.3); }
.border-amber-500\\/50 { border-color: rgba(245, 158, 11, 0.5); }
.border-l-amber-500 { border-left-color: #f59e0b; border-left-width: 4px; border-left-style: solid; }
.scale-95 { transform: scale(0.95); }
.scale-100 { transform: scale(1); }
.max-w-md { max-width: 28rem; }
.max-w-lg { max-width: 32rem; }
.max-w-xl { max-width: 36rem; }
.active-comment-card { border-color: #f59e0b !important; background-color: #fffdf5 !important; box-shadow: 0 4px 16px -2px rgba(245, 158, 11, 0.3) !important; }
.docx-comment-highlight { background-color: rgba(254, 243, 199, 0.85); border-bottom: 2px solid #f59e0b; border-radius: 2px; }
.docx-comment-highlight-active { background-color: #fde68a !important; outline: 2px solid #d97706 !important; }

/* Topbar Segmented Pill Controls */
.topbar-tabs-track {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background-color: #101E2E;
  padding: 3px;
  border-radius: 8px;
  border: 1px solid #2B4663;
}
.topbar-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #94A3B8;
  background-color: transparent;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  white-space: nowrap;
  user-select: none;
}
.topbar-tab-btn:hover {
  color: #FFFFFF;
  background-color: rgba(255, 255, 255, 0.08);
}
.topbar-tab-btn.active-tab {
  background-color: #2E5882 !important;
  color: #FFFFFF !important;
  font-weight: 600 !important;
  border-color: #4B79A6 !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3) !important;
}
.badge-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0px 5px;
  border-radius: 9999px;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 700;
  line-height: 1.4;
}
.badge-count-all { background-color: rgba(255, 255, 255, 0.15); color: #E2E8F0; }
.badge-count-high { background-color: #991B1B; color: #FEE2E2; }
.badge-count-missing { background-color: #9A6700; color: #FEF3C7; }
.badge-count-verify { background-color: #334E68; color: #BAE6FD; }
.badge-count-comment { background-color: #D97706; color: #FFFFFF; }

/* Primary Action Button */
.btn-append-comment-primary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 6px;
  background-color: #D97706;
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #F59E0B;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  transition: all 0.15s ease;
  white-space: nowrap;
  user-select: none;
}
.btn-append-comment-primary:hover {
  background-color: #B45309;
  border-color: #D97706;
  box-shadow: 0 2px 6px rgba(217, 119, 6, 0.35);
}

/* Workbench Tab Buttons */
.workbench-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #64748B;
  background-color: #F1F5F9;
  border: 1px solid #D9E1EC;
  transition: all 0.15s;
  user-select: none;
}
.workbench-tab-btn:hover {
  color: #1E293B;
  background-color: #E2E8F0;
}
.workbench-tab-btn.active {
  background-color: #FFFFFF !important;
  color: #1A2D42 !important;
  border-color: #2E5882 !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
}

/* Clause Comment Callout Banner */
.clause-comment-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 6px 0 10px 0;
  padding: 6px 10px;
  border-radius: 6px;
  background-color: #FFFBEB;
  border: 1px solid #FCD34D;
  color: #78350F;
  font-size: 12px;
}

/* Floating Text Selection Dual Bubble (添加批注 + 写入审批) */
#text-selection-bubble,
#text-selection-comment-bubble {
  position: absolute;
  z-index: 100;
  display: none;
  transform: translate(-50%, -100%);
  margin-top: -8px;
  background-color: #1A2D42;
  color: #FFFFFF;
  padding: 3px 4px;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  border: 1px solid #386A9E;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  user-select: none;
  align-items: center;
  gap: 3px;
}
#text-selection-bubble::after,
#text-selection-comment-bubble::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%);
  border-width: 5px 5px 0;
  border-style: solid;
  border-color: #1A2D42 transparent;
  display: block;
  width: 0;
}
.bubble-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  color: #FFFFFF;
  background: transparent;
  border: none;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.bubble-action-btn:hover {
  background-color: #2E5882;
  color: #FFFFFF;
}
.bubble-divider {
  width: 1px;
  height: 14px;
  background-color: #386A9E;
  margin: 0 2px;
}

/* Executive KPI Metric Tile Styles (Refined & Modern) */
.kpi-metric-tile {
  border-radius: 10px;
  padding: 10px 12px;
  text-align: left;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.kpi-metric-tile:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
}
.kpi-metric-tile:active {
  transform: translateY(0);
}

.kpi-card-high {
  background: linear-gradient(135deg, #FEF2F2 0%, #FFFFFF 100%);
  border: 1px solid #FECACA;
  border-top: 3px solid #DC2626;
}
.kpi-card-high:hover {
  border-color: #F87171;
}

.kpi-card-missing {
  background: linear-gradient(135deg, #FFFBEB 0%, #FFFFFF 100%);
  border: 1px solid #FDE68A;
  border-top: 3px solid #D97706;
}
.kpi-card-missing:hover {
  border-color: #FBBF24;
}

.kpi-card-verify {
  background: linear-gradient(135deg, #EFF6FF 0%, #FFFFFF 100%);
  border: 1px solid #BFDBFE;
  border-top: 3px solid #2563EB;
}
.kpi-card-verify:hover {
  border-color: #60A5FA;
}

.kpi-card-pass {
  background: linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 100%);
  border: 1px solid #BBF7D0;
  border-top: 3px solid #16A34A;
}
.kpi-card-pass:hover {
  border-color: #4ADE80;
}

.kpi-icon-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  letter-spacing: 0.02em;
}

/* Risk Finding Evidence Marks (Distinct from Docx Comments) */
.evidence-mark-high {
  background-color: rgba(254, 226, 226, 0.75) !important;
  border-bottom: 2px solid #EF4444 !important;
  color: #991B1B !important;
  padding: 1px 3px;
  border-radius: 2px;
  cursor: pointer;
}
.evidence-mark-medium {
  background-color: rgba(255, 237, 213, 0.75) !important;
  border-bottom: 2px solid #F97316 !important;
  color: #9A3412 !important;
  padding: 1px 3px;
  border-radius: 2px;
  cursor: pointer;
}
.evidence-risk-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  vertical-align: middle;
  margin-left: 4px;
  cursor: pointer;
  user-select: none;
}
.evidence-risk-badge-high {
  background-color: #FEE2E2;
  color: #991B1B;
  border: 1px solid #FCA5A5;
}
.evidence-risk-badge-medium {
  background-color: #FFEDD5;
  color: #9A3412;
  border: 1px solid #FDBA74;
}

/* Word Comment Highlights & Rich Badges */
.docx-comment-highlight {
  background-color: #FEF3C7;
  border-bottom: 2px solid #F59E0B;
  padding: 1px 2px;
  border-radius: 2px;
  transition: all 0.15s ease;
  cursor: pointer;
  scroll-margin-top: 130px;
}
.docx-comment-highlight:hover {
  background-color: #FDE68A !important;
  border-bottom-color: #D97706 !important;
}
.docx-comment-highlight-active {
  background-color: #FDE68A !important;
  border-bottom: 2px solid #D97706 !important;
  outline: 2px solid #D97706 !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.35) !important;
  animation: commentHighlightPulse 2s ease-in-out;
}
@keyframes commentHighlightPulse {
  0% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.6); }
  50% { box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2); }
  100% { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.35); }
}

.docx-comment-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  vertical-align: middle;
  margin-left: 5px;
  background: linear-gradient(180deg, #FEF3C7 0%, #FDE68A 100%);
  color: #78350F;
  border: 1px solid #FCD34D;
  box-shadow: 0 1px 2px rgba(180, 83, 9, 0.15);
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}
.docx-comment-badge:hover {
  background: #FCD34D;
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(180, 83, 9, 0.25);
}
.docx-comment-badge:active {
  transform: translateY(0);
}

/* Fast Rich Hover Popover for Docx Comments (Snappy, Beautiful, Large Font) */
#comment-hover-popover {
  position: absolute;
  z-index: 60;
  background-color: #FFFFFF;
  border: 1px solid #FCD34D;
  border-radius: 10px;
  box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.12), 0 4px 8px -2px rgba(0, 0, 0, 0.06);
  padding: 12px 14px;
  width: 320px;
  max-width: 90vw;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  pointer-events: auto;
  opacity: 0;
  transform: scale(0.96) translateY(4px);
  transition: opacity 0.12s ease, transform 0.12s ease;
  visibility: hidden;
}
#comment-hover-popover.popover-visible {
  opacity: 1;
  transform: scale(1) translateY(0);
  visibility: visible;
}
#comment-hover-popover::after {
  content: "";
  position: absolute;
  width: 10px;
  height: 10px;
  background: #FFFFFF;
  border-left: 1px solid #FCD34D;
  border-bottom: 1px solid #FCD34D;
  transform: rotate(-45deg);
}
#comment-hover-popover.arrow-top::after {
  top: -6px;
  left: 24px;
  border-left: none;
  border-bottom: none;
  border-top: 1px solid #FCD34D;
  border-right: 1px solid #FCD34D;
}
#comment-hover-popover.arrow-bottom::after {
  bottom: -6px;
  left: 24px;
}
#comment-hover-popover.popover-risk {
  border-color: #F87171;
  box-shadow: 0 10px 25px -3px rgba(239, 68, 68, 0.15), 0 4px 8px -2px rgba(0, 0, 0, 0.06);
}
#comment-hover-popover.popover-risk::after {
  border-left-color: #F87171;
  border-bottom-color: #F87171;
}
#comment-hover-popover.popover-risk.arrow-top::after {
  border-top-color: #F87171;
  border-right-color: #F87171;
}

/* Resizable Dual-Column Workspace Layout */
#main-workspace-container {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  position: relative;
  width: 100%;
}
#document-column {
  min-width: 0;
  flex-shrink: 0;
}
#workbench-column {
  min-width: 0;
  position: sticky;
  top: 56px;
  max-height: calc(100vh - 4.5rem);
  overflow-y: auto;
  flex: 1 1 0%;
}
@media (max-width: 1024px) {
  #main-workspace-container {
    flex-direction: column;
  }
  #layout-resizer {
    display: none !important;
  }
  #document-column, #workbench-column {
    width: 100% !important;
    position: static;
    max-height: none;
  }
}

/* Draggable Splitter */
#layout-resizer {
  width: 12px;
  min-width: 12px;
  margin: 0 -6px;
  z-index: 40;
  cursor: col-resize;
  background: transparent;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  transition: background-color 0.15s ease;
}
#layout-resizer:hover, #layout-resizer.resizer-active {
  background-color: #E2E8F0;
}
#layout-resizer::after {
  content: "";
  width: 2px;
  height: 48px;
  background-color: #94A3B8;
  border-radius: 9999px;
  position: sticky;
  top: 50vh;
  transition: background-color 0.15s ease;
}
#layout-resizer:hover::after, #layout-resizer.resizer-active::after {
  background-color: #2563EB;
}

/* View Mode Toggles & Primary Tabs */
.view-btn-active {
  background-color: #1E293B !important;
  color: #FFFFFF !important;
  border-color: #1E293B !important;
}

.primary-tab-active {
  background-color: #0F172A !important;
  color: #FFFFFF !important;
  font-weight: 700 !important;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25) !important;
}

.sev-filter-active {
  background-color: #1E293B !important;
  color: #FFFFFF !important;
  border-color: #1E293B !important;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.15) !important;
  font-weight: 700 !important;
}

/* Actionable Item Card Styling */
.finding-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 10px;
  margin-top: 10px;
  border-top: 1px solid #F1F5F9;
  flex-wrap: wrap;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.action-btn-primary {
  background-color: #0F172A;
  color: #FFFFFF;
  border: 1px solid #0F172A;
}
.action-btn-primary:hover {
  background-color: #1E293B;
  border-color: #1E293B;
}

.action-btn-secondary {
  background-color: #FFFFFF;
  color: #334155;
  border: 1px solid #CBD5E1;
}
.action-btn-secondary:hover {
  background-color: #F8FAFC;
  color: #0F172A;
  border-color: #94A3B8;
}

/* Status States */
.status-accepted {
  background-color: #F0FDF4 !important;
  border-color: #86EFAC !important;
}
.status-resolved {
  opacity: 0.65;
  background-color: #F8FAFC !important;
}
.status-resolved:hover {
  opacity: 1;
}
.status-ignored {
  opacity: 0.55;
  background-color: #FFFBEB !important;
  border-color: #FDE68A !important;
}
.status-ignored:hover {
  opacity: 0.9;
}

/* Mode Switching: View vs Review */
.mode-view .mode-review-only {
  display: none !important;
}
.mode-view .mode-view-only {
  display: flex !important;
}
.mode-review .mode-view-only {
  display: none !important;
}

/* Document Paper Comfort Reading & Anti-Glare */
#document-paper-container {
  background-color: #FAFAFA !important;
  border: 1px solid #D9E1EC !important;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05), 0 6px 24px rgba(15, 23, 42, 0.04) !important;
}
#document-body {
  line-height: 1.8;
}
#document-body .paragraph {
  margin-bottom: 0.85rem;
  line-height: 1.8;
}
#document-body .clause-hierarchical-line {
  margin-bottom: 0.45rem;
  line-height: 1.8;
}
.clause-content {
  line-height: 1.8 !important;
}

/* Modern Refined Finding Cards */
.finding-card {
  border-radius: 10px;
  background-color: #FFFFFF;
  border: 1px solid #D9E1EC;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}
.finding-card:hover {
  border-color: #94A3B8;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.07);
}
.finding-card.active-finding-card {
  border-color: #2E5882 !important;
  box-shadow: 0 0 0 2px rgba(46, 88, 130, 0.25), 0 4px 16px rgba(15, 23, 42, 0.08) !important;
}
.finding-card.finding-card-high {
  border-left: 3.5px solid #EF4444 !important;
}
.finding-card.finding-card-medium {
  border-left: 3.5px solid #F59E0B !important;
}
.finding-card.finding-card-low {
  border-left: 3.5px solid #3B82F6 !important;
}
.finding-card p {
  line-height: 1.7;
}

/* Filter controls button safety spacing */
#findings-filter-controls button, #findings-filter-controls select {
  margin: 0 2px;
}
`;
