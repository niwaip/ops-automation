import * as fs from 'fs';
import * as path from 'path';
import { WechatUploadMediaType } from './wechat-ilink.client';

export function getWechatMediaType(
  fileName: string
): (typeof WechatUploadMediaType)[keyof typeof WechatUploadMediaType] {
  const ext = path.extname(fileName).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
    return WechatUploadMediaType.IMAGE;
  }
  if (['.mp4', '.mov'].includes(ext)) {
    return WechatUploadMediaType.VIDEO;
  }
  return WechatUploadMediaType.FILE;
}

export function resolveUserFilePath(userId: string, targetPathOrName: string): string | null {
  const sanitized = userId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const projectRoot =
    Boolean(process.env.DOCKER_ENV) && fs.existsSync('/workspace')
      ? '/workspace'
      : process.env.PROJECT_ROOT || process.cwd();

  const clean = targetPathOrName.trim().replace(/^['"]|['"]$/g, '');
  const userRoot = path.join(projectRoot, 'data', 'users', sanitized);
  const workspaceDir = path.join(userRoot, 'workspace');
  const knowledgeDir = path.join(userRoot, 'knowledge');

  if (clean.startsWith('/workspace/')) {
    const rel = clean.slice('/workspace/'.length);
    const full = path.join(workspaceDir, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  if (clean.startsWith('/knowledge/')) {
    const rel = clean.slice('/knowledge/'.length);
    const full = path.join(knowledgeDir, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }

  const inWorkspace = path.join(workspaceDir, clean);
  if (fs.existsSync(inWorkspace) && fs.statSync(inWorkspace).isFile()) return inWorkspace;

  const inKnowledge = path.join(knowledgeDir, clean);
  if (fs.existsSync(inKnowledge) && fs.statSync(inKnowledge).isFile()) return inKnowledge;

  for (const dir of [knowledgeDir, workspaceDir]) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      const found = files.find(
        (f) =>
          f === clean || path.parse(f).name === clean || f.toLowerCase() === clean.toLowerCase()
      );
      if (found) {
        const full = path.join(dir, found);
        if (fs.statSync(full).isFile()) return full;
      }
      const sub = files.find((f) => f.includes(clean) || clean.includes(path.parse(f).name));
      if (sub) {
        const full = path.join(dir, sub);
        if (fs.statSync(full).isFile()) return full;
      }
    } catch {
      // ignore read error
    }
  }

  return null;
}
