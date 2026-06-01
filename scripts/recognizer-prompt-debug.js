#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_GUIDE_BUDGET = {
  maxGuideChars: 2000,
  maxExampleChars: 1200,
};

const VARIANTS = new Set(['current', 'lean', 'field-focused', 'natural-language', 'all']);
const OUTPUT_MODES = new Set(['rich-json', 'params-only', 'both']);

function parseArgs(argv) {
  const args = {
    variant: 'current',
    outputMode: 'params-only',
    run: false,
    temperature: 0,
    maxTokens: 1200,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    switch (key) {
      case 'case':
        args.casePath = next;
        i += 1;
        break;
      case 'variant':
        args.variant = next;
        i += 1;
        break;
      case 'run':
        args.run = true;
        break;
      case 'output-mode':
        args.outputMode = next;
        i += 1;
        break;
      case 'base-url':
        args.baseUrl = next;
        i += 1;
        break;
      case 'api-key':
        args.apiKey = next;
        i += 1;
        break;
      case 'model':
        args.model = next;
        i += 1;
        break;
      case 'temperature':
        args.temperature = Number(next);
        i += 1;
        break;
      case 'max-tokens':
        args.maxTokens = Number(next);
        i += 1;
        break;
      case 'output':
        args.outputPath = next;
        i += 1;
        break;
      case 'help':
        args.help = true;
        break;
      default:
        throw new Error(`未知参数: --${key}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
用法:
  node scripts/recognizer-prompt-debug.js --case <case.json> [--variant current|lean|field-focused|natural-language|all] [--output-mode rich-json|params-only|both]
  node scripts/recognizer-prompt-debug.js --case <case.json> --variant all --output-mode both
  node scripts/recognizer-prompt-debug.js --case <case.json> --variant lean --output-mode params-only --run --base-url <url> --api-key <key> --model <name>

说明:
  - 默认只打印 prompt，不调用模型
  - --run 时使用 OpenAI 兼容 chat completions 接口直接发送 system/user messages
  - --output-mode 可比较“富 JSON”与“只返回 params JSON”两种输出契约
  - 当前推荐和线上默认方向是 params-only
  - 可选输出 JSON 结果到 --output
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function truncateText(value, maxChars, suffix) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.length > maxChars ? `${value.slice(0, maxChars)}${suffix}` : value;
}

function normalizePromptDefaultValue(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0 ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value : undefined;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0 ? value : undefined;
  }
  return value;
}

function readText(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseRecord(value) {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function summarizeSchema(paramsSchema, limit = 18) {
  return Object.entries((paramsSchema && paramsSchema.properties) || {})
    .slice(0, limit)
    .map(([name, schema]) => {
      const description = readText(schema.description);
      const type = readText(schema.type) || 'string';
      return description ? `- ${name} [${type}]：${description}` : `- ${name} [${type}]`;
    });
}

function summarizeHints(runtimeMetadata, limit = 12) {
  const hints = [];
  const mappingHints = Array.isArray(runtimeMetadata && runtimeMetadata.mappingHints)
    ? runtimeMetadata.mappingHints
    : [];
  const extractionRules = Array.isArray(runtimeMetadata && runtimeMetadata.extractionRules)
    ? runtimeMetadata.extractionRules
    : [];

  mappingHints.slice(0, limit).forEach((item) => {
    const parameter = readText(item && item.parameter);
    const description = readText(item && item.description);
    const example = readText(item && item.example);
    if (!parameter) {
      return;
    }
    const suffix = [description ? `说明：${description}` : undefined, example ? `示例：${example}` : undefined]
      .filter(Boolean)
      .join('；');
    hints.push(suffix ? `${parameter} -> ${suffix}` : parameter);
  });

  extractionRules.slice(0, Math.max(0, limit - hints.length)).forEach((item) => {
    const parameter = readText(item && item.parameter);
    const fallbackStrategy = readText(item && item.fallbackStrategy);
    if (!parameter) {
      return;
    }
    hints.push(fallbackStrategy ? `${parameter} -> 缺失时：${fallbackStrategy}` : parameter);
  });

  return hints;
}

function buildDocumentGuideContext(input) {
  if (input.enabled === false) {
    return undefined;
  }

  const runtimeMetadata = input.runtimeMetadata || {};
  const guideMarkdown = readText(runtimeMetadata.skillGuideMarkdown);
  const paramCollectionGuidance = readText(runtimeMetadata.paramCollectionGuidance);
  const validationRules = readText(runtimeMetadata.validationRules);
  const outputExample = parseRecord(runtimeMetadata.dataExampleJson) || input.outputParams;

  const overviewParts = [
    readText(runtimeMetadata.matchSummary),
    readText(input.description),
    readText(input.goal),
    readText(input.expectedResult),
    (() => {
      const source = runtimeMetadata.sourceTemplate || {};
      const fileName = readText(source.fileName);
      const templateId = readText(source.templateId);
      const variableCount = source.variableCount;
      const segments = [
        fileName ? `模板文件：${fileName}` : undefined,
        templateId ? `模板ID：${templateId}` : undefined,
        typeof variableCount === 'number' ? `参数数：${variableCount}` : undefined,
      ].filter(Boolean);
      return segments.length > 0 ? segments.join('，') : undefined;
    })(),
  ].filter(Boolean);

  const schemaSummary = summarizeSchema(input.paramsSchema);
  const extractionHints = summarizeHints(runtimeMetadata);
  const synthesizedGuide = schemaSummary.length > 0
    ? [
        '请优先依据字段用途、业务分组和示例结构识别参数，再输出当前步骤要求的扁平字段键名。',
        '参数概览：',
        ...schemaSummary,
      ].join('\n')
    : undefined;

  if (
    overviewParts.length === 0 &&
    !guideMarkdown &&
    !paramCollectionGuidance &&
    !validationRules &&
    !outputExample &&
    !synthesizedGuide &&
    extractionHints.length === 0
  ) {
    return undefined;
  }

  return {
    mode: 'document_skill',
    templateOverview: overviewParts.join('\n'),
    guideMarkdown,
    paramCollectionGuidance: paramCollectionGuidance || synthesizedGuide,
    validationRules,
    outputExample,
    extractionHints,
    sourceTemplate: runtimeMetadata.sourceTemplate,
  };
}

function formatParamLine(name, schema, promptVariant) {
  const normalizedDefaultValue = normalizePromptDefaultValue(schema.default);
  const defaultStr = normalizedDefaultValue !== undefined ? ` (默认值: ${normalizedDefaultValue})` : '';
  const hintStr = schema.extractionPrompt ? `；提取提示：${schema.extractionPrompt}` : '';
  const semanticRoleStr = schema.semanticRole ? `；语义角色：${schema.semanticRole}` : '';
  const semanticHintsStr = Array.isArray(schema.extractionHints) && schema.extractionHints.length > 0
    ? `；语义提示：${schema.extractionHints.join('、')}`
    : '';

  if (promptVariant === 'field-focused') {
    return `- ${name}: ${schema.type}${schema.description ? ` - ${schema.description}` : ''}${hintStr}${semanticHintsStr}`;
  }

  return `- ${name}: ${schema.type}${schema.description ? ` - ${schema.description}` : ''}${defaultStr}${hintStr}${semanticRoleStr}${semanticHintsStr}`;
}

function buildStaticContractSection(experiment) {
  const { promptVariant, outputMode } = experiment;
  const base = [
    '你是一个参数提取助手。',
    '任务：根据用户输入提取 JSON 参数。',
    '规则：只提取当前输入中明确提供、或能从当前输入直接定位依据的值。',
    '禁止根据常见业务惯例、行业默认值、模板示例、历史经验或通常应该如此来脑补任何参数。',
    '如果缺少依据，请省略该字段，不要猜。',
  ];

  if (promptVariant === 'field-focused') {
    base.push('优先按字段定义逐项判断，不要被长篇模板说明分散注意力。');
    base.push('若字段名、提取提示、语义提示与用户输入不匹配，宁可留空。');
  } else if (promptVariant === 'natural-language') {
    base.push('用户通常使用自然语言描述需求，而不是按字段名逐项填写。');
    base.push('请先理解整段自然语言的业务含义，再把明确表达的信息映射到给定字段。');
    base.push('同一句话可能包含多个字段；金额、日期区间、并列服务内容都要做自然语言归一化。');
    base.push('最终只允许输出给定字段名，不要输出嵌套对象，不要创造新字段。');
  } else if (promptVariant === 'lean') {
    base.push('对每个字段先找证据，再决定是否输出。');
  }

  if (outputMode === 'params-only') {
    base.push('返回 JSON 对象，顶层只保留已识别参数键值。');
    base.push('不要输出 params、confidence、field_confidences、uncertain_fields、notes、explanation。');
    base.push('如果没有识别到任何参数，返回空对象 {}。');
  } else {
    base.push('返回 JSON，格式包含 params、confidence、field_confidences、uncertain_fields。');
  }
  return base.join('\n');
}

function buildSkillKnowledgeSection(templateName, properties, guideContext, experiment) {
  const { promptVariant } = experiment;
  const entries = Object.entries(properties || {});
  const requiredEntries = entries.filter(([, schema]) => schema.required === true);
  const optionalEntries = entries.filter(([, schema]) => schema.required !== true);
  const isDocumentGuide = guideContext && guideContext.mode === 'document_skill';

  const guideSections = [];
  if (isDocumentGuide) {
    if (guideContext.templateOverview) {
      guideSections.push(`文档概述：\n${guideContext.templateOverview}`);
    }
    if (guideContext.paramCollectionGuidance) {
      guideSections.push(`参数识别指导：\n${guideContext.paramCollectionGuidance}`);
    }
    if (promptVariant === 'current' && guideContext.guideMarkdown) {
      guideSections.push(
        `模板指南摘要：\n${truncateText(guideContext.guideMarkdown, DEFAULT_GUIDE_BUDGET.maxGuideChars, '\n...（模板指南已截断，以上为关键部分）')}`,
      );
    }
    if (promptVariant === 'lean' && guideContext.guideMarkdown) {
      guideSections.push(
        `模板指南摘录（精简）：\n${truncateText(guideContext.guideMarkdown, 600, '\n...（已精简）')}`,
      );
    }
    if (promptVariant === 'natural-language' && guideContext.guideMarkdown) {
      guideSections.push(
        `模板指南摘录（仅保留业务语义）：\n${truncateText(guideContext.guideMarkdown, 450, '\n...（仅保留关键业务语义）')}`,
      );
    }
    if (guideContext.validationRules) {
      guideSections.push(`校验规则：\n${guideContext.validationRules}`);
    }
    if (Array.isArray(guideContext.extractionHints) && guideContext.extractionHints.length > 0) {
      const hints = promptVariant === 'field-focused' ? guideContext.extractionHints.slice(0, 6) : guideContext.extractionHints;
      guideSections.push(`补充提示：\n${hints.map((item) => `- ${item}`).join('\n')}`);
    }
    if (guideContext.outputExample) {
      const maxChars = promptVariant === 'field-focused' ? 800 : DEFAULT_GUIDE_BUDGET.maxExampleChars;
      guideSections.push(
        `示例 JSON（仅帮助理解业务结构）：\n${truncateText(JSON.stringify(guideContext.outputExample, null, 2), maxChars, '\n...（示例已截断）')}`,
      );
    }
  }

  const arrayOutputRule = Object.keys(properties || {}).some((name) => name.includes('[]'))
    ? '对于数组字段，请按字段路径返回数组值，并保持同一行的数组索引顺序一致；如果只提供一组信息，也必须返回单元素数组。'
    : undefined;

  const sections = [
    `模版：${templateName}`,
    requiredEntries.length > 0
      ? `【必须提取】（没有依据则留空，不要猜）\n${requiredEntries.map(([name, schema]) => formatParamLine(name, schema, promptVariant)).join('\n')}`
      : undefined,
    optionalEntries.length > 0
      ? `【按需提取】（有则提取，无则省略）\n${optionalEntries.map(([name, schema]) => formatParamLine(name, schema, promptVariant)).join('\n')}`
      : undefined,
    guideSections.length > 0 ? guideSections.join('\n\n') : undefined,
    arrayOutputRule,
  ].filter(Boolean);

  if (promptVariant === 'field-focused') {
    sections.push('输出时只允许使用上面列出的字段名；不要根据模板指南自行创造新字段。');
  }

  if (promptVariant === 'natural-language') {
    sections.push([
      '自然语言抽取要求：',
      '- 用户输入往往是叙述句，不是表单。',
      '- 先按语义理解“谁是甲方/乙方、项目是什么、金额是多少、期限从何时到何时、服务内容有哪些”。',
      '- 对“50万元”这类表达，按字段要求转换为标准数值。',
      '- 对“从 A 到 B”这类表达，分别判断是否对应开始日期和结束日期。',
      '- 服务内容中的并列项可保留自然语言原文，不要为了凑结构改写。',
    ].join('\n'));
  }

  return sections.join('\n\n');
}

function serializeCollectedContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  return Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null && item !== '')
    .slice(0, 20)
    .map(([key, item]) => `${key} = ${typeof item === 'string' ? item : JSON.stringify(item)}`)
    .join('\n');
}

function buildDynamicUserContextSection(dto, guideContext, experiment) {
  const { promptVariant } = experiment;
  const sections = [];
  const context = dto && dto.context && typeof dto.context === 'object' ? dto.context : undefined;

  if (context && context.mode === 'waiting_input_resume') {
    sections.push('[本轮模式]\n补充缺失参数');
    if (typeof context.original_objective === 'string' && context.original_objective.trim()) {
      sections.push(`[原始任务]\n${context.original_objective.trim()}`);
    }
    const missing = Array.isArray(context.missing_inputs)
      ? context.missing_inputs.filter((item) => typeof item === 'string' && item.trim().length > 0)
      : [];
    if (missing.length > 0) {
      sections.push(`[当前仍缺失字段]\n${missing.join('、')}`);
    }
    const collected = serializeCollectedContext(context.already_collected);
    if (collected) {
      sections.push(`[已确认参数]\n${collected}`);
    }
  } else if (context) {
    const lines = Object.entries(context)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    if (lines.length > 0) {
      sections.push(`[补充上下文]\n${lines.join('\n')}`);
    }
  }

  sections.push(`[本轮用户输入]\n${dto.user_input}`);

  if (guideContext && guideContext.mode === 'document_skill') {
    const hints = [
      '注意：如果是文档模板，请结合文档概述、参数用途和示例结构理解业务语义，但最终返回仍必须使用扁平字段键名。',
      '注意：禁止把 Carbone 模板变量语法（如 {d.xxx}、{#...}、{/...}）写进 JSON key；key 必须与 paramsSchema 中的字段路径完全一致，且不应包含 { 或 }。',
    ];
    if (promptVariant === 'field-focused') {
      hints.push('注意：模板说明只能帮助理解业务，不可替代字段级证据。');
    }
    if (promptVariant === 'natural-language') {
      hints.push('注意：请把用户输入当作自然语言需求描述来理解，而不是字段列表。');
      hints.push('注意：即使模型心里理解成对象结构，最终输出也必须使用扁平字段 key。');
    }
    sections.push(hints.join('\n'));
  }

  return sections.join('\n\n');
}

function buildPromptAssembly(caseData, experiment) {
  const properties = markRequiredFields(
    (caseData.paramsSchema && caseData.paramsSchema.properties) || {},
    (caseData.paramsSchema && caseData.paramsSchema.required) || [],
  );

  const dto = {
    template_id: caseData.templateId || caseData.templateName || 'debug-template',
    user_input: caseData.userInput || '',
    context: caseData.context,
  };

  const guideContext = caseData.guideContext
    || (caseData.runtimeMetadata || caseData.goal || caseData.description || caseData.outputParams
      ? buildDocumentGuideContext({
          enabled: true,
          description: caseData.description,
          goal: caseData.goal,
          expectedResult: caseData.expectedResult,
          outputParams: caseData.outputParams,
          paramsSchema: caseData.paramsSchema,
          runtimeMetadata: caseData.runtimeMetadata,
        })
      : undefined);

  return {
    staticSystem: buildStaticContractSection(experiment),
    skillContext: buildSkillKnowledgeSection(caseData.templateName || dto.template_id, properties, guideContext, experiment),
    dynamicUser: buildDynamicUserContextSection(dto, guideContext, experiment),
  };
}

function markRequiredFields(properties, required) {
  const requiredSet = new Set(Array.isArray(required) ? required : []);
  return Object.fromEntries(
    Object.entries(properties || {}).map(([key, schema]) => [
      key,
      {
        ...schema,
        required: requiredSet.has(key) || schema.required === true,
      },
    ]),
  );
}

function parseRecognizerJson(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'empty_response' };
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced && fenced[1] ? fenced[1].trim() : text.trim();
  try {
    const parsed = JSON.parse(candidate);
    return { ok: true, parsed };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), raw: candidate };
  }
}

function diffExpected(expected, actual) {
  const expectedParams = (expected && expected.params) || {};
  const actualParams = actual && typeof actual === 'object'
    ? (actual.params && typeof actual.params === 'object' ? actual.params : actual)
    : {};
  const missingKeys = [];
  const mismatchedKeys = [];
  const unexpectedKeys = [];

  Object.entries(expectedParams).forEach(([key, value]) => {
    if (!(key in actualParams)) {
      missingKeys.push(key);
      return;
    }
    if (JSON.stringify(value) !== JSON.stringify(actualParams[key])) {
      mismatchedKeys.push({
        key,
        expected: value,
        actual: actualParams[key],
      });
    }
  });

  Object.keys(actualParams).forEach((key) => {
    if (!(key in expectedParams)) {
      unexpectedKeys.push(key);
    }
  });

  return {
    missingKeys,
    unexpectedKeys,
    mismatchedKeys,
    matchedAllExpected: missingKeys.length === 0 && mismatchedKeys.length === 0,
  };
}

function buildOutputModeList(name) {
  if (name === 'both') {
    return ['rich-json', 'params-only'];
  }
  if (!OUTPUT_MODES.has(name)) {
    throw new Error(`不支持的 output-mode: ${name}`);
  }
  return [name];
}

function buildExperiments(variantName, outputModeName) {
  const promptVariants = buildVariantList(variantName);
  const outputModes = buildOutputModeList(outputModeName);
  return promptVariants.flatMap((promptVariant) => (
    outputModes.map((outputMode) => ({
      promptVariant,
      outputMode,
      label: `${promptVariant} + ${outputMode}`,
    }))
  ));
}

function checkOutputContract(parsedPayload, experiment, properties) {
  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    return {
      passed: false,
      issues: ['顶层不是 JSON object'],
    };
  }

  const issues = [];
  const schemaKeys = new Set(Object.keys(properties || {}));
  const topLevelKeys = Object.keys(parsedPayload);

  if (experiment.outputMode === 'params-only') {
    const forbiddenKeys = ['params', 'confidence', 'field_confidences', 'uncertain_fields', 'notes', 'explanation']
      .filter((key) => key in parsedPayload);
    if (forbiddenKeys.length > 0) {
      issues.push(`出现禁止字段: ${forbiddenKeys.join(', ')}`);
    }
    const unknownKeys = topLevelKeys.filter((key) => !schemaKeys.has(key));
    if (unknownKeys.length > 0) {
      issues.push(`出现 schema 外字段: ${unknownKeys.join(', ')}`);
    }
  } else {
    if (!parsedPayload.params || typeof parsedPayload.params !== 'object' || Array.isArray(parsedPayload.params)) {
      issues.push('缺少 params 对象');
    }
    ['confidence', 'field_confidences', 'uncertain_fields'].forEach((key) => {
      if (!(key in parsedPayload)) {
        issues.push(`缺少 ${key}`);
      }
    });
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

function computeExperimentScore(modelResponse, experiment, caseData) {
  if (!modelResponse || modelResponse.error) {
    return 0;
  }

  const parsed = modelResponse.parsed;
  if (!parsed || !parsed.ok) {
    return 0;
  }

  const properties = (caseData.paramsSchema && caseData.paramsSchema.properties) || {};
  const contractCheck = checkOutputContract(parsed.parsed, experiment, properties);
  let score = 40;

  if (contractCheck.passed) {
    score += 20;
  } else {
    score += Math.max(0, 20 - contractCheck.issues.length * 5);
  }

  if (modelResponse.diff) {
    const { missingKeys, mismatchedKeys, unexpectedKeys } = modelResponse.diff;
    score += Math.max(0, 40 - missingKeys.length * 8 - mismatchedKeys.length * 8 - unexpectedKeys.length * 4);
  } else {
    score += 25;
  }

  return Math.max(0, Math.min(100, score));
}

function summarizePromptStats(messages) {
  const systemChars = messages[0] && typeof messages[0].content === 'string' ? messages[0].content.length : 0;
  const userChars = messages[1] && typeof messages[1].content === 'string' ? messages[1].content.length : 0;
  return {
    systemChars,
    userChars,
    totalChars: systemChars + userChars,
  };
}

function printExperimentSummary(results, caseData) {
  const summary = results.map((result) => {
    const promptStats = summarizePromptStats(result.requestMessages);
    const parsed = result.modelResponse && result.modelResponse.parsed;
    const contractCheck = parsed && parsed.ok
      ? checkOutputContract(
          parsed.parsed,
          result.experiment,
          (caseData.paramsSchema && caseData.paramsSchema.properties) || {},
        )
      : undefined;
    return {
      label: result.experiment.label,
      promptVariant: result.experiment.promptVariant,
      outputMode: result.experiment.outputMode,
      promptChars: promptStats.totalChars,
      parseOk: Boolean(parsed && parsed.ok),
      score: computeExperimentScore(result.modelResponse, result.experiment, caseData),
      contractPassed: contractCheck ? contractCheck.passed : undefined,
      contractIssues: contractCheck && contractCheck.issues.length > 0 ? contractCheck.issues : undefined,
      diff: result.modelResponse && result.modelResponse.diff
        ? {
            missing: result.modelResponse.diff.missingKeys.length,
            mismatched: result.modelResponse.diff.mismatchedKeys.length,
            unexpected: result.modelResponse.diff.unexpectedKeys.length,
          }
        : undefined,
      usage: result.modelResponse && result.modelResponse.usage ? result.modelResponse.usage : undefined,
      error: result.modelResponse && result.modelResponse.error ? result.modelResponse.error : undefined,
    };
  }).sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) {
      return (b.score || 0) - (a.score || 0);
    }
    return a.promptChars - b.promptChars;
  });

  printSection('EXPERIMENT SUMMARY', JSON.stringify(summary, null, 2));

  const hasModelResults = results.some((result) => Boolean(result.modelResponse));

  if (summary.length > 0) {
    const best = summary[0];
    const recommendation = {
      recommended: best.label,
      reason: hasModelResults
        ? [
            `score=${best.score}`,
            typeof best.promptChars === 'number' ? `promptChars=${best.promptChars}` : undefined,
            best.contractPassed === true ? 'outputContract=passed' : undefined,
            best.diff ? `diff(missing=${best.diff.missing}, mismatched=${best.diff.mismatched}, unexpected=${best.diff.unexpected})` : undefined,
          ].filter(Boolean).join(' ; ')
        : [
            '未实际调用模型，当前仅按 prompt 长度与结构可读性给出初步建议',
            typeof best.promptChars === 'number' ? `promptChars=${best.promptChars}` : undefined,
          ].filter(Boolean).join(' ; '),
    };
    printSection('RECOMMENDATION', JSON.stringify(recommendation, null, 2));
  }
}

async function callOpenAICompatible(messages, options) {
  const baseUrl = (options.baseUrl || process.env.OPENAI_BASE_URL || '').replace(/\/$/, '');
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY || '';
  const model = options.model || process.env.OPENAI_MODEL || '';

  if (!baseUrl || !apiKey || !model) {
    throw new Error('缺少模型配置。请提供 --base-url --api-key --model，或设置 OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL');
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: Number.isFinite(options.temperature) ? options.temperature : 0,
      max_tokens: Number.isFinite(options.maxTokens) ? options.maxTokens : 1200,
      response_format: { type: 'json_object' },
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`模型调用失败: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const payload = await response.json();
  return {
    raw: payload,
    content: payload && payload.choices && payload.choices[0] && payload.choices[0].message
      ? payload.choices[0].message.content
      : '',
    usage: payload.usage,
  };
}

function buildVariantList(name) {
  if (name === 'all') {
    return ['current', 'lean', 'field-focused', 'natural-language'];
  }
  if (!VARIANTS.has(name)) {
    throw new Error(`不支持的 variant: ${name}`);
  }
  return [name];
}

function printSection(title, content) {
  console.log(`\n===== ${title} =====\n`);
  console.log(content || '(empty)');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.casePath) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const absoluteCasePath = path.resolve(process.cwd(), args.casePath);
  const caseData = readJson(absoluteCasePath);
  const experiments = buildExperiments(args.variant, args.outputMode);
  const results = [];

  console.log(`Case: ${absoluteCasePath}`);
  console.log(`Template: ${caseData.templateName || caseData.templateId || 'N/A'}`);
  console.log(`Run model: ${args.run ? 'yes' : 'no'}`);
  console.log(`Experiments: ${experiments.map((item) => item.label).join(' | ')}`);

  for (const experiment of experiments) {
    const assembly = buildPromptAssembly(caseData, experiment);
    const requestMessages = [
      {
        role: 'system',
        content: [assembly.staticSystem, assembly.skillContext].filter(Boolean).join('\n\n'),
      },
      {
        role: 'user',
        content: assembly.dynamicUser,
      },
    ];

    printSection(`VARIANT ${experiment.label} / SYSTEM`, requestMessages[0].content);
    printSection(`VARIANT ${experiment.label} / USER`, requestMessages[1].content);

    const result = {
      variant: experiment.promptVariant,
      experiment,
      requestMessages,
    };

    if (args.run) {
      console.log(`\n--- 正在调用模型 (${experiment.label}) ---`);
      try {
        const modelResult = await callOpenAICompatible(requestMessages, args);
        const parsed = parseRecognizerJson(modelResult.content);
        const diff = caseData.expected ? diffExpected(caseData.expected, parsed.ok ? parsed.parsed : {}) : undefined;
        const contractCheck = parsed.ok
          ? checkOutputContract(
              parsed.parsed,
              experiment,
              (caseData.paramsSchema && caseData.paramsSchema.properties) || {},
            )
          : undefined;

        result.modelResponse = {
          content: modelResult.content,
          usage: modelResult.usage,
          parsed,
          diff,
          contractCheck,
        };

        printSection(`VARIANT ${experiment.label} / MODEL RAW RESPONSE`, modelResult.content);
        if (parsed.ok) {
          printSection(`VARIANT ${experiment.label} / PARSED JSON`, JSON.stringify(parsed.parsed, null, 2));
        } else {
          printSection(`VARIANT ${experiment.label} / PARSE ERROR`, JSON.stringify(parsed, null, 2));
        }
        if (diff) {
          printSection(`VARIANT ${experiment.label} / EXPECTED DIFF`, JSON.stringify(diff, null, 2));
        }
        if (contractCheck) {
          printSection(`VARIANT ${experiment.label} / OUTPUT CONTRACT CHECK`, JSON.stringify(contractCheck, null, 2));
        }
      } catch (error) {
        result.modelResponse = {
          error: error instanceof Error ? error.message : String(error),
        };
        printSection(`VARIANT ${experiment.label} / MODEL ERROR`, result.modelResponse.error);
      }
    }

    results.push(result);
  }

  printExperimentSummary(results, caseData);

  if (args.outputPath) {
    const absoluteOutputPath = path.resolve(process.cwd(), args.outputPath);
    ensureDir(path.dirname(absoluteOutputPath));
    fs.writeFileSync(absoluteOutputPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      casePath: absoluteCasePath,
      args: {
        ...args,
        apiKey: args.apiKey ? '***' : undefined,
      },
      results,
    }, null, 2));
    console.log(`\n已写入: ${absoluteOutputPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
