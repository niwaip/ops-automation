export interface TemplateTypeOption {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface FormatterOption {
  name: string;
  syntax: string;
  description: string;
  example: string;
}

export const TEMPLATE_TYPE_ICONS: Record<string, string> = {
  report: '📄',
  invoice: '🧾',
  certificate: '📜',
  contract: '📋',
  letter: '📨',
};

export const getTemplateTypeIcon = (id: string): string => {
  return TEMPLATE_TYPE_ICONS[id] || '📄';
};

export const TEMPLATE_TYPE_OPTIONS: TemplateTypeOption[] = [
  { id: 'report', name: '报告文档', description: '业务报告、分析报告等', icon: getTemplateTypeIcon('report') },
  { id: 'invoice', name: '发票账单', description: '发票、收据、账单等', icon: getTemplateTypeIcon('invoice') },
  { id: 'certificate', name: '证书证明', description: '证书、证明、执照等', icon: getTemplateTypeIcon('certificate') },
  { id: 'contract', name: '合同协议', description: '合同、协议、备忘录等', icon: getTemplateTypeIcon('contract') },
  { id: 'letter', name: '信函通知', description: '信函、通知、公告等', icon: getTemplateTypeIcon('letter') },
];

export const FORMATTER_OPTIONS: FormatterOption[] = [
  {
    name: 'formatDate',
    syntax: ':formatDate(YYYY-MM-DD)',
    description: '日期格式化',
    example: '{d.date:formatDate(YYYY-MM-DD)}',
  },
  {
    name: 'formatNumber',
    syntax: ':formatNumber(#,##0.00)',
    description: '数字格式化',
    example: '{d.amount:formatNumber(#,##0.00)}',
  },
  { name: 'upper', syntax: ':upper', description: '转大写', example: '{d.name:upper}' },
  { name: 'lower', syntax: ':lower', description: '转小写', example: '{d.code:lower}' },
  {
    name: 'convCurrency',
    syntax: ':convCurrency(USD)',
    description: '货币转换',
    example: '{d.price:convCurrency(USD)}',
  },
];
