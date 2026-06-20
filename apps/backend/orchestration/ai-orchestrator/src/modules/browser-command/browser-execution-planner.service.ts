import { Injectable, Logger } from '@nestjs/common';
import { ModelService } from '../model/model.service';
import type {
  BrowserCommandContext,
  BrowserPlanResponse,
} from './browser-command.types';
import { BrowserPlannerPromptBuilder } from './browser-planner-prompt.builder';
import { BrowserPlannerResponseParser } from './browser-planner-response.parser';

@Injectable()
export class BrowserExecutionPlannerService {
  private readonly logger = new Logger(BrowserExecutionPlannerService.name);

  constructor(
    private readonly modelService: ModelService,
    private readonly browserPlannerPromptBuilder: BrowserPlannerPromptBuilder,
    private readonly browserPlannerResponseParser: BrowserPlannerResponseParser
  ) {}

  async parseCommands(
    input: string,
    context: BrowserCommandContext,
    urlPatterns: Record<string, string>
  ): Promise<{ success: boolean; commands: any[]; explanation: string }> {
    const chatModel = await this.getActiveModel();
    if (!chatModel) {
      return {
        success: false,
        commands: [],
        explanation: '未找到可用的 AI 模型，请先配置 AI 模型',
      };
    }

    const prompt = this.browserPlannerPromptBuilder.buildParserPrompt(
      input,
      context,
      this.formatUrlMappings(urlPatterns)
    );

    try {
      const response = await this.modelService.callModel(chatModel.id, prompt);
      this.logger.debug(`AI raw response: ${response.content}`);
      const parsed = this.browserPlannerResponseParser.parseCommandResponse(response.content);
      if (!parsed) {
        return {
          success: false,
          commands: [],
          explanation: 'AI 返回格式错误，请重试',
        };
      }

      return {
        success: true,
        commands: parsed.commands,
        explanation: parsed.explanation,
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`AI parsing error: ${errorMsg}`);
      return {
        success: false,
        commands: [],
        explanation: `AI 解析失败: ${errorMsg}`,
      };
    }
  }

  async buildPlan(
    input: string,
    context: BrowserCommandContext,
    urlPatterns: Record<string, string>
  ): Promise<BrowserPlanResponse | null> {
    const chatModel = await this.getActiveModel();
    if (!chatModel) {
      return null;
    }

    const prompt = this.browserPlannerPromptBuilder.buildPlanPrompt(
      input,
      context,
      this.formatUrlMappings(urlPatterns)
    );

    try {
      const response = await this.modelService.callModel(chatModel.id, prompt);
      return this.browserPlannerResponseParser.parsePlanResponse(response.content);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`AI planning failed, fallback to rules: ${errorMsg}`);
      return null;
    }
  }

  private async getActiveModel(): Promise<{ id: string } | null> {
    const models = await this.modelService.listModels();
    const chatModel = models.find((model) => model.status === 'active');
    return chatModel ? { id: chatModel.id } : null;
  }

  private formatUrlMappings(urlPatterns: Record<string, string>): string {
    return Object.entries(urlPatterns)
      .map(([name, url]) => `- ${name} -> ${url}`)
      .join('\n');
  }
}
