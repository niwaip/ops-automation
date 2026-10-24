// Upgrade the audited rule-only skill without changing its confirmed business rules.
const fs = require('fs');
const path = require('path');
const base = '/workspace/apps/backend/intelligence/ai-orchestrator/dist/modules/personal-skill';
const { PersonalSkillGeneratorService } = require(path.join(base, 'personal-skill-generator.service'));
const { PersonalSkillValidatorService } = require(path.join(base, 'personal-skill-validator.service'));
const { PersonalSkillStoreService } = require(path.join(base, 'personal-skill-store.service'));

(async () => {
  const userId = 'e7fce333-a8f4-4097-9a53-f0a4c729da46';
  const skillId = 'c60d78fd-b6c3-4e7c-99ba-67f6d61efecd';
  const store = new PersonalSkillStoreService();
  const old = store.loadCatalog(userId)[skillId];
  if (old.version !== 1) throw new Error(`Expected v1; found v${old.version}, refusing duplicate migration`);
  const skillDir = path.join(store.getUserSkillsDir(userId), old.slug);
  const rules = JSON.parse(fs.readFileSync(path.join(skillDir, 'references/rules.json')));
  const source = { source: old.sourceRef, objective: rules.objective,
    confirmedInstructions: rules.confirmedInstructions, corrections: rules.negativeConstraints,
    inputs: rules.inputExpectations, outputContract: rules.outputContract,
    reusableSteps: [], reusableFiles: [] };
  const captureId = 'verified-workflow-upgrade-20261022';
  const staging = store.createStagingDir(userId, captureId);
  const generated = await new PersonalSkillGeneratorService().generateSkillPackage(source, old.displayName, old.slug, staging);
  const input = path.join(store.getUserKnowledgeDir(userId), '..', 'workspace', '.sessions',
    'chat-session-1792667458057-iiyfxw64', '工数实绩明细_20261020134124.xlsx');
  const validation = await new PersonalSkillValidatorService().validatePackage(staging, input);
  if (!validation.valid) throw new Error(JSON.stringify(validation));
  const replay = JSON.parse(fs.readFileSync(path.join(staging, 'references/validation.json')));
  if (replay.included_rows !== 253 || replay.excluded_rows !== 21 ||
      replay.total_scaled_1e20 !== '163741990000000000000000') throw new Error('Unexpected independent source replay');
  const record = await store.installFromStaging(userId, captureId, {
    existingSkillId: skillId, displayName: old.displayName, slug: old.slug,
    description: old.description, ...generated, sourceRef: old.sourceRef });
  const report = { skillId, slug: record.slug, version: record.version, hasScript: record.hasScript,
    requiresExecution: record.requiresExecution, packageHash: record.packageHash, replay };
  fs.writeFileSync('/workspace/docs/artifacts/reviews/department-paid-skill-workflow-fix-20261022/upgrade-result.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
