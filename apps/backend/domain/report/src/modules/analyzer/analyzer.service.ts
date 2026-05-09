import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import {
  ReportTemplateDTO,
  ReportSection,
  AIAnalysisResult,
  StepResult,
} from '../../interfaces';

@Injectable()
export class AnalyzerService {
  private readonly logger = new Logger(AnalyzerService.name);
  private readonly aiOrchestratorUrl: string;

  constructor() {
    this.aiOrchestratorUrl = getAiOrchestratorUrl();
  }

  async analyzeSections(
    template: ReportTemplateDTO,
    stepResults: StepResult[],
  ): Promise<AIAnalysisResult[]> {
    this.logger.log(`Analyzing sections for template ${template.id}`);

    const results: AIAnalysisResult[] = [];

    // Get sections that need AI analysis
    const aiSections = template.sections.filter(s => s.source === 'ai_analysis');

    for (const section of aiSections) {
      const analysis = await this.analyzeSection(section, stepResults, template.ai_config);
      results.push(analysis);
    }

    return results;
  }

  private async analyzeSection(
    section: ReportSection,
    stepResults: StepResult[],
    aiConfig?: ReportTemplateDTO['ai_config'],
  ): Promise<AIAnalysisResult> {
    this.logger.debug(`Analyzing section: ${section.id}`);

    try {
      // Get relevant step results for context
      const relevantSteps = this.getRelevantSteps(section, stepResults);
      const context = this.buildContext(relevantSteps);

      // Build prompt
      const prompt = this.buildPrompt(section, context);

      // Call AI Orchestrator
      const response = await this.callAI(prompt, aiConfig);

      return {
        section_id: section.id,
        analysis: response.content,
        confidence: response.confidence,
        tokens_used: response.tokens_used,
      };
    } catch (error) {
      this.logger.error(`Failed to analyze section ${section.id}: ${error}`);
      return {
        section_id: section.id,
        analysis: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private getRelevantSteps(section: ReportSection, stepResults: StepResult[]): StepResult[] {
    let results = stepResults;

    if (section.step_filter) {
      if (section.step_filter.actions) {
        results = results.filter(r => section.step_filter!.actions!.includes(r.action));
      }
      if (section.step_filter.success_only) {
        results = results.filter(r => r.success);
      }
      if (section.step_filter.step_ids) {
        results = results.filter(r => section.step_filter!.step_ids!.includes(r.step_id));
      }
    }

    return results;
  }

  private buildContext(steps: StepResult[]): string {
    if (steps.length === 0) {
      return 'No step results available for this section.';
    }

    return steps
      .map(s => {
        const parts = [
          `Step ${s.step_index !== undefined ? s.step_index + 1 : s.step_id}:`,
          `  Action: ${s.action}`,
          `  Status: ${s.success ? 'Success' : 'Failed'}`,
        ];

        if (s.message) parts.push(`  Message: ${s.message}`);
        if (s.text) parts.push(`  Text: ${s.text}`);
        if (s.error) parts.push(`  Error: ${s.error}`);
        if (s.screenshot) parts.push(`  Screenshot: [Base64 image data available]`);

        // Add metadata if available
        if (s.metadata) {
          const metaStr = JSON.stringify(s.metadata, null, 2);
          if (metaStr !== '{}') {
            parts.push(`  Metadata: ${metaStr}`);
          }
        }

        return parts.join('\n');
      })
      .join('\n\n');
  }

  private buildPrompt(section: ReportSection, context: string): string {
    const basePrompt = section.ai_prompt || 'Analyze the following execution results and provide a summary:';

    return `${basePrompt}\n\nExecution Context:\n${context}\n\nPlease provide your analysis.`;
  }

  private async callAI(
    prompt: string,
    aiConfig?: ReportTemplateDTO['ai_config'],
  ): Promise<{ content: string; confidence?: number; tokens_used?: number }> {
    try {
      // Get available models
      const modelsResponse = await axios.get(`${this.aiOrchestratorUrl}/ai/models`);
      const models = modelsResponse.data.models;

      if (!models || models.length === 0) {
        throw new Error('No AI models available');
      }

      // Select model
      let modelId = aiConfig?.model_id;
      if (!modelId) {
        // Use first active model
        const activeModel = models.find((m: { status: string }) => m.status === 'active');
        if (!activeModel) {
          throw new Error('No active AI models available');
        }
        modelId = activeModel.id;
      }

      // Test/call the model
      const testResponse = await axios.post(
        `${this.aiOrchestratorUrl}/ai/models/${modelId}/test`,
        { prompt },
        {
          timeout: 60000,
        },
      );

      if (!testResponse.data.success) {
        throw new Error(testResponse.data.error || 'AI call failed');
      }

      return {
        content: testResponse.data.response,
        tokens_used: Math.ceil(prompt.length / 4), // Approximate
      };
    } catch (error) {
      this.logger.error(`AI call failed: ${error}`);
      throw error;
    }
  }
}
