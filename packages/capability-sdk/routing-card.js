"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoutingCardBuilder = void 0;
class RoutingCardBuilder {
    constructor() {
        this.card = {
            displayName: '',
            summary: '',
            aliases: [],
            goals: [],
            positiveExamples: [],
            negativeExamples: [],
        };
    }
    named(displayName, summary) {
        this.card.displayName = displayName.trim();
        this.card.summary = summary.trim();
        return this;
    }
    goals(...goals) {
        this.card.goals.push(...goals.map((value) => value.trim()).filter(Boolean));
        return this;
    }
    aliases(...aliases) {
        this.card.aliases.push(...aliases.map((value) => value.trim()).filter(Boolean));
        return this;
    }
    examples(positive, negative) {
        this.card.positiveExamples.push(...positive);
        this.card.negativeExamples.push(...negative);
        return this;
    }
    build() {
        if (!this.card.displayName ||
            !this.card.summary ||
            !this.card.aliases.length ||
            !this.card.goals.length) {
            throw new Error('Routing card requires displayName, summary, at least one alias and at least one goal');
        }
        return structuredClone(this.card);
    }
}
exports.RoutingCardBuilder = RoutingCardBuilder;
//# sourceMappingURL=routing-card.js.map