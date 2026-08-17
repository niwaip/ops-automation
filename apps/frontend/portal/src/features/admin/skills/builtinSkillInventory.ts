import type { BuiltinSkillInventoryDTO, SkillConfigDTO } from '@/api/skill';

type JsonSchema = {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
};

type BuiltinManifest = {
  spec?: {
    planner?: {
      triggerKeywords?: string[];
      matchSummary?: string;
      runtimeType?: string;
    };
    contracts?: {
      input?: { schema?: JsonSchema };
      output?: { schema?: Record<string, unknown> };
    };
    workflow?: { engine?: string };
    runtime?: { handlerKey?: string; adapterRoute?: string };
  };
};

const toParamType = (type: unknown): 'string' | 'number' | 'date' | 'boolean' => {
  if (type === 'integer' || type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  return 'string';
};

const toParamsSchema = (schema?: JsonSchema): SkillConfigDTO['paramsSchema'] => {
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const properties = Object.fromEntries(
    Object.entries(schema?.properties || {}).map(([name, definition]) => {
      const defaultValue = definition.default;
      return [
        name,
        {
          type: toParamType(definition.type),
          description:
            typeof definition.description === 'string' ? definition.description : name,
          required: required.includes(name),
          ...(typeof defaultValue === 'string' ||
          typeof defaultValue === 'number' ||
          typeof defaultValue === 'boolean'
            ? { default: defaultValue }
            : {}),
        },
      ];
    })
  );

  return { properties, required };
};

const selectDeploymentStatus = (skill: BuiltinSkillInventoryDTO): string => {
  const deployments = skill.activeVersion?.deployments || [];
  const healthy = deployments.find(
    (deployment) => deployment.status === 'healthy' || deployment.status === 'deployed'
  );
  return healthy?.status || deployments[0]?.status || 'not_deployed';
};

export const isRegistryBuiltinSkill = (skill: SkillConfigDTO): boolean =>
  Boolean(skill.builtinMetadata);

export const toSkillConfigView = (skill: BuiltinSkillInventoryDTO): SkillConfigDTO => {
  const manifest = (skill.activeVersion?.manifest || {}) as BuiltinManifest;
  const planner = manifest.spec?.planner;
  const inputSchema = manifest.spec?.contracts?.input?.schema;
  const handlerKey = manifest.spec?.runtime?.handlerKey;
  const deploymentStatus = selectDeploymentStatus(skill);
  const hasHealthyActiveVersion =
    Boolean(skill.activeVersion) &&
    (deploymentStatus === 'healthy' || deploymentStatus === 'deployed');

  return {
    id: skill.capabilityKey,
    name: skill.displayName || skill.capabilityKey,
    description: skill.description || planner?.matchSummary || '',
    triggerKeywords: planner?.triggerKeywords || [],
    paramsSchema: toParamsSchema(inputSchema),
    executionFlowTemplateIds: [],
    executionFlow: [],
    tools: handlerKey ? [handlerKey] : [],
    effectiveTools: handlerKey ? [handlerKey] : [],
    apiEndpoints: {
      runtimeMetadata: {
        matchSummary: planner?.matchSummary,
        sourceType: 'builtin_skill',
        runtimeType: planner?.runtimeType || manifest.spec?.workflow?.engine,
        outputParams: manifest.spec?.contracts?.output?.schema,
      },
    },
    isActive: skill.isEnabled,
    isPublished: skill.isEnabled && hasHealthyActiveVersion,
    publishedReleaseStatus: skill.activeVersion ? 'active' : 'inactive',
    publishedDeploymentStatus: deploymentStatus,
    publishedSourceType: 'builtin',
    builtinMetadata: {
      registryId: skill.id,
      capabilityKey: skill.capabilityKey,
      aliases: skill.aliases,
      owner: skill.owner,
      category: skill.category,
      defaultAccess: skill.defaultAccess,
      lifecycle: skill.lifecycle,
      activeVersion: skill.activeVersion?.definitionVersion,
      definitionDigest: skill.activeVersion?.definitionDigest,
      attestationId: skill.activeVersion?.attestationId || undefined,
      versionCount: skill.versions.length,
    },
  };
};

export const mergeSkillInventory = (
  configuredSkills: SkillConfigDTO[],
  builtinSkills: BuiltinSkillInventoryDTO[]
): SkillConfigDTO[] => {
  const builtinViews = builtinSkills.map(toSkillConfigView);
  const builtinKeys = new Set(
    builtinViews.flatMap((skill) => [
      skill.id.toLowerCase(),
      ...(skill.builtinMetadata?.aliases || []).map((alias) => alias.toLowerCase()),
    ])
  );
  const configuredWithoutDuplicates = configuredSkills.filter(
    (skill) =>
      !builtinKeys.has(skill.id.toLowerCase()) &&
      !builtinKeys.has(skill.name.toLowerCase())
  );
  return [...configuredWithoutDuplicates, ...builtinViews];
};
