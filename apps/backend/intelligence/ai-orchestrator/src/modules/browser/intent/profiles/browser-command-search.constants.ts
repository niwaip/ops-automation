export const SEARCH_PROFILE_TYPE = 'search_intent';
export const SEARCH_PROFILE_MAX_TERM_LENGTH = 64;
export const SEARCH_PROFILE_MAX_TERM_COUNT = 24;

export const DEFAULT_SEARCH_TERMS = ['搜索', 'search'] as const;
export const DEFAULT_SMART_SEARCH_TERMS = ['智搜', '智能搜索', 'smart search'] as const;
export const DEFAULT_LIST_RESULT_TERMS = [
  '列出搜索结果',
  '查看搜索结果',
  '显示搜索结果',
  '列出结果',
  '查看结果',
  'show results',
  'list results',
  'inspect results',
] as const;
export const DEFAULT_CLICK_RESULT_TERMS = ['点击', '选择', '打开', 'click', 'open'] as const;
