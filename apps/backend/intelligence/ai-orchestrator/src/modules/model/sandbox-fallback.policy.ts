/** Bounded, capability-compatible fallback; failed clients cool down across requests. */
export class SandboxFallbackPolicy {
  private readonly unavailableUntil = new WeakMap<object, number>();
  select(service: any, vision: boolean, current: any): Array<{ id: string; client: any }> {
    const active = service.listActiveModelsForRouting();
    const preferred = vision ? service.getPreferredVisionModel() : null;
    const models = preferred ? [preferred, ...active.filter((m: any) => m.id !== preferred.id)] : active;
    const seen = new Set<any>();
    const candidates: Array<{ id: string; client: any }> = [];
    for (const model of models) {
      if (model.status === 'inactive' || model.hasApiKey === false) continue;
      if (vision && !service.isVisionCapableModel(model)) continue;
      const config = model.config || {};
      const inputs = config.input || [];
      const outputs = config.output || [];
      const tags = config.routing_tags || [];
      if (!vision && inputs.length && !inputs.includes('text')) continue;
      if (outputs.length && !outputs.includes('text')) continue;
      if (tags.some((t: string) => ['audio_transcription', 'image_generation', 'embedding'].includes(t)) && !inputs.includes('text')) continue;
      const client = service.getClient(model.id);
      if (!client || client === current || seen.has(client) || (this.unavailableUntil.get(client) || 0) > Date.now()) continue;
      seen.add(client);
      candidates.push({ id: model.name || model.id, client });
      if (candidates.length === 2) break;
    }
    return candidates;
  }
  failed(client: object, error: any) {
    const status = error?.status || error?.response?.status;
    const message = String(error?.message || '').toLowerCase();
    const permanent = [400, 401, 403, 404].includes(status) || /api.?key|authentication|model.*(not exist|not found)/.test(message);
    this.unavailableUntil.set(client, Date.now() + (permanent ? 300000 : 60000));
  }
}
