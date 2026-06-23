#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PrismaClient, TemplateFormat, TemplateType, Prisma } = require('@prisma/client');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const templatesOnly = args.has('--templates-only');
const outputsOnly = args.has('--outputs-only');
const skillsOnly = args.has('--skills-only');
const reportArg = (process.argv.find((s) => s.startsWith('--report=')) || '').split('=')[1] || '';

const projectRoot = path.resolve(__dirname, '..');
const templatesDir = process.env.TEMPLATES_DIR || path.join(projectRoot, 'templates');
const outputsDir = process.env.OUTPUTS_DIR || path.join(projectRoot, 'outputs');

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function safeReadJson(filePath) {
  try {
    return readJson(filePath);
  } catch (error) {
    console.warn(`[warn] Failed to read JSON: ${filePath}`);
    console.warn(String(error));
    return null;
  }
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function parseDate(value) {
  return typeof value === 'string' ? new Date(value) : undefined;
}

function normalizeFormat(format) {
  switch (format) {
    case 'xlsx':
      return TemplateFormat.xlsx;
    case 'pptx':
      return TemplateFormat.pptx;
    case 'html':
      return TemplateFormat.html;
    case 'docx':
    default:
      return TemplateFormat.docx;
  }
}

function extractVariablesFromSuggestions(suggestions) {
  if (!Array.isArray(suggestions)) {
    return [];
  }

  return suggestions
    .filter((item) => isRecord(item) && item.applied && typeof item.suggestedName === 'string')
    .map((item) => item.suggestedName);
}

function extractLoops(meta) {
  if (Array.isArray(meta.loops)) {
    return meta.loops;
  }

  const config = meta.templateConfig ?? meta.config;
  if (isRecord(config) && Array.isArray(config.tableLoops)) {
    return config.tableLoops
      .filter((item) => isRecord(item) && typeof item.arrayPath === 'string')
      .map((item) => ({ arrayPath: item.arrayPath }));
  }

  return [];
}

function resolveTemplateFilePath(meta) {
  const format = meta.format || 'docx';
  const binaryPath = path.join(templatesDir, `${meta.id}.${format}`);
  if (fileExists(binaryPath)) {
    return binaryPath;
  }

  const textFallback = path.join(templatesDir, `${meta.id}_content.txt`);
  if (fileExists(textFallback)) {
    return textFallback;
  }

  return binaryPath;
}

function resolveSkillFileCandidates() {
  const candidates = [];
  if (fileExists(templatesDir)) {
    for (const fileName of fs.readdirSync(templatesDir)) {
      if (fileName.startsWith('skill_') && fileName.endsWith('.json')) {
        candidates.push(path.join(templatesDir, fileName));
      }
    }
  }

  const skillsSubdir = path.join(templatesDir, 'skills');
  if (fileExists(skillsSubdir)) {
    for (const fileName of fs.readdirSync(skillsSubdir)) {
      if (fileName.endsWith('.json')) {
        candidates.push(path.join(skillsSubdir, fileName));
      }
    }
  }

  return candidates;
}

function normalizeVariableName(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const carboneMatch = trimmed.match(/^\{d\.(.*)\}$/);
  if (carboneMatch) {
    return carboneMatch[1];
  }

  return trimmed.startsWith('d.') ? trimmed.slice(2) : trimmed;
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function buildSkillSignature(skill) {
  if (!isRecord(skill)) {
    return null;
  }

  const clone = JSON.parse(JSON.stringify(skill));
  delete clone.id;
  delete clone.templateId;
  delete clone.updatedAt;
  return JSON.stringify(clone);
}

function buildSkillParameterSignature(skill) {
  if (!isRecord(skill) || !Array.isArray(skill.parameters)) {
    return null;
  }

  const parameters = skill.parameters
    .filter((item) => isRecord(item) && typeof item.name === 'string')
    .map((item) => normalizeVariableName(item.name))
    .filter((value) => typeof value === 'string');

  return JSON.stringify([...new Set(parameters)].sort());
}

function buildTemplateVariableSignature(meta) {
  const variables = new Set();

  if (Array.isArray(meta.variables)) {
    for (const variable of meta.variables) {
      const normalized = normalizeVariableName(variable);
      if (normalized) {
        variables.add(normalized);
      }
    }
  }

  if (Array.isArray(meta.suggestions)) {
    for (const suggestion of meta.suggestions) {
      if (
        !isRecord(suggestion) ||
        !suggestion.applied ||
        typeof suggestion.suggestedName !== 'string'
      ) {
        continue;
      }

      const match = suggestion.suggestedName.match(/^\{d\.(.*)\}$/);
      const normalized = normalizeVariableName(match ? match[1] : suggestion.suggestedName);
      if (normalized) {
        variables.add(normalized);
      }
    }
  }

  return JSON.stringify([...variables].sort());
}

function addUniqueValue(map, key, value) {
  if (!key || !value) {
    return;
  }

  if (!map.has(key)) {
    map.set(key, new Set());
  }

  map.get(key).add(value);
}

function buildSkillInferenceContext(skillFiles) {
  const skillSignatureToTemplateIds = new Map();
  const templateVariableSignatureToTemplateIds = new Map();

  for (const fullPath of skillFiles) {
    const skill = safeReadJson(fullPath);
    if (!skill || typeof skill.templateId !== 'string') {
      continue;
    }

    addUniqueValue(skillSignatureToTemplateIds, buildSkillSignature(skill), skill.templateId);
  }

  if (fileExists(templatesDir)) {
    const templateMetaFiles = fs
      .readdirSync(templatesDir)
      .filter((fileName) => fileName.endsWith('.json') && !fileName.startsWith('skill_'));

    for (const fileName of templateMetaFiles) {
      const meta = safeReadJson(path.join(templatesDir, fileName));
      if (!meta || typeof meta.id !== 'string') {
        continue;
      }

      addUniqueValue(
        templateVariableSignatureToTemplateIds,
        buildTemplateVariableSignature(meta),
        meta.id
      );
    }
  }

  return {
    skillSignatureToTemplateIds,
    templateVariableSignatureToTemplateIds,
  };
}

function inferTemplateId(skill, inferenceContext) {
  if (!skill || typeof skill.templateId === 'string') {
    return {
      templateId: typeof skill?.templateId === 'string' ? skill.templateId : null,
      reason: typeof skill?.templateId === 'string' ? 'direct' : null,
    };
  }

  const skillSignature = buildSkillSignature(skill);
  const matchedTemplateIds = skillSignature
    ? [...(inferenceContext.skillSignatureToTemplateIds.get(skillSignature) ?? [])]
    : [];
  if (matchedTemplateIds.length === 1) {
    return {
      templateId: matchedTemplateIds[0],
      reason: 'skill-signature',
    };
  }

  const parameterSignature = buildSkillParameterSignature(skill);
  const parameterMatchedTemplateIds = parameterSignature
    ? [...(inferenceContext.templateVariableSignatureToTemplateIds.get(parameterSignature) ?? [])]
    : [];
  if (parameterMatchedTemplateIds.length === 1) {
    return {
      templateId: parameterMatchedTemplateIds[0],
      reason: 'parameter-signature',
    };
  }

  const skillParams = JSON.parse(parameterSignature || '[]');
  const jaccardCandidates = [];
  for (const [sig, idsSet] of inferenceContext.templateVariableSignatureToTemplateIds.entries()) {
    const tmplVars = JSON.parse(sig || '[]');
    const a = new Set(skillParams);
    const b = new Set(tmplVars);
    let inter = 0;
    for (const v of a) {
      if (b.has(v)) inter += 1;
    }
    const union = new Set([...a, ...b]).size || 1;
    const ratio = inter / union;
    if (ratio >= 0.8) {
      const ids = [...idsSet];
      for (const id of ids) {
        jaccardCandidates.push({ id, ratio });
      }
    }
  }
  if (jaccardCandidates.length > 0) {
    jaccardCandidates.sort((x, y) => y.ratio - x.ratio);
    const best = jaccardCandidates[0];
    const ties = jaccardCandidates.filter((c) => c.ratio === best.ratio && c.id !== best.id);
    if (ties.length === 0) {
      return {
        templateId: best.id,
        reason: `parameter-jaccard-${best.ratio.toFixed(2)}`,
      };
    }
  }

  return {
    templateId: null,
    reason: null,
  };
}

function getSkillReasonPriority(reason) {
  if (reason === 'direct') {
    return 4;
  }
  if (reason === 'skill-signature') {
    return 3;
  }
  if (reason === 'parameter-signature') {
    return 2;
  }
  if (typeof reason === 'string' && reason.startsWith('parameter-jaccard-')) {
    return 1;
  }

  return 0;
}

function getSkillCreatedAtTime(skill) {
  const parsed = parseDate(skill?.updatedAt) ?? parseDate(skill?.createdAt);
  return parsed ? parsed.getTime() : 0;
}

function compareSkillCandidates(left, right) {
  const priorityDelta = getSkillReasonPriority(right.reason) - getSkillReasonPriority(left.reason);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const createdAtDelta = getSkillCreatedAtTime(right.skill) - getSkillCreatedAtTime(left.skill);
  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return left.fullPath.localeCompare(right.fullPath);
}

function resolveSkillMigrationPlan(files, inferenceContext) {
  const details = { migrated: [], skipped: [] };
  const grouped = new Map();
  const skillIdAliases = new Map();
  const skillIdToTemplateId = new Map();

  for (const fullPath of files) {
    const skill = safeReadJson(fullPath);
    if (!skill || typeof skill.id !== 'string') {
      continue;
    }

    const { templateId, reason } = inferTemplateId(skill, inferenceContext);

    if (!templateId) {
      console.warn(`[warn] Skip skill without templateId: ${fullPath}`);
      details.skipped.push({ file: fullPath, id: skill?.id ?? null, reason: 'missing-templateId' });
      continue;
    }

    const candidate = {
      fullPath,
      skill,
      templateId,
      reason: reason ?? 'direct',
    };

    if (!grouped.has(templateId)) {
      grouped.set(templateId, []);
    }
    grouped.get(templateId).push(candidate);
  }

  const planned = [];
  for (const [templateId, candidates] of grouped.entries()) {
    candidates.sort(compareSkillCandidates);
    const winner = candidates[0];
    planned.push(winner);
    skillIdAliases.set(winner.skill.id, winner.skill.id);
    skillIdToTemplateId.set(winner.skill.id, templateId);

    for (const candidate of candidates.slice(1)) {
      console.warn(
        `[warn] Skip duplicate skill for templateId ${templateId}: ${candidate.fullPath} (keep ${winner.fullPath})`
      );
      details.skipped.push({
        file: candidate.fullPath,
        id: candidate.skill.id,
        reason: 'duplicate-templateId',
        templateId,
        keptFile: winner.fullPath,
        keptId: winner.skill.id,
      });
      skillIdAliases.set(candidate.skill.id, winner.skill.id);
    }
  }

  return { planned, details, skillIdAliases, skillIdToTemplateId };
}

function buildTemplateData(meta) {
  const suggestions = Array.isArray(meta.suggestions) ? meta.suggestions : [];
  const variables =
    Array.isArray(meta.variables) && meta.variables.length > 0
      ? meta.variables
      : extractVariablesFromSuggestions(suggestions);
  const templateConfig = meta.templateConfig ?? meta.config ?? null;

  return {
    type: meta.type === 'marked_template' ? TemplateType.marked_template : TemplateType.template,
    originalId: meta.originalTemplateId ?? null,
    fileName: meta.fileName || `${meta.id}.${meta.format || 'docx'}`,
    filePath: resolveTemplateFilePath(meta),
    format: normalizeFormat(meta.format),
    size: typeof meta.size === 'number' ? meta.size : null,
    variables,
    loops: extractLoops(meta),
    markings: meta.markings ?? Prisma.DbNull,
    ignoredElements: meta.ignoredElements ?? Prisma.DbNull,
    elementGroups: meta.elementGroups ?? Prisma.DbNull,
    ignoredGroups: meta.ignoredGroups ?? Prisma.DbNull,
    markingsSavedAt: parseDate(meta.savedAt) ?? null,
    templateConfig: templateConfig ?? Prisma.DbNull,
    configSavedAt: parseDate(meta.configSavedAt) ?? null,
    suggestions: suggestions.length > 0 ? suggestions : Prisma.DbNull,
    verifyResult: meta.verifyResult ?? Prisma.DbNull,
    hasValidFile: typeof meta.hasValidFile === 'boolean' ? meta.hasValidFile : null,
    createdAt: parseDate(meta.createdAt) ?? new Date(),
  };
}

function buildSkillData(skill, templateId) {
  const parameters = Array.isArray(skill.parameters)
    ? skill.parameters
    : isRecord(skill.parameterization) && Array.isArray(skill.parameterization.variables)
      ? skill.parameterization.variables
      : [];

  return {
    templateId,
    parameters,
    dataExample: skill.dataExampleJson ?? skill.dataExample ?? Prisma.DbNull,
    rawSkill: skill,
    createdAt: parseDate(skill.createdAt) ?? new Date(),
  };
}

function resolveCanonicalSkillId(rawSkillId, outputContext) {
  if (typeof rawSkillId !== 'string') {
    return null;
  }

  if (outputContext.skillIdAliases.has(rawSkillId)) {
    return outputContext.skillIdAliases.get(rawSkillId) ?? null;
  }

  return isUuid(rawSkillId) ? rawSkillId : null;
}

function buildOutputData(meta, outputContext) {
  const format = normalizeFormat(meta.format);
  const canonicalSkillId = resolveCanonicalSkillId(meta.skillId, outputContext);
  const resolvedTemplateId = isUuid(meta.templateId)
    ? meta.templateId
    : canonicalSkillId
      ? (outputContext.skillIdToTemplateId.get(canonicalSkillId) ?? null)
      : null;
  const resolvedMarkedTemplateId = isUuid(meta.markedTemplateId) ? meta.markedTemplateId : null;

  return {
    templateId: resolvedTemplateId,
    markedTemplateId: resolvedMarkedTemplateId,
    skillId: canonicalSkillId,
    fileName: meta.fileName || `${meta.id}.${meta.format || 'docx'}`,
    filePath: path.join(outputsDir, `${meta.id}.${meta.format || 'docx'}`),
    format,
    size: typeof meta.size === 'number' ? meta.size : null,
    params: meta.params ?? Prisma.DbNull,
    sampleData: meta.sampleData ?? Prisma.DbNull,
    simulatedData: meta.simulatedData ?? Prisma.DbNull,
    debugLogs: meta.debugLogs ?? Prisma.DbNull,
    renderedAt: parseDate(meta.renderedAt ?? meta.createdAt) ?? new Date(),
  };
}

async function migrateTemplates(prisma) {
  if (!fileExists(templatesDir)) {
    return { scanned: 0, migrated: 0 };
  }

  const files = fs
    .readdirSync(templatesDir)
    .filter((fileName) => fileName.endsWith('.json') && !fileName.startsWith('skill_'));

  let migrated = 0;

  for (const fileName of files) {
    const fullPath = path.join(templatesDir, fileName);
    const meta = safeReadJson(fullPath);
    if (!meta || typeof meta.id !== 'string') {
      continue;
    }

    if (!dryRun) {
      await prisma.template.upsert({
        where: { id: meta.id },
        create: { id: meta.id, ...buildTemplateData(meta) },
        update: buildTemplateData(meta),
      });
    }
    migrated += 1;
  }

  return { scanned: files.length, migrated };
}

async function migrateSkills(prisma) {
  const files = resolveSkillFileCandidates();
  const inferenceContext = buildSkillInferenceContext(files);
  const { planned, details } = resolveSkillMigrationPlan(files, inferenceContext);
  const existingByTemplateId = new Map();
  if (!dryRun) {
    const existingSkills = await prisma.skill.findMany({
      select: {
        id: true,
        templateId: true,
      },
    });

    for (const existingSkill of existingSkills) {
      existingByTemplateId.set(existingSkill.templateId, existingSkill.id);
    }
  }
  let migrated = 0;

  for (const candidate of planned) {
    const { fullPath, skill, templateId, reason } = candidate;

    if (reason && reason !== 'direct') {
      console.log(`[info] Inferred templateId via ${reason}: ${fullPath} -> ${templateId}`);
    }

    if (!dryRun) {
      const existingSkillId = existingByTemplateId.get(templateId);
      if (existingSkillId && existingSkillId !== skill.id) {
        await prisma.skill.delete({
          where: { id: existingSkillId },
        });
      }

      await prisma.skill.upsert({
        where: { id: skill.id },
        create: { id: skill.id, ...buildSkillData(skill, templateId) },
        update: buildSkillData(skill, templateId),
      });
      existingByTemplateId.set(templateId, skill.id);
    }
    migrated += 1;
    details.migrated.push({ file: fullPath, id: skill.id, templateId, reason: reason ?? 'direct' });
  }

  return { scanned: files.length, migrated, details };
}

async function migrateOutputs(prisma) {
  if (!fileExists(outputsDir)) {
    return { scanned: 0, migrated: 0 };
  }

  const skillFiles = resolveSkillFileCandidates();
  const inferenceContext = buildSkillInferenceContext(skillFiles);
  const outputContext = resolveSkillMigrationPlan(skillFiles, inferenceContext);

  const files = fs.readdirSync(outputsDir).filter((fileName) => fileName.endsWith('.json'));

  let migrated = 0;

  for (const fileName of files) {
    const fullPath = path.join(outputsDir, fileName);
    const meta = safeReadJson(fullPath);
    if (!meta || typeof meta.id !== 'string') {
      continue;
    }

    if (!dryRun) {
      await prisma.renderOutput.upsert({
        where: { id: meta.id },
        create: { id: meta.id, ...buildOutputData(meta, outputContext) },
        update: buildOutputData(meta, outputContext),
      });
    }
    migrated += 1;
  }

  return { scanned: files.length, migrated };
}

async function main() {
  const prisma = new PrismaClient();

  const shouldTemplates = !outputsOnly && !skillsOnly;
  const shouldSkills = !templatesOnly && !outputsOnly;
  const shouldOutputs = !templatesOnly && !skillsOnly;

  try {
    if (!dryRun) {
      await prisma.$connect();
    }

    const summary = {};

    if (shouldTemplates) {
      summary.templates = await migrateTemplates(prisma);
    }
    if (shouldSkills) {
      summary.skills = await migrateSkills(prisma);
    }
    if (shouldOutputs) {
      summary.outputs = await migrateOutputs(prisma);
    }

    const result = {
      dryRun,
      templatesDir,
      outputsDir,
      ...summary,
    };
    if (reportArg) {
      try {
        fs.writeFileSync(reportArg, JSON.stringify(result, null, 2));
        console.log(`[done] Summary report written: ${reportArg}`);
      } catch (e) {
        console.warn('[warn] Failed to write summary report');
      }
    }
    console.log('[done] Sidecar migration summary');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error('[error] Sidecar migration failed');
  console.error(error);
  process.exit(1);
});
