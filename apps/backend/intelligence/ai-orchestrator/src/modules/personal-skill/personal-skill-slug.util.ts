import * as crypto from 'crypto';

const CHINESE_TO_ENGLISH_MAP: Record<string, string> = {
  部门: 'dept',
  无偿: 'unpaid',
  统计: 'summary',
  汇总: 'summary',
  金额: 'amount',
  费用: 'expense',
  报表: 'report',
  报告: 'report',
  合同: 'contract',
  审查: 'review',
  对比: 'compare',
  核对: 'reconciliation',
  数据: 'data',
  分析: 'analysis',
  清洗: 'cleanse',
  表格: 'sheet',
  导出: 'export',
  提取: 'extract',
  按: 'by-',
  与: '-and-',
  和: '-and-',
  项目: 'project',
  工单: 'ticket',
  清单: 'list',
  计算: 'calc',
  财务: 'finance',
};

/**
 * 将用户输入的技能展示名称或指定名称规范化为安全的技能 Slug
 * 格式限定为 2-64 位的合法小写中划线格式，如 `dept-amount-summary`
 */
export function normalizeSkillSlug(displayName: string, preferredSlug?: string): string {
  if (preferredSlug && preferredSlug.trim()) {
    const cleaned = preferredSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/[-_]+/g, '-')
      .replace(/^-|-$/g, '');
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 64);
    }
  }

  let text = displayName.trim();
  if (!text) {
    return `skill-${crypto.randomBytes(3).toString('hex')}`;
  }

  // 1. 如果本身是英文或数字组合，直接 kebab-case
  if (/^[a-zA-Z0-9_\-\s]+$/.test(text)) {
    const slug = text
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (slug.length >= 2) {
      return slug.slice(0, 64);
    }
  }

  // 2. 映射常用中文词根
  let mapped = text;
  for (const [cn, en] of Object.entries(CHINESE_TO_ENGLISH_MAP)) {
    if (mapped.includes(cn)) {
      mapped = mapped.split(cn).join(`-${en}-`);
    }
  }

  // 3. 清理为 ASCII 字符
  let cleaned = mapped
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (cleaned.length >= 3) {
    return cleaned.slice(0, 64);
  }

  // 4. 若无法完全转为有意义英文，使用哈希前缀保障唯一与合规
  const hash = crypto.createHash('sha256').update(displayName).digest('hex').slice(0, 8);
  return `skill-${hash}`;
}
