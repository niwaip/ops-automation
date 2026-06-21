import { Injectable } from '@nestjs/common';
import type {
  BrowserCommand,
  BrowserCommandContext,
  ParseBrowserCommandResponse,
} from './browser-command.types';
import {
  buildPendingClickIntent,
  inferSemanticHint,
  type PendingActionIntent,
} from './action-intent.builder';

export interface BrowserCommandLoginRuntimeDeps {
  resolveUrl: (input: string) => string;
  resolvePendingClickIntent: (
    intent: PendingActionIntent,
    context: BrowserCommandContext,
    description: string
  ) => BrowserCommand | null;
}

type ExtractedCredentialField = {
  selector: string;
  value: string;
  description: string;
};

@Injectable()
export class BrowserCommandLoginService {
  parseLoginCommand(input: string, context: BrowserCommandContext, deps: BrowserCommandLoginRuntimeDeps): ParseBrowserCommandResponse | null {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    if (!normalizedInput) {
      return null;
    }

    const hasCredentialIntent =
      /(用户名|账号|账户|user(?:name)?|邮箱|email|手机号|mobile|phone|密码|password|pass|验证码|verification|otp|code)/i.test(
        normalizedInput
      );
    const hasSubmitIntent = /(登录|登入|sign\s*in|log\s*in|log\s*on|next|submit|提交)/i.test(
      normalizedInput
    );
    if (!hasCredentialIntent && !hasSubmitIntent) {
      return null;
    }

    const fieldMatches = [
      this.extractCredentialField(normalizedInput, {
        selector: '用户名',
        description: '填写用户名',
        patterns: [/(?:用户名|账号|账户|user(?:name)?)\s*(?:是|为|:)?\s*([^\s，。,；;]+)/i],
      }),
      this.extractCredentialField(normalizedInput, {
        selector: '密码',
        description: '填写密码',
        patterns: [/(?:密码|password|pass)\s*(?:是|为|:)?\s*([^\s，。,；;]+)/i],
      }),
      this.extractCredentialField(normalizedInput, {
        selector: '验证码',
        description: '填写验证码',
        patterns: [
          /(?:验证码|verification(?:\s+code)?|otp|code)\s*(?:是|为|:)?\s*([^\s，。,；;]+)/i,
        ],
      }),
    ].filter((item): item is ExtractedCredentialField => Boolean(item));

    if (fieldMatches.length === 0) {
      return null;
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

    commands.push(
      ...fieldMatches.map((field) => ({
        tool: 'fill',
        params: { selector: field.selector, value: field.value },
        description: field.description,
      }))
    );
    explanations.push(`填写${fieldMatches.map((field) => field.selector).join('和')}`);

    const submitTarget = this.extractLoginSubmitTarget(normalizedInput);
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
      if (clickCommand) {
        commands.push(clickCommand);
        explanations.push(`点击 ${submitTarget}`);
      }
    }

    const trailingAction = normalizedInput.match(
      /(?:然后|并|再|接着|之后|登录成功后)\s*(点击|打开|进入)\s*([^\s，。,；;]+)/i
    );
    if (
      trailingAction?.[2] &&
      (!submitTarget ||
        this.normalizeCandidateText(trailingAction[2]) !== this.normalizeCandidateText(submitTarget))
    ) {
      const targetText = trailingAction[2].trim();
      const trailingIntent = buildPendingClickIntent({
        source: 'login-parser',
        rawTarget: targetText,
        semanticHint: inferSemanticHint(targetText),
      });
      const trailingClick = deps.resolvePendingClickIntent(
        trailingIntent,
        context,
        `点击${targetText}`
      );
      if (trailingClick) {
        commands.push(trailingClick);
        explanations.push(`点击 ${targetText}`);
      }
    }

    return {
      success: true,
      commands,
      explanation: `将依次${explanations.join('，')}`,
    };
  }

  private extractCredentialField(
    input: string,
    config: {
      selector: string;
      description: string;
      patterns: RegExp[];
    }
  ): ExtractedCredentialField | null {
    for (const pattern of config.patterns) {
      const match = input.match(pattern);
      const value = match?.[1]?.trim();
      if (value) {
        return {
          selector: config.selector,
          value,
          description: config.description,
        };
      }
    }
    return null;
  }

  private extractLoginSubmitTarget(input: string): string | undefined {
    if (/\bnext\b/i.test(input)) {
      return 'Next';
    }
    if (/log\s*on/i.test(input)) {
      return 'Log On';
    }
    if (/sign\s*in/i.test(input)) {
      return 'Sign In';
    }
    if (/log\s*in/i.test(input)) {
      return 'Log In';
    }
    if (/(登录|登入)/.test(input)) {
      return '登录';
    }
    if (/(提交|submit)/i.test(input)) {
      return '提交';
    }
    return undefined;
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
