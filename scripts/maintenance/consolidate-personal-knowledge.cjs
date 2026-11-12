#!/usr/bin/env node
/** Retire verified archive mirrors. No filename-only deletion; unknown files remain untouched. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const { PrismaClient } = require(path.join(root, 'apps/backend/platform/src/generated/prisma'));
const prisma = new PrismaClient();
const args = process.argv.slice(2);
const userIndex = args.indexOf('--user');
if (userIndex < 0 || !/^[a-f0-9-]{36}$/i.test(args[userIndex + 1] || '')) {
  console.error('Usage: node scripts/maintenance/consolidate-personal-knowledge.cjs --user <uuid> [--apply]');
  process.exit(2);
}
const userId = args[userIndex + 1];
const apply = args.includes('--apply');
const output = path.join(root, 'docs/artifacts/reviews/personal-knowledge-unification-20261112', userId);
const storageRoot = process.env.WORKSPACE_STORAGE_ROOT || path.join(root, 'data/storage/workspaces');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceKey = (file) => {
  if (!/\.md$/i.test(file)) return '';
  const head = fs.readFileSync(file, 'utf8').slice(0, 4096);
  const session = head.match(/^\s*session_id:\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
  const message = head.match(/^\s*message_id:\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
  return session && message ? `${session}:${message}` : '';
};
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || e.name === 'skills' || e.isSymbolicLink()) return [];
    const file = path.join(dir, e.name);
    return e.isDirectory() ? walk(file) : e.isFile() ? [file] : [];
  });
}
(async () => {
  const workspace = await prisma.workspace.findFirst({ where: { type: 'personal', ownerUserId: userId } });
  if (!workspace) throw new Error('Personal workspace does not exist');
  const nodes = await prisma.workspaceNode.findMany({ where: { workspaceId: workspace.id } });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  function isArchived(n) {
    const seen = new Set();
    let id = n.parentId;
    while (id) {
      if (seen.has(id)) return false;
      seen.add(id);
      const p = byId.get(id);
      if (!p || /临时工作区|\(temp\)|^temp$/i.test(p.name)) return false;
      id = p.parentId;
    }
    return true;
  }
  const originals = [];
  for (const n of nodes) {
    if (n.type !== 'file' || !n.storagePath?.startsWith(`personal/${workspace.id}/`) || !isArchived(n)) continue;
    const file = path.resolve(storageRoot, n.storagePath);
    if (!file.startsWith(path.resolve(storageRoot) + path.sep) || !fs.existsSync(file)) continue;
    originals.push({ id: n.id, file, sha256: hash(file), sourceKey: sourceKey(file) });
  }
  const userRoot = path.join(root, 'data/users', userId);
  const files = [...walk(path.join(userRoot, 'workspace/deliverables')), ...walk(path.join(userRoot, 'knowledge'))];
  const plan = files.map((file) => {
    const sha256 = hash(file);
    const key = sourceKey(file);
    const original = originals.find((n) => n.sha256 === sha256)
      || (key ? originals.find((n) => n.sourceKey === key) : null);
    return { file: path.relative(root, file), sha256, originalId: original?.id,
      originalFile: original?.file, originalSha256: original?.sha256,
      reason: original ? (original.sha256 === sha256 ? 'identical_bytes' : 'same_archived_message') : 'unmatched' };
  });
  // Derived PDF/Office text caches can retire only with their verified archived original.
  for (const item of plan.filter((p) => p.reason === 'unmatched')) {
    const compound = item.file.replace(/\.txt$/i, '');
    const sameStem = item.file.replace(/\.txt$/i, '');
    const primary = plan.find((p) => p.originalId && (p.file === compound
      || /\.(pdf|docx|pptx|xlsx)$/i.test(p.file) && p.file.replace(/\.[^.]+$/, '') === sameStem));
    if (primary && /\.txt$/i.test(item.file)) {
      Object.assign(item, { originalId: primary.originalId, originalFile: primary.originalFile,
        originalSha256: primary.originalSha256, reason: 'derived_text_cache' });
    }
  }
  fs.mkdirSync(output, { recursive: true });
  const report = { userId, apply, createdAt: new Date().toISOString(), files: plan, retired: [], unmatched: plan.filter((p) => !p.originalId) };
  // Always persist a reviewable plan before any filesystem mutation.
  fs.writeFileSync(path.join(output, apply ? 'apply-plan.json' : 'plan.json'), JSON.stringify(report, null, 2));
  if (apply) {
    // Preserve documents that never reached personal space before retiring their old location.
    for (const item of report.unmatched) {
      const source = path.join(root, item.file);
      if (hash(source) !== item.sha256) throw new Error('Unmatched document changed; rerun plan');
      const bytes = fs.readFileSync(source);
      const id = crypto.randomUUID();
      const name = path.basename(source);
      const storagePath = `personal/${workspace.id}/${id}_${name}`;
      const target = path.join(storageRoot, storagePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes, { flag: 'wx' });
      try {
        await prisma.$transaction(async (tx) => {
          const quota = await tx.workspace.updateMany({
            where: { id: workspace.id, usedBytes: { lte: workspace.quotaBytes - BigInt(bytes.length) } },
            data: { usedBytes: { increment: BigInt(bytes.length) } },
          });
          if (quota.count !== 1) throw new Error('Personal workspace quota exceeded');
          let saved = await tx.workspaceNode.findFirst({ where: { workspaceId: workspace.id, parentId: null, name: '沙盒保存内容 (saved)', type: 'folder' } });
          if (!saved) saved = await tx.workspaceNode.create({ data: { workspaceId: workspace.id, name: '沙盒保存内容 (saved)', type: 'folder', createdBy: userId } });
          await tx.workspaceNode.create({ data: { id, workspaceId: workspace.id, parentId: saved.id, name,
            type: 'file', storagePath, fileSize: BigInt(bytes.length), createdBy: userId,
            mimeType: /\.md$/i.test(name) ? 'text/markdown' : /\.txt$/i.test(name) ? 'text/plain' : 'application/octet-stream' } });
        });
      } catch (error) { fs.unlinkSync(target); throw error; }
      if (hash(target) !== item.sha256) throw new Error('Imported original verification failed');
      Object.assign(item, { originalId: id, originalFile: target, originalSha256: item.sha256, reason: 'imported_original' });
    }
    report.unmatched = plan.filter((p) => !p.originalId);
    for (const item of plan.filter((p) => p.originalId)) {
      const file = path.join(root, item.file);
      if (hash(file) !== item.sha256 || hash(item.originalFile) !== item.originalSha256) throw new Error('File changed during consolidation; rerun the plan');
      const backup = path.join(output, 'retired-files', path.relative(userRoot, file));
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      if (!fs.existsSync(backup)) fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
      if (hash(backup) !== item.sha256) throw new Error('Backup verification failed');
      fs.unlinkSync(file);
      report.retired.push(item.file);
      fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
    }
    function prune(dir) {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) prune(path.join(dir, e.name));
      if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
    }
    prune(path.join(userRoot, 'workspace/deliverables'));
  }
  console.log(JSON.stringify({ planned: plan.filter((p) => p.originalId).length, retired: report.retired.length,
    unmatched: report.unmatched.map((p) => p.file), evidence: path.relative(root, output) }));
})().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
