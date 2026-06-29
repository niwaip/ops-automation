import * as fs from 'fs';

export function debugStudioRenderHypothesis(
  hypothesisId: string,
  msg: string,
  data: Record<string, unknown> = {}
): void {
  let url = 'http://127.0.0.1:7777/event';
  let sessionId = 'signing-date-render';

  try {
    const env = fs.readFileSync('.dbg/signing-date-render.env', 'utf8');
    url = env.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || url;
    sessionId = env.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || sessionId;
  } catch {}

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      runId: 'pre-fix',
      hypothesisId,
      location: 'studio-render.controller.ts',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
}
