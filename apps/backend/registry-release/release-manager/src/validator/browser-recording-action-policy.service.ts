import { Injectable } from '@nestjs/common';

export type BrowserRecordingRuntimeActionRiskLevel =
  | 'safe'
  | 'caution'
  | 'confirm'
  | 'forbidden';

export type BrowserRecordingRuntimeActionAssessment = {
  riskLevel: BrowserRecordingRuntimeActionRiskLevel;
  reason: string;
};

const SAFE_ACTIONS = new Set([
  'scroll',
  'snapshot',
  'screenshot',
  'read_page',
  'read_value',
  'wait',
]);

const CAUTION_ACTIONS = new Set([
  'goto',
  'click',
  'fill',
  'type_text',
  'press_key',
  'hover',
  'search',
  'smart_search',
  'switch_latest_tab',
]);

const HIGH_RISK_KEYWORD =
  /(approve|approval|submit|confirm|delete|remove|download|付款|支付|提交|确认|删除|移除|下载|审批|批准|承认|承認|拒绝|却下)/i;

const LOW_RISK_VIEW_KEYWORD =
  /(view|open|show|filter|tab|list|detail|详情|详细|查看|筛选|过滤|列表)/i;

@Injectable()
export class BrowserRecordingActionPolicyService {
  assessRuntimeStep(
    step: {
      action: string;
      target?: string;
      args?: Record<string, unknown>;
      description?: string;
    },
    options?: {
      currentPageUrl?: string;
    }
  ): BrowserRecordingRuntimeActionAssessment {
    if (SAFE_ACTIONS.has(step.action)) {
      return {
        riskLevel: 'safe',
        reason: '只读或低风险运行时动作',
      };
    }

    if (step.action === 'goto') {
      const url =
        typeof step.args?.url === 'string'
          ? step.args.url
          : typeof step.target === 'string'
            ? step.target
            : '';
      if (this.isCrossDomainNavigation(url, options?.currentPageUrl)) {
        return {
          riskLevel: 'confirm',
          reason: '跨域导航需要人工确认或接管',
        };
      }
      return {
        riskLevel: 'caution',
        reason: '导航会改变当前页面上下文',
      };
    }

    if (CAUTION_ACTIONS.has(step.action)) {
      if (this.containsHighRiskIntent(step)) {
        return {
          riskLevel: 'confirm',
          reason: '运行时动作包含审批/提交/删除/下载等高风险语义',
        };
      }
      return {
        riskLevel: 'caution',
        reason: '可能修改页面状态或触发表单提交',
      };
    }

    if (step.action === 'branch' || step.action === 'takeover_gate') {
      return {
        riskLevel: 'safe',
        reason: '控制流动作由结构化计划驱动',
      };
    }

    return {
      riskLevel: 'forbidden',
      reason: `不允许执行未授权运行时动作: ${step.action}`,
    };
  }

  private containsHighRiskIntent(step: {
    target?: string;
    args?: Record<string, unknown>;
    description?: string;
  }): boolean {
    const targetSignals = [
      step.target,
      typeof step.args?.text === 'string' ? step.args.text : undefined,
      typeof step.args?.selector === 'string' ? step.args.selector : undefined,
      typeof step.args?.url === 'string' ? step.args.url : undefined,
      typeof step.args?.value === 'string' ? step.args.value : undefined,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ');

    if (HIGH_RISK_KEYWORD.test(targetSignals)) {
      return true;
    }

    const description =
      typeof step.description === 'string' && step.description.trim().length > 0
        ? step.description.trim()
        : '';
    if (!description || !HIGH_RISK_KEYWORD.test(description)) {
      return false;
    }

    if (LOW_RISK_VIEW_KEYWORD.test(description)) {
      return false;
    }

    return true;
  }

  private isCrossDomainNavigation(url: string, currentPageUrl?: string): boolean {
    if (!url || !currentPageUrl) {
      return false;
    }

    try {
      const targetHost = new URL(url).host;
      const currentHost = new URL(currentPageUrl).host;
      return Boolean(targetHost && currentHost && targetHost !== currentHost);
    } catch {
      return false;
    }
  }
}
