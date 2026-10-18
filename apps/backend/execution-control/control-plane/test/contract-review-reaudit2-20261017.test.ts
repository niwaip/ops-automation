import axios from 'axios';
import { Logger } from '@nestjs/common';
import { executeContractReviewOrchestration } from '../src/modules/execution/adapters/contract/contract-review-orchestrator';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('axios');
const post = axios.post as jest.Mock;
const logger = new Logger('ContractHarnessAudit');
const request: any = {
  requestId: 'crw-audit', executionId: 'crw-audit-execution', stepId: 'crw-audit-step',
  skillId: 'platform.document.contract-reviewer', input: { text: 'synthetic', modelId: 'qwen36-35b-a3b' },
  metadata: { definitionVersion: '1.0.2' },
};
const parsed = (count = 3) => ({
  fileName: 'synthetic.txt', contractType: 'procurement', myPosition: 'buyer',
  parsedClauses: Array.from({length: count}, (_, i) => ({
    clauseIndex: i, clauseNumber: `第${i + 1}条`, title: `条款${i}`,
    originalContent: `CRW_FAULT_${i} 双方依书面约定履行本条合同义务。`, matchedRules: [],
  })), missingClauses: [], warnings: [], isTruncated: false,
});
function setup(model: (body: any) => Promise<any>, count = 3) {
  post.mockImplementation(async (url: string, body: any) => {
    if (url.endsWith('/parse')) return { data: { output: parsed(count) } };
    if (url.endsWith('/ai/model/call')) return { data: { result: JSON.stringify(await model(body)) } };
    if (url.endsWith('/render-report')) return { data: { output: {
      summary: '审查完成', htmlReport: '<html>synthetic</html>',
      artifact: { name: 'synthetic.html' }, artifacts: [{ name: 'synthetic.html' }],
    } } };
    throw Error(`Unexpected test route ${url}`);
  });
}
async function invoke(): Promise<any> {
  const dir = path.resolve(process.cwd(), '../../../../docs/artifacts/reviews/contract-review-reaudit2-2026-10-17/fault-evidence');
  fs.mkdirSync(dir, {recursive: true});
  const caseId = expect.getState().currentTestName?.match(/[FRS]\d+/)?.[0] || 'unknown';
  try {
    const result = await executeContractReviewOrchestration(request, 'crw-audit-key', logger);
    fs.writeFileSync(path.join(dir, `${caseId}.json`), JSON.stringify({caseId, isolated: true, request, result}, null, 2));
    return result;
  } catch (error: any) {
    fs.writeFileSync(path.join(dir, `${caseId}.json`), JSON.stringify({caseId, isolated: true, error: error.message, stack: error.stack}, null, 2));
    throw error;
  }
}
function disclosed(result: any) {
  const o = result.output || {};
  return result.success === false ||
    ['incomplete', 'degraded', 'failed'].includes(o.reviewStatus) ||
    (Array.isArray(o.metrics?.warnings) && o.metrics.warnings.length > 0);
}

describe('Contract review harness: fault-injection audit (isolated mocked dependencies)', () => {
  beforeEach(() => { jest.resetAllMocks(); });

  it('F01 partial model response must not crash on an undefined clause', async () => {
    setup(async () => [{ clauseIndex: 0, riskLevel: 'PASS', riskSummary: '明确' }]);
    const result = await invoke();
    expect(result.output.clauses).toHaveLength(3);
    expect(result.output.clauses.every((c: any) => c && Number.isInteger(c.clauseIndex))).toBe(true);
    expect(disclosed(result)).toBe(true);
  });

  it('F02 duplicate IDs must not be accepted as complete semantic coverage', async () => {
    setup(async () => Array.from({length: 3}, () => ({ clauseIndex: 0, riskLevel: 'PASS', riskSummary: '重复结果' })));
    const result = await invoke();
    expect(disclosed(result) || result.output.metrics.llmReviewedCount < 3).toBe(true);
  });

  it('F03 foreign IDs must not be reassigned to source clauses by array position', async () => {
    setup(async () => [90, 91, 92].map(clauseIndex => ({ clauseIndex, riskLevel: 'HIGH', riskSummary: '其他条款的结果' })));
    const result = await invoke();
    expect(disclosed(result) || result.output.metrics.llmReviewedCount === 0).toBe(true);
  });

  it('F04 fabricated evidence must not survive as anchored source evidence', async () => {
    setup(async () => [0, 1, 2].map(clauseIndex => ({ clauseIndex, riskLevel: 'HIGH', findings: [{
      ruleId: 'GENERAL-RISK', verdict: 'MATCHED', severity: 'HIGH',
      evidenceQuote: '合同原文中完全不存在的虚构证据句子', reason: 'synthetic finding',
    }] })));
    const result = await invoke();
    const findings = result.output.clauses.flatMap((c: any) => (c.findings || []).map((f: any) => ({c, f})));
    expect(findings.every(({c, f}: any) => !f.evidenceQuote || c.originalContent.includes(f.evidenceQuote) || f.evidenceStatus === 'unverified')).toBe(true);
  });

  it('F05 model timeout must disclose incomplete/degraded review', async () => {
    setup(async () => { throw Error('ETIMEDOUT synthetic isolated model timeout'); });
    const result = await invoke();
    expect(result.output.metrics.llmReviewedCount).toBe(0);
    expect(disclosed(result)).toBe(true);
  });

  it('F06 empty JSON array must disclose incomplete/degraded review', async () => {
    setup(async () => []);
    const result = await invoke();
    expect(disclosed(result)).toBe(true);
  });

  it('F07 render failure must not return success', async () => {
    setup(async () => [0, 1, 2].map(clauseIndex => ({clauseIndex, riskLevel: 'PASS'})));
    const original = post.getMockImplementation()!;
    post.mockImplementation(async (url: string, body: any) => {
      if (url.endsWith('/render-report')) throw Error('synthetic renderer unavailable');
      return original(url, body);
    });
    await expect(invoke()).rejects.toThrow();
  });

  it('F08 batch scheduling keeps concurrency <=3, correct model and source order', async () => {
    let inFlight = 0, maximum = 0;
    setup(async body => {
      expect(body.modelId).toBe('qwen36-35b-a3b');
      inFlight++; maximum = Math.max(maximum, inFlight);
      await new Promise(resolve => setTimeout(resolve, 5));
      const indices = [...body.prompt.matchAll(/条款序号: (\d+)/g)].map(m => Number(m[1]));
      inFlight--; return indices.map(clauseIndex => ({clauseIndex, riskLevel: 'PASS'}));
    }, 10);
    const result = await invoke();
    expect(maximum).toBeLessThanOrEqual(3);
    expect(result.output.clauses.map((c: any) => c.clauseIndex)).toEqual([0,1,2,3,4,5,6,7,8,9]);
    expect(result.output.metrics.llmReviewedCount).toBe(10);
  });
});


describe('Additional re-audit contract invariants', () => {
  beforeEach(() => jest.resetAllMocks());
  it('R01 health score must remain in [0,100] for many high-risk clauses', async () => {
    setup(async body => [...body.prompt.matchAll(/条款序号: (\d+)/g)].map(m => ({clauseIndex: Number(m[1]),riskLevel:'HIGH',riskSummary:'synthetic risk'})), 10);
    const result = await invoke();
    expect(result.output.metrics.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.output.metrics.healthScore).toBeLessThanOrEqual(100);
  });
  it('R02 duplicate IDs alongside full coverage must be detected', async () => {
    setup(async () => [0,0,1,2].map(clauseIndex => ({clauseIndex,riskLevel:'PASS'})));
    const result = await invoke();
    expect(disclosed(result) || result.output.metrics.llmReviewedCount < 3).toBe(true);
  });
  it('R03 foreign extra IDs alongside full coverage must be detected', async () => {
    setup(async () => [0,1,2,99].map(clauseIndex => ({clauseIndex,riskLevel:'PASS'})));
    const result = await invoke();
    expect(disclosed(result) || result.output.metrics.llmReviewedCount < 3).toBe(true);
  });
  it('R04 missing semantic fields must not silently default to PASS', async () => {
    setup(async () => [0,1,2].map(clauseIndex => ({clauseIndex})));
    const result = await invoke();
    expect(disclosed(result) || result.output.metrics.llmReviewedCount < 3).toBe(true);
  });
});


describe('Semantic validity alternatives re-audit', () => {
  beforeEach(() => jest.resetAllMocks());
  it('S01 riskSummary alone cannot be converted to a PASS decision', async () => {
    setup(async () => [0,1,2].map(clauseIndex => ({clauseIndex,riskSummary:'本条存在严重风险，需要复核'})));
    const result=await invoke();
    expect(result.output.metrics.isDegraded || result.output.metrics.llmReviewedCount < 3).toBe(true);
  });
  it('S02 invalid riskLevel plus a summary cannot count as reviewed', async () => {
    setup(async () => [0,1,2].map(clauseIndex => ({clauseIndex,riskLevel:'INVALID',riskSummary:'异常结果'})));
    const result=await invoke();
    expect(result.output.metrics.isDegraded || result.output.metrics.llmReviewedCount < 3).toBe(true);
  });
  it('S03 empty finding objects cannot constitute a semantic review', async () => {
    setup(async () => [0,1,2].map(clauseIndex => ({clauseIndex,findings:[{}]})));
    const result=await invoke();
    expect(result.output.metrics.isDegraded || result.output.metrics.llmReviewedCount < 3).toBe(true);
  });
});
