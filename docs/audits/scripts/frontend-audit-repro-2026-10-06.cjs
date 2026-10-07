const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const root = require('path').resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const read = p => fs.readFileSync(root + '/' + p, 'utf8');
function compile(source, mocks, globals = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports: mod.exports, module: mod, require: id => {
    if (!(id in mocks)) throw new Error('Unexpected dependency: ' + id);
    return mocks[id];
  }, console: { error() {}, warn() {} }, Error, Date, Map, Set, ...globals });
  return mod.exports;
}
function hooks() {
  const states = [], refs = [], effects = [];
  const effectDeps = [];
  let si = 0, ri = 0, ei = 0;
  const react = {
    useState(initial) { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { const i = ri++; return refs[i] ||= { current: initial }; },
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useEffect(fn, deps) { const i = ei++; const old = effectDeps[i]; if (!old || deps.some((d, n) => !Object.is(d, old[n]))) { effectDeps[i] = deps; effects.push(fn); } },
    memo: fn => fn,
  };
  return { react, states, render(fn) { si = 0; ri = 0; ei = 0; effects.length = 0; const result = fn(); effects.forEach(fn => fn()); return result; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function main() {
  const messageSource = read('apps/frontend/shared/chat-web/components/MessageContentRenderer.tsx');
  const sourceFile = ts.createSourceFile('message.tsx', messageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const selected = sourceFile.statements.filter(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ['safeUrlTransform', 'extractLocalAuthToken', 'appendAuthToken'].includes(d.name.getText(sourceFile))));
  const functions = selected.map(n => n.getText(sourceFile)).join('\n') + '\nexport { safeUrlTransform, appendAuthToken };';
  const { safeUrlTransform, appendAuthToken } = compile(functions, {}, { window: {}, localStorage: { getItem: key => key === 'ops-user-auth' ? JSON.stringify({ accessToken: 'AUDIT_FAKE_TOKEN' }) : null }, URL });
  const external = appendAuthToken(safeUrlTransform('https://collector.invalid/api/ai/chat/workspace-files/demo.png'));
  assert.equal(new URL(external).searchParams.get('token'), 'AUDIT_FAKE_TOKEN');
  console.log('TOKEN_EXTERNAL_ORIGIN', external);

  const h = hooks();
  const cancellations = [], patches = [], streamRecords = [];
  const api = {
    apiClient: { ensureFreshAccessToken: async () => 'FAKE', post: async (url, payload) => { cancellations.push({ url, ...payload }); } },
    executionApi: { cancel: async executionId => { cancellations.push({ executionId }); } },
    chatApi: { stream(_transport, _token, request, onEvent) {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      const rec = { request, onEvent, resolve, reject, aborts: 0, promise, abort() { rec.aborts++; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); } };
      streamRecords.push(rec); return rec;
    } },
  };
  const useChat = compile(read('apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts'), {
    react: h.react,
    'react-query': { useQueryClient: () => ({ invalidateQueries: async () => {} }) },
    '@ops/user-core': { reduceChatStreamEvent: ({ event }) => ({ accumulatedContent: '', messagePatch: { metadata: event } }) },
    '../../../api': api,
    '../../../adapters/auth/authStore': { authStore: { getState: () => ({ accessToken: 'FAKE' }) } },
    '../../../adapters/streaming/browserStreamingTransport': { browserStreamingTransport: {} },
    '../lib/messageState': { buildPatchedMessage: (m, p) => ({ ...m, ...p }) },
    '../lib/taskNotifications': { notifyTaskTerminalState() {} },
    '../lib/backgroundTaskManager': { backgroundTaskManager: { setQueryInvalidator() {}, registerTask() {} } },
    '../lib/workflowNaturalLanguageRouter': { handleWorkflowNaturalLanguage: async () => null },
  }).useChatStreaming;
  const opts = { toast: { info() {}, success() {}, warning() {} }, notifiedTaskStateKeysRef: { current: new Set() }, sessionMessagesRef: { current: { A: [{ id: 'mA', content: '' }], B: [{ id: 'mB', content: '' }] } }, appendProgressLog() {}, snapshotMessageThoughts() {}, updateMessage: (sessionId, messageId, patch) => patches.push({ sessionId, messageId, ...patch }), updateSessionMeta() {} };
  const render = () => h.render(() => useChat(opts));
  let chat = render();
  const runA = chat.runAssistantRequest({ id: 'A' }, { message: 'A' }, 'mA');
  await tick();
  streamRecords[0].onEvent({ executionId: 'execution-A' });
  chat = render();
  chat.handleStopStreaming('B');
  await runA;
  assert(cancellations.some(x => x.executionId === 'execution-A'));
  assert.equal(streamRecords[0].aborts, 1);
  console.log('STOP_B_CANCELLED_A', JSON.stringify(cancellations));

  cancellations.length = 0; patches.length = 0;
  chat = render();
  const runA2 = chat.runAssistantRequest({ id: 'A' }, { message: 'A2' }, 'mA');
  await tick();
  const runB = chat.runAssistantRequest({ id: 'B' }, { message: 'B' }, 'mB');
  await tick();
  streamRecords[1].onEvent({ executionId: 'execution-A2' });
  streamRecords[2].onEvent({ executionId: 'execution-B' });
  chat = render();
  chat.handleStopStreaming('A');
  await runA2;
  streamRecords[2].reject(new Error('HTTP 500'));
  await runB;
  const aStop = patches.find(x => x.sessionId === 'A' && x.metadata?.executionStatus === 'cancelled');
  const bStop = patches.find(x => x.sessionId === 'B' && x.metadata?.executionStatus === 'cancelled');
  assert.equal(aStop.metadata.executionId, 'execution-B');
  assert(bStop);
  console.log('CONCURRENT_A_STOP_USES_B_ID', aStop.metadata.executionId);
  console.log('CONCURRENT_B_500_MARKED_CANCELLED', bStop.metadata.executionStatus);

  const hh = hooks(); let requests = 0;
  const jsx = (_type, props) => ({ props });
  const html = compile(read('apps/frontend/shared/chat-web/components/HtmlPreviewBlock.tsx'), {
    react: hh.react, antd: {}, '@ant-design/icons': {}, 'react/jsx-runtime': { jsx, jsxs: jsx },
  }, { window: {}, fetch: async () => { requests++; return { ok: false, status: 404 }; } }).HtmlPreviewBlock;
  const renderHtml = () => hh.render(() => html({ srcUrl: '/api/renders/missing.html' }));
  renderHtml(); hh.states[0] = 'code';
  for (let i = 0; i < 5; i++) { renderHtml(); renderHtml(); await tick(); }
  assert.equal(requests, 5);
  console.log('SOURCE_404_REQUESTS_AFTER_5_LOAD_CYCLES', requests);
  console.log('All assertions passed; source transpiled live, network and credentials mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
