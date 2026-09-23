import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

console.log('========================================================================');
console.log('  Outbound Side-Effect Safety & UNKNOWN Handler Quality Gate');
console.log('========================================================================');

const errors = [];

// 1. Verify backend-contracts/execution-core exports outbound effect constants and functions
const executionCoreIndexPath = path.join(
  root,
  'packages/backend-contracts/execution-core/src/index.ts'
);
if (!fs.existsSync(executionCoreIndexPath)) {
  errors.push(`Missing execution-core contract file: ${executionCoreIndexPath}`);
} else {
  const content = fs.readFileSync(executionCoreIndexPath, 'utf8');
  if (!content.includes('OUTBOUND_EFFECT_PHASE')) {
    errors.push('execution-core missing OUTBOUND_EFFECT_PHASE export');
  }
  if (!content.includes('OUTBOUND_EFFECT_STATUS')) {
    errors.push('execution-core missing OUTBOUND_EFFECT_STATUS export');
  }
  if (!content.includes('computeOutboundPayloadHash')) {
    errors.push('execution-core missing computeOutboundPayloadHash export');
  }
}

// 2. Verify builtin-skill-contract and runtime-capability-contract have 'unknown', 'prepared', 'committed'
const builtinContractPath = path.join(
  root,
  'packages/backend-contracts/builtin-skill-contract/src/index.ts'
);
if (fs.existsSync(builtinContractPath)) {
  const content = fs.readFileSync(builtinContractPath, 'utf8');
  if (!content.includes("'unknown'") || !content.includes("'prepared'") || !content.includes('payloadHash')) {
    errors.push('builtin-skill-contract BuiltinSkillHandlerResult missing unknown/prepared/payloadHash support');
  }
}

const runtimeContractPath = path.join(
  root,
  'packages/backend-contracts/runtime-capability-contract/src/index.ts'
);
if (fs.existsSync(runtimeContractPath)) {
  const content = fs.readFileSync(runtimeContractPath, 'utf8');
  if (!content.includes("'unknown'") || !content.includes('payloadHash')) {
    errors.push('runtime-capability-contract missing unknown status or payloadHash support');
  }
}

// 3. Verify email.send handler implements two-phase (prepare/commit), idempotencyKey, and OUTBOUND_EFFECT_UNKNOWN
const emailHandlerPath = path.join(
  root,
  'apps/backend/execution-control/control-plane/src/modules/execution/adapters/email/email-send.handler.ts'
);
if (!fs.existsSync(emailHandlerPath)) {
  errors.push(`Missing email-send handler: ${emailHandlerPath}`);
} else {
  const content = fs.readFileSync(emailHandlerPath, 'utf8');
  if (!content.includes('OUTBOUND_EFFECT_PHASE.PREPARE') && !content.includes("phase === 'prepare'")) {
    errors.push('email-send handler missing PREPARE phase logic');
  }
  if (!content.includes('PAYLOAD_HASH_MISMATCH')) {
    errors.push('email-send handler missing PAYLOAD_HASH_MISMATCH validation for commit phase');
  }
  if (!content.includes('OUTBOUND_EFFECT_UNKNOWN')) {
    errors.push('email-send handler missing OUTBOUND_EFFECT_UNKNOWN timeout classification');
  }
  if (!content.includes('computeOutboundPayloadHash')) {
    errors.push('email-send handler missing computeOutboundPayloadHash calculation');
  }
}

// 4. Verify DeterministicPlanSchedulerService handles UNKNOWN and freezes execution into human_control
const schedulerPath = path.join(
  root,
  'apps/backend/execution-control/control-plane/src/modules/execution/plan-runtime/deterministic-plan-scheduler.service.ts'
);
if (!fs.existsSync(schedulerPath)) {
  errors.push(`Missing deterministic plan scheduler: ${schedulerPath}`);
} else {
  const content = fs.readFileSync(schedulerPath, 'utf8');
  if (!content.includes('OUTBOUND_EFFECT_UNKNOWN')) {
    errors.push('DeterministicPlanSchedulerService does not catch OUTBOUND_EFFECT_UNKNOWN');
  }
  if (!content.includes('human_control')) {
    errors.push('DeterministicPlanSchedulerService does not transition UNKNOWN execution to human_control');
  }
  if (!content.includes('takeoverTriggered')) {
    errors.push('DeterministicPlanSchedulerService does not tag step with takeoverTriggered');
  }
}

if (errors.length > 0) {
  console.error('[FAIL] Outbound side-effect validation failed:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  console.error('========================================================================');
  process.exit(1);
}

console.log('[PASS] Outbound side-effect safety contracts, two-phase handler, and scheduler UNKNOWN takeover verified.');
console.log('========================================================================');
