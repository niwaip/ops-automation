import { createHash } from 'node:crypto';

/** Safe metadata only: model text may contain secrets and must not enter errors/logs. */
export class SandboxStreamGuardError extends Error {
  constructor(readonly code: string, readonly details: Record<string, unknown> = {}) {
    super(code);
    this.name = 'SandboxStreamGuardError';
  }
}

function repeatedSuffix(text: string, target: string) {
  const minimum = target === 'content' ? 100 : 50;
  for (let size = target === 'content' ? 20 : 12; size <= Math.min(400, text.length / 3); size++) {
    const pattern = text.slice(-size);
    if (new Set(pattern.trim()).size <= 3 || (pattern.match(/[\u4e00-\u9fa5a-zA-Z]/g) || []).length < 6) continue;
    let count = 1;
    for (let end = text.length - size; end >= size && text.slice(end - size, end) === pattern; end -= size) count++;
    if (count >= 3 && count * size >= minimum) {
      return { target, patternLength: size, repeatCount: count,
        patternSha256: createHash('sha256').update(pattern).digest('hex') };
    }
  }
  return undefined;
}

/** Checks upstream deltas before buffering. Limits memory, even when chunks are tiny. */
export class SandboxStreamGuard {
  private tails = { content: '', thought: '' };
  private bytes = 0;
  private frames = 0;
  constructor(private readonly maxBytes = 2 * 1024 * 1024, private readonly maxFrames = 32768) {}

  accept(chunk: string, meta?: any) {
    this.bytes += Buffer.byteLength(JSON.stringify({ chunk, meta }));
    if (++this.frames > this.maxFrames || this.bytes > this.maxBytes) {
      throw new SandboxStreamGuardError('MODEL_STREAM_LIMIT');
    }
    const thought = meta?.reasoning_content || meta?.delta?.reasoning_content || meta?.delta?.reasoning || meta?.delta?.thought || '';
    for (const [target, value] of [['content', chunk], ['thought', thought]] as const) {
      if (typeof value !== 'string' || !value) continue;
      this.tails[target] = (this.tails[target] + value.replace(/<\|(?:mask_start|mask_end|im_start|im_end|fim_prefix|fim_suffix|fim_middle|extra_\d+)\|?>/g, '')).slice(-3000);
      const repeat = repeatedSuffix(this.tails[target], target);
      if (repeat) throw new SandboxStreamGuardError('MODEL_REPETITION', repeat);
    }
  }
}

/** Never throw from an EventEmitter callback: abort and reject the owning request instead. */
export async function guardedSandboxStream(
  client: any, request: any, emit: (chunk: string, meta?: any) => void, reasoning: any,
  options: { buffered: boolean; mcpSelection?: boolean },
) {
  if (!options.buffered) return client.chatCompletionStream(request, emit, reasoning);
  const guard = new SandboxStreamGuard();
  const abort = new AbortController();
  let stopped = false;
  let rejectGuard: (error: Error) => void;
  const failure = new Promise<never>((_, reject) => { rejectGuard = reject; });
  const fail = (error: Error) => {
    if (stopped) return;
    stopped = true;
    rejectGuard(error);
    abort.abort(error);
  };
  const onAbort = () => fail(new Error('Model request cancelled'));
  request.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => fail(new SandboxStreamGuardError('MODEL_GENERATION_BUDGET')),
    options.mcpSelection ? 45_000 : 180_000);
  try {
    if (request.signal?.aborted) onAbort();
    const work = Promise.resolve().then(() => {
      if (stopped) return;
      return client.chatCompletionStream({ ...request, signal: abort.signal }, (chunk: string, meta?: any) => {
        if (stopped) return;
        try { guard.accept(chunk, meta); emit(chunk, meta); }
        catch (error) { fail(error as Error); }
      }, reasoning);
    });
    return await Promise.race([failure, work]);
  } finally {
    stopped = true;
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', onAbort);
  }
}
