import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface CaseAssertionRecord {
  assertion: string;
  passed: boolean;
  actual?: any;
  message?: string;
}

export interface CaseEvidenceRecord {
  caseId: string;
  variant: string;
  status: 'passed' | 'failed' | 'inconclusive' | 'blocked';
  traceIds: string[];
  executionIds: string[];
  requestDigest: string | null;
  fixtureDigest: string | null;
  catalogSnapshotDigest: string | null;
  routingPolicyVersion: string | null;
  routingPolicyDigest: string | null;
  selectedCapabilityRefs: string[];
  planHash: string | null;
  inputHash: string | null;
  actualInvocations: string[];
  usageByPurpose: Record<string, { promptTokens?: number; completionTokens?: number; totalTokens?: number }>;
  logicalEffectCount: number | null;
  artifactRefs: string[];
  assertions: CaseAssertionRecord[];
  failureCategory: string | null;
  notes?: string;
}

const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  'docs/artifacts/reviews/work-mode-routing-2026-10-15/evidence'
);

export function calculateDigest(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function saveEvidence(record: CaseEvidenceRecord): void {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const targetPath = path.join(EVIDENCE_DIR, `${record.caseId}.json`);
  fs.writeFileSync(targetPath, JSON.stringify(record, null, 2), 'utf-8');
}
