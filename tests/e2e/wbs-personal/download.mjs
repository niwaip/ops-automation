// Download only the two observed local W06 deliverables, using existing test auth.
import fs from 'node:fs/promises';
import path from 'node:path';
const root = process.argv[2];
const auth = JSON.parse(await fs.readFile('/tmp/wbs-e2e-login.json', 'utf8'));
const answer = await fs.readFile(path.join(root, 'W06.answer.txt'), 'utf8');
const userId = auth.user?.id || 'd6f71c6c-b359-450d-b706-175b7c9866f2';
const results = [];
for (const name of ['WBS成本中心汇总.xlsx', '名WBS成本中心汇总.xlsx']) {
  const encName = encodeURIComponent(name);
  const match = answer.match(new RegExp(`/api/ai/chat/workspace-files/([^/]+)/${encName}`));
  if (!match) continue;
  const relative = match[0];
  const res = await fetch(`http://127.0.0.1:3007${relative.slice(4)}`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` }, signal: AbortSignal.timeout(30000),
  });
  const record = { name, status: res.status };
  if (res.ok) {
    const bytes = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(path.join(root, name), bytes);
    record.bytes = bytes.length;
  }
  results.push(record);
}
await fs.writeFile(path.join(root, 'downloads.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
