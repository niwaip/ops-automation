import type { BrowserWorkflowActivityStep } from '../temporal-workflow.types';

export function inferSiteNameFromUrl(rawUrl?: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }
  const trimmed = rawUrl.trim();
  if (trimmed.includes('${') || trimmed.includes('{')) {
    return null;
  }
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('juejin.cn')) return '掘金论坛';
    if (host.includes('baidu.com')) return '百度搜索';
    if (host.includes('bing.com')) return '必应搜索';
    if (host.includes('google.com')) return '谷歌搜索';
    if (host.includes('github.com')) return 'GitHub';
    if (host.includes('zhihu.com')) return '知乎';
    if (host.includes('bilibili.com')) return '哔哩哔哩';
    if (host.includes('weibo.com')) return '微博';
    if (host.includes('xiaohongshu.com')) return '小红书';
    if (host.includes('taobao.com')) return '淘宝';
    if (host.includes('jd.com')) return '京东';
    if (host.includes('csdn.net')) return 'CSDN';
    return null;
  } catch {
    return null;
  }
}

export function cleanSemanticDescription(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/^(step\s*\d+[:\-\s]*|\d+[\.\、\s\-]+|\[\d+\]\s*)+/i, '')
    .trim();
}

const GENERIC_DESCRIPTIONS = new Set([
  '页面打开',
  '页面迁移',
  '页面处理',
  '浏览器操作',
  '访问页面',
  '点击元素',
  '输入文本',
  '键盘按键',
  '等待元素出现',
  '等待时间',
  '打开起始页面',
  '打开页面',
  '打开浏览器',
]);

const RAW_ACTIONS = new Set([
  'click',
  'navigate',
  'goto',
  'wait',
  'screenshot',
  'fill',
  'waitforselector',
  'waitfortimeout',
  'hover',
  'press',
  'get_text',
  'read_value',
  'type_text',
]);

export function isGenericPhaseDescription(desc?: string): boolean {
  if (!desc) return true;
  const trimmed = desc.trim();
  if (GENERIC_DESCRIPTIONS.has(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  if (RAW_ACTIONS.has(lower)) return true;
  return false;
}

export function buildDefaultBrowserWorkflowPhaseName(
  phaseType: 'open' | 'transition' | 'process',
  index: number
): string {
  switch (phaseType) {
    case 'open':
      return `${index}. 页面打开`;
    case 'transition':
      return `${index}. 页面迁移`;
    case 'process':
    default:
      return `${index}. 页面处理`;
  }
}

export function inferSemanticPhaseName(
  phaseType: 'open' | 'transition' | 'process',
  index: number,
  steps?: BrowserWorkflowActivityStep[]
): string {
  if (!steps || steps.length === 0) {
    return buildDefaultBrowserWorkflowPhaseName(phaseType, index);
  }

  // 1. Check for specific semantic step descriptions across all steps in the phase
  for (const step of steps) {
    const rawDesc =
      (typeof step.config?.templateStepDescription === 'string' &&
        step.config.templateStepDescription) ||
      (typeof step.name === 'string' && step.name) ||
      '';
    const desc = cleanSemanticDescription(rawDesc);
    const action = String(step.config?.action || step.config?.originalAction || '').toLowerCase();

    // Check if this step is opening a detail page or clicking a result item
    if (
      action === 'click_result' ||
      /打开(详情|详细)页/.test(desc) ||
      (/点击/.test(desc) &&
        (desc.includes('《') ||
          /第[0-9一二两三四五六七八九十]+条/.test(desc) ||
          /详细|详情/.test(desc)))
    ) {
      return `${index}. 打开详细页`;
    }

    // Check if this step is a search action
    if (action === 'search' || action === 'smart_search') {
      const query = String(step.config?.query || step.config?.value || '').trim();
      if (query && !query.startsWith('$') && !query.startsWith('{')) {
        return `${index}. 搜索「${query}」`;
      }
      return `${index}. 搜索关键词`;
    }
  }

  // 2. Open phase: check URL site name or open descriptions
  if (phaseType === 'open') {
    for (const step of steps) {
      const rawUrl = String(step.config?.url || step.config?.target || '').trim();
      const siteName = inferSiteNameFromUrl(rawUrl);
      if (siteName) {
        return `${index}. 打开${siteName}`;
      }
    }

    for (const step of steps) {
      const rawDesc =
        (typeof step.config?.templateStepDescription === 'string' &&
          step.config.templateStepDescription) ||
        step.name ||
        '';
      const desc = cleanSemanticDescription(rawDesc);
      if (desc && !isGenericPhaseDescription(desc) && desc.startsWith('打开')) {
        return `${index}. ${desc}`;
      }
    }

    return `${index}. 页面打开`;
  }

  // 3. Transition phase: check tab switches, click descriptions, or fallback
  if (phaseType === 'transition') {
    for (const step of steps) {
      const action = String(step.config?.action || '').toLowerCase();
      if (action === 'click_result') {
        return `${index}. 打开详细页`;
      }
      if (action === 'switch_latest_tab') {
        return `${index}. 切换到新标签页`;
      }
    }

    for (const step of steps) {
      const rawDesc =
        (typeof step.config?.templateStepDescription === 'string' &&
          step.config.templateStepDescription) ||
        '';
      const desc = cleanSemanticDescription(rawDesc);
      if (desc && !isGenericPhaseDescription(desc)) {
        return `${index}. ${desc}`;
      }
    }

    return `${index}. 页面迁移`;
  }

  // 4. Process phase: check descriptions, data extraction, or form filling
  for (const step of steps) {
    const rawDesc =
      (typeof step.config?.templateStepDescription === 'string' &&
        step.config.templateStepDescription) ||
      '';
    const desc = cleanSemanticDescription(rawDesc);
    if (desc && !isGenericPhaseDescription(desc)) {
      return `${index}. ${desc}`;
    }
  }

  const hasRead = steps.some((s) => {
    const act = String(s.config?.action || '').toLowerCase();
    return act === 'get_text' || act === 'read_value';
  });
  if (hasRead) {
    return `${index}. 提取页面数据`;
  }

  const hasFill = steps.some((s) => {
    const act = String(s.config?.action || '').toLowerCase();
    return act === 'fill' || act === 'type_text';
  });
  if (hasFill) {
    return `${index}. 填写表单数据`;
  }

  return buildDefaultBrowserWorkflowPhaseName(phaseType, index);
}
