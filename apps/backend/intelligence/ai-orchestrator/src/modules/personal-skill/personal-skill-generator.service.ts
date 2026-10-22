import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { SkillSource } from './personal-skill.types';

@Injectable()
export class PersonalSkillGeneratorService {
  private readonly logger = new Logger(PersonalSkillGeneratorService.name);

  /**
   * 根据提取的 SkillSource 与配置，在暂存目录生成完整的技能包
   */
  async generateSkillPackage(
    source: SkillSource,
    displayName: string,
    slug: string,
    stagingDir: string,
    customDescription?: string
  ): Promise<{ hasScript: boolean; deliverables: string[] }> {
    fs.mkdirSync(stagingDir, { recursive: true });

    const description =
      customDescription ||
      `按已确认的业务逻辑与规则处理新附件，自动化执行“${displayName}”。`;

    const deliverables = source.outputContract
      .filter((o) => o && o.type)
      .map((o) => (o.type.startsWith('.') ? o.type : `.${o.type}`));

    const hasScript = Boolean(source.scriptCode && source.scriptCode.trim().length > 30);

    // 1. 生成 SKILL.md
    const skillMdContent = this.buildSkillMd(
      slug,
      displayName,
      description,
      deliverables,
      hasScript,
      source
    );
    fs.writeFileSync(path.join(stagingDir, 'SKILL.md'), skillMdContent, 'utf-8');

    // 2. 生成 scripts/run.py（如存在可用代码）
    if (hasScript && source.scriptCode) {
      const scriptsDir = path.join(stagingDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      const parameterizedCode = this.parameterizeScript(source.scriptCode, slug);
      fs.writeFileSync(path.join(scriptsDir, 'run.py'), parameterizedCode, 'utf-8');
      try {
        fs.chmodSync(path.join(scriptsDir, 'run.py'), 0o755);
      } catch {
        /* best-effort */
      }
    }

    // 3. 生成 references/rules.json（结构化规则与负向约束）
    const referencesDir = path.join(stagingDir, 'references');
    fs.mkdirSync(referencesDir, { recursive: true });
    const rulesJson = {
      slug,
      displayName,
      objective: source.objective,
      confirmedInstructions: source.confirmedInstructions,
      negativeConstraints: source.corrections || [],
      inputExpectations: source.inputs,
      outputContract: source.outputContract,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(referencesDir, 'rules.json'),
      JSON.stringify(rulesJson, null, 2),
      'utf-8'
    );

    // 4. 复制可复用模板与资产到 assets/ (R07 / B05)
    if (source.reusableFiles && source.reusableFiles.length > 0) {
      const assetsDir = path.join(stagingDir, 'assets');
      for (const rf of source.reusableFiles) {
        if (rf.role === 'template' || rf.role === 'reference') {
          if (rf.path && fs.existsSync(rf.path)) {
            fs.mkdirSync(assetsDir, { recursive: true });
            const safeName = path.basename(rf.name || rf.path);
            fs.copyFileSync(rf.path, path.join(assetsDir, safeName));
          }
        }
      }
    }

    this.logger.log(`Successfully generated personal skill package at staging [${stagingDir}]`);
    return { hasScript, deliverables };
  }

  private buildSkillMd(
    slug: string,
    displayName: string,
    description: string,
    deliverables: string[],
    hasScript: boolean,
    source: SkillSource
  ): string {
    const triggers = [
      displayName,
      `用${displayName}处理`,
      `使用${displayName}`,
      slug,
    ];

    const instructionsList = source.confirmedInstructions
      .map((ins) => `- ${ins}`)
      .join('\n');

    const correctionsSection =
      source.corrections && source.corrections.length > 0
        ? `\n## 2.1 用户确认的边界纠偏与排除规则（负向约束）\n` +
          source.corrections
            .map((c) => `- ⚠️ 纠偏要点: ${c.userCorrection}`)
            .join('\n') +
          '\n'
        : '';

    const scriptSection = hasScript
      ? `## 4. 可重复执行程序\n确定性执行程序位于 \`scripts/run.py\`。\n运行指令示例：\n\`\`\`bash\npython scripts/run.py --input /workspace/新上传附件.xlsx --output /workspace/输出结果.xlsx\n\`\`\`\n对新附件执行时，若表头或数据行有微调，允许根据本 SKILL.md 规则自主微调参数或适配代码后执行。\n`
      : `## 4. 执行机制\n本技能为规则说明型个人技能，沙箱 Agent 读取本说明后根据规则自主进行数据分析、脚本编写与结果交付。\n`;

    const deliverablesYaml =
      deliverables.length > 0
        ? `deliverables:\n${deliverables.map((d) => `  - "${d}"`).join('\n')}`
        : 'deliverables: []';

    const outputSection =
      deliverables.length > 0
        ? `## 5. 输出约定\n- 输出文件格式限定为：${deliverables.join(', ')}。\n- 对计算结果保留原单位，并输出关键分组统计条数与核算总额，便于用户快速比对核验。\n`
        : `## 5. 输出约定\n- 本技能无需生成独立物理附件，处理结果根据业务规则在沙箱中以文本或结构化数据直接呈现。\n`;

    return `---
name: ${slug}
zh_name: "${displayName}"
description: "${description}"
zh_description: "${description}"
triggers:
${triggers.map((t) => `  - "${t}"`).join('\n')}
aliases:
  - "${displayName.toLowerCase()}"
  - "${slug}"
${deliverablesYaml}
requires_execution: ${hasScript}
default_rounds: 5
---

# ${displayName}

${description}

## 1. 业务目标与触发场景
- **业务目标**：${source.objective}
- **触发意图**：当用户上传相关业务附件并提出类似“${triggers[1]}”或“按${displayName}要求统计”时触发。

## 2. 业务规则与处理口径
${instructionsList}
${correctionsSection}
## 3. 输入要求与参数化规范
- **输入附件**：新上传的同构业务文件（如 Excel / CSV / 报表）。
- **去硬编码原则**：严禁固化原文件名、固定数据行号或旧历史数字；对新输入文件必须重新扫描表头与有效数据区域。
- 详细结构化规则可参考 \`references/rules.json\`。

${scriptSection}
${outputSection}`;
  }

  /**
   * 将一次性脚本参数化，去除写死的文件名和路径
   */
  private parameterizeScript(rawCode: string, slug: string): string {
    let code = rawCode;

    // 1. 替换输出写入调用中的硬编码路径
    code = code.replace(
      /(open\s*\(\s*)['"][^'"]+['"](\s*,\s*(?:mode\s*=\s*)?['"][wWaA][^'"]*['"])/g,
      '$1output_path$2'
    );
    code = code.replace(
      /(\.to_(?:excel|csv|json|parquet)\s*\(\s*)(?:['"][^'"]+['"])/g,
      '$1output_path'
    );
    code = code.replace(
      /(\.save\s*\(\s*)(?:['"][^'"]+['"])/g,
      '$1output_path'
    );

    // 2. 替换输入读取调用中的硬编码路径（支持 encoding 等关键字参数）
    code = code.replace(
      /(open\s*\(\s*)['"][^'"]+['"](?!\s*,\s*(?:mode\s*=\s*)?['"][wWaA])/g,
      '$1input_path'
    );
    code = code.replace(
      /(pd\.read_(?:excel|csv|json|parquet|table)\s*\(\s*)(?:['"][^'"]+['"])/g,
      '$1input_path'
    );
    code = code.replace(
      /(load_workbook\s*\(\s*)(?:['"][^'"]+['"])/g,
      '$1input_path'
    );
    code = code.replace(
      /(Document\s*\(\s*)(?:['"][^'"]+['"])/g,
      '$1input_path'
    );

    // 包装为标准的 argparse CLI 入口
    const wrapper = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Parameterized runner for personal skill: ${slug}
Auto-generated from confirmed sandbox execution.
"""
import sys
import os
import argparse
import glob

def run(input_path: str, output_path: str):
    print(f"[SkillRunner] Processing input: {input_path}")
    print(f"[SkillRunner] Output will be saved to: {output_path}")

    # ============ Confirmed Logic Begins ============
`;

    const indentedLogic = code
      .split('\n')
      .map((line) => (line.trim() ? `    ${line}` : ''))
      .join('\n');

    const footer = `
    # ============ Confirmed Logic Ends ============
    print(f"[SkillRunner] Successfully delivered: {output_path}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Execute personal skill ${slug}')
    parser.add_argument('--input', '-i', type=str, help='Path to input data file')
    parser.add_argument('--output', '-o', type=str, help='Path to output deliverable')
    args = parser.parse_args()

    input_file = args.input
    if not input_file:
        candidates = glob.glob('/workspace/*.xlsx') + glob.glob('/workspace/*.csv') + glob.glob('/workspace/*.json')
        if candidates:
            input_file = candidates[0]
        else:
            print("Error: No input file specified and none found in /workspace", file=sys.stderr)
            sys.exit(1)

    output_file = args.output
    if not output_file:
        ext = os.path.splitext(input_file)[1] or '.xlsx'
        output_file = f"/workspace/output_${slug}{ext}"

    run(input_file, output_file)
`;

    return wrapper + indentedLogic + footer;
  }
}
