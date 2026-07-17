import { Injectable, Logger } from '@nestjs/common';
import { ModelService } from '../../../model/model.service';
import type { RecorderObservedRegion } from '../../execute/recorder-debug.types';
import type { BrowserCommandCandidate } from '../browser-command.types';

@Injectable()
export class TableRegionResolverService {
  private readonly logger = new Logger(TableRegionResolverService.name);

  constructor(private readonly modelService: ModelService) {}

  async resolveTableRegion(params: {
    userScope: string;
    regions?: RecorderObservedRegion[];
    candidates: BrowserCommandCandidate[];
    pageTitle?: string;
    pageUrl?: string;
  }): Promise<string | null> {
    const chatModel = await this.getActiveModel();
    if (!chatModel) {
      this.logger.warn('No active AI model available for table region resolution');
      return null;
    }

    if (!params.regions || params.regions.length === 0) {
      return null;
    }

    // Prepare regions summary for AI
    const regionsSummary = params.regions.map(r => {
      const entryCount = r.entryCount || 0;
      const rowCount = params.candidates.filter(c => c.kind === 'row' && c.region?.name === r.regionId).length;
      return `- regionId: "${r.regionId}", label: "${r.label || 'unknown'}", textSnippet: "${r.text ? r.text.substring(0, 100).replace(/\n/g, ' ') : ''}", rowCount: ${rowCount}, entryCount: ${entryCount}`;
    }).join('\n');

    const prompt = `You are a web page region matching assistant.
The user wants to interact with a table, list, or grid named: "${params.userScope}".

Below are the visible regions on the current page:
${regionsSummary}

Your task:
Identify which of the above regions is MOST LIKELY the one the user wants to interact with.
If there is an obvious match based on the label, textSnippet, or regionId, select it.
If none of them look even remotely close, return null.

CRITICAL: You MUST respond with ONLY a valid JSON object, NO other text.
Response format:
{
  "regionId": "the-matched-region-id-string", // or null if no match
  "reasoning": "brief explanation"
}`;

    try {
      const response = await this.modelService.callModel(chatModel.id, prompt);
      const content = response.content.trim();
      
      let parsed: { regionId: string | null; reasoning?: string };
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : content;
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        this.logger.warn(`Failed to parse AI region resolution response: ${content}`);
        return null;
      }

      if (parsed.regionId) {
        this.logger.debug(`AI resolved table region "${params.userScope}" to regionId "${parsed.regionId}". Reasoning: ${parsed.reasoning}`);
        return parsed.regionId;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error resolving table region with AI: ${error}`);
      return null;
    }
  }

  private async getActiveModel(): Promise<{ id: string } | null> {
    const models = await this.modelService.listModels();
    const chatModel = models.find((model) => model.status === 'active');
    return chatModel ? { id: chatModel.id } : null;
  }
}
