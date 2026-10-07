// Reuse the prior evidence harness utilities, without running its historical assertions.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const utilities = { exports: {} };
const prior = fs.readFileSync(path.join(__dirname, 'frontend-reaudit-repro-2026-10-06.cjs'), 'utf8');
vm.runInNewContext(prior.slice(0, prior.indexOf('async function main()')) + '\nmodule.exports = { compile, hooks, tick, read, makeChat, declaration, jsx, findNode, ts, htmlPath, pagePath };', {
  require, module: utilities, __dirname, AbortController, console, Error, Date, Map, Set, setImmediate,
});
const { compile, hooks, tick, read, makeChat, declaration, jsx, findNode, ts, htmlPath, pagePath } = utilities.exports;
function methodBody(source, name) {
  const ast = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  let body;
  function visit(n) { if (ts.isMethodDeclaration(n) && n.name.getText(ast) === name) body = n.body.getText(ast); ts.forEachChild(n, visit); }
  visit(ast); assert(body, 'Method missing: ' + name); return body;
}
async function main() {
  const hh = hooks(); let container; const opens = [];
  const Html = compile(read(htmlPath), { react: hh.react, antd: { Button: 'Button' }, '@ant-design/icons': {}, 'react/jsx-runtime': { jsx, jsxs: jsx } }, {
    window: { location: { origin: 'https://app.invalid' }, open: (...args) => { opens.push(args); return null; } },
    Blob: class { constructor(parts) { container = parts.join(''); } },
    URL: { createObjectURL: () => 'blob:https://app.invalid/FAKE', revokeObjectURL() {} }, setTimeout() {},
  }).HtmlPreviewBlock;
  const payload = '<!DOCTYPE html><html><body><script>globalThis.INNER_ONLY=true;</script><script>globalThis.ESCAPE=true;</script></body></html>';
  const inline = hh.render(() => Html({ code: payload }));
  findNode(inline, n => n.type === 'Button' && n.props.children === '新窗口').props.onClick();
  const scripts = [...container.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(m => m[1]);
  assert.equal(scripts.length, 1);
  const frame = {}; const top = { document: { getElementById: () => frame } };
  vm.runInNewContext(scripts[0], top); assert.equal(frame.srcdoc, payload); assert(!top.ESCAPE);
  console.log('FIXED_INLINE_SCRIPT_BREAKOUT_AND_PAYLOAD_ROUNDTRIP', true);
  const remote = hh.render(() => Html({ srcUrl: '/api/renders/FAKE_UNTRUSTED.html' }));
  findNode(remote, n => n.type === 'Button' && n.props.children === '新窗口').props.onClick();
  assert.equal(opens[1][0], '/api/renders/FAKE_UNTRUSTED.html');
  console.log('URL_ARTIFACT_OPENS_WITHOUT_SANDBOX_WRAPPER', opens[1][0]);

  const stopped = makeChat(); let release;
  stopped.setTokenProvider(() => new Promise(resolve => { release = resolve; }));
  let chat = stopped.render(); const stoppedRun = chat.runAssistantRequest({ id: 'A' }, { message: 'stop pending' }, 'mA');
  chat = stopped.render(); chat.handleStopStreaming('A'); release('FAKE'); await stoppedRun;
  assert.equal(stopped.streams.length, 0);
  console.log('FIXED_STOP_DURING_TOKEN_WAIT_NO_REQUEST', true);

  const bgPending = makeChat(); let releaseBg;
  bgPending.setTokenProvider(() => new Promise(resolve => { releaseBg = resolve; }));
  chat = bgPending.render(); const bgPendingRun = chat.runAssistantRequest({ id: 'A' }, { message: 'pending background' }, 'mA');
  chat = bgPending.render(); chat.handleRunInBackground('A'); releaseBg('FAKE'); await bgPendingRun;
  assert.equal(bgPending.streams.length, 0); assert.equal(bgPending.background.length, 1);
  assert(bgPending.patches.some(p => p.metadata?.taskStatus === 'running'));
  console.log('BACKGROUND_BEFORE_TOKEN', JSON.stringify({ requests: bgPending.streams.length, backgroundTasks: bgPending.background.length, shownRunning: true }));

  const wrongId = makeChat(); chat = wrongId.render();
  const a = chat.runAssistantRequest({ id: 'A' }, { message: 'A' }, 'mA'); await tick();
  const b = chat.runAssistantRequest({ id: 'B' }, { message: 'B' }, 'mB'); await tick();
  wrongId.streams[0].onEvent({ executionId: 'execution-A' });
  chat = wrongId.render(); chat.handleRunInBackground('B'); await b;
  assert.equal(wrongId.background[0].sessionId, 'B'); assert.equal(wrongId.background[0].executionId, 'execution-A');
  console.log('BACKGROUND_B_ASSOCIATED_WITH_A_EXECUTION', JSON.stringify({ sessionId: wrongId.background[0].sessionId, executionId: wrongId.background[0].executionId }));
  wrongId.streams[0].resolve(); await a;

  const statuses = makeChat(); chat = statuses.render();
  const sa = chat.runAssistantRequest({ id: 'A' }, { message: 'A' }, 'mA'); await tick(); chat = statuses.render();
  const readPage = compile('export function readPage(selectedSessionId, isSessionStreaming) {' + declaration(read(pagePath), 'isCurrentSessionStreaming') + '; return isCurrentSessionStreaming; }').readPage;
  assert.equal(readPage('B', chat.isSessionStreaming), false);
  const sb = chat.runAssistantRequest({ id: 'B' }, { message: 'B' }, 'mB'); await tick(); chat = statuses.render();
  assert.equal(readPage('B', chat.isSessionStreaming), true);
  statuses.streams[1].resolve(); await sb; chat = statuses.render(); assert.equal(readPage('B', chat.isSessionStreaming), false); assert.equal(chat.isStreaming, true);
  statuses.streams[0].resolve(); await sa;
  console.log('FIXED_SESSION_STATUS_START_AND_FINISH_WITH_OTHER_ACTIVE', true);

  const fh = hooks(); const fetches = [];
  const FetchHtml = compile(read(htmlPath), { react: fh.react, antd: {}, '@ant-design/icons': {}, 'react/jsx-runtime': { jsx, jsxs: jsx } }, {
    window: {}, fetch: (url, { signal }) => new Promise((resolve, reject) => {
      const req = { url, resolve, aborted: false }; fetches.push(req);
      signal.addEventListener('abort', () => { req.aborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
    }),
  }).HtmlPreviewBlock;
  let srcUrl = '/api/renders/A.html'; const renderHtml = () => fh.render(() => FetchHtml({ srcUrl }));
  renderHtml(); fh.states[0] = 'code'; renderHtml(); renderHtml();
  assert.equal(fetches.length, 1); assert.equal(fetches[0].aborted, false);
  console.log('FIXED_FETCH_LOADING_NO_SELF_ABORT', true);
  fetches[0].resolve({ ok: false, status: 404 }); await tick(); renderHtml();
  srcUrl = '/api/renders/B.html'; renderHtml(); renderHtml(); await tick(); renderHtml();
  assert.equal(fetches.filter(r => r.url.endsWith('/B.html')).length, 0); assert.equal(fh.states[4], null);
  console.log('URL_CHANGE_AFTER_404', JSON.stringify({ newUrlRequests: 0, displayedError: fh.states[4] }));

  const dispatcherSource = read('apps/backend/intelligence/ai-orchestrator/src/modules/chat/user-sandbox-dispatcher.service.ts');
  const dispatcherAst = ts.createSourceFile('dispatcher.ts', dispatcherSource, ts.ScriptTarget.Latest, true);
  let registration;
  function findRegistration(n) {
    if (ts.isExpressionStatement(n) && n.getText(dispatcherAst).startsWith('this.activeUserExecutions.set(effectiveUserId,')) registration = n.getText(dispatcherAst);
    ts.forEachChild(n, findRegistration);
  }
  findRegistration(dispatcherAst); assert(registration);
  const register = compile('export function register(effectiveUserId, sessionId, body, turnStartTime, controller) {' + registration + '}').register;
  const kills = []; const controllers = [];
  const stop = compile('export async function stop(userId, sessionId, executionId) ' + methodBody(dispatcherSource, 'stopPersonalSandbox'), {}, {
    getInternalServiceHeaders: () => ({}), fetch: async url => { kills.push(url); return { ok: true }; },
  }).stop;
  const ctx = { activeUserExecutions: new Map(), sessionBrokerUrl: 'http://BROKER.invalid', logger: { log() {}, warn() {} } };
  function reg(session, time) { const controller = { abort: () => controllers.push(session) }; register.call(ctx, 'FAKE_USER', session, {}, time, controller); }
  reg('A', 1); reg('B', 2); const stopA = await stop.call(ctx, 'FAKE_USER', 'A'); assert.equal(stopA, false);
  await stop.call(ctx, 'FAKE_USER', 'B'); assert.equal(kills.length, 1);
  console.log('QUEUED_B_OVERWRITES_RUNNING_A', JSON.stringify({ stopRunningAAllowed: stopA, stopQueuedBCallsUserWideKill: kills.length === 1 }));
  await stop.call(ctx, 'FAKE_USER', 'A'); assert.equal(kills.length, 2);
  console.log('NO_ACTIVE_RECORD_STILL_CALLS_USER_WIDE_KILL', true);

  let finishKill;
  const slowStop = compile('export async function stop(userId, sessionId, executionId) ' + methodBody(dispatcherSource, 'stopPersonalSandbox'), {}, {
    getInternalServiceHeaders: () => ({}), fetch: () => new Promise(resolve => { finishKill = resolve; }),
  }).stop;
  reg('A', 3); const stopping = slowStop.call(ctx, 'FAKE_USER', 'A'); reg('B', 4); finishKill({ ok: true }); await stopping;
  assert.equal(ctx.activeUserExecutions.has('FAKE_USER'), false);
  console.log('OLD_STOP_FINALLY_DELETES_NEW_B_RECORD', true);

  const brokerController = read('apps/backend/execution-control/session-broker/src/modules/user-sandbox/user-sandbox.controller.ts');
  const runHarnessStream = compile('export async function runHarnessStream(dto, res) ' + methodBody(brokerController, 'runHarnessStream')).runHarnessStream;
  let closeCallback, finishQueued; const closeKills = [];
  const res = { writableEnded: false, setHeader() {}, write() {}, on(event, callback) { if (event === 'close') closeCallback = callback; }, removeListener() {}, end() { this.writableEnded = true; } };
  const brokerRun = runHarnessStream.call({ userSandboxService: { runHarness: () => new Promise(resolve => { finishQueued = resolve; }), stopSandboxExecution: async (...args) => closeKills.push(args) } }, { userId: 'FAKE_USER', sessionId: 'B', prompt: 'queued B' }, res);
  closeCallback(); await tick(); assert.equal(closeKills.length, 1); assert.equal(closeKills[0][0], 'FAKE_USER'); assert.equal(closeKills[0].length, 1);
  finishQueued({ success: true, output: 'FAKE' }); await brokerRun;
  console.log('QUEUED_B_DISCONNECT_CALLS_USER_WIDE_STOP', JSON.stringify(closeKills));
  console.log('All assertions passed; mock API/processes and hook lifecycle model, no real network/browser/kill.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
