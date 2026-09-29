/**
 * Self-contained offline CSS utilities for generated contract reports.
 * Replaces remote Tailwind Play CDN / external scripts to support
 * air-gapped environments, offline viewing, and zero third-party DOM execution risks.
 */
export const CONTRACT_REPORT_STANDALONE_CSS = `
/* Reset & Base */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.5; -webkit-font-smoothing: antialiased; }

/* Display & Layout */
.hidden { display: none !important; }
.block { display: block; }
.inline-block { display: inline-block; }
.inline { display: inline; }
.flex { display: flex; }
.inline-flex { display: inline-flex; }
.grid { display: grid; }
.flex-1 { flex: 1 1 0%; }
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
.gap-1 { gap: 0.25rem; }
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
.space-y-3 > * + * { margin-top: 0.75rem; }
.space-y-4 > * + * { margin-top: 1rem; }

.p-0\\.5 { padding: 0.125rem; }
.p-1\\.5 { padding: 0.375rem; }
.p-2 { padding: 0.5rem; }
.p-2\\.5 { padding: 0.625rem; }
.p-3 { padding: 0.75rem; }
.p-3\\.5 { padding: 0.875rem; }
.p-4 { padding: 1rem; }
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
.pt-2 { padding-top: 0.5rem; }
.pt-3 { padding-top: 0.75rem; }
.pt-4 { padding-top: 1rem; }
.pb-2\\.5 { padding-bottom: 0.625rem; }
.pb-12 { padding-bottom: 3rem; }
.pl-1 { padding-left: 0.25rem; }
.pl-3 { padding-left: 0.75rem; }
.pr-1 { padding-right: 0.25rem; }
.pr-2 { padding-right: 0.5rem; }
.pr-3 { padding-right: 0.75rem; }

.m-0 { margin: 0; }
.mx-auto { margin-left: auto; margin-right: auto; }
.mt-1 { margin-top: 0.25rem; }
.mt-2 { margin-top: 0.5rem; }
.mt-2\\.5 { margin-top: 0.625rem; }
.mb-1\\.5 { margin-bottom: 0.375rem; }
.mb-2 { margin-bottom: 0.5rem; }
.mb-4 { margin-bottom: 1rem; }
.ml-1 { margin-left: 0.25rem; }
.ml-2 { margin-left: 0.5rem; }

/* Typography */
.text-\\[10px\\] { font-size: 10px; }
.text-\\[11px\\] { font-size: 11px; }
.text-\\[13px\\] { font-size: 13px; }
.text-\\[14px\\] { font-size: 14px; }
.text-\\[15px\\] { font-size: 15px; }
.text-\\[17px\\] { font-size: 17px; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-base { font-size: 1rem; line-height: 1.5rem; }
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
.cursor-pointer { cursor: pointer; }
.leading-tight { line-height: 1.25; }
.leading-normal { line-height: 1.5; }
.leading-relaxed { line-height: 1.625; }
.tracking-tight { letter-spacing: -0.025em; }
.tracking-wider { letter-spacing: 0.05em; }

/* Colors - Background */
.bg-white { background-color: #ffffff; }
.bg-white\\/95 { background-color: rgba(255, 255, 255, 0.95); }
.bg-slate-50 { background-color: #f8fafc; }
.bg-slate-100 { background-color: #f1f5f9; }
.bg-slate-200 { background-color: #e2e8f0; }
.bg-slate-900\\/30 { background-color: rgba(15, 23, 42, 0.3); }
.bg-\\[\\#202833\\] { background-color: #202833; }
.bg-\\[\\#294766\\] { background-color: #294766; }
.bg-\\[\\#315A7D\\] { background-color: #315A7D; }
.bg-\\[\\#F0FDF4\\] { background-color: #f0fdf4; }
.bg-\\[\\#FEF2F2\\] { background-color: #fef2f2; }
.bg-\\[\\#FFFBEB\\] { background-color: #fffbeb; }

/* Colors - Text */
.text-white { color: #ffffff; }
.text-slate-300 { color: #cbd5e1; }
.text-slate-400 { color: #94a3b8; }
.text-slate-500 { color: #64748b; }
.text-slate-600 { color: #475569; }
.text-slate-700 { color: #334155; }
.text-slate-800 { color: #1e293b; }
.text-\\[\\#166534\\] { color: #166534; }
.text-\\[\\#202833\\] { color: #202833; }
.text-\\[\\#243041\\] { color: #243041; }
.text-\\[\\#294766\\] { color: #294766; }
.text-\\[\\#315A7D\\] { color: #315A7D; }
.text-\\[\\#667085\\] { color: #667085; }
.text-\\[\\#92400E\\] { color: #92400e; }
.text-\\[\\#991B1B\\] { color: #991b1b; }
.text-\\[\\#B45309\\] { color: #b45309; }
.text-rose-600 { color: #e11d48; }
.text-emerald-400 { color: #34d399; }

/* Borders */
.border { border: 1px solid #e2e8f0; }
.border-b { border-bottom: 1px solid #e2e8f0; }
.border-t { border-top: 1px solid #e2e8f0; }
.border-r { border-right: 1px solid #e2e8f0; }
.border-l-4 { border-left-width: 4px; border-left-style: solid; }
.border-slate-200 { border-color: #e2e8f0; }
.border-slate-300 { border-color: #cbd5e1; }
.border-slate-700 { border-color: #334155; }
.border-\\[\\#E2E5EA\\] { border-color: #E2E5EA; }
.border-\\[\\#294766\\] { border-color: #294766; }
.border-\\[\\#F59E0B\\] { border-color: #f59e0b; }
.border-\\[\\#FCD34D\\] { border-color: #fcd34d; }
.border-\\[\\#FCA5A5\\] { border-color: #fca5a5; }
.border-\\[\\#86EFAC\\] { border-color: #86efac; }
.rounded { border-radius: 0.25rem; }
.rounded-md { border-radius: 0.375rem; }
.rounded-lg { border-radius: 0.5rem; }
.rounded-full { border-radius: 9999px; }
.rounded-r-md { border-top-right-radius: 0.375rem; border-bottom-right-radius: 0.375rem; }

/* Positioning & Shadows */
.sticky { position: sticky; }
.fixed { position: fixed; }
.top-0 { top: 0px; }
.top-4 { top: 1rem; }
.top-\\[56px\\] { top: 56px; }
.top-\\[72px\\] { top: 72px; }
.inset-0 { inset: 0px; }
.inset-y-0 { top: 0px; bottom: 0px; }
.left-0 { left: 0px; }
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
.shadow-lg { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1); }
.shadow-xl { box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); }
.pointer-events-none { pointer-events: none; }
.opacity-0 { opacity: 0; }
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
}
@media (min-width: 768px) {
  .md\\:inline-block { display: inline-block; }
  .md\\:grid-cols-10 { grid-template-columns: repeat(10, minmax(0, 1fr)); }
  .md\\:col-span-4 { grid-column: span 4 / span 4; }
  .md\\:col-span-6 { grid-column: span 6 / span 6; }
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
`;
