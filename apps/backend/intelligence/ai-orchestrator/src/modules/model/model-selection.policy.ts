import { AIModelDTO } from '../../interfaces';
import {
  getCapabilityWeight,
  getDefaultScopeWeight,
} from './model-config.helpers';

export interface ModelSelectionPolicyContext {
  mode?: 'chat' | 'task' | 'audio_transcription' | 'ocr' | 'vision' | 'image_generation';
  userRoles?: string[];
}

export function selectScopedDefaultModel(
  scope:
    | 'global'
    | 'admin_chat'
    | 'admin_task'
    | 'audio_transcription'
    | 'ocr'
    | 'image_generation',
  activeModels: AIModelDTO[]
): AIModelDTO | null {
  return activeModels.find((model) => model.config.default_scope?.[scope] === true) || null;
}

export function isVisionCapableModel(model: AIModelDTO | null | undefined): boolean {
  if (!model || model.status !== 'active') {
    return false;
  }
  if (model.config?.default_scope?.['ocr'] === true) {
    return true;
  }
  const tags = (model.config?.routing_tags || []).map((t) => String(t).toLowerCase());
  if (
    tags.some(
      (t) =>
        t.includes('vision') ||
        t.includes('multimodal') ||
        t.includes('image') ||
        t.includes('ocr')
    )
  ) {
    return true;
  }
  const name = (model.name || '').toLowerCase();
  const provider = (model.provider || '').toLowerCase();
  if (provider === 'gemini' || name.includes('gemini')) {
    return true;
  }
  if (
    name.includes('vision') ||
    name.includes('-vl') ||
    name.includes('vl-') ||
    name.includes('gpt-4o') ||
    name.includes('claude-3') ||
    name.includes('omni')
  ) {
    return true;
  }
  return false;
}

export function sortFallbackCandidates(models: AIModelDTO[]): AIModelDTO[] {
  return [...models].sort((left, right) => {
    const scopeDelta = getDefaultScopeWeight(right) - getDefaultScopeWeight(left);
    if (scopeDelta !== 0) {
      return scopeDelta;
    }
    const capabilityDelta = getCapabilityWeight(right) - getCapabilityWeight(left);
    if (capabilityDelta !== 0) {
      return capabilityDelta;
    }
    return 0;
  });
}

export function getPreferredImageGenerationModel(
  activeModels: AIModelDTO[],
  _context?: ModelSelectionPolicyContext
): AIModelDTO | null {
  const scopedModel = selectScopedDefaultModel('image_generation', activeModels);
  if (scopedModel) {
    return scopedModel;
  }

  const candidate = activeModels.find((m) => {
    const tags = (m.config?.routing_tags || []).map((t) => String(t).toLowerCase());
    const name = (m.name || '').toLowerCase();
    return (
      tags.includes('image_generation') ||
      tags.includes('image') ||
      name.includes('imagen') ||
      name.includes('dall-e') ||
      name.includes('flux') ||
      name.includes('wanx') ||
      name.includes('cogview')
    );
  });
  return candidate || null;
}

export function getPreferredVisionModel(
  activeModels: AIModelDTO[],
  defaultModel: AIModelDTO | null,
  context?: ModelSelectionPolicyContext
): AIModelDTO | null {
  const ocrModel = selectScopedDefaultModel('ocr', activeModels);
  if (ocrModel && isVisionCapableModel(ocrModel)) {
    return ocrModel;
  }

  const defaultChat = getPreferredDefaultModel(
    { mode: 'chat', userRoles: context?.userRoles },
    activeModels,
    defaultModel,
    () => null,
    () => null
  );
  if (defaultChat && isVisionCapableModel(defaultChat)) {
    return defaultChat;
  }

  const sortedCandidates = sortFallbackCandidates(activeModels);
  const visionCandidate = sortedCandidates.find((m) => isVisionCapableModel(m));
  if (visionCandidate) {
    return visionCandidate;
  }

  return defaultModel;
}

export function getPreferredDefaultModel(
  context: ModelSelectionPolicyContext | undefined,
  activeModels: AIModelDTO[],
  defaultModel: AIModelDTO | null,
  getPreferredImageGenFn: () => AIModelDTO | null,
  getPreferredVisionFn: () => AIModelDTO | null
): AIModelDTO | null {
  const userRoles = context?.userRoles || [];
  const isAdmin = userRoles.includes('admin');

  if (context?.mode === 'image_generation') {
    return selectScopedDefaultModel('image_generation', activeModels) || getPreferredImageGenFn();
  }

  if (context?.mode === 'audio_transcription') {
    return selectScopedDefaultModel('audio_transcription', activeModels) || defaultModel;
  }

  if (context?.mode === 'ocr' || context?.mode === 'vision') {
    return (
      selectScopedDefaultModel('ocr', activeModels) ||
      getPreferredVisionFn() ||
      defaultModel
    );
  }

  if (context?.mode === 'task') {
    return (
      selectScopedDefaultModel('admin_task', activeModels) ||
      selectScopedDefaultModel('admin_chat', activeModels) ||
      selectScopedDefaultModel('global', activeModels) ||
      defaultModel
    );
  }

  if (isAdmin && context?.mode === 'chat') {
    return (
      selectScopedDefaultModel('admin_chat', activeModels) ||
      selectScopedDefaultModel('global', activeModels) ||
      defaultModel
    );
  }

  return selectScopedDefaultModel('global', activeModels) || defaultModel;
}

export function resolveFallbackModelIds(
  currentModel: AIModelDTO | null,
  activeModels: AIModelDTO[],
  getProviderGroupingKey: (model: AIModelDTO) => string,
  strategy?: {
    groupOrder: Array<'same_provider' | 'cross_provider'>;
    includeCurrentModel: boolean;
  }
): string[] {
  if (!currentModel) {
    return sortFallbackCandidates(activeModels).map((model) => model.id);
  }

  const sameProviderModels = sortFallbackCandidates(
    activeModels.filter((model) => {
      return (
        model.id !== currentModel.id &&
        getProviderGroupingKey(model) === getProviderGroupingKey(currentModel)
      );
    })
  );
  const crossProviderModels = sortFallbackCandidates(
    activeModels.filter((model) => {
      return (
        model.id !== currentModel.id &&
        getProviderGroupingKey(model) !== getProviderGroupingKey(currentModel)
      );
    })
  );
  const groupedCandidates = {
    same_provider: sameProviderModels.map((model) => model.id),
    cross_provider: crossProviderModels.map((model) => model.id),
  };
  const groupOrder = strategy?.groupOrder || ['same_provider', 'cross_provider'];
  const orderedCandidates = groupOrder.flatMap((group) => groupedCandidates[group]);

  return [
    ...(strategy?.includeCurrentModel === false ? [] : [currentModel.id]),
    ...orderedCandidates,
  ];
}
