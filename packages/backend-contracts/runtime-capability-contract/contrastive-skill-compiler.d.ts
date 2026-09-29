export interface SkillCompilationInput {
    id: string;
    name: string;
    description?: string;
    triggerKeywords?: string[];
    aliases?: string[];
    negativeKeywords?: string[];
    runtimeType?: string;
}
export interface CompiledSkillRoutingProfile {
    skillId: string;
    skillName: string;
    positiveSignals: string[];
    negativeSignals: string[];
}
export declare class ContrastiveSkillCompiler {
    /**
     * Deterministic contrastive feature extractor:
     * Analyzes the whole user/org skill set to eliminate shared generic terms
     * and distill distinctive positive anchors and negative exclusion boundaries.
     */
    static compile(skills: SkillCompilationInput[]): Map<string, CompiledSkillRoutingProfile>;
    /**
     * Optional AI-assisted contrastive compilation:
     * When an LLM caller is provided, prompts the model for global contrastive disambiguation.
     * Seamlessly falls back to deterministic compilation on error or when llmCaller is absent.
     */
    static compileWithAi(skills: SkillCompilationInput[], llmCaller?: (prompt: string) => Promise<string>): Promise<Map<string, CompiledSkillRoutingProfile>>;
    private static buildCompilationPrompt;
    private static parseAiCompilationResponse;
    private static extractDistinctiveNgrams;
}
//# sourceMappingURL=contrastive-skill-compiler.d.ts.map