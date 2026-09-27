#!/usr/bin/env node

const AUTH_BASE = process.env.AUTH_BASE || 'http://localhost:3001';
const USERNAME = process.env.AUTH_USER || 'admin';
const PASSWORD = process.env.AUTH_PASS || 'admin123';
const APPLY = process.env.APPLY === 'true' || process.argv.includes('--apply');

function log(...args) {
  console.log('[migrate-workflow-activity-refs]', ...args);
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(
      `[${res.status}] ${url} -> ${typeof data === 'string' ? data : JSON.stringify(data)}`
    );
  }
  return data;
}

function resolveBuiltin(step, builtinActivities) {
  const activityName = String(step.activityName || '').trim();
  if (!activityName) {
    return null;
  }
  return (
    builtinActivities.find(
      (activity) =>
        activity.ref === activityName ||
        activity.key === activityName ||
        activity.name === activityName ||
        activity.fn === activityName
    ) || null
  );
}

function resolveCustom(step, customActivities) {
  const activityName = String(step.activityName || '').trim();
  if (!activityName) {
    return null;
  }
  return (
    customActivities.find(
      (activity) => activity.name === activityName || activity.fn === activityName
    ) || null
  );
}

function migrateSteps(workflow, builtinActivities, customActivities) {
  const steps = Array.isArray(workflow?.workflowDsl?.steps) ? workflow.workflowDsl.steps : [];
  let changed = false;

  const nextSteps = steps.map((step) => {
    if (!step || step.type !== 'activity') {
      return step;
    }
    if (step.activityRef && String(step.activityRef).trim()) {
      return step;
    }

    const builtin = resolveBuiltin(step, builtinActivities);
    if (builtin) {
      changed = true;
      return {
        ...step,
        activityRef: builtin.ref,
        activityName: step.activityName || builtin.name,
      };
    }

    const custom = resolveCustom(step, customActivities);
    if (custom) {
      changed = true;
      return {
        ...step,
        activityRef: `custom:${custom.id}`,
        activityName: step.activityName || custom.name,
      };
    }

    return step;
  });

  return {
    changed,
    steps: nextSteps,
  };
}

async function main() {
  log(`mode=${APPLY ? 'apply' : 'dry-run'}`);

  const login = await requestJson(`${AUTH_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });

  const token = login.accessToken;
  if (!token) {
    throw new Error('登录成功但未返回 accessToken');
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const [workflows, customActivities, builtinActivities] = await Promise.all([
    requestJson(`${AUTH_BASE}/temporal-workflow`, { headers }),
    requestJson(`${AUTH_BASE}/activities`, { headers }),
    requestJson(`${AUTH_BASE}/activities/builtin`, { headers }),
  ]);

  const updated = [];
  const unresolved = [];

  for (const workflow of workflows || []) {
    const result = migrateSteps(workflow, builtinActivities || [], customActivities || []);
    if (!result.changed) {
      continue;
    }

    const unresolvedSteps = result.steps.filter(
      (step) => step?.type === 'activity' && step.activityName && !step.activityRef
    );

    if (unresolvedSteps.length > 0) {
      unresolved.push({
        workflowId: workflow.id,
        workflowName: workflow.name,
        steps: unresolvedSteps.map((step) => ({
          id: step.id,
          name: step.name,
          activityName: step.activityName,
        })),
      });
    }

    updated.push({
      id: workflow.id,
      name: workflow.name,
      workflowDsl: {
        ...(workflow.workflowDsl || {}),
        steps: result.steps,
      },
      unresolvedStepCount: unresolvedSteps.length,
    });
  }

  if (APPLY) {
    for (const workflow of updated) {
      await requestJson(`${AUTH_BASE}/temporal-workflow/${workflow.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          workflowDsl: workflow.workflowDsl,
        }),
      });
      log(`updated ${workflow.name} (${workflow.id})`);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? 'apply' : 'dry-run',
        scannedWorkflows: (workflows || []).length,
        updatedCount: updated.length,
        unresolvedCount: unresolved.length,
        updated: updated.map((item) => ({
          id: item.id,
          name: item.name,
          unresolvedStepCount: item.unresolvedStepCount,
        })),
        unresolved,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('[migrate-workflow-activity-refs] failed:', error.message);
  process.exit(1);
});
