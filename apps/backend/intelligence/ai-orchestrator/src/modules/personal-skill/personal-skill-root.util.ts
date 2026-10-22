import * as fs from 'fs';
import * as path from 'path';

/** pnpm starts services in package directories; user data belongs to the repository mount. */
export function resolvePersonalSkillProjectRoot(): string {
  if (process.env.PROJECT_ROOT?.trim()) return path.resolve(process.env.PROJECT_ROOT);
  if (process.env.DOCKER_ENV && fs.existsSync('/workspace')) return '/workspace';
  let candidate = path.resolve(process.cwd());
  while (true) {
    if (fs.existsSync(path.join(candidate, 'pnpm-workspace.yaml')) &&
        fs.existsSync(path.join(candidate, 'docker', 'start-smart.sh'))) return candidate;
    const parent = path.dirname(candidate);
    if (parent === candidate) throw new Error('无法定位个人技能存储根目录，请配置 PROJECT_ROOT');
    candidate = parent;
  }
}
