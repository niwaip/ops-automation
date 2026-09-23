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
  if (!content.includes("'unknown'") || !content.includes("'prepared'") || !content.includes('payloadHash')) {
    errors.push('runtime-capability-contract missing unknown status, prepared status, or payloadHash support');
  }
}

// 3. Verify outbound_effect_ledgers table schema ownership and Prisma models
const schemaOwnershipPath = path.join(root, 'database/schema-ownership.json');
if (!fs.existsSync(schemaOwnershipPath)) {
  errors.push(`Missing schema ownership file: ${schemaOwnershipPath}`);
} else {
  const ownership = JSON.parse(fs.readFileSync(schemaOwnershipPath, 'utf8'));
  const controlPlaneTables = ownership.owners?.['control-plane'] || [];
  if (!controlPlaneTables.includes('outbound_effect_ledgers')) {
    errors.push("database/schema-ownership.json missing 'outbound_effect_ledgers' owned by control-plane");
  }
}

const platformPrismaPath = path.join(root, 'apps/backend/platform/prisma/schema.prisma');
const cpPrismaPath = path.join(
  root,
  'apps/backend/execution-control/control-plane/prisma/schema.prisma'
);
for (const p of [platformPrismaPath, cpPrismaPath]) {
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf8');
    if (!content.includes('model OutboundEffectLedger')) {
      errors.push(`${p} missing OutboundEffectLedger model`);
    }
    if (!content.includes('@@unique([tenantId, capabilityKey, idempotencyKey])')) {
      errors.push(`${p} missing unique constraint on [tenantId, capabilityKey, idempotencyKey]`);
    }
  }
}

// 4. Verify fail-closed commit logic in email.send handler
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
  if (!content.includes('PAYLOAD_HASH_REQUIRED')) {
    errors.push('email-send handler missing PAYLOAD_HASH_REQUIRED fail-closed check for commit phase');
  }
  if (!content.includes('PAYLOAD_HASH_MISMATCH')) {
    errors.push('email-send handler missing PAYLOAD_HASH_MISMATCH validation for commit phase');
  }
  if (!content.includes('INVALID_EFFECT_PHASE')) {
    errors.push('email-send handler missing INVALID_EFFECT_PHASE check');
  }
  if (!content.includes('OUTBOUND_EFFECT_UNKNOWN')) {
    errors.push('email-send handler missing OUTBOUND_EFFECT_UNKNOWN timeout classification');
  }
  if (!content.includes('computeOutboundPayloadHash')) {
    errors.push('email-send handler missing computeOutboundPayloadHash calculation');
  }
}

// 5. Verify email providers propagate clientRequestKey (deduplication keys)
const smtpClientPath = path.join(
  root,
  'apps/backend/execution-control/control-plane/src/modules/execution/adapters/email/providers/smtp-client.ts'
);
if (fs.existsSync(smtpClientPath)) {
  const content = fs.readFileSync(smtpClientPath, 'utf8');
  if (!content.includes('clientRequestKey') || !content.includes('X-Client-Request-Key')) {
    errors.push('smtp-client.ts missing clientRequestKey / X-Client-Request-Key propagation');
  }
}

const graphProviderPath = path.join(
  root,
  'apps/backend/execution-control/control-plane/src/modules/execution/adapters/email/providers/microsoft-graph.provider.ts'
);
if (fs.existsSync(graphProviderPath)) {
  const content = fs.readFileSync(graphProviderPath, 'utf8');
  if (!content.includes('client-request-id') || !content.includes('clientRequestKey')) {
    errors.push('microsoft-graph.provider.ts missing client-request-id / clientRequestKey propagation');
  }
}

// 6. Verify DeterministicPlanSchedulerService handles UNKNOWN unconditionally before terminal output/continue
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
  // Check order: isUnknownEffect check must precede terminalOutputAllowed check
  const unknownIdx = content.indexOf('if (isUnknownEffect)');
  const terminalIdx = content.indexOf('const terminalOutputAllowed =');
  if (unknownIdx === -1 || terminalIdx === -1 || unknownIdx > terminalIdx) {
    errors.push('DeterministicPlanSchedulerService: isUnknownEffect check must precede terminalOutputAllowed check');
  }
}

// 7. Verify RuntimeResultInterpreter routes UNKNOWN directly to context.takeover
const interpreterPath = path.join(
  root,
  'apps/backend/execution-control/control-plane/src/modules/execution/step-runner/runtime/runtime-result.interpreter.ts'
);
if (fs.existsSync(interpreterPath)) {
  const content = fs.readFileSync(interpreterPath, 'utf8');
  if (!content.includes("status === 'unknown'") || !content.includes('context.takeover')) {
    errors.push('RuntimeResultInterpreter missing UNKNOWN routing to context.takeover');
  }
}

// 8. Verify W3C distributed trace propagation in TraceInterceptor
const traceInterceptorPath = path.join(
  root,
  'apps/backend/execution-control/control-plane/src/common/interceptors/trace.interceptor.ts'
);
if (fs.existsSync(traceInterceptorPath)) {
  const content = fs.readFileSync(traceInterceptorPath, 'utf8');
  if (!content.includes('generateW3cTraceparent')) {
    errors.push('TraceInterceptor missing generateW3cTraceparent implementation');
  }
  if (!content.includes('req.traceContext =')) {
    errors.push('TraceInterceptor missing req.traceContext attachment');
  }
  if (!content.includes('TRACEPARENT_HEADER')) {
    errors.push('TraceInterceptor missing TRACEPARENT_HEADER response handling');
  }
}

// 9. Verify production Compose durable role configuration
const prodComposePath = path.join(root, 'docker/compose/docker-compose.production.yml');
if (fs.existsSync(prodComposePath)) {
  const content = fs.readFileSync(prodComposePath, 'utf8');
  if (!content.includes('API_EXECUTION_OUTBOX_ENABLED')) {
    errors.push('docker-compose.production.yml: control-plane-api missing API_EXECUTION_OUTBOX_ENABLED default fallback');
  }
  // Check that dispatcher and schedule roles are isolated
  if (
    !content.includes("SCHEDULE_FIRE_V2_ENABLED: 'false'") ||
    !content.includes("EXECUTION_DISPATCHER_V2_ENABLED: 'false'")
  ) {
    errors.push('docker-compose.production.yml: execution-dispatcher and schedule-trigger must isolate runner flags');
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

console.log('[PASS] All outbound side-effect safety contracts, fail-closed handlers, UNKNOWN precedence, W3C trace context, and production Compose role gates verified.');
console.log('========================================================================');
