const Redis = require('ioredis');
const { resolveActionIntentToLocator } = require('./dist/modules/browser/intent/atomic-parsers/action-target-resolver.service');
const { BrowserCommandContextNormalizerService } = require('./dist/modules/browser/intent/atomic-parsers/browser-command-context-normalizer.service');

const redis = new Redis({ host: 'redis', port: 6379, password: 'redis_secret' });

async function main() {
  const data = await redis.get('recorder_debug_session:recorder-debug-1784260289390');
  if (!data) {
    console.log('Session not found');
    process.exit(0);
  }
  const session = JSON.parse(data);
  const obs = session.lastObservation;

  const normalizer = new BrowserCommandContextNormalizerService();
  const context = normalizer.normalizeContext({
    availableCandidates: obs.candidates,
    currentPageUrl: session.currentPageUrl,
    lastObservationText: obs.text,
  });

  const intent = {
    source: 'ai-plan',
    rawTarget: '详情',
    rowHint: { index: 1 },
    semanticHint: 'detail'
  };

  console.log('Resolving intent:', intent);
  
  const candidates = context.availableCandidates || [];
  console.log('Candidates count:', candidates.length);

  const resolved = resolveActionIntentToLocator(intent, {
    availableCandidates: candidates,
    currentPageUrl: context.currentPageUrl,
    lastObservationText: context.lastObservationText,
  });

  console.log('Resolved target:', JSON.stringify(resolved, null, 2));

  if (resolved) {
    const winner = candidates.find(c => c.candidateId === resolved.matchedCandidateId);
    console.log('Winner candidate:', JSON.stringify(winner, null, 2));
  } else {
    console.log('No candidate matched!');
  }

  process.exit(0);
}

main().catch(console.error);
