// Evidence harness: current sources, fake credentials/APIs, no network or real browser.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const root = require('path').resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const read = p => fs.readFileSync(root + '/' + p, 'utf8');
function compile(source, mocks = {}, globals = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports: mod.exports, module: mod, require: id => {
    if (!(id in mocks)) throw new Error('Unexpected dependency: ' + id);
    return mocks[id];
  }, console: { error() {}, warn() {} }, Error, Date, Map, Set, AbortController, ...globals });
  return mod.exports;
}
function hooks() {
  const states = [], refs = [], memos = [], effectSlots = [];
  let si, ri, mi, ei, pending;
  const same = (a, b) => a && b && a.length === b.length && b.every((v, i) => Object.is(v, a[i]));
  const react = {
    useState(initial) { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; },
    useRef(initial) { const i = ri++; return refs[i] ||= { current: initial }; },
    useMemo(fn, deps) { const i = mi++; if (!memos[i] || !same(memos[i].deps, deps)) memos[i] = { deps, value: fn() }; return memos[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = ei++; if (!effectSlots[i] || !same(effectSlots[i].deps, deps)) pending.push({ i, fn, deps }); },
    memo: fn => fn,
  };
  return { react, states, render(fn) {
    si = ri = mi = ei = 0; pending = []; const result = fn();
    for (const { i } of pending) effectSlots[i]?.cleanup?.();
    for (const { i, fn, deps } of pending) effectSlots[i] = { deps, cleanup: fn() };
    return result;
  } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const chatPath = 'apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts';
const htmlPath = 'apps/frontend/shared/chat-web/components/HtmlPreviewBlock.tsx';
const pagePath = 'apps/frontend/user-web/src/features/chat/pages/ChatPage.tsx';
function makeChat() {
  const h = hooks(), streams = [], calls = [], patches = [], background = [];
  const queryClient = { invalidateQueries: async () => {} };
  let tokenProvider = async () => 'FAKE';
  const api = {
    apiClient: { ensureFreshAccessToken: () => tokenProvider(), post: async (url, payload) => calls.push({ url, ...payload }) },
    executionApi: { cancel: async executionId => calls.push({ executionId }) },
    chatApi: { stream(_transport, _token, request, onEvent) {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      const record = { request, onEvent, resolve, reject, promise, aborts: 0, abort() { record.aborts++; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); } };
      streams.push(record); return record;
    } },
  };
  const useChat = compile(read(chatPath), {
    react: h.react, 'react-query': { useQueryClient: () => queryClient },
    '@ops/user-core': { reduceChatStreamEvent: ({ event }) => ({ accumulatedContent: '', messagePatch: { metadata: event } }) },
    '../../../api': api,
    '../../../adapters/auth/authStore': { authStore: { getState: () => ({ accessToken: 'FAKE' }) } },
    '../../../adapters/streaming/browserStreamingTransport': { browserStreamingTransport: {} },
    '../lib/messageState': { buildPatchedMessage: (m, p) => ({ ...m, ...p }) },
    '../lib/taskNotifications': { notifyTaskTerminalState() {} },
    '../lib/backgroundTaskManager': { backgroundTaskManager: { setQueryInvalidator() {}, registerTask: entry => background.push(entry) } },
    '../lib/workflowNaturalLanguageRouter': { handleWorkflowNaturalLanguage: async () => null },
  }).useChatStreaming;
  const opts = { toast: { info() {}, success() {}, warning() {} }, notifiedTaskStateKeysRef: { current: new Set() }, sessionMessagesRef: { current: { A: [{ id: 'mA', content: '' }], B: [{ id: 'mB', content: '' }] } }, appendProgressLog() {}, snapshotMessageThoughts() {}, updateMessage: (sessionId, messageId, patch) => patches.push({ sessionId, messageId, ...patch }), updateSessionMeta() {} };
  return { h, streams, calls, patches, background, render: () => h.render(() => useChat(opts)), setTokenProvider: fn => { tokenProvider = fn; } };
}
function declaration(source, name) {
  const sf = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(n) { if (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(sf) === name)) found = n.getText(sf); ts.forEachChild(n, visit); }
  visit(sf); assert(found, 'Declaration missing: ' + name); return found;
}
const jsx = (type, props) => ({ type, props });
function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) { const match = findNode(n, predicate); if (match) return match; } return; }
  if (predicate(node)) return node;
  return findNode(node.props?.children, predicate);
}
async function main() {
  const rendererSource = read('apps/frontend/shared/chat-web/components/MessageContentRenderer.tsx');
  const funcs = ['safeUrlTransform', 'extractLocalAuthToken', 'appendAuthToken'].map(n => declaration(rendererSource, n)).join('\n');
  const token = compile(funcs, {}, { window: { location: { origin: 'https://app.invalid' } }, URL, localStorage: { getItem: key => key === 'ops-user-auth' ? JSON.stringify({ accessToken: 'FAKE_SECRET' }) : null } });
  assert.equal(token.appendAuthToken('https://collector.invalid/api/ai/chat/workspace-files/demo.png'), 'https://collector.invalid/api/ai/chat/workspace-files/demo.png');
  assert.equal(token.appendAuthToken('/api/ai/chat/workspace-files/demo.png'), '/api/ai/chat/workspace-files/demo.png?token=FAKE_SECRET');
  console.log('FIXED_EXTERNAL_TOKEN_LEAK', true);

  const old = makeChat(); let chat = old.render();
  const runA = chat.runAssistantRequest({ id: 'A' }, { message: 'A' }, 'mA'); await tick();
  old.streams[0].onEvent({ executionId: 'execution-A' }); chat = old.render(); chat.handleStopStreaming('B');
  assert.equal(old.streams[0].aborts, 0); assert(!old.calls.some(x => x.executionId));
  old.streams[0].resolve(); await runA;
  console.log('FIXED_FRONTEND_EXECUTION_CANCEL_FALLBACK', true);

  const controllerSource = read('apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat.controller.ts');
  const controllerAst = ts.createSourceFile('controller.ts', controllerSource, ts.ScriptTarget.Latest, true);
  let stopBody;
  function findStop(n) { if (ts.isMethodDeclaration(n) && n.name.getText(controllerAst) === 'stopChat') stopBody = n.body.getText(controllerAst); ts.forEachChild(n, findStop); }
  findStop(controllerAst); assert(stopBody);
  const stopChat = compile('export async function stopChat(body, req) ' + stopBody).stopChat;
  const brokerStops = [];
  await stopChat.call({ chatOrchestratorService: { resolveAuthenticatedUser: async () => ({ userId: 'FAKE_USER' }) }, userSandboxDispatcherService: { stopPersonalSandbox: async (...args) => brokerStops.push(args) } }, { sessionId: 'B' }, { headers: { authorization: 'FAKE' } });
  assert.deepEqual(brokerStops, [['FAKE_USER']]);
  console.log('BACKEND_STOP_B_DISCARDS_SESSION_ID', JSON.stringify(brokerStops));

  const concurrent = makeChat(); chat = concurrent.render();
  const a = chat.runAssistantRequest({ id: 'A' }, { message: 'A' }, 'mA'); await tick();
  const b = chat.runAssistantRequest({ id: 'B' }, { message: 'B' }, 'mB'); await tick();
  concurrent.streams[0].onEvent({ executionId: 'execution-A' }); concurrent.streams[1].onEvent({ executionId: 'execution-B' });
  chat = concurrent.render(); chat.handleStopStreaming('A'); await a;
  concurrent.streams[1].reject(new Error('HTTP 500')); await b;
  assert.equal(concurrent.patches.find(x => x.sessionId === 'A' && x.metadata?.executionStatus === 'cancelled').metadata.executionId, 'execution-A');
  assert(concurrent.patches.some(x => x.sessionId === 'B' && x.metadata?.taskStatus === 'failed'));
  console.log('FIXED_CONCURRENT_CANCEL_ID_AND_500_CLASSIFICATION', true);

  const hh = hooks(); let container;
  const Html = compile(read(htmlPath), { react: hh.react, antd: { Button: 'Button' }, '@ant-design/icons': {}, 'react/jsx-runtime': { jsx, jsxs: jsx } }, {
    window: { open: () => null }, Blob: class { constructor(parts) { container = parts.join(''); } }, URL: { createObjectURL: () => 'blob:https://app.invalid/FAKE', revokeObjectURL() {} }, setTimeout() {},
  }).HtmlPreviewBlock;
  const payload = '<!DOCTYPE html><html><body><script>globalThis.AUDIT_ESCAPE = true;</script><script>globalThis.AUDIT_TOP_LEVEL = true;</script></body></html>';
  const tree = hh.render(() => Html({ code: payload }));
  const openButton = findNode(tree, n => n.type === 'Button' && n.props.children === '新窗口');
  assert(openButton); openButton.props.onClick();
  const scripts = [...container.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(m => m[1]);
  assert(scripts.some(s => s === 'globalThis.AUDIT_TOP_LEVEL = true;'));
  const top = {}; vm.runInNewContext(scripts.find(s => s === 'globalThis.AUDIT_TOP_LEVEL = true;'), top);
  assert.equal(top.AUDIT_TOP_LEVEL, true);
  console.log('NEW_WINDOW_UNSANDBOXED_SCRIPT', scripts.find(s => s === 'globalThis.AUDIT_TOP_LEVEL = true;'));

  const fh = hooks(); const fetches = [];
  const FetchHtml = compile(read(htmlPath), { react: fh.react, antd: {}, '@ant-design/icons': {}, 'react/jsx-runtime': { jsx, jsxs: jsx } }, {
    window: {}, fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
      const entry = { aborted: false }; fetches.push(entry);
      signal.addEventListener('abort', () => { entry.aborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
    }),
  }).HtmlPreviewBlock;
  const renderHtml = () => fh.render(() => FetchHtml({ srcUrl: '/api/renders/demo.html' }));
  renderHtml(); fh.states[0] = 'code';
  for (let i = 0; i < 4; i++) { renderHtml(); renderHtml(); await tick(); }
  assert.equal(fetches.length, 4); assert(fetches.every(x => x.aborted));
  console.log('SOURCE_FETCH_SELF_ABORT_LOOP', JSON.stringify({ requests: fetches.length, aborted: fetches.filter(x => x.aborted).length }));

  const pending = makeChat(); let releaseToken;
  pending.setTokenProvider(() => new Promise(resolve => { releaseToken = resolve; }));
  chat = pending.render(); const pendingRun = chat.runAssistantRequest({ id: 'A' }, { message: 'pending' }, 'mA');
  chat = pending.render(); chat.handleStopStreaming('A'); assert.equal(pending.streams.length, 0);
  releaseToken('FAKE'); await tick(); assert.equal(pending.streams.length, 1); assert.equal(pending.streams[0].aborts, 0);
  console.log('STOP_DURING_TOKEN_WAIT_STILL_STARTS_STREAM', pending.streams.length);
  pending.streams[0].resolve(); await pendingRun;

  const bg = makeChat(); chat = bg.render();
  const bgRun = chat.runAssistantRequest({ id: 'A' }, { message: 'A' }, 'mA'); await tick();
  bg.streams[0].onEvent({ executionId: 'execution-A' }); chat = bg.render(); chat.handleRunInBackground('B'); await bgRun;
  assert.equal(bg.streams[0].aborts, 1); assert.equal(bg.background[0].sessionId, 'A');
  console.log('BACKGROUND_B_ACTUALLY_BACKGROUNDS_A', bg.background[0].sessionId);

  const selected = hooks();
  const getStatus = compile('export function getStatus(selectedSessionId, isSessionStreaming, isStreaming) {' + declaration(read(pagePath), 'isCurrentSessionStreaming') + '\n return isCurrentSessionStreaming; }', {}, { useMemo: selected.react.useMemo }).getStatus;
  let actualB = false; const stableStatus = () => actualB;
  assert.equal(selected.render(() => getStatus('B', stableStatus, true)), false);
  actualB = true;
  assert.equal(selected.render(() => getStatus('B', stableStatus, true)), false);
  console.log('SESSION_B_STATUS_AFTER_START_WHILE_A_ACTIVE', JSON.stringify({ actual: actualB, displayed: selected.render(() => getStatus('B', stableStatus, true)) }));

  const callbackHooks = hooks(); const backgroundCalls = []; const stableBg = id => backgroundCalls.push(id); const toast = { info() {} };
  const getCallback = compile('export function getCallback(selectedSessionId, handleRunInBackground, toast) { const chatMode = "task"; const setIsChatBackgroundUnlocked = () => {}; ' + declaration(read(pagePath), 'handleRunInBackgroundModeAware') + '\n return handleRunInBackgroundModeAware; }', {}, { useCallback: callbackHooks.react.useCallback }).getCallback;
  callbackHooks.render(() => getCallback('A', stableBg, toast));
  callbackHooks.render(() => getCallback('B', stableBg, toast))();
  assert.deepEqual(backgroundCalls, ['A']);
  console.log('BACKGROUND_CALLBACK_AFTER_SWITCH_TO_B_TARGETS', backgroundCalls[0]);
  console.log('All evidence assertions passed; hook dependency/cleanup model, no real network/browser.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
