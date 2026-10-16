#!/usr/bin/env node
/**
 * E2E Benchmark Runner with 35B Model (qwen36-35b-a3b)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PLATFORM_URL = process.env.PLATFORM_URL || 'http://127.0.0.1:3001';
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:3007';
const MODEL_ID_35B = 'd13e0d30-87b9-4e87-b96a-d8b1b3cf78af'; // qwen36-35b-a3b

export async function login(username = 'admin', password = 'admin123') {
  const res = await fetch(`${PLATFORM_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.accessToken;
}

export async function uploadFile(token, filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const filename = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer]);
  const formData = new FormData();
  formData.append('file', blob, filename);

  const res = await fetch(`${ORCHESTRATOR_URL}/ai/chat/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function runChatCase({
  token,
  prompt,
  files = [],
  sessionId = null,
  timeoutMs = 300000,
}) {
  const sid = sessionId || crypto.randomUUID();
  const payload = {
    message: prompt,
    sessionId: sid,
    modelId: MODEL_ID_35B,
    conversationType: 'general',
  };
  if (files && files.length > 0) {
    payload.files = files;
  }

  const startTime = Date.now();
  const events = [];
  let fullText = '';
  let exitCode = 0;
  let toolsCalled = [];
  let doneReceived = false;
  let usage = {};

  console.log(`\n======================================================`);
  console.log(`[>>>] Starting session: ${sid}`);
  console.log(`[>>>] Prompt: ${prompt.slice(0, 80)}...`);
  if (files && files.length > 0) {
    console.log(`[>>>] Files: ${files.map(f => f.fileName).join(', ')}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const res = await fetch(`${ORCHESTRATOR_URL}/ai/chat/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat request failed (${res.status}): ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep remainder

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const dataStr = line.slice(5).trim();
      if (!dataStr) continue;

      try {
        const ev = JSON.parse(dataStr);
        events.push(ev);
        const evType = ev.type;
        if (evType === 'observation') {
          const content = String(ev.content || '').slice(0, 90).replace(/\n/g, ' ');
          console.log(`  [OBS] ${content}`);
        } else if (evType === 'thought') {
          const content = String(ev.content || '').slice(0, 80).replace(/\n/g, ' ');
          console.log(`  [THOUGHT] ${content}`);
        } else if (evType === 'result') {
          fullText = ev.content || '';
          usage = ev.data?.usage || {};
          const sb = ev.data?.sandbox || {};
          exitCode = sb.exitCode ?? 0;
          toolsCalled = sb.metrics?.toolCalls || [];
          console.log(`  [RESULT] tokens=${JSON.stringify(usage)}, exitCode=${exitCode}, tools=${toolsCalled.length}`);
        } else if (evType === 'done') {
          doneReceived = true;
          console.log(`  [DONE] Stream completed.`);
        }
      } catch (err) {
        // ignore parse error
      }
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`[<<<] Session ${sid} completed in ${durationMs}ms`);

  return {
    sessionId: sid,
    durationMs,
    exitCode,
    done: doneReceived,
    usage,
    tools: toolsCalled,
    text: fullText,
    events,
  };
}

if (process.argv[1] && process.argv[1].endsWith('run_benchmark_35b.mjs')) {
  try {
    const token = await login();
    console.log(`Login succeeded. Token: ${token.slice(0, 15)}...`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
