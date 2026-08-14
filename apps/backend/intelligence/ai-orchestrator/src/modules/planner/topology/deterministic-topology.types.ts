/**
 * 阶段一内部任务拓扑定义 (DeterministicTopologyDraftV1)
 * 只包含节点依赖关系与候选别名，不生成参数 Schema、版本、UUID 或 Path
 */

export interface TopologyNodeV1 {
  ref: string; // 本地引用名，例如 n1, n2, n3
  capabilityKey: string; // 选中的 Skill ID / Name 或 Operation ID 标识
  dependsOn: string[]; // 依赖的前序节点 ref 列表
}

export interface DeterministicTopologyDraftV1 {
  schemaVersion: 'deterministic-topology/v1';
  objective: string;
  matchDecision: 'matched' | 'no_match';
  matchConfidence: number;
  matchReason: string;
  recipeName?: string; // 命中的 Recipe 名称 (若命中 Recipe)
  nodes: TopologyNodeV1[];
  finalNodeRef: string | null;
  finalOutputKind: 'value' | 'artifact';
}
