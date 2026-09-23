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

// 3b. Verify Platform Prisma migration exists for outbound_effect_ledgers
const platformMigrationsDir = path.join(root, 'apps/backend/platform/prisma/migrations');
if (!fs.existsSync(platformMigrationsDir)) {
  errors.push(`Missing platform prisma migrations dir: ${platformMigrationsDir}`);
} else {
  const migrationDirs = fs.readdirSync(platformMigrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let hasLedgerMigration = false;
  for (const dirName of migrationDirs) {
    const sqlPath = path.join(platformMigrationsDir, dirName, 'migration.sql');
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf8');
      if (
        sql.includes('outbound_effect_ledgers') &&
        sql.includes('CREATE TABLE') &&
        sql.includes('CREATE UNIQUE INDEX')
      ) {
        hasLedgerMigration = true;
        break;
      }
    }
  }
  if (!hasLedgerMigration) {
    errors.push('apps/backend/platform/prisma/migrations missing migration creating outbound_effect_ledgers table');
  }
}

// 4. Verify OutboundEffectLedgerService state machine and CAS enforcement
const ledgerServicePath = path.join(
  root,
  'apps/backend/execution-control/control-plane/src/modules/execution/outbox/outbound-effect-ledger.service.ts'
);
if (!fs.existsSync(ledgerServicePath)) {
  errors.push(`Missing outbound-effect-ledger.service.ts: ${ledgerServicePath}`);
} else {
  const content = fs.readFileSync(ledgerServicePath, 'utf8');
  if (!content.includes('OUTBOUND_EFFECT_NOT_APPROVED')) {
    errors.push('outbound-effect-ledger.service.ts missing OUTBOUND_EFFECT_NOT_APPROVED rejection in acquireCommit');
  }
  if (!content.includes('OUTBOUND_EFFECT_IN_UNKNOWN_STATE')) {
    errors.push('outbound-effect-ledger.service.ts missing OUTBOUND_EFFECT_IN_UNKNOWN_STATE rejection in acquireCommit');
  }
  if (!content.includes('OUTBOUND_EFFECT_FAILED')) {
    errors.push('outbound-effect-ledger.service.ts missing OUTBOUND_EFFECT_FAILED rejection in acquireCommit');
  }
  // CAS checks for markCommitted, markUnknown, markFailed on state = COMMITTING
  const hasCasOnCommitting = content.includes("state = 'COMMITTING'") || content.includes("state: 'COMMITTING'");
  if (!hasCasOnCommitting) {
    errors.push('outbound-effect-ledger.service.ts terminal state updates must CAS check state = COMMITTING');
  }
}

// 5. Verify fail-closed commit & ledger integration in email.send handler
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
  if (!content.includes('DIRECT_EXTERNAL_WRITE_FORBIDDEN')) {
    errors.push('email-send handler missing DIRECT_EXTERNAL_WRITE_FORBIDDEN fail-closed enforcement');
  }
  // Check active ledger calls
  if (
    !content.includes('ledger.prepare') ||
    !content.includes('ledger.acquireCommit') ||
    !content.includes('ledger.markCommitted') ||
    !content.includes('ledger.markUnknown') ||
    !content.includes('ledger.markFailed')
  ) {
    errors.push('email-send handler must actively call ledger.prepare, acquireCommit, markCommitted, markUnknown, markFailed');
  }
}

// 6. Verify email providers propagate clientRequestKey and shape timeout error
const smtpClientPath = path.join(
  root,
  'apps/backend/execution-control/control-plane/src/modules/execution/adapters/email/providers/smtp-client.ts'
);
if (fs.existsSync(smtpClientPath)) {
  const content = fs.readFileSync(smtpClientPath, 'utf8');
  if (!content.includes('clientRequestKey') || !content.includes('X-Client-Request-Key')) {
    errors.push('smtp-client.ts missing clientRequestKey / X-Client-Request-Key propagation');
  }
  if (!content.includes('ETIMEDOUT') || !content.includes('isTimeout')) {
    errors.push('smtp-client.ts missing ETIMEDOUT code or isTimeout flag on socket timeout');
  }
}

if (fs.existsSync(emailHandlerPath)) {
  const content = fs.readFileSync(emailHandlerPath, 'utf8');
  if (!content.includes('isTimeout === true') || !content.includes('超时')) {
    errors.push('email-send.handler.ts isUncertainNetworkError must check isTimeout and Chinese 超时');
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

// 7. Verify DeterministicPlanSchedulerService handles UNKNOWN unconditionally and guards against caller self-auth
const schedulerPath = path.join(
  root,
  'apps/backend/execution-control/control-plane/src/modules/execution/plan-runtime/deterministic-plan-scheduler.service.ts'
);
const schedulerHelpersPath = path.join(
  root,
  'apps/backend/execution-control/control-plane/src/modules/execution/plan-runtime/deterministic-plan-scheduler.helpers.ts'
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

if (fs.existsSync(schedulerHelpersPath)) {
  const helpersContent = fs.readFileSync(schedulerHelpersPath, 'utf8');
  if (!helpersContent.includes('UNAUTHORIZED_EFFECT_COMMIT')) {
    errors.push('deterministic-plan-scheduler.helpers.ts missing UNAUTHORIZED_EFFECT_COMMIT guard');
  }
}

// 8. Verify RuntimeResultInterpreter routes UNKNOWN directly to context.takeover
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

// 9. Verify W3C distributed trace propagation in TraceInterceptor, ProxyController, and Outbox Enqueue
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

const proxyControllerPath = path.join(
  root,
  'apps/backend/execution-control/control-plane/src/modules/proxy/proxy.controller.ts'
);
if (fs.existsSync(proxyControllerPath)) {
  const content = fs.readFileSync(proxyControllerPath, 'utf8');
  if (!content.includes('createChildTraceparent') || !content.includes('currentTraceparent')) {
    errors.push('ProxyController missing child span derivation from traceparent via createChildTraceparent');
  }
}

const executionCreatePath = path.join(
  root,
  'apps/backend/execution-control/control-plane/src/modules/execution/creation/execution-create.service.ts'
);
if (fs.existsSync(executionCreatePath)) {
  const content = fs.readFileSync(executionCreatePath, 'utf8');
  if (!content.includes('traceContext')) {
    errors.push('ExecutionCreateService missing traceContext propagation into outbox event');
  }
}

// 10. Verify production Compose durable role configuration
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
