export function normalizeWorkflowAlias(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/查看|查询|获取/g, '查')
    .replace(/给出总结|进行总结|汇总/g, '总结')
    .replace(/最后|然后|并且|并|通过|使用|用|的|一下|当前/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}
