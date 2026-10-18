#!/usr/bin/env node
/**
 * Run Commercial Office Benchmark (CP-01 to CP-06) with 35B model (qwen36-35b-a3b)
 */
import fs from 'node:fs';
import path from 'node:path';
import { login, uploadFile, runChatCase } from './run_benchmark_35b.mjs';

const CASES_PATH = path.resolve('docs/artifacts/reviews/office-copilot-benchmark-files/test-cases.json');
const FILES_DIR = path.resolve('docs/artifacts/reviews/office-copilot-benchmark-files');
const REVIEWS_DIR = path.resolve('docs/artifacts/reviews');
const USER_WORKSPACE = '/Users/chain/Documents/MyProject/ops-automation/data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace';

async function main() {
  const targetCaseId = process.argv[2] || 'all';
  console.log(`[🚀] Starting 35B benchmark suite for target: ${targetCaseId}`);

  const rawCases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf-8'));
  const cases = rawCases.cases.filter(c => targetCaseId === 'all' || c.id === targetCaseId);

  if (cases.length === 0) {
    console.error(`[-] No cases matched: ${targetCaseId}`);
    process.exit(1);
  }

  const token = await login();
  console.log(`[+] Logged in as admin.`);

  const results = [];
  let prevSessionId = null;

  for (const c of cases) {
    console.log(`\n======================================================`);
    console.log(`[▶] Running Case ${c.id}: ${c.prompt.slice(0, 50)}...`);

    // Upload files if needed
    const uploadedFiles = [];
    for (const inp of c.inputs) {
      const filePath = path.join(FILES_DIR, inp);
      if (fs.existsSync(filePath)) {
        console.log(`  [Upload] Uploading ${inp}...`);
        const upRes = await uploadFile(token, filePath);
        uploadedFiles.push(upRes);
        console.log(`  [Upload] Uploaded ${inp} -> fileId: ${upRes.fileId}`);
      } else {
        console.warn(`  [Upload] File not found: ${filePath}`);
      }
    }

    // Handle multi-turn session if CP-06
    let sid = null;
    if (c.id === 'CP-06' && prevSessionId) {
      sid = prevSessionId;
      console.log(`  [Multi-turn] Inheriting session from CP-05/CP-04: ${sid}`);
    }

    // Record snapshot of workspace before run
    const filesBefore = fs.existsSync(USER_WORKSPACE) ? new Set(fs.readdirSync(USER_WORKSPACE)) : new Set();

    let caseRes;
    try {
      caseRes = await runChatCase({
        token,
        prompt: c.prompt,
        files: uploadedFiles,
        sessionId: sid,
        timeoutMs: 300000,
      });
    } catch (err) {
      console.error(`[-] Case ${c.id} execution failed:`, err);
      caseRes = {
        sessionId: sid || 'error',
        durationMs: 0,
        exitCode: 1,
        done: false,
        usage: {},
        tools: [],
        text: `Error: ${err.message}`,
        events: []
      };
    }

    if (c.id === 'CP-04') {
      prevSessionId = caseRes.sessionId;
    }

    // Inspect files added in workspace
    const filesAfter = fs.existsSync(USER_WORKSPACE) ? fs.readdirSync(USER_WORKSPACE) : [];
    const newFiles = filesAfter.filter(f => !filesBefore.has(f));
    console.log(`  [Workspace] New files created: ${newFiles.join(', ') || 'none'}`);

    // Save stream log
    const streamLogPath = path.join(REVIEWS_DIR, `35b-copilot-${c.id.toLowerCase()}-stream.txt`);
    const streamContent = caseRes.events.map(ev => `data: ${JSON.stringify(ev)}\n\n`).join('');
    fs.writeFileSync(streamLogPath, streamContent, 'utf-8');
    console.log(`  [Log] Saved stream to ${streamLogPath}`);

    // Summary item
    const summaryItem = {
      case: `35b-${c.id}`,
      sessionId: caseRes.sessionId,
      durationMs: caseRes.durationMs,
      exitCode: caseRes.exitCode,
      tokens: caseRes.usage?.total_tokens || 0,
      finishReason: caseRes.events.find(e => e.type === 'result')?.data?.sandbox?.metrics?.finishReason || 'unknown',
      tools: caseRes.tools || [],
      newFiles,
      done: caseRes.done,
    };
    results.push(summaryItem);
  }

  const metricsPath = path.join(REVIEWS_DIR, '35b-copilot-metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n[✓] All finished. Metrics saved to ${metricsPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
