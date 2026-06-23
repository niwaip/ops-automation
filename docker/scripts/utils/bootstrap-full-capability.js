const base = 'http://localhost:3001';
const workflowName = '保密协议模板-48cd5507-工作流';

async function bootstrap() {
  console.log('Logging in as admin...');
  const login = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  }).then((r) => r.json());

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${login.accessToken}`,
  };

  console.log('Finding workflow...');
  const workflows = await fetch(base + '/temporal-workflow', { headers }).then((r) => r.json());
  const wf = (workflows || []).find((w) => w.name === workflowName);
  if (!wf) {
    throw new Error('未找到目标 workflow: ' + workflowName);
  }
  console.log(`Found workflow: ${wf.name} (${wf.id})`);

  console.log('Checking existing releases...');
  const list = await fetch(base + '/capability-releases', { headers }).then((r) => r.json());
  let release = (list.releases || []).find(
    (r) => r.sourceType === 'temporal_workflow' && r.sourceId === wf.id
  );

  if (!release) {
    console.log('Creating new Capability Release...');
    const created = await fetch(base + '/capability-releases', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sourceType: 'temporal_workflow',
        sourceId: wf.id,
        sourceName: workflowName,
      }),
    }).then((r) => r.json());
    release = created.release.release;
    console.log(`Created release: ${release.id}`);
  } else {
    console.log(`Release already exists: ${release.id}`);
  }

  // 1. Build
  if (release.status === 'draft') {
    console.log('Building capability...');
    const buildRes = await fetch(`${base}/capability-releases/${release.id}/build`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ buildType: 'temporal_workflow' }),
    }).then((r) => r.json());
    console.log('Build triggered');
    // Wait a bit for build to complete (simple mock/local build is fast)
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 2. Validate
  if (!release.latestSuccessfulValidationId) {
    console.log('Validating capability (static)...');
    const validateRes = await fetch(`${base}/capability-releases/${release.id}/validate/static`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    }).then((r) => r.json());
    console.log('Validation completed');
  }

  // 3. Generate Skill Draft
  if (!release.currentSkillDraftId) {
    console.log('Generating Skill Draft...');
    const draftRes = await fetch(`${base}/capability-releases/${release.id}/generate-skill-draft`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    }).then((r) => r.json());
    release = draftRes.release;
    console.log(`Generated skill draft: ${release.currentSkillDraftId}`);
  }

  // 4. Approve
  if (release.approvalStatus !== 'approved' && release.approvalStatus !== 'not_required') {
    console.log('Approving release...');
    const approveRes = await fetch(`${base}/capability-releases/${release.id}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ decision: 'approved', comment: 'auto approve for bootstrap' }),
    }).then((r) => r.json());
    release = approveRes.release.release;
    console.log('Approved');
  }

  // 5. Publish
  if (!release.publishedSkillId) {
    console.log('Publishing skill...');
    const res = await fetch(`${base}/capability-releases/${release.id}/publish-skill`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    const publishRes = await res.json();
    if (!res.ok) {
      console.error('Publish failed:', publishRes);
      throw new Error(`Publish failed with status ${res.status}`);
    }
    release = publishRes.release;
    console.log(`Published skill ID: ${publishRes.publishedSkillId}`);
  }

  console.log('\nBootstrap successful!');
  console.log(
    JSON.stringify(
      {
        releaseId: release.id,
        publishedSkillId: release.publishedSkillId,
        status: release.status,
      },
      null,
      2
    )
  );
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
