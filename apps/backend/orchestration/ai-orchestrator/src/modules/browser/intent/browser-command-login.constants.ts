import type { LoginProfile } from './browser-command-login.types';

export const LOGIN_PROFILE_TYPE = 'login_terms';
export const MAX_PROFILE_TERM_LENGTH = 64;
export const MAX_PROFILE_TERM_COUNT = 48;

export const DEFAULT_LOGIN_PROFILE: LoginProfile = {
  credentialIntentTerms: [
    '用户名',
    '账号',
    '账户',
    'user',
    'username',
    '邮箱',
    'email',
    '手机号',
    'mobile',
    'phone',
    '密码',
    'password',
    'pass',
    '验证码',
    'verification',
    'otp',
    'code',
  ],
  submitIntentTerms: ['登录', '登入', 'sign in', 'log in', 'log on', 'next', 'submit', '提交'],
  usernameTerms: [
    '用户名',
    '账号',
    '账户',
    'user',
    'username',
    '邮箱',
    'email',
    '手机号',
    'mobile',
    'phone',
  ],
  passwordTerms: ['密码', 'password', 'pass'],
  otpTerms: ['验证码', 'verification code', 'verification', 'otp', 'code'],
  submitLabels: ['登录', '登入', 'Sign In', 'Log In', 'Log On', 'Next', '提交', 'Submit'],
  trailingActionTerms: ['然后', '并', '再', '接着', '之后', '登录成功后'],
  loginSuccessHints: ['首页', '工作台', 'dashboard', 'home'],
  takeoverSignals: ['请拖动滑块', '安全校验', '扫码登录', 'scan code', 'verify', 'captcha'],
  unsupportedAuthSignals: ['Passkey', '企业微信扫码', '硬件盾', '扫码', 'scan qr'],
  interruptPolicy: 'takeover_required',
  localeHints: ['zh-CN', 'en-US'],
};

export const LOGIN_PROFILE_ARRAY_OUTPUT_KEYS = [
  'credential_intent_terms',
  'submit_intent_terms',
  'username_terms',
  'password_terms',
  'otp_terms',
  'submit_labels',
  'trailing_action_terms',
  'login_success_hints',
  'takeover_signals',
  'unsupported_auth_signals',
  'locale_hints',
] as const;
