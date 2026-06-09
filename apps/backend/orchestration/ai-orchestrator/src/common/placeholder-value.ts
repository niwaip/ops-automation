const PLACEHOLDER_TEXT_VALUES = new Set([
  '-',
  '--',
  'n/a',
  'n.a.',
  'n.a',
  'na',
  'none',
  'null',
  'undefined',
  'unknown',
  'tbd',
  'pending',
  'notprovided',
  'notspecified',
  'notavailable',
  '待补充',
  '待确认',
  '待定',
  '暂未提供',
  '未提供',
  '未填写',
  '未确定',
  '未知',
  '未说明',
  '未注明',
  '未提及',
  '未明确',
  '留空',
  '空字符串',
  '空值',
  '暂无',
  '暂无数据',
  '无',
  '无数据',
  '无具体信息',
  '不详',
  'to be confirmed',
  'to be determined',
]);

function normalizePlaceholderText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/^[`"'“”‘’]+|[`"'“”‘’。．\.,，；;：:、!！?？]+$/g, '');
}

export function isPlaceholderTextValue(value: string): boolean {
  const normalized = normalizePlaceholderText(value);
  if (!normalized) {
    return true;
  }

  return PLACEHOLDER_TEXT_VALUES.has(normalized);
}
