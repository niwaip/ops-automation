import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { PersonalSkillWorkflow } from './personal-skill-workflow.compiler';

export const sha256 = (bytes: Buffer | string): string => crypto.createHash('sha256').update(bytes).digest('hex');

export function workflowEnginePath(): string {
  let root = __dirname;
  while (true) {
    const candidate = path.join(root, 'apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/personal_skill_workflow_engine.py');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(root);
    if (parent === root) throw new Error('核算执行引擎不可用，无法保存可执行技能');
    root = parent;
  }
}

export function writeWorkflowPackage(stagingDir: string, plan: PersonalSkillWorkflow): void {
  fs.mkdirSync(path.join(stagingDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(stagingDir, 'references'), { recursive: true });
  const engine = fs.readFileSync(workflowEnginePath());
  const planBytes = JSON.stringify(plan, null, 2) + '\n';
  fs.writeFileSync(path.join(stagingDir, 'scripts/run.py'), engine);
  fs.writeFileSync(path.join(stagingDir, 'references/workflow.json'), planBytes);
  fs.writeFileSync(path.join(stagingDir, 'execution.json'), JSON.stringify({
    schema_version: 1, kind: 'personal_skill_workflow',
    entrypoint: 'scripts/run.py', plan: 'references/workflow.json',
    engine_sha256: sha256(engine), plan_sha256: sha256(planBytes),
  }, null, 2));
}
