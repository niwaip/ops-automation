// Repair the single package created during live verification; preserve its identity and backup.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = '/workspace';
const user = 'e7fce333-a8f4-4097-9a53-f0a4c729da46';
const skillId = 'c60d78fd-b6c3-4e7c-99ba-67f6d61efecd';
const old = path.join(root, 'apps/backend/intelligence/ai-orchestrator/data/users', user, 'knowledge');
const target = path.join(root, 'data/users', user, 'knowledge');
const backup = path.join(root, 'docs/artifacts/reviews/department-paid-skill-fix-20261022/misplaced-skill-backup');
const catalogName = '.personal-skills-catalog.json';
const sourceCatalog = JSON.parse(fs.readFileSync(path.join(old, catalogName), 'utf8'));
const record = sourceCatalog[skillId];
assert.equal(record?.displayName, '部门别有偿统计');
const targetCatalogPath = path.join(target, catalogName);
const targetCatalog = fs.existsSync(targetCatalogPath) ? JSON.parse(fs.readFileSync(targetCatalogPath, 'utf8')) : {};
assert(!Object.values(targetCatalog).some((r) => r.slug === record.slug), 'destination already contains this slug');
assert(!fs.existsSync(backup), 'backup already exists');
fs.cpSync(old, backup, { recursive: true, errorOnExist: true, force: false });
for (const relative of [path.join('skills', record.slug), path.join('.skill-versions', skillId)]) {
  const dest = path.join(target, relative);
  assert(!fs.existsSync(dest), 'destination exists');
  fs.cpSync(path.join(old, relative), dest, { recursive: true, errorOnExist: true, force: false });
}
targetCatalog[skillId] = record;
fs.writeFileSync(targetCatalogPath + '.migration-tmp', JSON.stringify(targetCatalog, null, 2));
fs.renameSync(targetCatalogPath + '.migration-tmp', targetCatalogPath);
assert(fs.existsSync(path.join(target, 'skills', record.slug, 'SKILL.md')));
delete sourceCatalog[skillId];
fs.writeFileSync(path.join(old, catalogName), JSON.stringify(sourceCatalog, null, 2));
console.log(JSON.stringify({ migrated: skillId, target, backup, preservedVersion: record.version }));
