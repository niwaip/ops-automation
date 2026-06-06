const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { CarboneEngine } = require('../../domain/carbone-engine/dist/lib/engine.js');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://ops:ops_secret@localhost:5432/ops"
    }
  }
});

// The bindings from Template1febbc18Workflow
const RENDER_BINDINGS = {
  "payment.method": [
    "payment.method_cn",
    "payment.method_jp"
  ],
  "payment.remark": [
    "payment.remark_cn",
    "payment.remark_jp"
  ],
  "service.period": [
    "service.period_cn",
    "service.period_jp"
  ],
  "acceptance.days": [
    "acceptance.days_cn",
    "acceptance.days_jp"
  ],
  "contract.partyA": [
    "contract.partyA_cn",
    "contract.partyA_jp"
  ],
  "service.endUser": [
    "service.endUser_cn",
    "service.endUser_jp"
  ],
  "items[].quantity": [
    "items[].quantity_cn",
    "items[].quantity_jp"
  ],
  "otherTerms.title": [
    "otherTerms.title_jp"
  ],
  "service.location": [
    "service.location_cn",
    "service.location_jp"
  ],
  "service.progress": [
    "service.progress_cn",
    "service.progress_jp"
  ],
  "payment.finalDays": [
    "payment.finalDays_cn",
    "payment.finalDays_jp"
  ],
  "payment.firstDays": [
    "payment.firstDays",
    "payment.firstDays_jp"
  ],
  "payment.finalRatio": [
    "payment.finalRatio_jp",
    "payment.finalRatio_cn"
  ],
  "payment.firstRatio": [
    "payment.firstRatio_jp",
    "payment.firstRatio_cn"
  ],
  "contract.contractNo": [
    "contract.contractNo_cn",
    "contract.contractNo_jp"
  ],
  "contract.partyA.fax": [
    "contract.partyA.fax_cn",
    "contract.partyA.fax_jp"
  ],
  "items[].productName": [
    "items[].productName_cn",
    "items[].productName_jp"
  ],
  "items[].projectName": [
    "items[].projectName_cn",
    "items[].projectName_jp"
  ],
  "payment.bankAccount": [
    "payment.bankAccount_cn",
    "payment.bankAccount_jp"
  ],
  "payment.firstAmount": [
    "payment.firstAmount_jp",
    "payment.firstAmount_cn"
  ],
  "payment.totalAmount": [
    "payment.totalAmount_cn",
    "payment.totalAmount_jp"
  ],
  "contract.partyA.name": [
    "contract.partyA.name_cn",
    "contract.partyA.name_jp"
  ],
  "contract.projectName": [
    "contract.projectName_cn",
    "contract.projectName_jp"
  ],
  "contract.serviceName": [
    "contract.serviceName_cn",
    "contract.serviceName_jp"
  ],
  "contract.signingDate": [
    "contract.signingDate_cn",
    "contract.signingDate_jp"
  ],
  "warranty.periodYears": [
    "warranty.periodYears_cn",
    "warranty.periodYears_jp"
  ],
  "contract.partyA.phone": [
    "contract.partyA.phone_cn",
    "contract.partyA.phone_jp"
  ],
  "items[].maintenanceFee": [
    "items[].maintenanceFee_cn",
    "items[].maintenanceFee_jp"
  ],
  "contract.partyA.address": [
    "contract.partyA.address_cn",
    "contract.partyA.address_jp"
  ],
  "contract.systemLocation": [
    "contract.systemLocation_cn",
    "contract.systemLocation_jp"
  ],
  "contract.originalCopyCount": [
    "contract.originalCopyCount_cn",
    "contract.originalCopyCount_jp"
  ],
  "contract.partyA.postalCode": [
    "contract.partyA.postalCode_cn",
    "contract.partyA.postalCode_jp"
  ],
  "contract.eachPartyCopyCount": [
    "contract.eachPartyCopyCount_cn",
    "contract.eachPartyCopyCount_jp"
  ],
  "contract.partyA.representative": [
    "contract.partyA.representative_jp",
    "contract.partyA.representative_cn"
  ],
  "contract.partyB.representative": [
    "contract.partyB.representative_cn",
    "contract.partyB.representative_jp"
  ]
};

function normalize(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return value;
}

function resolveBindingPaths(key) {
  const rawPaths = RENDER_BINDINGS[key] || [key];
  return rawPaths.map(item => {
    let path = item.trim();
    if (path.startsWith("{d.") && path.endsWith("}")) {
      path = path.slice(3, -1).trim();
    }
    if (path.startsWith("d.")) {
      path = path.slice(2).trim();
    }
    if (path.startsWith("data.")) {
      path = path.slice(5).trim();
    }
    return path;
  });
}

function setNestedValue(target, path, value) {
  const segments = path.split('.').map(s => s.trim()).filter(Boolean);
  if (segments.length === 0) return;
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    if (!current[segment] || typeof current[segment] !== 'object' || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[segments[segments.length - 1]] = value;
}

function ensureArrayPath(target, path) {
  const segments = path.split('.').map(s => s.trim()).filter(Boolean);
  if (segments.length === 0) return [];
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    if (!current[segment] || typeof current[segment] !== 'object' || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }
  const leafKey = segments[segments.length - 1];
  if (!Array.isArray(current[leafKey])) {
    current[leafKey] = [];
  }
  return current[leafKey];
}

function setBoundValue(target, path, value) {
  const arrayMatch = path.match(/^(.*)\[\]\.(.+)$/);
  if (arrayMatch) {
    const arrayPath = arrayMatch[1].trim();
    const itemPath = arrayMatch[2].trim();
    if (!arrayPath || !itemPath || !Array.isArray(value)) {
      return;
    }
    const items = ensureArrayPath(target, arrayPath);
    for (let index = 0; index < value.length; index++) {
      const itemValue = value[index];
      if (!items[index] || typeof items[index] !== 'object' || Array.isArray(items[index])) {
        items[index] = {};
      }
      setNestedValue(items[index], itemPath, itemValue);
    }
    return;
  }
  setNestedValue(target, path, value);
}

function buildRenderData(params) {
  const renderData = {};
  for (const [key, value] of Object.entries(params)) {
    const paths = resolveBindingPaths(key);
    for (const bindingPath of paths) {
      setBoundValue(renderData, bindingPath, normalize(value));
    }
  }
  return renderData;
}

// Mimics NestJS normalizeRenderData in studio.controller.ts
function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeObjects(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value)) {
      if (!isPlainObject(target[key])) {
        target[key] = {};
      }
      mergeObjects(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

function normalizeRenderData(data) {
  const normalized = {};
  const arrayGroups = new Map();

  for (const [key, value] of Object.entries(data || {})) {
    if (key === 'd' && isPlainObject(value)) {
      mergeObjects(normalized, normalizeRenderData(value));
      continue;
    }

    if (key.includes('[]')) {
      const [rawPrefix, rawSuffix] = key.split('[]', 2);
      const prefix = rawPrefix.replace(/\.$/, '').trim();
      const suffix = String(rawSuffix || '').replace(/^\./, '').trim();
      if (prefix && suffix) {
        const entry = arrayGroups.get(prefix) || {};
        entry[suffix] = value;
        arrayGroups.set(prefix, entry);
        continue;
      }
    }

    if (key.includes('.')) {
      setNestedValue(normalized, key, value);
      continue;
    }

    if (isPlainObject(value)) {
      const existing = normalized[key];
      if (isPlainObject(existing)) {
        mergeObjects(existing, normalizeRenderData(value));
      } else {
        normalized[key] = normalizeRenderData(value);
      }
      continue;
    }

    normalized[key] = value;
  }

  for (const [prefix, fields] of arrayGroups.entries()) {
    const fieldEntries = Object.entries(fields);
    if (fieldEntries.length === 0) continue;

    const maxLen = fieldEntries.reduce((acc, [, raw]) => {
      if (Array.isArray(raw)) {
        return Math.max(acc, raw.length);
      }
      return Math.max(acc, 1);
    }, 0);

    const rows = [];
    for (let i = 0; i < maxLen; i += 1) {
      const row = {};
      for (const [fieldPath, raw] of fieldEntries) {
        const valueAtIndex = Array.isArray(raw) ? raw[i] : (i === 0 ? raw : undefined);
        if (valueAtIndex === undefined) continue;
        if (fieldPath.includes('.')) {
          setNestedValue(row, fieldPath, valueAtIndex);
        } else {
          row[fieldPath] = valueAtIndex;
        }
      }
      rows.push(row);
    }

    if (prefix.includes('.')) {
      setNestedValue(normalized, prefix, rows);
    } else {
      normalized[prefix] = rows;
    }
  }

  return normalized;
}

async function main() {
  const executionId = 'b104a2ff-b302-436e-960a-d72a265d4681';
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: {
      steps: {
        orderBy: { stepIndex: 'asc' }
      }
    }
  });

  if (!execution) {
    console.log("No execution found");
    return;
  }

  const step2 = execution.steps.find(s => s.stepIndex === 2);
  const params = step2.inputJson;
  delete params.prompt; // prompt is not in RENDER_BINDINGS

  console.log("Input params keys:", Object.keys(params));

  // Build render data using python workflow equivalent logic
  const renderData = buildRenderData(params);
  console.log("Python-equivalent built renderData:", JSON.stringify(renderData, null, 2));

  // Normalize data using NestJS normalizeRenderData
  const normalizedData = normalizeRenderData(renderData);
  console.log("NestJS-equivalent normalizedData:", JSON.stringify(normalizedData, null, 2));

  // Load template
  const templateId = '1febbc18-1f17-4c49-a4b2-9bfb38fffeaf';
  const templatePath = path.join(__dirname, '../../../../.data/carbone-engine/templates', `${templateId}.docx`);
  
  if (!fs.existsSync(templatePath)) {
    console.error("Template file not found at:", templatePath);
    return;
  }

  // Load template meta config
  const metaPath = path.join(__dirname, '../../../../.data/carbone-engine/templates', `${templateId}.json`);
  if (!fs.existsSync(metaPath)) {
    console.error("Meta file not found at:", metaPath);
    return;
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  console.log("Template config from meta:", JSON.stringify(meta.templateConfig, null, 2));

  const templateBuffer = fs.readFileSync(templatePath);

  // Initialize services and apply config to docx
  const { DocumentStructureService } = require('../../domain/carbone-engine/dist/modules/studio/document-structure.service.js');
  const documentStructureService = new DocumentStructureService();

  const loopFallback = Array.isArray(meta.loops) && meta.loops.length > 0
    ? { tableLoops: meta.loops }
    : {};
  const config = meta.templateConfig || loopFallback || {};
  console.log("Applying config to DOCX...");
  const markedBuffer = await documentStructureService.applyConfigToDocx(templateBuffer, config);

  // Initialize engine and render
  const engine = new CarboneEngine();
  const outputBuffer = await engine.render(markedBuffer, normalizedData, 'test.docx');

  // Let's write the rendered document to temp directory
  const outputPath = path.join(__dirname, '../../../../temp', 'rendered_test.docx');
  fs.writeFileSync(outputPath, outputBuffer);
  console.log("Rendered file written to:", outputPath);

  // Now, let's parse the rendered document's XML to see if the placeholders are resolved or blank!
  const JSZip = require('jszip');

  // Check the original generated output file
  const runtimeDownloadUrl = execution.steps[1].outputJson.result.downloadUrl || '';
  const outputIdMatch = String(runtimeDownloadUrl).match(/\/studio\/download\/([^/?#]+)/);
  const outputId = outputIdMatch?.[1] || 'aa1d89e2-444c-47ac-9a55-084a5ccd36e1';
  const originalOutputPath = path.join(__dirname, '../../../../.data/carbone-engine/outputs', `${outputId}.docx`);
  if (fs.existsSync(originalOutputPath)) {
    console.log("\n--- Checking original generated output file: " + originalOutputPath + " ---");
    const originalBuffer = fs.readFileSync(originalOutputPath);
    const originalZip = await JSZip.loadAsync(originalBuffer);
    const originalDocumentXml = await originalZip.file('word/document.xml').async('text');
    const checkTexts = [
      "上海云章科技有限公司",
      "王志远",
      "李承泽",
      "HT-2026-OPS-0601-001"
    ];
    for (const text of checkTexts) {
      console.log(`Original file contains "${text}"?`, originalDocumentXml.includes(text));
    }
    // Also write a copy to temp
    const copyPath = path.join(__dirname, '../../../../temp', 'original_output_copy.docx');
    fs.writeFileSync(copyPath, originalBuffer);
    console.log("Original file copy written to:", copyPath);
  } else {
    console.log("Original output file not found at:", originalOutputPath);
  }

  // Check our newly rendered output file
  console.log("\n--- Checking newly rendered output file ---");
  const zip = await JSZip.loadAsync(outputBuffer);
  const documentXml = await zip.file('word/document.xml').async('text');
  
  console.log("Searching for document placeholders or text in output xml...");
  // Let's check some rendered values
  const checkTexts = [
    "上海云章科技有限公司",
    "王志远",
    "李承泽",
    "HT-2026-OPS-0601-001"
  ];
  for (const text of checkTexts) {
    console.log(`Contains "${text}"?`, documentXml.includes(text));
  }

  // Let's print some segments around paragraph text to see how placeholders look like
  console.log("\nSome lines from document.xml:");
  console.log(documentXml.slice(0, 1000));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
