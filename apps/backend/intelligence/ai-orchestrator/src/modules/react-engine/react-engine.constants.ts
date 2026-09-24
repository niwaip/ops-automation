import type { ReActConfig } from './interfaces';

export const DEFAULT_REACT_CONFIG: ReActConfig = {
  maxIterations: Number(process.env.REACT_MAX_ITERATIONS || 10),
  modelId: 'default',
  tools: [
    'skill_match',
    'preview_params',
    'document_render',
    'param_collect',
    'user_ask',
    'file_parse',
    'api_call',
    'flow_execute',
  ],
  mode: 'task',
};
