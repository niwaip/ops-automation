import { apiClient } from './index';

export interface RecognizeParamsRequest {
  template_id: string;
  user_input: string;
  context?: Record<string, unknown>;
  params_schema?: {
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        default?: string | number | boolean | Record<string, unknown>;
      }
    >;
    required?: string[];
  };
}

export interface RecognizeParamsResponse {
  params: Record<string, unknown>;
  confidence: number;
  suggestions?: string[];
}

export const aiApi = {
  recognizeParams: async (data: RecognizeParamsRequest): Promise<RecognizeParamsResponse> => {
    return apiClient.post<RecognizeParamsResponse>('/ai/recognize-params', data);
  },
};
