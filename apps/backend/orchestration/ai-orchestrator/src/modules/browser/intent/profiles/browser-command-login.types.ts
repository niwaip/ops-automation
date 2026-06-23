export type LoginInterruptPolicy = 'fallback' | 'takeover_required';

export interface LoginProfile {
  credentialIntentTerms: string[];
  submitIntentTerms: string[];
  usernameTerms: string[];
  passwordTerms: string[];
  otpTerms: string[];
  submitLabels: string[];
  trailingActionTerms: string[];
  loginSuccessHints: string[];
  takeoverSignals: string[];
  unsupportedAuthSignals: string[];
  interruptPolicy: LoginInterruptPolicy;
  localeHints: string[];
}
