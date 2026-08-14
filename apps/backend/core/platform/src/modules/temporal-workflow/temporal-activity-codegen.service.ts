import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ActivityFormData, GenerateCodeResult } from './temporal-activity.types';
import { normalizeInputParams } from './temporal-activity-input-params.utils';
import { buildActivityBodyPrompt } from './activity-body-prompt-builder';
import {
  getAiOrchestratorUrl,
  getCarboneExternalUrl,
  getCarboneServiceUrl,
} from '../../config/service-endpoints';

@Injectable()
export class ActivityCodegenService {
  private readonly logger = new Logger('ActivityCodegenService');

  /**
   * Generate Python code using AI
   */
  async generateCode(config: ActivityFormData, errorContext?: string): Promise<GenerateCodeResult> {
    const prompt = buildActivityBodyPrompt(config, errorContext);

    try {
      const aiOrchestratorUrl = getAiOrchestratorUrl();
      this.logger.log(`Calling AI orchestrator at ${aiOrchestratorUrl}/ai/model/call`);

      const response = await axios.post<{ result: string }>(
        `${aiOrchestratorUrl}/ai/model/call`,
        {
          modelId: 'default', // 使用系统默认模型
          prompt,
        },
        { timeout: 120000 }
      );

      let code = response.data?.result;
      if (code) {
        // More robust markdown stripping
        if (code.includes('```')) {
          const match = code.match(/```(?:python)?\n?([\s\S]*?)```/);
          if (match) {
            code = match[1].trim();
          } else {
            // Fallback for weird markdown
            code = code
              .replace(/```[a-zA-Z]*\n?/g, '')
              .replace(/```/g, '')
              .trim();
          }
        }

        this.logger.log('Successfully generated code');
        return { success: true, code };
      } else {
        return { success: false, error: 'AI returned empty response' };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`AI code generation failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }
}
