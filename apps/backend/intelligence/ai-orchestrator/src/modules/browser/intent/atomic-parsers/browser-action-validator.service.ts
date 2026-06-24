import { Injectable } from '@nestjs/common';
import { BrowserCommand } from '../browser-command.service';

export type BrowserActionRiskLevel = 'safe' | 'caution' | 'confirm' | 'forbidden';

export type BrowserActionAssessment = {
  command: BrowserCommand;
  riskLevel: BrowserActionRiskLevel;
  reason: string;
};

export type BrowserActionValidationResult = {
  highestRiskLevel: BrowserActionRiskLevel;
  requiresConfirmation: boolean;
  forbidden: boolean;
  assessments: BrowserActionAssessment[];
};

const SAFE_TOOLS = new Set([
  'scroll',
  'snapshot',
  'screenshot',
  'get_text',
  'read_page',
  'wait',
  'list_search_results',
]);

const CAUTION_TOOLS = new Set([
  'navigate',
  'switch_latest_tab',
  'click',
  'fill',
  'type_text',
  'press_key',
  'search',
  'smart_search',
  'click_result',
  'hover',
]);

const HIGH_RISK_KEYWORD =
  /(approve|approval|submit|confirm|delete|remove|download|付款|支付|提交|确认|删除|移除|下载|审批|批准|承认|承認|拒绝|却下)/i;

const RISK_ORDER: BrowserActionRiskLevel[] = ['safe', 'caution', 'confirm', 'forbidden'];

@Injectable()
export class BrowserActionValidatorService {
  assessCommands(
    commands: BrowserCommand[],
    options?: {
      currentPageUrl?: string;
    }
  ): BrowserActionValidationResult {
    const assessments = commands.map((command) => this.assessCommand(command, options));
    const highestRiskLevel = assessments.reduce<BrowserActionRiskLevel>(
      (current, item) => (this.compareRisk(item.riskLevel, current) > 0 ? item.riskLevel : current),
      'safe'
    );

    return {
      highestRiskLevel,
      requiresConfirmation: assessments.some((item) => item.riskLevel === 'confirm'),
      forbidden: assessments.some((item) => item.riskLevel === 'forbidden'),
      assessments,
    };
  }

  private assessCommand(
    command: BrowserCommand,
    options?: {
      currentPageUrl?: string;
    }
  ): BrowserActionAssessment {
    if (command.tool === 'evaluate') {
      return {
        command,
        riskLevel: 'forbidden',
        reason: '录制态禁止执行任意 evaluate 脚本',
      };
    }

    if (SAFE_TOOLS.has(command.tool)) {
      return {
        command,
        riskLevel: 'safe',
        reason: '只读或低风险浏览器动作',
      };
    }

    if (command.tool === 'navigate') {
      const url = typeof command.params.url === 'string' ? command.params.url : '';
      if (this.isCrossDomainNavigation(url, options?.currentPageUrl)) {
        return {
          command,
          riskLevel: 'confirm',
          reason: '跨域导航需要用户确认',
        };
      }

      return {
        command,
        riskLevel: 'caution',
        reason: '导航会改变当前页面上下文',
      };
    }

    if (CAUTION_TOOLS.has(command.tool)) {
      if (this.containsHighRiskIntent(command)) {
        return {
          command,
          riskLevel: 'confirm',
          reason: '动作包含审批/提交/删除/下载等高风险语义',
        };
      }

      return {
        command,
        riskLevel: 'caution',
        reason: '可能修改页面状态或提交交互',
      };
    }

    return {
      command,
      riskLevel: 'forbidden',
      reason: `不允许执行未授权动作: ${command.tool}`,
    };
  }

  private containsHighRiskIntent(command: BrowserCommand): boolean {
    const raw = [
      command.description,
      typeof command.params.text === 'string' ? command.params.text : undefined,
      typeof command.params.target === 'string' ? command.params.target : undefined,
      typeof command.params.selector === 'string' ? command.params.selector : undefined,
      typeof command.params.url === 'string' ? command.params.url : undefined,
      command.locator?.value,
      command.locator?.name,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ');

    return HIGH_RISK_KEYWORD.test(raw);
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

  private compareRisk(left: BrowserActionRiskLevel, right: BrowserActionRiskLevel): number {
    return RISK_ORDER.indexOf(left) - RISK_ORDER.indexOf(right);
  }
}
