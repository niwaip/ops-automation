import { useTranslation } from 'react-i18next';

// Type derived from zh-CN/execution.json keys at build time (via `import.meta`),
// kept loose to avoid breaking consumers that index by dynamic keys.
export type ExecutionDetailText = Record<string, string>;

// Read locales/{lang}/execution.json as the single source of truth.
// Step 5 will retire this shim and migrate consumers to useTranslation('execution') directly.
export const useExecutionDetailText = (): ExecutionDetailText => {
  const { i18n } = useTranslation('execution');
  const dict = (i18n.getResourceBundle(i18n.resolvedLanguage || i18n.language, 'execution') || {}) as ExecutionDetailText;
  return dict;
};
