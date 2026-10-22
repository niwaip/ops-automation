import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { spawnSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import type {
  CreateSkillVersionDto,
  PersonalSkillDetailDto,
} from './personal-skill.dto';
import type {
  PersonalSkillCatalogRecord,
  PersonalSkillSourceRef,
} from './personal-skill.types';
import { normalizeSkillSlug } from './personal-skill-slug.util';
import { resolvePersonalSkillProjectRoot } from './personal-skill-root.util';

@Injectable()
export class PersonalSkillStoreService {
  private readonly logger = new Logger(PersonalSkillStoreService.name);
  private readonly projectRoot: string;
  private readonly userLocks = new Map<string, Promise<unknown>>();

  constructor() {
    this.projectRoot = resolvePersonalSkillProjectRoot();
  }

  /**
   * 按用户隔离的串行操作互斥锁
   */
  private async withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.userLocks.get(userId) || Promise.resolve();
    let release: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.userLocks.set(
      userId,
      prev.then(
        () => current,
        () => current
      )
    );
    try {
      await prev;
      return await fn();
    } finally {
      release!();
      if (this.userLocks.get(userId) === current) {
        this.userLocks.delete(userId);
      }
    }
  }

  getUserKnowledgeDir(userId: string): string {
    const sanitized = userId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const userDir = path.join(this.projectRoot, 'data', 'users', sanitized, 'knowledge');
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
  }

  getUserSkillsDir(userId: string): string {
    const skillsDir = path.join(this.getUserKnowledgeDir(userId), 'skills');
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }
    return skillsDir;
  }

  getUserVersionsDir(userId: string): string {
    const versionsDir = path.join(this.getUserKnowledgeDir(userId), '.skill-versions');
    if (!fs.existsSync(versionsDir)) {
      fs.mkdirSync(versionsDir, { recursive: true });
    }
    return versionsDir;
  }

  getUserStagingBaseDir(userId: string): string {
    const stagingDir = path.join(this.getUserKnowledgeDir(userId), '.staging');
    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true });
    }
    return stagingDir;
  }

  createStagingDir(userId: string, captureId: string): string {
    const target = path.join(this.getUserStagingBaseDir(userId), captureId);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    fs.mkdirSync(target, { recursive: true });
    return target;
  }

  cleanStagingDir(userId: string, captureId: string): void {
    const target = path.join(this.getUserStagingBaseDir(userId), captureId);
    if (fs.existsSync(target)) {
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch (err: any) {
        this.logger.warn(`Failed to cleanup staging dir [${target}]: ${err.message}`);
      }
    }
  }

  private getCatalogFilePath(userId: string): string {
    return path.join(this.getUserKnowledgeDir(userId), '.personal-skills-catalog.json');
  }

  loadCatalog(userId: string): Record<string, PersonalSkillCatalogRecord> {
    const catalogFile = this.getCatalogFilePath(userId);
    if (!fs.existsSync(catalogFile)) {
      return {};
    }
    try {
      const data = fs.readFileSync(catalogFile, 'utf-8');
      return JSON.parse(data) || {};
    } catch (e: any) {
      this.logger.warn(`Failed to read personal skills catalog for ${userId}: ${e.message}`);
      return {};
    }
  }

  saveCatalog(userId: string, catalog: Record<string, PersonalSkillCatalogRecord>): void {
    const catalogFile = this.getCatalogFilePath(userId);
    fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2), 'utf-8');
  }

  /**
   * 计算技能包内所有文件的整体 SHA256 摘要
   */
  computePackageHash(packageDir: string): string {
    if (!fs.existsSync(packageDir)) return '';
    const hash = crypto.createHash('sha256');
    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && !entry.name.startsWith('.')) {
          const rel = path.relative(packageDir, full);
          hash.update(rel);
          hash.update(fs.readFileSync(full));
        }
      }
    };
    walk(packageDir);
    return hash.digest('hex');
  }

  /**
   * 将暂存包原子安装到用户正式技能目录
   */
  async installFromStaging(
    userId: string,
    captureId: string,
    params: {
      displayName: string;
      slug: string;
      description: string;
      deliverables: string[];
      hasScript: boolean;
      sourceRef?: PersonalSkillSourceRef;
      existingSkillId?: string;
    }
  ): Promise<PersonalSkillCatalogRecord> {
    return this.withUserLock(userId, async () => {
      const stagingDir = path.join(this.getUserStagingBaseDir(userId), captureId);
      if (!fs.existsSync(stagingDir)) {
        throw new NotFoundException(`Staging directory not found for capture [${captureId}]`);
      }

      const catalog = this.loadCatalog(userId);
      const skillId = params.existingSkillId || crypto.randomUUID();
      const existing = catalog[skillId];

      const activeSkillsDir = this.getUserSkillsDir(userId);

      // F03 / B04: 防止同名 slug 静默覆盖已有不同技能（包括未在 catalog 登记的目录）
      const isSlugOccupied = (testSlug: string) => {
        const inCatalog = Object.values(catalog).some(
          (s) => s.slug === testSlug && s.skillId !== skillId
        );
        const inFs = fs.existsSync(path.join(activeSkillsDir, testSlug));
        if (inFs && (!existing || existing.slug !== testSlug)) {
          return true;
        }
        return inCatalog;
      };

      let effectiveSlug = params.slug;
      if (!params.existingSkillId) {
        if (isSlugOccupied(effectiveSlug)) {
          let counter = 2;
          while (isSlugOccupied(`${params.slug}-${counter}`)) {
            counter++;
          }
          effectiveSlug = `${params.slug}-${counter}`;
          const stagingSkillMd = path.join(stagingDir, 'SKILL.md');
          if (fs.existsSync(stagingSkillMd)) {
            let md = fs.readFileSync(stagingSkillMd, 'utf-8');
            md = md.replace(/^name:\s*.+$/m, `name: ${effectiveSlug}`);
            fs.writeFileSync(stagingSkillMd, md, 'utf-8');
          }
        }
      }

      const activeSkillPath = path.join(activeSkillsDir, effectiveSlug);

      const currentVersion = existing ? existing.version + 1 : 1;
      const packageHash = this.computePackageHash(stagingDir);

      // 1. 创建不可变版本快照
      const versionDir = path.join(
        this.getUserVersionsDir(userId),
        skillId,
        `v${currentVersion}`
      );
      fs.mkdirSync(versionDir, { recursive: true });
      this.copyDirRecursive(stagingDir, versionDir);

      // 2. 原子写入活动技能目录
      if (fs.existsSync(activeSkillPath)) {
        fs.rmSync(activeSkillPath, { recursive: true, force: true });
      }
      fs.mkdirSync(activeSkillPath, { recursive: true });
      this.copyDirRecursive(stagingDir, activeSkillPath);

      // 3. 更新目录记录
      const now = new Date().toISOString();
      const updatedRecord: PersonalSkillCatalogRecord = {
        skillId,
        ownerUserId: userId,
        slug: effectiveSlug,
        displayName: params.displayName,
        description: params.description,
        aliases: [params.displayName.toLowerCase(), effectiveSlug],
        triggers: [
          params.displayName,
          `用${params.displayName}处理`,
          `使用${params.displayName}`,
          effectiveSlug,
        ],
        deliverables: params.deliverables,
        requiresExecution: params.hasScript,
        version: currentVersion,
        packageHash,
        status: 'ready',
        sourceRef: params.sourceRef || existing?.sourceRef,
        hasScript: params.hasScript,
        versions: [
          ...(existing?.versions || []),
          {
            version: currentVersion,
            packageHash,
            createdAt: now,
            description: existing ? `更新至 v${currentVersion}` : '初始创建 v1',
          },
        ],
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      catalog[skillId] = updatedRecord;
      this.saveCatalog(userId, catalog);

      // 4. 清理暂存区
      this.cleanStagingDir(userId, captureId);

      this.logger.log(
        `Installed personal skill [${params.displayName}] (${effectiveSlug}) v${currentVersion} for user [${userId}]`
      );
      return updatedRecord;
    });
  }

  async listSkills(userId: string): Promise<PersonalSkillCatalogRecord[]> {
    const catalog = this.loadCatalog(userId);
    return Object.values(catalog).filter((s) => s.status === 'ready');
  }

  async getSkill(userId: string, skillIdOrSlug: string): Promise<PersonalSkillDetailDto | null> {
    const catalog = this.loadCatalog(userId);
    const skill =
      catalog[skillIdOrSlug] ||
      Object.values(catalog).find((s) => s.slug === skillIdOrSlug);

    if (!skill) return null;

    const skillPath = path.join(this.getUserSkillsDir(userId), skill.slug);
    if (!fs.existsSync(skillPath)) return null;

    const skillMdFile = path.join(skillPath, 'SKILL.md');
    const skillMdContent = fs.existsSync(skillMdFile)
      ? fs.readFileSync(skillMdFile, 'utf-8')
      : '';

    const scriptFiles: Array<{ name: string; content?: string }> = [];
    const scriptsDir = path.join(skillPath, 'scripts');
    if (fs.existsSync(scriptsDir)) {
      for (const file of fs.readdirSync(scriptsDir)) {
        if (!file.startsWith('.')) {
          const full = path.join(scriptsDir, file);
          if (fs.statSync(full).isFile()) {
            scriptFiles.push({
              name: file,
              content: fs.readFileSync(full, 'utf-8'),
            });
          }
        }
      }
    }

    const referenceFiles: Array<{ name: string; content?: string }> = [];
    const refsDir = path.join(skillPath, 'references');
    if (fs.existsSync(refsDir)) {
      for (const file of fs.readdirSync(refsDir)) {
        if (!file.startsWith('.')) {
          const full = path.join(refsDir, file);
          if (fs.statSync(full).isFile()) {
            referenceFiles.push({
              name: file,
              content: fs.readFileSync(full, 'utf-8'),
            });
          }
        }
      }
    }

    const assetFiles: Array<{ name: string; size: number }> = [];
    const assetsDir = path.join(skillPath, 'assets');
    if (fs.existsSync(assetsDir)) {
      for (const file of fs.readdirSync(assetsDir)) {
        if (!file.startsWith('.')) {
          const full = path.join(assetsDir, file);
          if (fs.statSync(full).isFile()) {
            const stat = fs.statSync(full);
            assetFiles.push({ name: file, size: stat.size });
          }
        }
      }
    }

    return {
      id: skill.skillId,
      slug: skill.slug,
      displayName: skill.displayName,
      description: skill.description,
      version: skill.version,
      triggers: skill.triggers,
      aliases: skill.aliases,
      deliverables: skill.deliverables,
      hasScript: skill.hasScript,
      packageHash: skill.packageHash,
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
      skillMdContent,
      scriptFiles,
      referenceFiles,
      assetFiles,
      sourceRef: skill.sourceRef,
      versions: skill.versions || [],
    };
  }

  async createVersion(
    userId: string,
    skillId: string,
    dto: CreateSkillVersionDto
  ): Promise<PersonalSkillCatalogRecord> {
    return this.withUserLock(userId, async () => {
      const catalog = this.loadCatalog(userId);
      const skill = catalog[skillId];
      if (!skill) {
        throw new NotFoundException(`Personal skill ${skillId} not found`);
      }

      const activeSkillPath = path.join(this.getUserSkillsDir(userId), skill.slug);
      if (!fs.existsSync(activeSkillPath)) {
        throw new NotFoundException(`Skill directory ${skill.slug} not found on disk`);
      }

      if (fs.existsSync(path.join(activeSkillPath, 'execution.json'))) {
        throw new BadRequestException('可验证核算技能的规则变更必须重新编译并重放来源附件；不能仅追加文字或替换脚本后发布版本');
      }

      const nextVersion = skill.version + 1;

      // B06: 语法检查，拒绝包含语法错误的 Python 脚本更新
      if (dto.scriptFiles && dto.scriptFiles.length > 0) {
        for (const sf of dto.scriptFiles) {
          const safeName = path.basename(sf.name.replace(/\\/g, '/')).trim();
          if (safeName.endsWith('.py') && sf.content) {
            const check = spawnSync(
              'python3',
              ['-c', 'import ast, sys; ast.parse(sys.stdin.read())'],
              {
                input: sf.content,
                encoding: 'utf-8',
              }
            );
            if (check.status !== 0) {
              throw new BadRequestException(
                `Script [${safeName}] contains invalid Python syntax: ${check.stderr || 'SyntaxError'}`
              );
            }
          }
        }
      }

      // F05: 创建不可变快照目录，先将 activeSkillPath 复制到 versionDir。
      // 若创建快照或复制过程发生异常（如磁盘满故障），activeSkillPath 保持完好无损！
      const versionDir = path.join(
        this.getUserVersionsDir(userId),
        skillId,
        `v${nextVersion}`
      );
      if (fs.existsSync(versionDir)) {
        fs.rmSync(versionDir, { recursive: true, force: true });
      }
      fs.mkdirSync(versionDir, { recursive: true });
      this.copyDirRecursive(activeSkillPath, versionDir);

      // 在快照目录中应用新修改
      if (dto.skillMdContent) {
        fs.writeFileSync(path.join(versionDir, 'SKILL.md'), dto.skillMdContent, 'utf-8');
      }

      // F06: 如果有 modificationInstruction，增量更新规则以真正改变可执行规则与 packageHash
      if (dto.modificationInstruction && dto.modificationInstruction.trim()) {
        const instruction = dto.modificationInstruction.trim();
        const vSkillMdFile = path.join(versionDir, 'SKILL.md');
        if (fs.existsSync(vSkillMdFile)) {
          const currentMd = fs.readFileSync(vSkillMdFile, 'utf-8');
          const appendRule = `\n\n## 增量规则 (v${nextVersion})\n- ⚠️ 用户修改指令：${instruction}\n`;
          fs.writeFileSync(vSkillMdFile, currentMd.trim() + appendRule, 'utf-8');
        }
        const vRulesJsonFile = path.join(versionDir, 'references', 'rules.json');
        if (fs.existsSync(vRulesJsonFile)) {
          try {
            const rulesData = JSON.parse(fs.readFileSync(vRulesJsonFile, 'utf-8'));
            rulesData.negativeConstraints = rulesData.negativeConstraints || [];
            rulesData.negativeConstraints.push({
              userCorrection: instruction,
              adjustment: `版本 v${nextVersion} 增量修改规则`,
            });
            fs.writeFileSync(vRulesJsonFile, JSON.stringify(rulesData, null, 2), 'utf-8');
          } catch {
            /* best-effort */
          }
        }

        // B02: 同步将规则更新注入到 scripts/run.py 中，使交付脚本实际执行新规则
        const vRunPyFile = path.join(versionDir, 'scripts', 'run.py');
        if (fs.existsSync(vRunPyFile)) {
          let pyContent = fs.readFileSync(vRunPyFile, 'utf-8');
          const ruleMatch = instruction.match(
            /(?:仅统计|只统计|仅保留|只保留|只包含|仅包含|过滤|筛选|当|排除|剔除|不包含)?\s*([a-zA-Z0-9_]+|[\u4e00-\u9fa5]+?)\s*(?:为|等于|is|==|=|!=|不为|不是)\s*['"]?([^\s的,，;；"']+)/i
          );
          if (ruleMatch && ruleMatch[1] && ruleMatch[2]) {
            const field = ruleMatch[1].trim();
            const value = ruleMatch[2].trim();
            const isNegative = /(?:排除|不包含|剔除|除去|不要|不统计|!=|不为|不是)/.test(instruction);
            const op = isNegative ? '!=' : '==';

            const loaderRegex = /(([ \t]*)([a-zA-Z0-9_]+)\s*=\s*(?:json\.load[s]?|pd\.read_[a-z]+|load_workbook|csv\.reader|csv\.DictReader)\s*\([^)]*\))/;
            const loaderMatch = pyContent.match(loaderRegex);
            if (loaderMatch) {
              const fullMatch = loaderMatch[0];
              const indent = loaderMatch[2] || '    ';
              const varName = loaderMatch[3];
              const filterSnippet = `\n${indent}if isinstance(${varName}, list):\n${indent}    ${varName} = [r for r in ${varName} if not isinstance(r, dict) or str(r.get(${JSON.stringify(field)})) ${op} ${JSON.stringify(value)}]\n${indent}elif hasattr(${varName}, 'loc') and ${JSON.stringify(field)} in getattr(${varName}, 'columns', []):\n${indent}    ${varName} = ${varName}[${varName}[${JSON.stringify(field)}] ${op} ${JSON.stringify(value)}]`;
              pyContent = pyContent.replace(fullMatch, fullMatch + filterSnippet);
              fs.writeFileSync(vRunPyFile, pyContent, 'utf-8');
            }
          }
        }
      }

      // F02: 脚本路径遍历防御，严格限制在当前技能包 scripts/ 目录内，杜绝越界写出
      if (dto.scriptFiles && dto.scriptFiles.length > 0) {
        const scriptsDir = path.join(versionDir, 'scripts');
        fs.mkdirSync(scriptsDir, { recursive: true });
        for (const sf of dto.scriptFiles) {
          const safeName = path.basename(sf.name.replace(/\\/g, '/')).trim();
          if (!safeName || safeName === '.' || safeName === '..' || safeName.includes('\0')) {
            continue;
          }
          const targetPath = path.join(scriptsDir, safeName);
          fs.writeFileSync(targetPath, sf.content, 'utf-8');
        }
      }

      // B01: 先将当前 active 目录读入内存，以备在切换激活发生故障（如 copyFileSync 失败）时完整回滚
      const backupFiles: { relPath: string; content: Buffer }[] = [];
      const readDirRecursive = (dir: string, base: string) => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          const rel = path.join(base, entry.name);
          if (entry.isDirectory()) {
            readDirRecursive(full, rel);
          } else if (entry.isFile()) {
            backupFiles.push({ relPath: rel, content: fs.readFileSync(full) });
          }
        }
      };
      readDirRecursive(activeSkillPath, '');

      const packageHash = this.computePackageHash(versionDir);

      // 快照就绪无误后，同步更新活动技能目录
      try {
        if (fs.existsSync(activeSkillPath)) {
          fs.rmSync(activeSkillPath, { recursive: true, force: true });
        }
        fs.mkdirSync(activeSkillPath, { recursive: true });
        this.copyDirRecursive(versionDir, activeSkillPath);
      } catch (activationErr) {
        try {
          if (fs.existsSync(activeSkillPath)) {
            fs.rmSync(activeSkillPath, { recursive: true, force: true });
          }
          fs.mkdirSync(activeSkillPath, { recursive: true });
          for (const item of backupFiles) {
            const target = path.join(activeSkillPath, item.relPath);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, item.content);
          }
        } catch {
          /* best effort rollback */
        }
        throw activationErr;
      }

      const now = new Date().toISOString();
      skill.version = nextVersion;
      skill.packageHash = packageHash;
      skill.updatedAt = now;
      skill.versions.push({
        version: nextVersion,
        packageHash,
        createdAt: now,
        description: dto.modificationInstruction || `更新版本 v${nextVersion}`,
      });

      catalog[skillId] = skill;
      this.saveCatalog(userId, catalog);
      return skill;
    });
  }

  async copySkill(
    userId: string,
    sourceSkillId: string,
    targetDisplayName: string,
    targetSlug?: string
  ): Promise<PersonalSkillCatalogRecord> {
    return this.withUserLock(userId, async () => {
      const catalog = this.loadCatalog(userId);
      const sourceSkill = catalog[sourceSkillId];
      if (!sourceSkill) {
        throw new NotFoundException(`Source skill ${sourceSkillId} not found`);
      }

      const srcDir = path.join(this.getUserSkillsDir(userId), sourceSkill.slug);
      if (!fs.existsSync(srcDir)) {
        throw new NotFoundException(`Source skill directory not found on disk`);
      }

      const newSlug = normalizeSkillSlug(targetDisplayName, targetSlug);
      const newSkillId = crypto.randomUUID();
      const targetDir = path.join(this.getUserSkillsDir(userId), newSlug);

      if (fs.existsSync(targetDir)) {
        throw new BadRequestException(`Skill with slug [${newSlug}] already exists`);
      }

      fs.mkdirSync(targetDir, { recursive: true });
      this.copyDirRecursive(srcDir, targetDir);

      // F07: 更新副本中的 SKILL.md Frontmatter、Triggers、Aliases 和标题
      const skillMdFile = path.join(targetDir, 'SKILL.md');
      if (fs.existsSync(skillMdFile)) {
        let md = fs.readFileSync(skillMdFile, 'utf-8');
        md = md.replace(/^name:\s*.+$/m, `name: ${newSlug}`);
        md = md.replace(/^zh_name:\s*.+$/m, `zh_name: "${targetDisplayName}"`);
        const newTriggersYaml = `triggers:\n  - "${targetDisplayName}"\n  - "用${targetDisplayName}处理"\n  - "使用${targetDisplayName}"\n  - "${newSlug}"`;
        if (/triggers:\s*\n(?:\s*-\s*["'][^"']+["']\s*\n)+/m.test(md)) {
          md = md.replace(
            /triggers:\s*\n(?:\s*-\s*["'][^"']+["']\s*\n)+/m,
            newTriggersYaml + '\n'
          );
        } else if (/triggers:\s*\[[^\]]*\]/m.test(md)) {
          md = md.replace(/triggers:\s*\[[^\]]*\]/m, newTriggersYaml);
        }
        const newAliasesYaml = `aliases:\n  - "${targetDisplayName.toLowerCase()}"\n  - "${newSlug}"`;
        if (/aliases:\s*\n(?:\s*-\s*["'][^"']+["']\s*\n)+/m.test(md)) {
          md = md.replace(
            /aliases:\s*\n(?:\s*-\s*["'][^"']+["']\s*\n)+/m,
            newAliasesYaml + '\n'
          );
        }
        md = md.replace(/^#\s+.+$/m, `# ${targetDisplayName}`);
        fs.writeFileSync(skillMdFile, md, 'utf-8');
      }

      // F07: 为副本保存 v1 快照
      const v1SnapshotDir = path.join(this.getUserVersionsDir(userId), newSkillId, 'v1');
      fs.mkdirSync(v1SnapshotDir, { recursive: true });
      this.copyDirRecursive(targetDir, v1SnapshotDir);

      const packageHash = this.computePackageHash(targetDir);
      const now = new Date().toISOString();

      const newRecord: PersonalSkillCatalogRecord = {
        ...sourceSkill,
        skillId: newSkillId,
        slug: newSlug,
        displayName: targetDisplayName,
        version: 1,
        packageHash,
        triggers: [targetDisplayName, `用${targetDisplayName}处理`, newSlug],
        aliases: [targetDisplayName.toLowerCase(), newSlug],
        versions: [
          {
            version: 1,
            packageHash,
            createdAt: now,
            description: `复制自 ${sourceSkill.displayName}`,
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      catalog[newSkillId] = newRecord;
      this.saveCatalog(userId, catalog);
      return newRecord;
    });
  }

  async exportSkillZip(userId: string, skillId: string, version?: number): Promise<Buffer> {
    const catalog = this.loadCatalog(userId);
    const skill = catalog[skillId];
    if (!skill) {
      throw new NotFoundException(`Skill ${skillId} not found`);
    }

    let sourceDir: string;
    if (version && version !== skill.version) {
      sourceDir = path.join(this.getUserVersionsDir(userId), skillId, `v${version}`);
    } else {
      sourceDir = path.join(this.getUserSkillsDir(userId), skill.slug);
    }

    if (!fs.existsSync(sourceDir)) {
      throw new NotFoundException(`Skill directory does not exist on disk`);
    }

    const zip = new JSZip();
    const rootFolder = zip.folder(skill.slug) || zip;

    const addFilesToZip = (dir: string, zipFolder: JSZip) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const sub = zipFolder.folder(entry.name);
          if (sub) addFilesToZip(full, sub);
        } else if (entry.isFile()) {
          zipFolder.file(entry.name, fs.readFileSync(full));
        }
      }
    };

    addFilesToZip(sourceDir, rootFolder);
    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  async deleteSkill(userId: string, skillId: string): Promise<boolean> {
    return this.withUserLock(userId, async () => {
      const catalog = this.loadCatalog(userId);
      const skill = catalog[skillId];
      if (!skill) return false;

      const skillPath = path.join(this.getUserSkillsDir(userId), skill.slug);
      if (fs.existsSync(skillPath)) {
        fs.rmSync(skillPath, { recursive: true, force: true });
      }

      delete catalog[skillId];
      this.saveCatalog(userId, catalog);
      return true;
    });
  }

  private copyDirRecursive(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else if (entry.isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
