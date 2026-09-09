import { Injectable, Logger } from '@nestjs/common';
import { ModelService } from '../../../model/model.service';
import type {
  BrowserCommandContext,
  BrowserPlanResponse,
} from '../browser-command.types';
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
      const response = await this.callModelWithFallback(chatModel.id, prompt);
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
      const response = await this.callModelWithFallback(chatModel.id, prompt);
      console.log(`[AI Planner Raw Response]:\n`, response.content);
      return this.browserPlannerResponseParser.parsePlanResponse(response.content);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`AI planning failed, fallback to rules: ${errorMsg}`);
      return null;
    }
  }

  async buildLoginFallbackPlan(
    input: string,
    context: BrowserCommandContext,
    urlPatterns: Record<string, string>
  ): Promise<BrowserPlanResponse | null> {
    const chatModel = await this.getActiveModel();
    if (!chatModel) {
      return null;
    }

    const prompt = this.browserPlannerPromptBuilder.buildLoginFallbackPlanPrompt(
      input,
      context,
      this.formatUrlMappings(urlPatterns)
    );

    try {
      const response = await this.callModelWithFallback(chatModel.id, prompt);
      return this.browserPlannerResponseParser.parsePlanResponse(response.content);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Login AI fallback planning failed: ${errorMsg}`);
      return null;
    }
  }

  private async callModelWithFallback(
    primaryModelId: string,
    prompt: string
  ): Promise<{ content: string }> {
    try {
      return await this.modelService.callModel(primaryModelId, prompt);
    } catch (primaryError: unknown) {
      const errorMsg = primaryError instanceof Error ? primaryError.message : 'Unknown error';
      this.logger.warn(
        `Primary planner model (${primaryModelId}) failed: ${errorMsg}. Attempting fallback models...`
      );

      const models = await this.modelService.listModels();
      const fallbackCandidates = models.filter(
        (m) => m.status === 'active' && m.id !== primaryModelId
      );

      for (const candidate of fallbackCandidates) {
        try {
          this.logger.log(`Attempting fallback planner model: ${candidate.name} (${candidate.id})`);
          const response = await this.modelService.callModel(candidate.id, prompt);
          this.logger.log(`Fallback planner model ${candidate.name} succeeded.`);
          return response;
        } catch (fallbackError: unknown) {
          const fallbackMsg =
            fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
          this.logger.warn(`Fallback planner model (${candidate.id}) failed: ${fallbackMsg}`);
        }
      }

      throw primaryError;
    }
  }

  private async getActiveModel(): Promise<{ id: string } | null> {
    const preferred = this.modelService.getPreferredDefaultModel({
      mode: 'task',
      userRoles: ['admin'],
    });
    if (preferred) {
      return { id: preferred.id };
    }
    const defaultModel = this.modelService.getDefaultModel();
    if (defaultModel) {
      return { id: defaultModel.id };
    }
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
