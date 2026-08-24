import { Injectable } from '@nestjs/common';
import type { RuntimeSemanticRule } from '../../../../client/browser-semantics.client';
import type {
  BrowserCommand,
  BrowserCommandContext,
  ParseBrowserCommandResponse,
} from '../browser-command.types';
import {
  buildPendingClickIntent,
  inferSemanticHint,
  type PendingActionIntent,
} from '../atomic-parsers/action-intent.builder';
import {
  DEFAULT_LOGIN_PROFILE,
  LOGIN_PROFILE_ARRAY_OUTPUT_KEYS,
  LOGIN_PROFILE_TYPE,
} from './browser-command-login.constants';
import {
  mapProfileOutputKey,
  mergeLoginProfiles,
  mergeStringArrays,
  normalizeProfileTerms,
} from './browser-command-login.profile';
import type { LoginProfile } from './browser-command-login.types';

export interface BrowserCommandLoginRuntimeDeps {
  resolveUrl: (input: string) => string;
  resolvePendingClickIntent: (
    intent: PendingActionIntent,
    context: BrowserCommandContext,
    description: string
  ) => BrowserCommand | null;
}

export type LoginParseStatus =
  | 'no_match'
  | 'success'
  | 'partial'
  | 'profile_miss'
  | 'takeover_required';

export interface BrowserCommandLoginParseOptions {
  runtimeRules?: RuntimeSemanticRule[];
}

export interface LoginParserDetailedResult {
  status: LoginParseStatus;
  response: ParseBrowserCommandResponse | null;
  reason?: string;
  missingFields?: Array<'username' | 'password' | 'otp' | 'submit'>;
  nextStepHint?: string;
  matchedRuntimeRuleIds: string[];
  usedRuntimeProfile: boolean;
}

type ExtractedCredentialField = {
  fieldKey: 'username' | 'password' | 'otp';
  selector: string;
  value: string;
  description: string;
};

function escapeRegExp(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|]/g, '\\$&');
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeLooseText(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

@Injectable()
export class BrowserCommandLoginService {
  parseLoginCommand(
    input: string,
    context: BrowserCommandContext,
    deps: BrowserCommandLoginRuntimeDeps,
    options?: BrowserCommandLoginParseOptions
  ): ParseBrowserCommandResponse | null {
    const result = this.parseLoginCommandDetailed(input, context, deps, options);
    return result.status === 'success' || result.status === 'partial' ? result.response : null;
  }

  parseLoginCommandDetailed(
    input: string,
    context: BrowserCommandContext,
    deps: BrowserCommandLoginRuntimeDeps,
    options?: BrowserCommandLoginParseOptions
  ): LoginParserDetailedResult {
    const normalizedInput = normalizeWhitespace(input);
    if (!normalizedInput) {
      return {
        status: 'no_match',
        response: null,
        matchedRuntimeRuleIds: [],
        usedRuntimeProfile: false,
      };
    }

    const runtimeProfile = this.buildProfileFromRuntimeRules(options?.runtimeRules || []);
    const effectiveProfile = mergeLoginProfiles(DEFAULT_LOGIN_PROFILE, runtimeProfile.profile);
    const combinedLoginText = this.collectLoginObservationText(context, normalizedInput);

    if (this.containsAnyTerm(combinedLoginText, effectiveProfile.unsupportedAuthSignals)) {
      return this.buildTerminalResult({
        status: 'takeover_required',
        explanation: '当前页面包含不受支持的认证挑战，请切换为人工接管或改用受支持的登录方式',
        reason: 'login-unsupported-auth-challenge',
        matchedRuntimeRuleIds: runtimeProfile.matchedRuleIds,
        usedRuntimeProfile: runtimeProfile.usedRuntimeProfile,
      });
    }

    if (this.containsAnyTerm(combinedLoginText, effectiveProfile.takeoverSignals)) {
      const explanation =
        effectiveProfile.interruptPolicy === 'fallback'
          ? '当前页面出现需要进一步识别的登录挑战，建议进入 AI fallback 继续判断'
          : '当前页面命中了扫码、滑块或安全校验等挑战，请人工接管后继续';
      return this.buildTerminalResult({
        status: 'takeover_required',
        explanation,
        reason: 'login-takeover-required',
        matchedRuntimeRuleIds: runtimeProfile.matchedRuleIds,
        usedRuntimeProfile: runtimeProfile.usedRuntimeProfile,
      });
    }

    const hasCredentialIntent = this.containsAnyTerm(
      normalizedInput,
      effectiveProfile.credentialIntentTerms
    );
    const hasSubmitIntent = this.containsAnyTerm(normalizedInput, effectiveProfile.submitIntentTerms);
    if (!hasCredentialIntent && !hasSubmitIntent) {
      return {
        status: 'no_match',
        response: null,
        matchedRuntimeRuleIds: runtimeProfile.matchedRuleIds,
        usedRuntimeProfile: runtimeProfile.usedRuntimeProfile,
      };
    }

    const extractedFields = [
      this.extractCredentialField(normalizedInput, {
        fieldKey: 'username',
        selector: '用户名',
        description: '填写用户名',
        terms: effectiveProfile.usernameTerms,
      }),
      this.extractCredentialField(normalizedInput, {
        fieldKey: 'password',
        selector: '密码',
        description: '填写密码',
        terms: effectiveProfile.passwordTerms,
      }),
      this.extractCredentialField(normalizedInput, {
        fieldKey: 'otp',
        selector: '验证码',
        description: '填写验证码',
        terms: effectiveProfile.otpTerms,
      }),
    ].filter((item): item is ExtractedCredentialField => Boolean(item));

    const missingFields = this.detectMissingFields(normalizedInput, effectiveProfile, extractedFields);
    const missingCredentialFields = missingFields.filter(
      (field): field is 'username' | 'password' | 'otp' => field !== 'submit'
    );
    if (extractedFields.length === 0) {
      return {
        status: 'profile_miss',
        response: null,
        reason: missingCredentialFields.length > 0 ? 'login-field-missing' : 'login-profile-miss',
        missingFields,
        matchedRuntimeRuleIds: runtimeProfile.matchedRuleIds,
        usedRuntimeProfile: runtimeProfile.usedRuntimeProfile,
      };
    }

    if (missingCredentialFields.length > 0) {
      return {
        status: 'profile_miss',
        response: null,
        reason: 'login-field-missing',
        missingFields,
        matchedRuntimeRuleIds: runtimeProfile.matchedRuleIds,
        usedRuntimeProfile: runtimeProfile.usedRuntimeProfile,
      };
    }

    const commands: BrowserCommand[] = [];
    const explanations: string[] = [];

    const navigateTarget = this.extractSequentialNavigateTarget(normalizedInput, deps.resolveUrl);
    if (navigateTarget) {
      const url = deps.resolveUrl(navigateTarget.target);
      commands.push({
        tool: 'navigate',
        params: { url },
        description: `打开 ${navigateTarget.target}`,
      });
      explanations.push(`打开 ${url}`);
    }

    const visibleFieldKeys = this.detectVisibleFieldKeys(context, effectiveProfile);
    const stepAwareFields = this.selectStepAwareFields(extractedFields, visibleFieldKeys);
    commands.push(
      ...stepAwareFields.map((field) => ({
        tool: 'fill',
        params: { selector: field.selector, value: field.value },
        description: field.description,
      }))
    );
    explanations.push(`填写${stepAwareFields.map((field) => field.selector).join('和')}`);

    const status: LoginParseStatus = stepAwareFields.length < extractedFields.length ? 'partial' : 'success';
    const reason: string | undefined = status === 'partial' ? 'login-partial-step' : undefined;
    const nextStepHint: string | undefined =
      status === 'partial' ? '当前页面疑似只展示部分登录步骤，请等待下一步页面后继续补全剩余字段' : undefined;

    const submitTarget =
      this.extractLoginSubmitTarget(normalizedInput, effectiveProfile) ||
      this.inferSubmitTargetFromContext(context, effectiveProfile);
    const shouldAttemptSubmit = Boolean(submitTarget) || hasSubmitIntent;

    if (shouldAttemptSubmit && !submitTarget) {
      return {
        status: 'profile_miss',
        response: null,
        reason: 'login-submit-target-missing',
        missingFields: this.appendMissingField(missingFields, 'submit'),
        matchedRuntimeRuleIds: runtimeProfile.matchedRuleIds,
        usedRuntimeProfile: runtimeProfile.usedRuntimeProfile,
      };
    }

    if (submitTarget) {
      const submitIntent = buildPendingClickIntent({
        source: 'login-parser',
        rawTarget: submitTarget,
        semanticHint: 'submit',
        roleHint: 'button',
      });
      const clickCommand = deps.resolvePendingClickIntent(
        submitIntent,
        context,
        `点击${submitTarget}`
      );
      if (!clickCommand) {
        return {
          status: 'profile_miss',
          response: null,
          reason: 'login-click-resolve-miss',
          missingFields: this.appendMissingField(missingFields, 'submit'),
          matchedRuntimeRuleIds: runtimeProfile.matchedRuleIds,
          usedRuntimeProfile: runtimeProfile.usedRuntimeProfile,
        };
      }
      commands.push(clickCommand);
      explanations.push(`点击 ${submitTarget}`);
    }

    const trailingActionTarget = this.extractTrailingActionTarget(normalizedInput, effectiveProfile);
    if (
      trailingActionTarget &&
      (!submitTarget ||
        this.normalizeCandidateText(trailingActionTarget) !== this.normalizeCandidateText(submitTarget))
    ) {
      const trailingIntent = buildPendingClickIntent({
        source: 'login-parser',
        rawTarget: trailingActionTarget,
        semanticHint: inferSemanticHint(trailingActionTarget),
      });
      const trailingClick = deps.resolvePendingClickIntent(
        trailingIntent,
        context,
        `点击${trailingActionTarget}`
      );
      if (!trailingClick) {
        return {
          status: 'profile_miss',
          response: null,
          reason: 'login-trailing-action-miss',
          missingFields,
          matchedRuntimeRuleIds: runtimeProfile.matchedRuleIds,
          usedRuntimeProfile: runtimeProfile.usedRuntimeProfile,
        };
      }
      commands.push(trailingClick);
      explanations.push(`点击 ${trailingActionTarget}`);
    }

    const parserMetadata =
      status !== 'success' || runtimeProfile.usedRuntimeProfile || missingFields.length > 0
        ? {
            login: {
              status,
              reason,
              filledFields: stepAwareFields.map((field) => field.fieldKey),
              missingFields,
              nextStepHint,
              matchedRuntimeRuleIds: runtimeProfile.matchedRuleIds,
              usedRuntimeProfile: runtimeProfile.usedRuntimeProfile,
            },
          }
        : undefined;

    return {
      status,
      response: {
        success: true,
        commands,
        explanation: `将依次${explanations.join('，')}`,
        parserMetadata,
      },
      reason,
      missingFields,
      nextStepHint,
      matchedRuntimeRuleIds: runtimeProfile.matchedRuleIds,
      usedRuntimeProfile: runtimeProfile.usedRuntimeProfile,
    };
  }

  buildProfileFromRuntimeRules(rules: RuntimeSemanticRule[]): {
    profile: Partial<LoginProfile>;
    matchedRuleIds: string[];
    usedRuntimeProfile: boolean;
  } {
    const loginRules = rules
      .filter((rule) => this.isLoginProfileRule(rule))
      .sort((left, right) => (right.priority || 0) - (left.priority || 0));

    if (loginRules.length === 0) {
      return {
        profile: {},
        matchedRuleIds: [],
        usedRuntimeProfile: false,
      };
    }

    const profile: Partial<LoginProfile> = {};
    for (const rule of loginRules) {
      const outputs = rule.outputs || {};
      for (const key of LOGIN_PROFILE_ARRAY_OUTPUT_KEYS) {
        const outputValue = outputs[key];
        if (!Array.isArray(outputValue)) {
          continue;
        }
        const normalized = normalizeProfileTerms(outputValue.filter((item): item is string => typeof item === 'string'));
        if (normalized.length === 0) {
          continue;
        }
        const profileKey = mapProfileOutputKey(key);
        profile[profileKey] = mergeStringArrays(profile[profileKey] || [], normalized);
      }

      if (
        outputs.interrupt_policy === 'fallback' ||
        outputs.interrupt_policy === 'takeover_required'
      ) {
        profile.interruptPolicy = outputs.interrupt_policy;
      }
    }

    return {
      profile,
      matchedRuleIds: loginRules
        .map((rule) => (typeof rule.id === 'string' ? rule.id.trim() : ''))
        .filter(Boolean),
      usedRuntimeProfile: Object.keys(profile).length > 0,
    };
  }

  private extractCredentialField(
    input: string,
    config: {
      fieldKey: 'username' | 'password' | 'otp';
      selector: string;
      description: string;
      terms: string[];
    }
  ): ExtractedCredentialField | null {
    const pattern = this.buildCredentialFieldPattern(config.terms);
    if (!pattern) {
      return null;
    }

    const match = input.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return {
        fieldKey: config.fieldKey,
        selector: config.selector,
        value,
        description: config.description,
      };
    }

    return null;
  }

  private buildCredentialFieldPattern(terms: string[]): RegExp | null {
    const alternation = this.buildTermAlternation(terms);
    if (!alternation) {
      return null;
    }

    return new RegExp(
      `(?:${alternation})\\s*(?:是|为|:|=)?\\s*([^\\s，。,；;]+)`,
      'i'
    );
  }

  private extractLoginSubmitTarget(input: string, profile: LoginProfile): string | undefined {
    const candidates = normalizeProfileTerms([...profile.submitLabels, ...profile.submitIntentTerms]);
    for (const candidate of candidates) {
      if (this.matchesTerm(input, candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private inferSubmitTargetFromContext(
    context: BrowserCommandContext,
    profile: LoginProfile
  ): string | undefined {
    const observationText = this.collectLoginObservationText(context);
    const candidates = normalizeProfileTerms([...profile.submitLabels, ...profile.submitIntentTerms]);
    return candidates.find((candidate) => this.matchesTerm(observationText, candidate));
  }

  private extractTrailingActionTarget(input: string, profile: LoginProfile): string | undefined {
    const alternation = this.buildTermAlternation(profile.trailingActionTerms);
    if (!alternation) {
      return undefined;
    }

    const trailingAction = input.match(
      new RegExp(`(?:${alternation})\\s*(?:点击|打开|进入)\\s*([^\\s，。,；;]+)`, 'i')
    );
    return trailingAction?.[1]?.trim() || undefined;
  }

  private detectMissingFields(
    input: string,
    profile: LoginProfile,
    fields: ExtractedCredentialField[]
  ): Array<'username' | 'password' | 'otp' | 'submit'> {
    const fieldSet = new Set(fields.map((field) => field.fieldKey));
    const missingFields: Array<'username' | 'password' | 'otp' | 'submit'> = [];
    if (!fieldSet.has('username') && this.containsAnyTerm(input, profile.usernameTerms)) {
      missingFields.push('username');
    }
    if (!fieldSet.has('password') && this.containsAnyTerm(input, profile.passwordTerms)) {
      missingFields.push('password');
    }
    if (!fieldSet.has('otp') && this.containsAnyTerm(input, profile.otpTerms)) {
      missingFields.push('otp');
    }
    return [...new Set(missingFields)];
  }

  private appendMissingField(
    missingFields: Array<'username' | 'password' | 'otp' | 'submit'>,
    field: 'username' | 'password' | 'otp' | 'submit'
  ): Array<'username' | 'password' | 'otp' | 'submit'> {
    return missingFields.includes(field) ? missingFields : [...missingFields, field];
  }

  private detectVisibleFieldKeys(
    context: BrowserCommandContext,
    profile: LoginProfile
  ): Set<'username' | 'password' | 'otp'> {
    const observationText = this.collectLoginObservationText(context);
    const visibleFields = new Set<'username' | 'password' | 'otp'>();

    if (this.containsAnyTerm(observationText, profile.usernameTerms)) {
      visibleFields.add('username');
    }
    if (this.containsAnyTerm(observationText, profile.passwordTerms)) {
      visibleFields.add('password');
    }
    if (this.containsAnyTerm(observationText, profile.otpTerms)) {
      visibleFields.add('otp');
    }

    return visibleFields;
  }

  private selectStepAwareFields(
    fields: ExtractedCredentialField[],
    visibleFieldKeys: Set<'username' | 'password' | 'otp'>
  ): ExtractedCredentialField[] {
    if (visibleFieldKeys.size === 0) {
      return fields;
    }

    const visibleFields = fields.filter((field) => visibleFieldKeys.has(field.fieldKey));
    return visibleFields.length > 0 ? visibleFields : fields;
  }

  private collectLoginObservationText(
    context: BrowserCommandContext,
    input?: string
  ): string {
    const candidateTokens =
      context.availableCandidates?.flatMap((candidate) => [
        candidate.label,
        candidate.summary,
        candidate.text,
        candidate.action,
        candidate.field,
        candidate.stableName,
        candidate.role,
        candidate.region?.name,
      ]) || [];

    return [
      input,
      context.observationSummary,
      context.lastObservationText,
      ...(context.availableInputs || []),
      ...(context.availableButtons || []),
      ...candidateTokens,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ');
  }

  private containsAnyTerm(text: string, terms: string[]): boolean {
    return terms.some((term) => this.matchesTerm(text, term));
  }

  private matchesTerm(text: string, term: string): boolean {
    const normalizedText = normalizeLooseText(text);
    const normalizedTerm = normalizeLooseText(term);
    return normalizedTerm.length > 0 && normalizedText.includes(normalizedTerm);
  }

  private buildTermAlternation(terms: string[]): string | null {
    const normalizedTerms = normalizeProfileTerms(terms);
    if (normalizedTerms.length === 0) {
      return null;
    }

    return normalizedTerms
      .map((term) => escapeRegExp(term).replace(/\s+/g, '\\s+'))
      .join('|');
  }

  private isLoginProfileRule(rule: RuntimeSemanticRule): boolean {
    if (!rule.outputs || rule.outputs.profile_type !== LOGIN_PROFILE_TYPE) {
      return false;
    }

    return rule.category === 'LOGIN' || rule.type === 'LOGIN_PHRASE';
  }

  private buildTerminalResult(options: {
    status: 'takeover_required';
    explanation: string;
    reason: string;
    matchedRuntimeRuleIds: string[];
    usedRuntimeProfile: boolean;
  }): LoginParserDetailedResult {
    return {
      status: options.status,
      response: {
        success: false,
        commands: [],
        explanation: options.explanation,
        parserMetadata: {
          login: {
            status: options.status,
            reason: options.reason,
            filledFields: [],
            matchedRuntimeRuleIds: options.matchedRuntimeRuleIds,
            usedRuntimeProfile: options.usedRuntimeProfile,
          },
        },
      },
      reason: options.reason,
      matchedRuntimeRuleIds: options.matchedRuntimeRuleIds,
      usedRuntimeProfile: options.usedRuntimeProfile,
    };
  }

  private extractSequentialNavigateTarget(
    input: string,
    resolveUrl: (input: string) => string
  ): { target: string; consumedLength: number } | null {
    const prefixMatch = input.match(
      /^(?:打开|导航到|访问|前往|goto|open|navigate|go\s*to|visit)\s*/i
    );
    if (!prefixMatch) {
      return null;
    }

    const rest = input.slice(prefixMatch[0].length);
    const firstToken = rest.match(/^([^\s]+)/)?.[1];
    if (firstToken) {
      const resolved = resolveUrl(firstToken);
      const looksLikeExplicitTarget =
        resolved !== `https://${firstToken}` ||
        /^https?:\/\//i.test(firstToken) ||
        /^[\w.-]+\.[a-z]{2,}/i.test(firstToken);
      if (looksLikeExplicitTarget) {
        return {
          target: firstToken,
          consumedLength: prefixMatch[0].length + firstToken.length,
        };
      }
    }

    const fallbackMatch = rest.match(
      /^(.+?)(?=\s*(?:并|然后|再|后|接着)?\s*(?:智搜|智能搜索|搜索|search|点击|选择|click)|$)/i
    );
    if (!fallbackMatch?.[1]) {
      return null;
    }

    return {
      target: fallbackMatch[1].trim(),
      consumedLength: prefixMatch[0].length + fallbackMatch[0].length,
    };
  }

  private normalizeCandidateText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/案件粗利率|粗利率|毛利率|gross[\s_-]*margin/g, 'grossmargin')
      .replace(/详情|詳細/g, 'detail')
      .replace(/承认する|承認する|承认|承認|approve/g, 'approve')
      .replace(/批准|审批通过|审批|通过/g, 'approve')
      .replace(/却下する|却下|拒绝|拒否|reject/g, 'reject')
      .replace(/打开|进入|点击|单击|选择/g, '')
      .replace(/按钮|按键|链接|入口|字段|输入框|文本框|区域|面板|模块|区块|部分/g, '')
      .replace(/[的"'\s:=|]/g, '')
      .trim();
  }
}
