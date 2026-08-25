import type { CapabilityRoutingCard } from './manifest';

export class RoutingCardBuilder {
  private readonly card: CapabilityRoutingCard = {
    displayName: '',
    summary: '',
    aliases: [],
    goals: [],
    positiveExamples: [],
    negativeExamples: [],
  };

  named(displayName: string, summary: string): this {
    this.card.displayName = displayName.trim();
    this.card.summary = summary.trim();
    return this;
  }

  goals(...goals: string[]): this {
    this.card.goals.push(...goals.map((value) => value.trim()).filter(Boolean));
    return this;
  }

  aliases(...aliases: string[]): this {
    this.card.aliases.push(...aliases.map((value) => value.trim()).filter(Boolean));
    return this;
  }

  examples(positive: string[], negative: string[]): this {
    this.card.positiveExamples.push(...positive);
    this.card.negativeExamples.push(...negative);
    return this;
  }

  build(): CapabilityRoutingCard {
    if (
      !this.card.displayName ||
      !this.card.summary ||
      !this.card.aliases.length ||
      !this.card.goals.length
    ) {
      throw new Error(
        'Routing card requires displayName, summary, at least one alias and at least one goal'
      );
    }
    return structuredClone(this.card);
  }
}
