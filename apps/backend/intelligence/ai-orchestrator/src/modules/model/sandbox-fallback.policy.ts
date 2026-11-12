const NON_CHAT_CAPABILITY_TAGS = ['audio_transcription', 'image_generation', 'embedding'];
const PERMANENT_ERROR_PATTERN =
  /api.?key|authentication|unauthorized|forbidden|missing.*auth|invalid.*key|model.*(not exist|not found)|does not exist/i;

export function isPermanentFallbackError(error: any): boolean {
  const status = error?.status ?? error?.response?.status;
  if ([400, 401, 403, 404].includes(status)) return true;
  const message = String(error?.message || '');
  return PERMANENT_ERROR_PATTERN.test(message);
}

/** Bounded, capability-compatible fallback; failed clients cool down across requests. */
export class SandboxFallbackPolicy {
  private readonly unavailableUntil = new WeakMap<object, number>();
  select(service: any, vision: boolean, current: any, limit = 2): Array<{ id: string; client: any }> {
    const active = service.listActiveModelsForRouting();
    const preferred = vision ? service.getPreferredVisionModel() : null;
    const models = preferred ? [preferred, ...active.filter((m: any) => m.id !== preferred.id)] : active;
    const seen = new Set<any>();
    const candidates: Array<{ id: string; client: any }> = [];
    const maxCandidates = Math.max(1, limit);
    for (const model of models) {
      if (model.status === 'inactive' || model.hasApiKey === false) continue;
      if (vision && !service.isVisionCapableModel(model)) continue;
      const config = model.config || {};
      const inputs = config.input || [];
      const outputs = config.output || [];
      const tags = config.routing_tags || [];
      const scope = config.default_scope || {};
      if (!vision && inputs.length && !inputs.includes('text')) continue;
      if (outputs.length && !outputs.includes('text')) continue;
      if (
        scope.audio_transcription === true ||
        scope.image_generation === true ||
        scope.embedding === true ||
        tags.some((t: string) => NON_CHAT_CAPABILITY_TAGS.includes(t))
      ) {
        continue;
      }
      const client = service.getClient(model.id);
      if (!client || client === current || seen.has(client) || (this.unavailableUntil.get(client) || 0) > Date.now()) continue;
      seen.add(client);
      candidates.push({ id: model.name || model.id, client });
      if (candidates.length >= maxCandidates) break;
    }
    return candidates;
  }
  failed(client: object, error: any) {
    this.unavailableUntil.set(
      client,
      Date.now() + (isPermanentFallbackError(error) ? 3_600_000 : 60_000)
    );
  }
}
