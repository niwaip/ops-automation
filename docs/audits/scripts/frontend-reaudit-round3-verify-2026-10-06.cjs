// Round 3 Verification Script: Verifies all 5 fixes for issues T1 - T5.
// Uses current sources and mock harness, without real network, browser, or kill.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const utilities = { exports: {} };
const prior = fs.readFileSync(path.join(__dirname, 'frontend-reaudit-repro-2026-10-06.cjs'), 'utf8');
vm.runInNewContext(
  prior.slice(0, prior.indexOf('async function main()')) +
    '\nmodule.exports = { compile, hooks, tick, read, makeChat, declaration, jsx, findNode, ts, htmlPath, pagePath };',
  {
    require,
    module: utilities,
    __dirname,
    AbortController,
    console,
    Error,
    Date,
    Map,
    Set,
    setImmediate,
  }
);
const { compile, hooks, tick, read, makeChat, declaration, jsx, findNode, ts, htmlPath, pagePath } = utilities.exports;

function methodBody(source, name) {
  const ast = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  let body;
  function visit(n) {
    if (ts.isMethodDeclaration(n) && n.name.getText(ast) === name) body = n.body.getText(ast);
    ts.forEachChild(n, visit);
  }
  visit(ast);
  assert(body, 'Method missing: ' + name);
  return body;
}

async function main() {
  console.log('=== Starting Round 3 Verification (T1 - T5) ===\n');

  // -------------------------------------------------------------
  // T1 [P1]: URL HTML artifact opened in new window wrapped in sandbox Blob
  // -------------------------------------------------------------
  const hh = hooks();
  let container;
  const opens = [];
  const Html = compile(read(htmlPath), {
    react: hh.react,
    antd: { Button: 'Button' },
    '@ant-design/icons': {},
    'react/jsx-runtime': { jsx, jsxs: jsx },
  }, {
    window: {
      location: { origin: 'https://app.invalid' },
      open: (...args) => {
        opens.push(args);
        return null;
      },
    },
    Blob: class {
      constructor(parts) {
        container = parts.join('');
      }
    },
    URL: {
      createObjectURL: () => 'blob:https://app.invalid/FAKE_CONTAINER_BLOB',
      revokeObjectURL() {},
    },
    setTimeout() {},
  }).HtmlPreviewBlock;

  const remote = hh.render(() => Html({ srcUrl: '/api/renders/FAKE_UNTRUSTED.html' }));
  findNode(remote, (n) => n.type === 'Button' && n.props.children === '新窗口').props.onClick();

  // Verification assertions:
  // 1. Opens the sandboxed Blob URL, NOT raw /api/renders/FAKE_UNTRUSTED.html directly
  assert.equal(opens[0][0], 'blob:https://app.invalid/FAKE_CONTAINER_BLOB');
  // 2. Container includes iframe with strict sandbox without allow-same-origin
  assert.match(container, /sandbox="allow-scripts allow-forms allow-popups allow-modals"/);
  assert(!container.includes('allow-same-origin'));
  // 3. Frame src points to the normalized artifact URL
  assert(container.includes('frame.src = "/api/renders/FAKE_UNTRUSTED.html";'));
  console.log('✓ T1 [P1] PASS: URL artifact opened in new window is safely wrapped in isolated sandbox Blob.');

  // -------------------------------------------------------------
  // T4 [P2]: Backgrounding while awaiting access token does not create phantom background task
  // -------------------------------------------------------------
  const bgPending = makeChat();
  let releaseBg;
  bgPending.setTokenProvider(() => new Promise((resolve) => { releaseBg = resolve; }));
  let chat = bgPending.render();
  const bgPendingRun = chat.runAssistantRequest({ id: 'A' }, { message: 'pending background' }, 'mA');
  chat = bgPending.render();
  chat.handleRunInBackground('A');
  releaseBg('FAKE');
  await tick();
  assert.equal(bgPending.background.length, 0, 'No phantom background task created while awaiting token');
  assert.equal(bgPending.streams.length, 1, 'Stream request proceeded once token became available');
  bgPending.streams[0].resolve();
  await bgPendingRun;
  console.log('✓ T4 [P2] PASS: Backgrounding before token release prevents phantom tasks and allows stream to start cleanly.');

  // -------------------------------------------------------------
  // T3 [P2]: Backgrounding session B does not borrow session A's executionId
  // -------------------------------------------------------------
  const wrongId = makeChat();
  chat = wrongId.render();
  const a = chat.runAssistantRequest({ id: 'A' }, { message: 'A' }, 'mA');
  await tick();
  const b = chat.runAssistantRequest({ id: 'B' }, { message: 'B' }, 'mB');
  await tick();
  wrongId.streams[0].onEvent({ executionId: 'execution-A' });
  chat = wrongId.render();
  chat.handleRunInBackground('B');
  await b;

  // Verification assertions:
  // Session B background registration uses targetRecord.executionId (null/chat-B), NOT falling back to session A's execution-A
  assert.equal(wrongId.background[0].sessionId, 'B');
  assert.notEqual(wrongId.background[0].executionId, 'execution-A');
  assert(wrongId.background[0].executionId.startsWith('chat-B-'));
  console.log('✓ T3 [P2] PASS: Backgrounding session B strictly uses its own executionId without fallback cross-talk.');
  wrongId.streams[0].resolve();
  await a;

  // -------------------------------------------------------------
  // T5 [P2]: Switching URL after a 404 properly fetches new URL
  // -------------------------------------------------------------
  const fh = hooks();
  const fetches = [];
  const FetchHtml = compile(read(htmlPath), {
    react: fh.react,
    antd: {},
    '@ant-design/icons': {},
    'react/jsx-runtime': { jsx, jsxs: jsx },
  }, {
    window: {},
    fetch: (url, { signal }) => new Promise((resolve, reject) => {
      const req = { url, resolve, aborted: false };
      fetches.push(req);
      signal.addEventListener('abort', () => {
        req.aborted = true;
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    }),
  }).HtmlPreviewBlock;

  let srcUrl = '/api/renders/A.html';
  const renderHtml = () => fh.render(() => FetchHtml({ srcUrl }));
  renderHtml();
  fh.states[0] = 'code';
  renderHtml();
  renderHtml();
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].aborted, false);

  fetches[0].resolve({ ok: false, status: 404 });
  await tick();
  renderHtml();

  // Now switch srcUrl to B.html
  srcUrl = '/api/renders/B.html';
  renderHtml();
  renderHtml();
  await tick();
  renderHtml();

  // Verification assertions:
  // 1. Fetch was initiated for B.html
  const bFetches = fetches.filter((r) => r.url.endsWith('/B.html'));
  assert.equal(bFetches.length, 1, 'Fetching B.html was triggered on URL switch');
  // 2. Prior error from A.html is cleared for B.html
  assert.equal(fh.states[4], null, 'Previous 404 error is cleared for new URL');
  console.log('✓ T5 [P2] PASS: URL switch after 404 triggers fresh fetch and clears stale error.');

  // -------------------------------------------------------------
  // T2 [P1]: Multi-session sandbox dispatcher and Broker lock ownership
  // -------------------------------------------------------------
  const dispatcherSource = read('apps/backend/intelligence/ai-orchestrator/src/modules/chat/user-sandbox-dispatcher.service.ts');
  const dispatcherAst = ts.createSourceFile('dispatcher.ts', dispatcherSource, ts.ScriptTarget.Latest, true);

  // Check how registration sets map: key is ${effectiveUserId}:${sessionId}
  let registration;
  function findRegistration(n) {
    if (
      ts.isExpressionStatement(n) &&
      n.getText(dispatcherAst).startsWith('this.activeUserExecutions.set(execKey,')
    ) {
      registration = n.getText(dispatcherAst);
    }
    ts.forEachChild(n, findRegistration);
  }
  findRegistration(dispatcherAst);
  assert(registration, 'activeUserExecutions.set(execKey, ...) must be present in dispatcher');

  const register = compile(
    'export function register(effectiveUserId, sessionId, body, turnStartTime, controller) { const execKey = sessionId ? `${effectiveUserId}:${sessionId}` : effectiveUserId; ' +
      registration +
      '}'
  ).register;

  const kills = [];
  const controllers = [];
  const stop = compile(
    'export async function stop(userId, sessionId, executionId) ' +
      methodBody(dispatcherSource, 'stopPersonalSandbox'),
    {},
    {
      getInternalServiceHeaders: () => ({}),
      fetch: async (url, options) => {
        kills.push({ url, body: options?.body ? JSON.parse(options.body) : undefined });
        return { ok: true };
      },
    }
  ).stop;

  const ctx = {
    activeUserExecutions: new Map(),
    sessionBrokerUrl: 'http://BROKER.invalid',
    logger: { log() {}, warn() {} },
  };

  function reg(session, time) {
    const controller = { abort: () => controllers.push(session) };
    register.call(ctx, 'FAKE_USER', session, {}, time, controller);
  }

  // 1. Concurrent sessions A and B do not overwrite each other
  reg('A', 1);
  reg('B', 2);
  assert.equal(ctx.activeUserExecutions.has('FAKE_USER:A'), true);
  assert.equal(ctx.activeUserExecutions.has('FAKE_USER:B'), true);

  // 2. Stopping A succeeds and targets session A
  const stopA = await stop.call(ctx, 'FAKE_USER', 'A');
  assert.equal(stopA, true, 'Stopping session A succeeds');
  assert.equal(kills.length, 1);
  assert.equal(kills[0].body.sessionId, 'A');
  assert.equal(ctx.activeUserExecutions.has('FAKE_USER:A'), false);
  assert.equal(ctx.activeUserExecutions.has('FAKE_USER:B'), true, 'Session B record remains intact');

  // 3. Stopping non-existent session C fails-closed and does NOT trigger user-wide kill
  const stopC = await stop.call(ctx, 'FAKE_USER', 'C');
  assert.equal(stopC, false, 'Stopping non-existent session C returns false');
  assert.equal(kills.length, 1, 'No additional kill dispatched for non-existent session C');

  // 4. Slow stop cleanup only deletes the matching turn, not subsequent registrations
  let finishKill;
  const slowStop = compile(
    'export async function stop(userId, sessionId, executionId) ' +
      methodBody(dispatcherSource, 'stopPersonalSandbox'),
    {},
    {
      getInternalServiceHeaders: () => ({}),
      fetch: () => new Promise((resolve) => { finishKill = resolve; }),
    }
  ).stop;

  reg('A', 3);
  const stoppingA = slowStop.call(ctx, 'FAKE_USER', 'A');
  // Re-register A with timestamp 4 while stop is awaiting fetch
  reg('A', 4);
  finishKill({ ok: true });
  await stoppingA;
  // A's re-registration (timestamp 4) must NOT be deleted by older stop (timestamp 3)
  assert.equal(ctx.activeUserExecutions.has('FAKE_USER:A'), true);
  assert.equal(ctx.activeUserExecutions.get('FAKE_USER:A').startedAt, 4);

  // 5. Broker controller: queued request disconnect does NOT kill active running execution
  const brokerController = read(
    'apps/backend/execution-control/session-broker/src/modules/user-sandbox/user-sandbox.controller.ts'
  );
  const runHarnessStream = compile(
    'export async function runHarnessStream(dto, res) ' +
      methodBody(brokerController, 'runHarnessStream')
  ).runHarnessStream;

  let closeCallback;
  let finishQueued;
  const closeKills = [];
  const res = {
    writableEnded: false,
    setHeader() {},
    write() {},
    on(event, callback) {
      if (event === 'close') closeCallback = callback;
    },
    removeListener() {},
    end() {
      this.writableEnded = true;
    },
  };

  const brokerRun = runHarnessStream.call(
    {
      userSandboxService: {
        runHarness: (userId, prompt, options) =>
          new Promise((resolve) => {
            // Simulate waiting in queue (lock NOT yet acquired)
            finishQueued = resolve;
          }),
        stopSandboxExecution: async (...args) => closeKills.push(args),
      },
    },
    { userId: 'FAKE_USER', sessionId: 'B', prompt: 'queued B' },
    res
  );

  // Client disconnects while still queued (before lock acquisition)
  closeCallback();
  await tick();
  // Must NOT trigger stopSandboxExecution
  assert.equal(closeKills.length, 0, 'Queued request disconnect must not kill running sandbox process');

  finishQueued({ success: true, output: 'FAKE' });
  await brokerRun;
  console.log('✓ T2 [P1] PASS: Dispatcher per-session isolation & broker queued disconnect protection verified.');

  console.log('\n=== All 5 Round 3 verification checks passed successfully! ===');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
