import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface NdaCaseAssertionRecord {
  assertion: string;
  passed: boolean;
  actual?: any;
  expected?: any;
  message?: string;
}

export interface NdaPerformanceRecord {
  ttftMs?: number;
  planningDurationMs?: number;
  executionDurationMs?: number;
  totalDurationMs: number;
  tokens?: {
    promptTokens?: number;
    completionTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
  };
}

export interface NdaCaseEvidenceRecord {
  caseId: string;
  variant: string;
  status: 'passed' | 'failed' | 'inconclusive';
  traceIds: string[];
  executionIds: string[];
  requestDigest: string | null;
  selectedCapabilityRefs: string[];
  actualInvocations: string[];
  resolvedParameters: Record<string, any>;
  performance: NdaPerformanceRecord;
  assertions: NdaCaseAssertionRecord[];
  failureCategory: string | null;
  notes?: string;
}

const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  'docs/artifacts/reviews/nda-generation-2026-10-15/evidence'
);

export function calculateDigest(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function saveNdaEvidence(record: NdaCaseEvidenceRecord): void {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const targetPath = path.join(EVIDENCE_DIR, `${record.caseId}.json`);
  fs.writeFileSync(targetPath, JSON.stringify(record, null, 2), 'utf-8');
}
