"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUIDE_INQUIRY_PATTERNS = exports.GENERIC_ROUTING_BUZZWORDS = exports.ENUM_ALIASES_SCHEMA_KEY = void 0;
exports.normalizePlanningText = normalizePlanningText;
exports.isGuideOrInquiryRequest = isGuideOrInquiryRequest;
exports.resolveCapabilityModality = resolveCapabilityModality;
exports.resolveUserActionIntent = resolveUserActionIntent;
exports.matchDeterministicRoutingCapability = matchDeterministicRoutingCapability;
exports.resolveDeterministicEnumParams = resolveDeterministicEnumParams;
exports.isDistinctiveSignal = isDistinctiveSignal;
exports.ENUM_ALIASES_SCHEMA_KEY = 'x-enum-aliases';
const ROUTING_CONTAINER_SUFFIXES = [
    '工作流',
    '服务',
    '技能',
    '能力',
    '数字员工',
    '助手',
    'workflow',
    'service',
    'skill',
];
const ROUTING_ACTION_SUFFIXES = [
    '查询',
    '检索',
    '搜索',
    '查找',
    '获取',
    '生成',
    '创建',
    '发送',
    '推送',
    '导出',
    '解析',
    '转换',
    '提醒',
    'query',
    'search',
    'find',
    'get',
    'create',
    'generate',
    'send',
    'export',
    'parse',
    'convert',
];
exports.GENERIC_ROUTING_BUZZWORDS = new Set([
    'ai',
    '智能',
    '助手',
    '系统',
    '自动化',
    '处理',
    '问答',
    '调用',
    '平台',
    '服务',
    '数据',
    '流程',
    '执行',
    '任务',
    '功能',
    '工具',
    '操作',
    '输入',
    '输出',
    '回复',
    '结果',
    '页面',
    '指定',
    '支持',
    '完成',
    '进行',
    '文本',
    '内容',
    '方式',
    '方法',
    '用户',
    '工作台',
    // Domain generic nouns that must not act as sole capability triggers
    '文件',
    '文档',
    '资料',
    '附件',
    '信息',
    // Pure generic action verbs that can apply to any arbitrary object
    '查看',
    '读取',
    '浏览',
    '显示',
    '打开',
    '获取',
    '查询',
    '查找',
    '导出',
    '下载',
    '上传',
    '分析',
    '统计',
    '计算',
]);
exports.GUIDE_INQUIRY_PATTERNS = [
    '安装方法',
    '安装教程',
    '安装步骤',
    '安装指南',
    '怎么安装',
    '如何安装',
    '部署方法',
    '部署教程',
    '部署指南',
    '怎么部署',
    '如何部署',
    '使用教程',
    '使用方法',
    '使用指南',
    '使用说明',
    '怎么使用',
    '如何使用',
    '怎么用',
    '配置指南',
    '配置方法',
    '配置教程',
    '怎么配置',
    '如何配置',
    '实现原理',
    '工作原理',
    '架构原理',
    '架构设计',
    '系统架构',
    '什么是',
    '是什么',
    '有什么用',
    '代码写法',
];
function normalizePlanningText(value) {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s\p{P}\p{S}_]+/gu, '');
}
function isGuideOrInquiryRequest(userInput) {
    const normalized = normalizePlanningText(userInput);
    if (!normalized)
        return false;
    return exports.GUIDE_INQUIRY_PATTERNS.some((pattern) => normalized.includes(normalizePlanningText(pattern)));
}
function resolveCapabilityModality(capability) {
    if (capability.modality)
        return capability.modality;
    const id = (capability.id || '').toLowerCase();
    const name = (capability.name || '').toLowerCase();
    const cat = (capability.category || '').toLowerCase();
    // Physical artifact / file generation
    if (cat === 'artifact' ||
        id.includes('markdown-artifact-writer') ||
        id.includes('pdf-create') ||
        id.includes('artifact-writer') ||
        name.includes('文件生成') ||
        name.includes('文档生成')) {
        return 'generate';
    }
    // Mutate / external side effects (notifications, sending, mutating records)
    if (cat === 'notification' ||
        (cat === 'communication' && (id.includes('send') || id.includes('update'))) ||
        id.includes('send') ||
        id.includes('update') ||
        id.includes('notify') ||
        id.includes('reminder')) {
        return 'mutate';
    }
    // Inspect / search / extract / read / review
    if (cat === 'search' ||
        cat === 'extraction' ||
        cat === 'comparison' ||
        cat === 'review' ||
        id.includes('search') ||
        id.includes('explorer') ||
        id.includes('extractor') ||
        id.includes('read') ||
        id.includes('messages')) {
        return 'inspect';
    }
    return 'inspect';
}
function resolveUserActionIntent(userInput) {
    const hasInspectIntent = /(?:查询|检索|搜索|查阅|查看|读取|看下|看一下|看看|检查|排查|探查|浏览|找一下|找下|找出|找到|提取|抽取|search|find|query|inspect|view|check|examine|read|cat)/i.test(userInput);
    const hasGenerateIntent = /(?:生成|制作|创建|导出|新建|另存为|保存为|输出为|做一份|做个|写一份|写个|写出|排版成|输出成|转为文件|保存成文件|generate|create|export|build|make|produce)/i.test(userInput);
    const hasMutateIntent = /(?:发送|推送|提醒|更新|修改|删除|send|push|notify|update|delete)/i.test(userInput);
    return { hasInspectIntent, hasGenerateIntent, hasMutateIntent };
}
function matchDeterministicRoutingCapability(userInput, capabilities) {
    const normalizedInput = normalizePlanningText(userInput);
    if (!normalizedInput)
        return null;
    const userIntent = resolveUserActionIntent(userInput);
    const ranked = capabilities
        .map((capability) => rankCapability(normalizedInput, capability, userIntent, userInput))
        .filter((candidate) => candidate.score >= 150)
        .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    if (!best || (ranked[1] && best.score === ranked[1].score))
        return null;
    return {
        capability: best.capability,
        matchedSignals: best.matchedSignals,
        confidence: 0.99,
        reason: 'deterministic_routing_signal',
    };
}
function resolveDeterministicEnumParams(userInput, properties) {
    const normalizedInput = normalizePlanningText(userInput);
    const result = {
        params: {},
        fieldConfidences: {},
        matchedAliases: {},
    };
    for (const [fieldName, property] of Object.entries(properties)) {
        const candidates = buildEnumAliasCandidates(property)
            .filter((candidate) => normalizedInput.includes(candidate.normalizedAlias))
            .sort((left, right) => right.normalizedAlias.length - left.normalizedAlias.length);
        const best = candidates[0];
        if (!best)
            continue;
        const equallySpecificValues = new Set(candidates
            .filter((candidate) => candidate.normalizedAlias.length === best.normalizedAlias.length)
            .map((candidate) => String(candidate.canonicalValue)));
        if (equallySpecificValues.size !== 1)
            continue;
        result.params[fieldName] = best.canonicalValue;
        result.fieldConfidences[fieldName] = 1;
        result.matchedAliases[fieldName] = best.alias;
    }
    return result;
}
function rankCapability(normalizedInput, capability, userIntent, rawUserInput) {
    // If negative keywords are defined and any matches, reject this capability immediately
    if (Array.isArray(capability.negativeKeywords) && capability.negativeKeywords.length > 0) {
        for (const neg of capability.negativeKeywords) {
            const normalizedNeg = normalizePlanningText(neg);
            if (normalizedNeg && normalizedInput.includes(normalizedNeg)) {
                return { capability, matchedSignals: [], score: 0 };
            }
        }
    }
    // Modality Gate:
    // If capability produces physical artifacts/files, user MUST have positive generate intent,
    // OR explicitly mention the capability ID or exact capability name.
    // A query like "查询关于ai能力测试的文件" has inspect intent and lacks positive generate intent,
    // so artifact generation capabilities are strictly gated (score 0).
    const modality = resolveCapabilityModality(capability);
    const normalizedId = normalizePlanningText(capability.id);
    const normalizedName = normalizePlanningText(capability.name);
    const isExplicitInvocation = normalizedInput === normalizedId ||
        normalizedInput === normalizedName ||
        rawUserInput.includes(capability.id);
    if (modality === 'generate' && !userIntent.hasGenerateIntent && !isExplicitInvocation) {
        return { capability, matchedSignals: [], score: 0 };
    }
    // Capability IDs are stable, user-visible invocation handles. Treat an exact
    // ID mention as an explicit routing signal alongside display names/aliases so
    // prompts such as "use platform.document.pdf-create" never depend on an LLM
    // guessing the intended capability.
    const explicitSignals = [capability.id, capability.name, ...(capability.aliases || [])];
    const derivedSignals = explicitSignals.flatMap(deriveRoutingSignals);
    const triggerSignals = capability.triggerKeywords || [];
    let score = 0;
    const matchedSignals = [];
    const isGuideRequest = isGuideOrInquiryRequest(normalizedInput);
    for (const signal of [...explicitSignals, ...derivedSignals, ...triggerSignals]) {
        const normalizedSignal = normalizePlanningText(signal);
        if (!isDistinctiveSignal(normalizedSignal) || !normalizedInput.includes(normalizedSignal)) {
            continue;
        }
        const exact = normalizedInput === normalizedSignal;
        const explicit = explicitSignals.includes(signal);
        const isSearchCapability = capability.id.toLowerCase().includes('search') ||
            capability.name.includes('搜索') ||
            capability.name.includes('检索');
        // On pure guide/inquiry requests (e.g. installation/tutorials), only explicit/exact capability
        // naming is permitted, unless the capability itself is a search capability.
        if (isGuideRequest && !exact && !explicit && !isSearchCapability) {
            continue;
        }
        matchedSignals.push(signal);
        score = Math.max(score, (exact ? 220 : explicit ? 175 : 160) + Math.min(normalizedSignal.length, 20));
    }
    return { capability, matchedSignals: [...new Set(matchedSignals)], score };
}
function deriveRoutingSignals(value) {
    const normalized = normalizePlanningText(value);
    const signals = new Set();
    value
        .split(/[\s,，。；;:：/|]+/u)
        .map(normalizePlanningText)
        .filter(isDistinctiveSignal)
        .forEach((segment) => signals.add(segment));
    const current = stripSuffixes(normalized, ROUTING_CONTAINER_SUFFIXES);
    if (current && current !== normalized)
        signals.add(current);
    const withoutAction = stripSuffixes(current, ROUTING_ACTION_SUFFIXES);
    if (withoutAction && withoutAction !== current)
        signals.add(withoutAction);
    return [...signals].filter(isDistinctiveSignal);
}
function stripSuffixes(value, suffixes) {
    let current = value;
    let changed = true;
    while (changed) {
        changed = false;
        for (const suffix of suffixes) {
            if (current.endsWith(suffix) && current.length > suffix.length) {
                current = current.slice(0, -suffix.length);
                changed = true;
                break;
            }
        }
    }
    return current;
}
function isDistinctiveSignal(value) {
    if (exports.GENERIC_ROUTING_BUZZWORDS.has(value))
        return false;
    if (/^[a-z0-9]+$/.test(value))
        return value.length >= 3;
    return value.length >= 2;
}
function buildEnumAliasCandidates(property) {
    const allowedValues = property.enum || [];
    const allowed = new Set(allowedValues.map(String));
    const aliases = property[exports.ENUM_ALIASES_SCHEMA_KEY] || {};
    return allowedValues.flatMap((canonicalValue) => {
        const configuredAliases = aliases[String(canonicalValue)] || [];
        return [canonicalValue, ...configuredAliases]
            .map(String)
            .map((alias) => ({
            canonicalValue,
            alias,
            normalizedAlias: normalizePlanningText(alias),
        }))
            .filter((candidate) => allowed.has(String(candidate.canonicalValue)) &&
            isDistinctiveSignal(candidate.normalizedAlias));
    });
}
//# sourceMappingURL=planning-contract.js.map