import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { validateWorkflowPackage } from './personal-skill-workflow-validation.util';

const execFileAsync = promisify(execFile);

export interface SkillValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class PersonalSkillValidatorService {
  private readonly logger = new Logger(PersonalSkillValidatorService.name);

  /**
   * 针对个人沙箱模式执行轻量级校验（保证结构规范，避免过度门禁）
   */
  async validatePackage(packageDir: string, inputPath?: string): Promise<SkillValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!fs.existsSync(packageDir)) {
      errors.push(`技能包目录不存在: ${packageDir}`);
      return { valid: false, errors, warnings };
    }

    // 1. 检查 SKILL.md 是否存在
    const skillMdPath = path.join(packageDir, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      errors.push('缺少核心定义文件 SKILL.md');
      return { valid: false, errors, warnings };
    }

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    if (!content.trim()) {
      errors.push('SKILL.md 内容为空');
      return { valid: false, errors, warnings };
    }

    // 2. 检查 Frontmatter
    if (!content.startsWith('---')) {
      errors.push('SKILL.md 缺少标准的 YAML frontmatter（必须以 --- 开头）');
    } else {
      const parts = content.split('---');
      if (parts.length < 3) {
        errors.push('SKILL.md frontmatter 格式不完整');
      } else {
        const fm = parts[1] || '';
        if (!/name\s*:\s*[a-z0-9_-]+/i.test(fm)) {
          errors.push('frontmatter 必须包含合法的 name 字段 (slug)');
        }
        if (!/description\s*:\s*.+/i.test(fm)) {
          warnings.push('frontmatter 缺少 description 字段，建议提供');
        }
      }
    }

    if (fs.existsSync(path.join(packageDir, 'execution.json'))) {
      try { validateWorkflowPackage(packageDir, inputPath); }
      catch (err: any) { errors.push(`核算流程重放失败: ${err.message}`); }
    } else if (content.includes('execution_mode: verified_workflow')) {
      errors.push('缺少可验证核算流程 execution.json');
    }

    // 3. 检查可选的 scripts/run.py 可运行性（轻量语法检查）
    const runPyPath = path.join(packageDir, 'scripts', 'run.py');
    if (fs.existsSync(runPyPath)) {
      const pyContent = fs.readFileSync(runPyPath, 'utf-8');
      if (!pyContent.trim()) {
        warnings.push('scripts/run.py 内容为空');
      } else {
        const pySyntaxError = await this.checkPythonSyntax(runPyPath);
        if (pySyntaxError) {
          this.logger.warn(`Script syntax error in [${runPyPath}]: ${pySyntaxError}`);
          errors.push(`脚本语法检查失败: ${pySyntaxError}`);
        }
      }
    }

    // 4. 检查资源引用一致性
    const referencesDir = path.join(packageDir, 'references');
    if (fs.existsSync(referencesDir)) {
      const rulesPath = path.join(referencesDir, 'rules.json');
      if (fs.existsSync(rulesPath)) {
        try {
          JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
        } catch (e: any) {
          warnings.push(`references/rules.json 格式非合法 JSON: ${e.message}`);
        }
      }
    }

    const valid = errors.length === 0;
    return { valid, errors, warnings };
  }

  private async checkPythonSyntax(pyFilePath: string): Promise<string | null> {
    try {
      await execFileAsync('python3', ['-c', 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())', pyFilePath], { timeout: 10000 });
      return null;
    } catch (err: any) {
      // 若当前环境中无 python3 命令，则安全跳过编译检查
      if (err?.code === 'ENOENT') {
        return null;
      }
      return err.stderr || err.message || 'Syntax error';
    }
  }
}
