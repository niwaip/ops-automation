const LOGIN_PROFILE_TYPE = 'login_terms';

type LoginProfileDraftSource = {
  sampleText?: string | null;
  errorMessage?: string | null;
  observationSummary?: string | null;
};

const LOGIN_PROFILE_TERM_CANDIDATES = {
  username_terms: [
    '用户名',
    '账号',
    '账户',
    'user',
    'username',
    'email',
    '邮箱',
    'mobile',
    'phone',
    '手机号',
    '工号',
  ],
  password_terms: ['密码', 'password', 'pass', 'passcode', '口令'],
  otp_terms: ['验证码', 'verification code', 'verification', 'otp', 'code'],
  submit_intent_terms: ['登录', '登入', 'sign in', 'log in', 'log on', 'next', '继续', '提交', 'submit'],
  submit_labels: ['登录', '登入', 'Sign In', 'Log In', 'Log On', 'Next', '继续', '提交', 'Submit'],
  trailing_action_terms: ['然后', '并', '再', '接着', '之后'],
  takeover_signals: ['请拖动滑块', '安全校验', '扫码登录', 'scan code', 'captcha'],
  unsupported_auth_signals: ['Passkey', '企业微信扫码', '硬件盾', '扫码', 'scan qr'],
} as const;

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function collectSourceTexts(sources: LoginProfileDraftSource[]): string[] {
  return sources
    .flatMap((source) => [source.sampleText, source.errorMessage, source.observationSummary])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function collectObservedTerms(
  sourceTexts: string[],
  candidates: readonly string[]
): string[] {
  return candidates.filter((candidate) => {
    const normalizedCandidate = normalizeText(candidate);
    return sourceTexts.some((text) => normalizeText(text).includes(normalizedCandidate));
  });
}

function inferLocaleHints(sourceTexts: string[]): string[] {
  const joined = sourceTexts.join(' ');
  const hints: string[] = [];

  if (/[\u4e00-\u9fff]/.test(joined)) {
    hints.push('zh-CN');
  }

  if (/[a-z]/i.test(joined)) {
    hints.push('en-US');
  }

  return hints;
}

export function buildLoginProfileDraftOutputs(input: {
  sources: LoginProfileDraftSource[];
}): Record<string, unknown> {
  const sourceTexts = collectSourceTexts(input.sources);
  const usernameTerms = collectObservedTerms(
    sourceTexts,
    LOGIN_PROFILE_TERM_CANDIDATES.username_terms
  );
  const passwordTerms = collectObservedTerms(
    sourceTexts,
    LOGIN_PROFILE_TERM_CANDIDATES.password_terms
  );
  const otpTerms = collectObservedTerms(sourceTexts, LOGIN_PROFILE_TERM_CANDIDATES.otp_terms);
  const submitIntentTerms = collectObservedTerms(
    sourceTexts,
    LOGIN_PROFILE_TERM_CANDIDATES.submit_intent_terms
  );
  const submitLabels = collectObservedTerms(
    sourceTexts,
    LOGIN_PROFILE_TERM_CANDIDATES.submit_labels
  );
  const trailingActionTerms = collectObservedTerms(
    sourceTexts,
    LOGIN_PROFILE_TERM_CANDIDATES.trailing_action_terms
  );
  const takeoverSignals = collectObservedTerms(
    sourceTexts,
    LOGIN_PROFILE_TERM_CANDIDATES.takeover_signals
  );
  const unsupportedAuthSignals = collectObservedTerms(
    sourceTexts,
    LOGIN_PROFILE_TERM_CANDIDATES.unsupported_auth_signals
  );
  const credentialIntentTerms = unique([...usernameTerms, ...passwordTerms, ...otpTerms]);
  const localeHints = inferLocaleHints(sourceTexts);

  const outputs: Record<string, unknown> = {
    profile_type: LOGIN_PROFILE_TYPE,
    interrupt_policy: 'takeover_required',
  };

  if (credentialIntentTerms.length) {
    outputs.credential_intent_terms = credentialIntentTerms;
  }
  if (usernameTerms.length) {
    outputs.username_terms = usernameTerms;
  }
  if (passwordTerms.length) {
    outputs.password_terms = passwordTerms;
  }
  if (otpTerms.length) {
    outputs.otp_terms = otpTerms;
  }
  if (submitIntentTerms.length) {
    outputs.submit_intent_terms = submitIntentTerms;
  }
  if (submitLabels.length) {
    outputs.submit_labels = submitLabels;
  }
  if (trailingActionTerms.length) {
    outputs.trailing_action_terms = trailingActionTerms;
  }
  if (takeoverSignals.length) {
    outputs.takeover_signals = takeoverSignals;
  }
  if (unsupportedAuthSignals.length) {
    outputs.unsupported_auth_signals = unsupportedAuthSignals;
  }
  if (localeHints.length) {
    outputs.locale_hints = localeHints;
  }

  return outputs;
}
