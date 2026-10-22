import type { SkillSource } from './personal-skill.types';

export function authoredSkillMarkdown(source: SkillSource, name: string, slug: string, description?: string): string {
  const design = source.authoring!;
  const quote = JSON.stringify;
  return `---
name: ${slug}
zh_name: ${quote(name)}
description: ${quote(description || design.description)}
zh_description: ${quote(description || design.description)}
triggers:
  - ${quote(name)}
  - ${quote(`用${name}处理`)}
  - ${quote(slug)}
aliases: [${quote(name)}, ${quote(slug)}]
deliverables: []
requires_execution: true
execution_mode: verified_workflow
default_rounds: 1
---

# ${name}

${design.when_to_use}

${design.procedure.map((step) => `- ${step}`).join('\n')}

执行当前附件时按字段重新定位数据，不固化旧文件名、行号或旧结果。核算由确定性程序执行并验收；有歧义时先确认，不能从技能名称补充筛选。

- 核算规则与操作：[workflow.json](references/workflow.json)。执行时读取。
- 用户原话与提炼依据：[authoring.json](references/authoring.json)。追溯或修改口径时读取。
- 独立重放验收：[validation.json](references/validation.json)。排查数值差异时读取。
- 独立执行：\`python scripts/run.py --input /workspace/新附件.xlsx --receipt /workspace/核算回执.json\`。

结果表格由程序生成。LLM 仅基于验证回执选择解读重点，不改写数值或推断未确认的业务原因。
`;
}
