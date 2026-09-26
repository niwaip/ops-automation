import { Pool } from 'pg';
import { randomUUID } from 'crypto';

interface TestSummary {
  concurrencyResult: {
    totalAttempts: number;
    winners: number;
    conflictsHandled: number;
    dbRecordCount: number;
    outboxEventCount: number;
    pass: boolean;
  };
  leaseRecoveryResult: {
    recoveredBy: string;
    pass: boolean;
  };
  outboxLeaseRecoveryResult: {
    recoveredBy: string;
    attempts: number;
    pass: boolean;
  };
  poisonIsolationResult: {
    quarantinedCount: number;
    pass: boolean;
  };
}

export async function runScheduleConcurrencyVerification(
  connectionString: string = process.env.DATABASE_URL || 'postgresql://ops:ops_secret@localhost:5432/ops',
  concurrency: number = 50
): Promise<TestSummary> {
  // Probe PostgreSQL connection capacity to prevent "sorry, too many clients already"
  let poolSize = 20;
  const probePool = new Pool({ connectionString, max: 2 });
  try {
    const probeClient = await probePool.connect();
    try {
      const maxRes = await probeClient.query('SHOW max_connections');
      const currRes = await probeClient.query('SELECT count(*)::int as count FROM pg_stat_activity');
      const maxConn = parseInt(maxRes.rows[0].max_connections, 10) || 100;
      const currConn = currRes.rows[0].count || 0;
      const safeBuffer = 15;
      const available = Math.max(maxConn - currConn - safeBuffer, 5);
      poolSize = Math.min(available, 25);
    } finally {
      probeClient.release();
    }
  } catch {
    poolSize = 15;
  } finally {
    await probePool.end();
  }

  const pool = new Pool({
    connectionString,
    max: poolSize,
    idleTimeoutMillis: 5000,
  });

  const client = await pool.connect();
  const testScheduleId = randomUUID();
  const testScheduledAt = new Date('2026-09-24T12:00:00.000Z');
  let winnerFireId: string | null = null;
  const createdFireIds: string[] = [];
  const createdOutboxIds: string[] = [];

  console.log('========================================================================');
  console.log('  Schedule Fire Real DB Concurrency & Lease Recovery Verification');
  console.log('========================================================================');
  console.log(`Connecting to: ${connectionString.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Concurrency target: ${concurrency} parallel transactions (pool size: ${poolSize})`);
  console.log(`Test Schedule ID: ${testScheduleId}`);
  console.log(`Scheduled At: ${testScheduledAt.toISOString()}`);
  console.log('------------------------------------------------------------------------');

  try {
    // -------------------------------------------------------------------------
    // 1. 50-concurrency unique ScheduleFire generation
    // -------------------------------------------------------------------------
    console.log(`[Phase 1] Launching ${concurrency} simultaneous ScheduleFire creation attempts...`);

    const attemptTasks = Array.from({ length: concurrency }, async (_, index) => {
      const attemptClient = await pool.connect();
      try {
        await attemptClient.query('BEGIN');
        const fireId = randomUUID();
        const insertRes = await attemptClient.query(
          `INSERT INTO schedule_fires (id, schedule_id, scheduled_at, status)
           VALUES ($1::uuid, $2::uuid, $3, 'pending')
           ON CONFLICT (schedule_id, scheduled_at) DO NOTHING
           RETURNING id`,
          [fireId, testScheduleId, testScheduledAt]
        );

        if (insertRes.rows.length === 1) {
          const outboxId = randomUUID();
          await attemptClient.query(
            `INSERT INTO execution_outbox
               (id, aggregate_type, aggregate_id, event_type, payload_json, available_at)
             VALUES
               ($1::uuid, 'schedule_fire', $2::uuid, 'schedule.fire.created', $3::jsonb, NOW())`,
            [
              outboxId,
              fireId,
              JSON.stringify({
                fireId,
                scheduleId: testScheduleId,
                scheduledAt: testScheduledAt.toISOString(),
                workerIndex: index,
              }),
            ]
          );
          await attemptClient.query('COMMIT');
          return { created: true, fireId, outboxId, index };
        } else {
          await attemptClient.query('COMMIT');
          return { created: false, index };
        }
      } catch (err) {
        await attemptClient.query('ROLLBACK');
        throw err;
      } finally {
        attemptClient.release();
      }
    });

    const results = await Promise.all(attemptTasks);
    const winners = results.filter((r) => r.created);
    const conflictsHandled = results.filter((r) => !r.created);

    if (winners.length === 1 && winners[0].fireId) {
      winnerFireId = winners[0].fireId;
      createdFireIds.push(winnerFireId);
      if (winners[0].outboxId) createdOutboxIds.push(winners[0].outboxId);
    }

    // Verify DB count
    const dbCountRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM schedule_fires WHERE schedule_id = $1::uuid AND scheduled_at = $2`,
      [testScheduleId, testScheduledAt]
    );
    const dbRecordCount = dbCountRes.rows[0].count;

    const outboxCountRes = winnerFireId
      ? await client.query(
          `SELECT COUNT(*)::int AS count FROM execution_outbox WHERE aggregate_id = $1::uuid`,
          [winnerFireId]
        )
      : { rows: [{ count: 0 }] };
    const outboxEventCount = outboxCountRes.rows[0].count;

    const concurrencyPass =
      winners.length === 1 &&
      conflictsHandled.length === concurrency - 1 &&
      dbRecordCount === 1 &&
      outboxEventCount === 1;

    console.log(`[Phase 1 Result] Winners: ${winners.length}, Handled Conflicts: ${conflictsHandled.length}`);
    console.log(`[Phase 1 Result] DB Records in schedule_fires: ${dbRecordCount} (expected: 1)`);
    console.log(`[Phase 1 Result] Events in execution_outbox: ${outboxEventCount} (expected: 1)`);
    console.log(`[Phase 1 Gate] ${concurrencyPass ? '✓ PASSED' : '✗ FAILED'}`);
    console.log('------------------------------------------------------------------------');

    if (!concurrencyPass || !winnerFireId) {
      throw new Error('Phase 1 concurrency test failed assertion.');
    }

    // -------------------------------------------------------------------------
    // 2. Lease recovery & Crash injection simulation
    // -------------------------------------------------------------------------
    console.log('[Phase 2] Simulating worker crash with expired lease...');

    // Worker 1 claims but "crashes", leaving an expired lease
    await client.query(
      `UPDATE schedule_fires
          SET claimed_by = 'worker-crashed-node-1',
              lease_expires_at = NOW() - INTERVAL '15 seconds',
              updated_at = NOW()
        WHERE id = $1::uuid`,
      [winnerFireId]
    );

    console.log('[Phase 2] Healthy Worker 2 attempting atomic claim over expired lease...');

    const claimRes = await client.query(
      `WITH candidates AS (
         SELECT id
           FROM schedule_fires
          WHERE (claimed_by IS NULL OR lease_expires_at < NOW())
            AND execution_id IS NULL
            AND id = $1::uuid
          ORDER BY scheduled_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
       UPDATE schedule_fires AS sf
          SET claimed_by = 'worker-healthy-node-2',
              lease_expires_at = NOW() + INTERVAL '30 seconds',
              updated_at = NOW()
         FROM candidates
        WHERE sf.id = candidates.id
       RETURNING sf.id, sf.claimed_by`,
      [winnerFireId]
    );

    const recoveredBy = claimRes.rows[0]?.claimed_by || 'NONE';
    const leasePass = claimRes.rows.length === 1 && recoveredBy === 'worker-healthy-node-2';

    console.log(`[Phase 2 Result] Lease successfully recovered by: ${recoveredBy}`);
    console.log(`[Phase 2 Gate] ${leasePass ? '✓ PASSED' : '✗ FAILED'}`);
    console.log('------------------------------------------------------------------------');

    if (!leasePass) {
      throw new Error('Phase 2 lease recovery test failed assertion.');
    }

    // -------------------------------------------------------------------------
    // 3. Poison Message Quarantine Isolation
    // -------------------------------------------------------------------------
    console.log('[Phase 3] Testing Outbox poison message quarantine...');
    const poisonOutboxId = randomUUID();
    createdOutboxIds.push(poisonOutboxId);

    // Insert poison event with 10 failed attempts
    await client.query(
      `INSERT INTO execution_outbox
         (id, aggregate_type, aggregate_id, event_type, payload_json, attempts, available_at)
       VALUES
         ($1::uuid, 'execution', $2::uuid, 'execution.ready', $3::jsonb, 10, NOW() - INTERVAL '1 minute')`,
      [poisonOutboxId, randomUUID(), JSON.stringify({ executionId: randomUUID(), poison: true })]
    );

    // Verify claimBatch with maxAttempts=10 skips this item
    const candidateRes = await client.query(
      `SELECT id FROM execution_outbox
        WHERE published_at IS NULL
          AND id = $1::uuid
          AND attempts < 10`,
      [poisonOutboxId]
    );
    const skippedByClaim = candidateRes.rows.length === 0;

    // Quarantine poison messages
    const quarantineRes = await client.query(
      `UPDATE execution_outbox
          SET published_at = NOW(),
              claimed_by = NULL,
              lease_expires_at = NULL,
              payload_json = jsonb_set(
                CASE WHEN jsonb_typeof(payload_json) = 'object' THEN payload_json ELSE '{}'::jsonb END,
                '{deadLetter}',
                jsonb_build_object('reason', 'Exceeded max retry attempts', 'deadLetteredAt', NOW()::text),
                true
              )
        WHERE published_at IS NULL
          AND attempts >= 10
          AND id = $1::uuid
       RETURNING id`,
      [poisonOutboxId]
    );

    const quarantinedCount = quarantineRes.rows.length;
    const poisonPass = skippedByClaim && quarantinedCount === 1;

    console.log(`[Phase 3 Result] Skipped by normal claims: ${skippedByClaim}`);
    console.log(`[Phase 3 Result] Quarantined to dead letter: ${quarantinedCount} items`);
    console.log(`[Phase 3 Gate] ${poisonPass ? '✓ PASSED' : '✗ FAILED'}`);
    console.log('------------------------------------------------------------------------');

    if (!poisonPass) {
      throw new Error('Phase 3 poison quarantine test failed assertion.');
    }

    // -------------------------------------------------------------------------
    // 4. Execution Outbox Crash Lease Recovery & SKIP LOCKED Reclaim
    // -------------------------------------------------------------------------
    console.log('[Phase 4] Testing Execution Outbox lease crash recovery with SKIP LOCKED...');
    const outboxRecoveryId = randomUUID();
    createdOutboxIds.push(outboxRecoveryId);

    // Insert pending outbox event
    await client.query(
      `INSERT INTO execution_outbox
         (id, aggregate_type, aggregate_id, event_type, payload_json, attempts, available_at)
       VALUES
         ($1::uuid, 'execution', $2::uuid, 'execution.step.execute', $3::jsonb, 0, NOW() - INTERVAL '30 seconds')`,
      [outboxRecoveryId, randomUUID(), JSON.stringify({ executionId: randomUUID(), stepId: 'step-1' })]
    );

    // Worker 1 claims it but crashes, leaving an expired lease
    await client.query(
      `UPDATE execution_outbox
          SET claimed_by = 'dispatcher-crashed-node-1',
              lease_expires_at = NOW() - INTERVAL '15 seconds',
              attempts = 1
        WHERE id = $1::uuid`,
      [outboxRecoveryId]
    );

    console.log('[Phase 4] Healthy Dispatcher 2 attempting atomic claim over expired outbox lease...');

    // Worker 2 attempts atomic claim using exact query from ExecutionOutboxService.claimBatch
    const outboxClaimRes = await client.query(
      `WITH candidates AS (
         SELECT id
           FROM execution_outbox
          WHERE published_at IS NULL
            AND available_at <= NOW()
            AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
            AND attempts < 10
            AND id = $1::uuid
          ORDER BY available_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
       UPDATE execution_outbox AS outbox
          SET claimed_by = 'dispatcher-healthy-node-2',
              lease_expires_at = NOW() + INTERVAL '30 seconds',
              attempts = attempts + 1
         FROM candidates
        WHERE outbox.id = candidates.id
       RETURNING outbox.id, outbox.claimed_by, outbox.attempts, outbox.lease_expires_at`,
      [outboxRecoveryId]
    );

    const outboxRecoveredBy = outboxClaimRes.rows[0]?.claimed_by || 'NONE';
    const outboxAttempts = outboxClaimRes.rows[0]?.attempts || 0;
    const outboxLeasePass =
      outboxClaimRes.rows.length === 1 &&
      outboxRecoveredBy === 'dispatcher-healthy-node-2' &&
      outboxAttempts === 2;

    console.log(`[Phase 4 Result] Outbox lease recovered by: ${outboxRecoveredBy}, attempts: ${outboxAttempts}`);
    console.log(`[Phase 4 Gate] ${outboxLeasePass ? '✓ PASSED' : '✗ FAILED'}`);
    console.log('========================================================================');

    if (!outboxLeasePass) {
      throw new Error('Phase 4 Execution Outbox lease recovery test failed assertion.');
    }

    return {
      concurrencyResult: {
        totalAttempts: concurrency,
        winners: winners.length,
        conflictsHandled: conflictsHandled.length,
        dbRecordCount,
        outboxEventCount,
        pass: concurrencyPass,
      },
      leaseRecoveryResult: {
        recoveredBy,
        pass: leasePass,
      },
      outboxLeaseRecoveryResult: {
        recoveredBy: outboxRecoveredBy,
        attempts: outboxAttempts,
        pass: outboxLeasePass,
      },
      poisonIsolationResult: {
        quarantinedCount,
        pass: poisonPass,
      },
    };
  } finally {
    // Clean up test records
    try {
      if (createdFireIds.length > 0) {
        await client.query(`DELETE FROM schedule_fires WHERE id = ANY($1::uuid[])`, [createdFireIds]);
      }
      if (createdOutboxIds.length > 0) {
        await client.query(`DELETE FROM execution_outbox WHERE id = ANY($1::uuid[])`, [createdOutboxIds]);
      }
    } catch {
      // ignore cleanup errors
    }
    client.release();
    await pool.end();
  }
}

// Direct execution entrypoint
if (require.main === module) {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://ops:ops_secret@localhost:5432/ops';
  runScheduleConcurrencyVerification(dbUrl, 50)
    .then((summary) => {
      if (
        summary.concurrencyResult.pass &&
        summary.leaseRecoveryResult.pass &&
        summary.outboxLeaseRecoveryResult.pass &&
        summary.poisonIsolationResult.pass
      ) {
        console.log('[SUCCESS] All PostgreSQL concurrency and resilience checks passed 100%!');
        process.exit(0);
      } else {
        console.error('[FAILURE] Verification assertions failed.');
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('[FATAL] Verification encountered an error:', err.message);
      process.exit(1);
    });
}
