"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContrastiveSkillCompiler = void 0;
const planning_contract_1 = require("./planning-contract");
const GENERIC_SKILL_BUZZWORDS = planning_contract_1.GENERIC_ROUTING_BUZZWORDS;
class ContrastiveSkillCompiler {
    /**
     * Deterministic contrastive feature extractor:
     * Analyzes the whole user/org skill set to eliminate shared generic terms
     * and distill distinctive positive anchors and negative exclusion boundaries.
     */
    static compile(skills) {
        const result = new Map();
        if (!skills || skills.length === 0) {
            return result;
        }
        // Step 1: Tokenize and compute Document Frequency (DF) across the skill pool
        const skillTerms = new Map();
        const documentFrequency = new Map();
        for (const skill of skills) {
            const rawText = `${skill.name} ${skill.description || ''} ${(skill.aliases || []).join(' ')} ${(skill.triggerKeywords || []).join(' ')}`;
            const terms = this.extractDistinctiveNgrams(rawText);
            skillTerms.set(skill.id, terms);
            for (const term of terms) {
                documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
            }
        }
        // A term is non-discriminative if it appears across multiple skills or is in generic buzzwords
        const thresholdDf = skills.length <= 2 ? 2 : Math.max(2, Math.floor(skills.length * 0.4));
        const isNonDiscriminative = (term) => {
            if (GENERIC_SKILL_BUZZWORDS.has(term))
                return true;
            const df = documentFrequency.get(term) || 0;
            return df >= thresholdDf;
        };
        // Step 2: Extract discriminative positive anchors for each skill
        const skillSpecificAnchors = new Map();
        for (const skill of skills) {
            const terms = skillTerms.get(skill.id) || new Set();
            const distinctiveTerms = [...terms]
                .filter((t) => !isNonDiscriminative(t) && t.length >= 2)
                .sort((a, b) => b.length - a.length);
            skillSpecificAnchors.set(skill.id, distinctiveTerms);
        }
        // Step 3: Build the compiled routing profile
        for (const skill of skills) {
            const distinctive = skillSpecificAnchors.get(skill.id) || [];
            const positiveSet = new Set();
            // Always include explicit name and explicit aliases
            if (skill.name)
                positiveSet.add(skill.name);
            for (const alias of skill.aliases || []) {
                if (alias.trim())
                    positiveSet.add(alias.trim());
            }
            for (const kw of skill.triggerKeywords || []) {
                const norm = (0, planning_contract_1.normalizePlanningText)(kw);
                // Only keep triggers that are distinctive in this pool
                if (!GENERIC_SKILL_BUZZWORDS.has(norm) && norm.length >= 2) {
                    positiveSet.add(kw.trim());
                }
            }
            // Add top distinctive terms from description
            for (const term of distinctive.slice(0, 8)) {
                positiveSet.add(term);
            }
            // Negative exclusion signals:
            const negativeSet = new Set();
            // 1. Explicit user-provided negative keywords
            for (const neg of skill.negativeKeywords || []) {
                if (neg.trim())
                    negativeSet.add(neg.trim());
            }
            // 2. Default guide/inquiry safety guard for non-installer skills
            const isInstallerSkill = /安装|部署|教程|文档指南/i.test(skill.name);
            if (!isInstallerSkill) {
                for (const pattern of planning_contract_1.GUIDE_INQUIRY_PATTERNS) {
                    negativeSet.add(pattern);
                }
            }
            // 3. Collision protection from other skills in the user's pool
            for (const otherSkill of skills) {
                if (otherSkill.id === skill.id)
                    continue;
                // Peer skill distinctive triggers and name serve as primary collision boundaries
                if (otherSkill.name && !distinctive.includes(otherSkill.name)) {
                    negativeSet.add(otherSkill.name);
                }
                for (const kw of otherSkill.triggerKeywords || []) {
                    const norm = (0, planning_contract_1.normalizePlanningText)(kw);
                    if (!distinctive.includes(kw) &&
                        !GENERIC_SKILL_BUZZWORDS.has(norm) &&
                        norm.length >= 2) {
                        negativeSet.add(kw);
                    }
                }
                const otherAnchors = skillSpecificAnchors.get(otherSkill.id) || [];
                for (const anchor of otherAnchors.slice(0, 5)) {
                    // If the other anchor doesn't appear in this skill, it can act as a disambiguation boundary
                    const isSufficientLength = /[\u4e00-\u9fa5]/.test(anchor)
                        ? anchor.length >= 2
                        : anchor.length >= 3;
                    if (!distinctive.includes(anchor) && isSufficientLength) {
                        negativeSet.add(anchor);
                    }
                }
            }
            result.set(skill.id, {
                skillId: skill.id,
                skillName: skill.name,
                positiveSignals: [...positiveSet],
                negativeSignals: [...negativeSet],
            });
        }
        return result;
    }
    /**
     * Optional AI-assisted contrastive compilation:
     * When an LLM caller is provided, prompts the model for global contrastive disambiguation.
     * Seamlessly falls back to deterministic compilation on error or when llmCaller is absent.
     */
    static async compileWithAi(skills, llmCaller) {
        const baseProfiles = this.compile(skills);
        if (!llmCaller || skills.length <= 1) {
            return baseProfiles;
        }
        try {
            const prompt = this.buildCompilationPrompt(skills);
            const rawResponse = await llmCaller(prompt);
            const parsed = this.parseAiCompilationResponse(rawResponse, skills);
            if (parsed && parsed.size > 0) {
                // Merge AI signals with base profiles (union of positive and negative signals)
                for (const [skillId, aiProfile] of parsed.entries()) {
                    const base = baseProfiles.get(skillId);
                    if (base) {
                        const mergedPos = new Set([...base.positiveSignals, ...aiProfile.positiveSignals]);
                        const mergedNeg = new Set([...base.negativeSignals, ...aiProfile.negativeSignals]);
                        baseProfiles.set(skillId, {
                            skillId,
                            skillName: base.skillName,
                            positiveSignals: [...mergedPos],
                            negativeSignals: [...mergedNeg],
                        });
                    }
                }
            }
        }
        catch {
            // Graceful fallback to deterministic profiles without breaking caller
        }
        return baseProfiles;
    }
    static buildCompilationPrompt(skills) {
        const skillsList = skills
            .map((s, idx) => `${idx + 1}. [id: "${s.id}"] 名称: "${s.name}" | 描述: "${s.description || '无'}"`)
            .join('\n');
        return `你是一个企业任务技能路由特征编译器。当前用户拥有以下 [${skills.length}] 个业务技能：
${skillsList}

请进行互斥区分度分析，为每个技能提取高区分度的路由指纹：
1. positive_signals: 提取该技能独有的业务专有动作与实体，严禁包含“AI”、“问答”、“处理”、“查询”等通用大词。
2. negative_signals: 明确列出该技能禁止响应的通用问答、教程或冲突场景（如“安装方法”、“使用教程”）。

请严格返回以下 JSON 格式：
{
  "skills": [
    {
      "id": "技能id",
      "positive_signals": ["专属动词实体1", "专属动词实体2"],
      "negative_signals": ["排除词1", "排除词2"]
    }
  ]
}`;
    }
    static parseAiCompilationResponse(response, skills) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch)
                return null;
            const parsed = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed.skills))
                return null;
            const map = new Map();
            const validIds = new Set(skills.map((s) => s.id));
            for (const item of parsed.skills) {
                if (item?.id && validIds.has(item.id)) {
                    map.set(item.id, {
                        positiveSignals: Array.isArray(item.positive_signals)
                            ? item.positive_signals.map(String).filter((s) => s.trim().length >= 2)
                            : [],
                        negativeSignals: Array.isArray(item.negative_signals)
                            ? item.negative_signals.map(String).filter((s) => s.trim().length >= 2)
                            : [],
                    });
                }
            }
            return map;
        }
        catch {
            return null;
        }
    }
    static extractDistinctiveNgrams(text) {
        const normalized = text.toLowerCase();
        const result = new Set();
        // Alpha words
        const words = normalized.match(/[a-z0-9_\-\.]+/g) || [];
        for (const w of words) {
            if (w.length >= 2 && !GENERIC_SKILL_BUZZWORDS.has(w)) {
                result.add(w);
            }
        }
        // CJK blocks and 2-grams / 3-grams
        const cjkMatches = normalized.match(/[\u4e00-\u9fff]+/g) || [];
        for (const block of cjkMatches) {
            if (block.length >= 2 && block.length <= 6 && !GENERIC_SKILL_BUZZWORDS.has(block)) {
                result.add(block);
            }
            for (let i = 0; i < block.length - 1; i++) {
                const bg = block.slice(i, i + 2);
                if (!GENERIC_SKILL_BUZZWORDS.has(bg)) {
                    result.add(bg);
                }
            }
            for (let i = 0; i < block.length - 2; i++) {
                const tg = block.slice(i, i + 3);
                if (!GENERIC_SKILL_BUZZWORDS.has(tg)) {
                    result.add(tg);
                }
            }
        }
        return result;
    }
}
exports.ContrastiveSkillCompiler = ContrastiveSkillCompiler;
//# sourceMappingURL=contrastive-skill-compiler.js.map