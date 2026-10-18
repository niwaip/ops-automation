// Ground truth is authored independently of the production scoring function.
export function corpus(run) {
  return [
    { key: 'target', text: `DeepSeek Harness 安装配置\n项目编号 ${run}-A17\n负责人：林晓雨\n预算：52931元\n截止日期：2026-11-12\n验收口令：KS-7Q4M-9286\n安装命令：pip install deepseek-harness\n验收要求：四台模拟终端联调，归档三份记录。`, facts: ['DeepSeek', 'Harness', `${run}-A17`, '林晓雨', '52931', '2026-11-12', 'KS-7Q4M-9286', '四台', '三份'] },
    { key: 'partial', text: 'DeepSeek API 调用指南。本文仅介绍 API 密钥与计费，不涉及 Harness 安装。', facts: ['DeepSeek', 'API'] },
    { key: 'other', text: 'Redis 高可用配置。负责人：陈晨。预算：83000元。验收口令：RD-8821。', facts: ['Redis', '83000', 'RD-8821'] },
    ...Array.from({ length: 12 }, (_, i) => ({ key: `noise${i}`, text: `MySQL 环境 ${i}。\n${'安装 配置 部署 教程 步骤 说明。\n'.repeat(20)}`, facts: ['MySQL'] })),
  ];
}

export function cases(run) {
  return [
    { q: 'DeepSeek Harness 安装配置', first: 'target', relevant: ['target'], forbidden: ['other', ...Array.from({ length: 12 }, (_, i) => `noise${i}`)] },
    { q: 'deepseek harness的安装方法', first: 'target', relevant: ['target'] },
    { q: `${run}-A17`, first: 'target', relevant: ['target'], only: true },
    { q: 'KS-7Q4M-9286', first: 'target', relevant: ['target'], only: true },
    { q: '林晓雨', first: 'target', relevant: ['target'], only: true },
    { q: '52931', first: 'target', relevant: ['target'], only: true },
    { q: 'Redis 高可用配置', first: 'other', relevant: ['other'] },
    { q: `${run}-ABSENT 安装配置`, empty: true },
    { q: `${run}-ABSENT`, empty: true },
    { q: 'x', empty: true },
    { q: '   ', empty: true },
  ];
}
