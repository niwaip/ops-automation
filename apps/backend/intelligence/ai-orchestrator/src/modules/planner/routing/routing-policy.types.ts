export const ROUTING_SIGNAL_GROUPS = [
  'sequential',
  'processing',
  'generation',
  'documentSource',
  'artifact',
  'search',
  'summarize',
  'markdown',
  'uncoveredAction',
] as const;

export type RoutingSignalGroup = (typeof ROUTING_SIGNAL_GROUPS)[number];

export const ROUTING_CAPABILITY_ROLES = ['search', 'markdownWriter', 'documentExtractor'] as const;

export type RoutingCapabilityRole = (typeof ROUTING_CAPABILITY_ROLES)[number];

export interface RoutingIntentEquivalence {
  canonical: string;
  aliases: string[];
}

export interface RoutingPolicySnapshotV1 {
  schemaVersion: 'routing-policy/v1';
  version: string;
  source: 'builtin' | 'environment' | 'file';
  digest: string;
  signals: Record<RoutingSignalGroup, string[]>;
  terminalActions: Record<string, string[]>;
  capabilityRoles: Record<RoutingCapabilityRole, string[]>;
  intentNormalization: {
    equivalences: RoutingIntentEquivalence[];
    stopWords: string[];
  };
}

/**
 * Managed policy updates are additive by design. Learned evidence may propose a
 * patch, but cannot silently remove a production routing guard or Recipe signal.
 */
export interface RoutingPolicyPatchV1 {
  schemaVersion: 'routing-policy-patch/v1';
  version: string;
  additions?: {
    signals?: Partial<Record<RoutingSignalGroup, string[]>>;
    terminalActions?: Record<string, string[]>;
    capabilityRoles?: Partial<Record<RoutingCapabilityRole, string[]>>;
    intentNormalization?: {
      equivalences?: Record<string, string[]>;
      stopWords?: string[];
    };
  };
}
