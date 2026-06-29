import axios from 'axios';
import { getAiOrchestratorUrl } from '../../../config/service-endpoints';

export async function callTemplateWorkflowAiText(
  prompt: string,
  retryCount = 0
): Promise<string> {
  const aiOrchestratorUrl = getAiOrchestratorUrl();
  const aiModelId = process.env.AI_MODEL_ID || 'default';
  const maxRetries = 2;
  const actualPrompt =
    retryCount > 0
      ? `${prompt}\n\n【重要】请只返回 JSON 对象，不要 markdown，不要解释文字。`
      : prompt;

  try {
    const response = await axios.post<{ response?: string }>(
      `${aiOrchestratorUrl}/ai/models/${aiModelId}/test`,
      { prompt: actualPrompt },
      { timeout: 180000 }
    );
    const content = String(response.data?.response || '')
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    if (content) {
      return content;
    }

    if (retryCount < maxRetries) {
      return callTemplateWorkflowAiText(prompt, retryCount + 1);
    }

    throw new Error('AI 返回为空');
  } catch (error) {
    if (retryCount < maxRetries) {
      return callTemplateWorkflowAiText(prompt, retryCount + 1);
    }
    throw error;
  }
}
