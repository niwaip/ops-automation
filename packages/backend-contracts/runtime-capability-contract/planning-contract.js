"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUIDE_INQUIRY_PATTERNS = exports.GENERIC_ROUTING_BUZZWORDS = exports.ENUM_ALIASES_SCHEMA_KEY = void 0;
exports.normalizePlanningText = normalizePlanningText;
exports.isGuideOrInquiryRequest = isGuideOrInquiryRequest;
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
function matchDeterministicRoutingCapability(userInput, capabilities) {
    const normalizedInput = normalizePlanningText(userInput);
    if (!normalizedInput)
        return null;
    const ranked = capabilities
        .map((capability) => rankCapability(normalizedInput, capability))
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
function rankCapability(normalizedInput, capability) {
    // If negative keywords are defined and any matches, reject this capability immediately
    if (Array.isArray(capability.negativeKeywords) && capability.negativeKeywords.length > 0) {
        for (const neg of capability.negativeKeywords) {
            const normalizedNeg = normalizePlanningText(neg);
            if (normalizedNeg && normalizedInput.includes(normalizedNeg)) {
                return { capability, matchedSignals: [], score: 0 };
            }
        }
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