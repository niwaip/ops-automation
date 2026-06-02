const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://ops:ops_secret@localhost:5432/ops"
    }
  }
});

function asRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value;
}

function normalizeDocumentParamResolutionEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const entry = value;
  return {
    ...entry,
    ...(entry.template_binding === undefined && typeof entry.templateBinding === 'string'
      ? { template_binding: entry.templateBinding }
      : {}),
    ...(entry.render_path === undefined && (
      typeof entry.renderPath === 'string'
      || (Array.isArray(entry.renderPath) && entry.renderPath.every((item) => typeof item === 'string'))
    )
      ? { render_path: entry.renderPath }
      : {}),
  };
}

function resolveDocumentBindingPaths(entry) {
  const rawBindingPaths = typeof entry.template_binding === 'string' && entry.template_binding.trim()
    ? [entry.template_binding.trim()]
    : typeof entry.render_path === 'string' && entry.render_path.trim()
      ? [entry.render_path.trim()]
      : Array.isArray(entry.render_path)
        ? entry.render_path
            .filter((item) => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        : [];
  if (rawBindingPaths.length === 0) {
    return [];
  }

  return Array.from(
    new Set(
      rawBindingPaths
        .map((bindingPath) => bindingPath.replace(/^data\./, '').trim())
        .filter((bindingPath) => bindingPath.length > 0),
    ),
  );
}

function extractBindingLocale(path) {
  const normalizedPath = path.trim();
  if (/_cn$/i.test(normalizedPath) || /_zh$/i.test(normalizedPath)) {
    return 'cn';
  }
  if (/_jp$/i.test(normalizedPath) || /_ja$/i.test(normalizedPath)) {
    return 'jp';
  }
  return undefined;
}

function resolveLocalizedBindingValue(path, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const locale = extractBindingLocale(path);
  if (!locale) {
    return value;
  }

  const record = value;
  const localeCandidates = locale === 'cn'
    ? ['cn', 'zh']
    : ['jp', 'ja'];

  for (const candidate of localeCandidates) {
    if (Object.prototype.hasOwnProperty.call(record, candidate)) {
      const localizedValue = record[candidate];
      if (localizedValue !== undefined && localizedValue !== null) {
        return localizedValue;
      }
    }
  }

  return undefined;
}

function resolveBindingValue(path, value) {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => resolveLocalizedBindingValue(path, item))
      .filter((item) => item !== undefined && item !== null);
    return normalized;
  }

  return resolveLocalizedBindingValue(path, value);
}

function setNestedValue(target, path, value) {
  const segments = path
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return;
  }

  let current = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      current[segment] = {};
    }
    current = current[segment];
  }

  current[segments[segments.length - 1]] = value;
}

function ensureArrayPath(target, path) {
  const segments = path
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return [];
  }

  let current = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      current[segment] = {};
    }
    current = current[segment];
  }

  const leafKey = segments[segments.length - 1];
  const existingLeaf = current[leafKey];
  if (!Array.isArray(existingLeaf)) {
    current[leafKey] = [];
  }
  return current[leafKey];
}

function setBoundValue(target, path, value) {
  const resolvedValue = resolveBindingValue(path, value);
  if (resolvedValue === undefined || resolvedValue === null) {
    return;
  }

  const arrayPathMatch = path.match(/^(.*)\[\]\.(.+)$/);
  if (arrayPathMatch) {
    const [, rawArrayPath, rawItemPath] = arrayPathMatch;
    const arrayPath = rawArrayPath.trim();
    const itemPath = rawItemPath.trim();
    if (!arrayPath || !itemPath || !Array.isArray(resolvedValue)) {
      return;
    }
    const list = ensureArrayPath(target, arrayPath);
    resolvedValue.forEach((itemValue, index) => {
      const existing = list[index];
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
        list[index] = {};
      }
      setNestedValue(list[index], itemPath, itemValue);
    });
    return;
  }

  setNestedValue(target, path, resolvedValue);
}

function buildDocumentRuntimeInput(input, rawParamResolution) {
  const result = { ...input };
  const existingData = asRecord(result.data);
  const dataPayload = existingData ? { ...existingData } : {};
  let hasBindingMappings = false;

  for (const [name, entry] of Object.entries(rawParamResolution || {})) {
    const normalizedEntry = normalizeDocumentParamResolutionEntry(entry);
    if (!normalizedEntry) continue;
    if (normalizedEntry.final !== true) continue;
    if (normalizedEntry.value === undefined || normalizedEntry.value === null) continue;

    const bindingPaths = resolveDocumentBindingPaths(normalizedEntry);
    if (bindingPaths.length === 0) continue;

    hasBindingMappings = true;
    bindingPaths.forEach((bindingPath) => {
      setBoundValue(dataPayload, bindingPath, normalizedEntry.value);
    });
    delete result[name];
  }

  if (!hasBindingMappings) {
    return result;
  }

  result.data = dataPayload;
  return result;
}

async function main() {
  const executionId = 'b104a2ff-b302-436e-960a-d72a265d4681';
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    select: {
      inputJson: true,
      normalizedInputJson: true,
    }
  });

  const baseInput = execution.normalizedInputJson.input || execution.inputJson;
  const paramResolution = execution.normalizedInputJson.paramResolution;

  const mapped = buildDocumentRuntimeInput(baseInput, paramResolution);
  console.log("Mapped data structure sent to document rendering:");
  console.log(JSON.stringify(mapped, null, 2));

  // Query Template Info from carbone_templates table
  try {
    const templateId = '1febbc18-1f17-4c49-a4b2-9bfb38fffeaf';
    // Using raw query or checking if Prisma client has it
    // Wait, the client in control-plane doesn't have carbone_templates (it has it in platform/carbone-engine).
    // So let's run a raw SQL query!
    const template = await prisma.$queryRaw`SELECT * FROM carbone_templates WHERE id = ${templateId}::uuid`;
    console.log("Carbone template info:", JSON.stringify(template, null, 2));
  } catch (err) {
    console.error("Failed to query template table:", err);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
