import axios from 'axios';

export type AiModelDescriptor = {
  id: string;
  status: string;
  [key: string]: unknown;
};

export type AiModelsResponse = {
  models?: AiModelDescriptor[];
};

export type AiTestResponse = {
  success?: boolean;
  response?: any;
  error?: string;
};

export async function resolveActiveAiModelId(
  aiOrchestratorUrl: string,
  timeout = 5000
): Promise<string | null> {
  const modelsResponse = await axios.get<AiModelsResponse>(`${aiOrchestratorUrl}/ai/models`, {
    timeout,
  });
  const models = modelsResponse.data?.models || [];
  const activeModel = models.find((model) => model.status === 'active');
  return activeModel?.id || null;
}

export async function callAiJson(
  aiOrchestratorUrl: string,
  prompt: string,
  retryCount = 0
): Promise<any> {
  try {
    const activeModelId = await resolveActiveAiModelId(aiOrchestratorUrl);
    if (!activeModelId) {
      throw new Error('没有可用的活跃AI模型');
    }

    const response = await axios.post<AiTestResponse>(
      `${aiOrchestratorUrl}/ai/models/${activeModelId}/test`,
      { prompt },
      { timeout: 120000 }
    );

    if (!response.data.success) {
      throw new Error(response.data.error || 'AI服务返回失败');
    }

    const responseText = String(response.data.response || '');
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(responseText);
    } catch {
      return { response: responseText };
    }
  } catch (error) {
    if (retryCount < 1) {
      return callAiJson(aiOrchestratorUrl, prompt, retryCount + 1);
    }
    throw error;
  }
}

export async function callAiText(
  aiOrchestratorUrl: string,
  prompt: string,
  timeout = 180000
): Promise<string | null> {
  const activeModelId = await resolveActiveAiModelId(aiOrchestratorUrl);
  if (!activeModelId) {
    return null;
  }

  const response = await axios.post<AiTestResponse>(
    `${aiOrchestratorUrl}/ai/models/${activeModelId}/test`,
    { prompt },
    { timeout }
  );
  if (!response.data.success) {
    return null;
  }
  return String(response.data.response || '');
}

export async function streamAiText(
  aiOrchestratorUrl: string,
  prompt: string,
  onProgress?: (chunk: string) => void
): Promise<string | null> {
  const activeModelId = await resolveActiveAiModelId(aiOrchestratorUrl);
  if (!activeModelId) {
    return null;
  }

  const response = await fetch(`${aiOrchestratorUrl}/ai/models/${activeModelId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    return null;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return null;
  }

  const decoder = new TextDecoder();
  let fullResponse = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) {
        continue;
      }
      try {
        const data = JSON.parse(line.slice(6));
        if (data.chunk) {
          fullResponse += data.chunk;
          onProgress?.(data.chunk);
        }
      } catch {
        // Ignore malformed SSE chunks and continue streaming.
      }
    }
  }

  return fullResponse;
}
