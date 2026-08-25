import type { CapabilityRoutingCard } from './manifest';
export declare class RoutingCardBuilder {
    private readonly card;
    named(displayName: string, summary: string): this;
    goals(...goals: string[]): this;
    aliases(...aliases: string[]): this;
    examples(positive: string[], negative: string[]): this;
    build(): CapabilityRoutingCard;
}
//# sourceMappingURL=routing-card.d.ts.map