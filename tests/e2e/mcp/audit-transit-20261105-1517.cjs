// Read-only audit: locate the exact transit turn, never export connection credentials.
const fs = require('node:fs');
const Redis = require('/workspace/apps/backend/intelligence/ai-orchestrator/node_modules/ioredis');
const { PrismaClient } = require('/workspace/apps/backend/platform/src/generated/prisma');
const redis = new Redis({ host: process.env.REDIS_HOST || 'redis', port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD });
const db = new PrismaClient();
const output = process.argv[3] || '/workspace/docs/artifacts/reviews/mcp-transit-audit-evidence-2026-11-05-1517.json';
const targetTime = process.argv[2] || '2026-11-05T07:1';
function sanitize(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.replace(/([?&](?:key|token|api_key|access_token)=)[^\s&#"<>]*/gi, '$1[REDACTED]');
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, /^(encryptedData|password|token|apiKey|authorization|contractToken)$/i.test(k) ? '[REDACTED]' : sanitize(v)]));
  return value;
}
(async () => {
  const admin = await db.user.findUnique({ where: { username: 'admin' }, select: { id: true } });
  const matches = [];
  let cursor = '0';
  do {
    const scanned = await redis.scan(cursor, 'MATCH', 'chat_session:*', 'COUNT', 100);
    cursor = scanned[0];
    for (const key of scanned[1]) {
      const raw = await redis.get(key); if (!raw || !raw.includes('中星海上名庭')) continue;
      const session = JSON.parse(raw);
      if (session.session?.ownerUserId !== admin.id) continue;
      const history = session.history || [];
      for (let i = 0; i < history.length; i++) {
        const m = history[i];
        if (m.role !== 'user' || !String(m.content).includes('中星海上名庭')) continue;
        if (!String(m.timestamp).startsWith(targetTime)) continue;
        const answer = history.slice(i+1).find(item => item.role === 'assistant');
        matches.push({ redisKey: key, session: session.session, request: m, answer });
      }
    }
  } while (cursor !== '0');
  if (matches.length !== 1) {
    console.log(JSON.stringify({ matchCount: matches.length, matches: matches.map(m => ({ key: m.redisKey, time: m.request.timestamp, prompt: m.request.content, answerTime: m.answer?.timestamp })) }));
    throw new Error('Exact target turn is ambiguous or missing');
  }
  const target = matches[0];
  const start = new Date(new Date(target.request.timestamp).getTime()-60000);
  const end = new Date(new Date(target.answer.timestamp).getTime()+60000);
  const calls = await db.mcpInvocation.findMany({ where: { userId: admin.id, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'asc' } });
  const connections = await db.mcpConnection.findMany({ where: { OR: [{ ownerUserId: admin.id }, ...(target.session.orgId ? [{ orgId: target.session.orgId }] : [])] } });
  const details = [];
  for (const c of connections) {
    const revision = await db.mcpConnectionRevision.findUnique({ where: { id: c.activeRevisionId } });
    const bindings = await db.mcpToolBinding.findMany({ where: { connectionId: c.id }, select: { id: true, revisionId: true, remoteName: true, description: true, inputSchema: true, effect: true, status: true, createdAt: true, allowedRoles: true } });
    const authorization = await db.userMcpAuthorization.findUnique({ where: { userId_connectionId: { userId: admin.id, connectionId: c.id } }, select: { revisionId: true, status: true, createdAt: true, updatedAt: true } });
    const { endpoint, authType, authLocation, queryParameter } = revision?.config || {};
    details.push({ ...c, revision: { id: revision?.id, createdAt: revision?.createdAt, endpoint, authType, authLocation, queryParameter }, authorizationMetadata: authorization, bindings });
  }
  const r = await fetch('http://platform:3001/mcp-integrations/skills?mode=personal', { headers: { 'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET, 'x-user-id': admin.id, 'x-user-role': 'admin' } });
  const catalog = r.ok ? await r.json() : { status: r.status };
  const report = sanitize({ auditedAt: new Date().toISOString(), ...target, window: { start, end }, calls, connections: details, currentCatalog: catalog });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ session: report.session, request: report.request, answerTime: report.answer.timestamp,
    trace: report.answer.metadata?.executionTrace, calls: report.calls.map(c => ({ id: c.id, bindingId: c.bindingId, status: c.status, createdAt: c.createdAt })), catalog: report.currentCatalog }));
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => { redis.disconnect(); return db.$disconnect(); });
