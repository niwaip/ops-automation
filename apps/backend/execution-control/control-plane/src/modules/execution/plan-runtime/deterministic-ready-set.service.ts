import { Injectable } from '@nestjs/common';

interface ReadySetStep {
  id: string;
  planNodeId?: string | null;
  status: string;
  dependsOnJson?: unknown;
  idempotencyKey?: string | null;
  leaseExpiresAt?: Date | string | null;
}

@Injectable()
export class DeterministicReadySetService {
  compute(steps: ReadySetStep[], planJson?: unknown, now = new Date()): ReadySetStep[] {
    const completed = new Set(
      steps
        .filter((step) => step.status === 'succeeded')
        .map((step) => step.planNodeId)
        .filter((value): value is string => Boolean(value))
    );
    return steps.filter((step) => {
      const claimable =
        step.status === 'pending' ||
        (step.status === 'running' &&
          (!step.leaseExpiresAt || new Date(step.leaseExpiresAt).getTime() <= now.getTime()));
      if (!claimable) return false;
      const dependencies = Array.isArray(step.dependsOnJson)
        ? step.dependsOnJson.filter((value): value is string => typeof value === 'string')
        : [];
      return dependencies.every((dependency) => completed.has(dependency));
    });
  }

  selectSafeParallelBatch(ready: ReadySetStep[], planJson?: unknown, limit = 4): ReadySetStep[] {
    if (ready.length <= 1) return ready.slice(0, 1);
    const nodes = Array.isArray((planJson as any)?.nodes) ? (planJson as any).nodes : [];
    const nodeById = new Map(nodes.map((node: any) => [node.nodeId, node]));
    const selected: ReadySetStep[] = [];
    const scopes = new Set<string>();
    for (const step of ready) {
      const node: any = nodeById.get(step.planNodeId || '');
      const sideEffectClass = String(
        node?.sideEffectClass || node?.metadata?.sideEffectClass || 'unknown'
      ).toLowerCase();
      if (!['none', 'read'].includes(sideEffectClass)) continue;
      const scope = String(node?.metadata?.idempotencyScope || step.idempotencyKey || step.id);
      if (scopes.has(scope)) continue;
      scopes.add(scope);
      selected.push(step);
      if (selected.length >= Math.max(1, limit)) break;
    }
    return selected.length > 0 ? selected : ready.slice(0, 1);
  }
}
