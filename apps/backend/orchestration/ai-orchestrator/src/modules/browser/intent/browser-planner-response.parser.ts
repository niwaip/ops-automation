import { Injectable, Logger } from '@nestjs/common';
import type { BrowserCommand, BrowserPlanResponse, BrowserPlanStep } from './browser-command.types';

@Injectable()
export class BrowserPlannerResponseParser {
  private readonly logger = new Logger(BrowserPlannerResponseParser.name);

  parseCommandResponse(content?: string): {
    commands: BrowserCommand[];
    explanation: string;
  } | null {
    const parsed = this.parseJsonObject(content);
    if (!parsed) {
      return null;
    }

    return {
      commands: Array.isArray(parsed.commands) ? (parsed.commands as BrowserCommand[]) : [],
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
    };
  }

  parsePlanResponse(content?: string): BrowserPlanResponse | null {
    const parsed = this.parseJsonObject(content);
    if (!parsed) {
      return null;
    }

    if (Array.isArray(parsed.steps)) {
      return {
        steps: parsed.steps as BrowserPlanStep[],
        explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
      };
    }

    if (Array.isArray(parsed.commands)) {
      return {
        steps: (parsed.commands as Array<Record<string, unknown>>).map((command) => ({
          action: String(command.tool || '') as BrowserPlanStep['action'],
          params: (command.params as Record<string, unknown>) || {},
          description: typeof command.description === 'string' ? command.description : undefined,
        })),
        explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
      };
    }

    return null;
  }

  private parseJsonObject(content?: string): Record<string, any> | null {
    if (!content) {
      return null;
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = (jsonMatch ? jsonMatch[0] : content).trim();
    try {
      return JSON.parse(jsonStr) as Record<string, any>;
    } catch (error) {
      this.logger.warn(
        `Failed to parse planner JSON: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      return null;
    }
  }
}
