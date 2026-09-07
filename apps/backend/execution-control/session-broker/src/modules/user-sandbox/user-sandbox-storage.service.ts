import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface UserWorkspacePaths {
  workspace: string;
  knowledge: string;
  sharedPlugins: string;
  sharedSkills: string;
}

export interface UserSandboxQuota {
  cpuLimit: number;
  memoryLimitMb: number;
}

@Injectable()
export class UserSandboxStorageService {
  private readonly logger = new Logger(UserSandboxStorageService.name);
  readonly hostProjectRoot: string;
  readonly localProjectRoot: string;
  readonly defaultCpuLimit: number;
  readonly defaultMemoryLimitMb: number;

  constructor() {
    this.hostProjectRoot = process.env.PROJECT_ROOT || process.cwd();
    this.localProjectRoot =
      Boolean(process.env.DOCKER_ENV) && fs.existsSync('/workspace')
        ? '/workspace'
        : this.hostProjectRoot;
    this.defaultCpuLimit = Math.max(
      0.1,
      parseFloat(process.env.USER_SANDBOX_DEFAULT_CPU || '1') || 1
    );
    this.defaultMemoryLimitMb = Math.max(
      128,
      parseInt(process.env.USER_SANDBOX_DEFAULT_MEMORY_MB || '2048', 10) || 2048
    );
  }

  /**
   * 校验并清洗安全的用户标识
   */
  sanitizeUserId(userId: string): string {
    if (!userId || typeof userId !== 'string') {
      throw new BadRequestException('userId 不能为空');
    }
    const sanitized = userId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!sanitized) {
      throw new BadRequestException('userId 包含无效字符');
    }
    return sanitized;
  }

  /**
   * 获取用户独立配额配置文件的存储路径
   */
  getUserConfigPath(userId: string): string {
    const sanitized = this.sanitizeUserId(userId);
    const userRoot = path.join(this.localProjectRoot, 'data', 'users', sanitized);
    if (!fs.existsSync(userRoot)) {
      fs.mkdirSync(userRoot, { recursive: true });
    }
    return path.join(userRoot, 'sandbox-config.json');
  }

  /**
   * 读取用户配置的资源配额（如未配置则返回系统默认规格）
   */
  getUserQuota(userId: string): UserSandboxQuota {
    try {
      const configPath = this.getUserConfigPath(userId);
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const data = JSON.parse(content);
        return {
          cpuLimit:
            typeof data.cpuLimit === 'number' && data.cpuLimit > 0
              ? data.cpuLimit
              : this.defaultCpuLimit,
          memoryLimitMb:
            typeof data.memoryLimitMb === 'number' && data.memoryLimitMb > 0
              ? data.memoryLimitMb
              : this.defaultMemoryLimitMb,
        };
      }
    } catch (err: any) {
      this.logger.warn(`Failed to read user quota for ${userId}: ${err.message}`);
    }
    return {
      cpuLimit: this.defaultCpuLimit,
      memoryLimitMb: this.defaultMemoryLimitMb,
    };
  }

  /**
   * 写入用户独立配额设置
   */
  writeUserQuota(userId: string, quota: { cpuLimit?: number; memoryLimitMb?: number }): UserSandboxQuota {
    const current = this.getUserQuota(userId);
    const newCpu =
      typeof quota.cpuLimit === 'number' && quota.cpuLimit > 0
        ? quota.cpuLimit
        : current.cpuLimit;
    const newMem =
      typeof quota.memoryLimitMb === 'number' && quota.memoryLimitMb > 0
        ? quota.memoryLimitMb
        : current.memoryLimitMb;

    const configPath = this.getUserConfigPath(userId);
    fs.writeFileSync(
      configPath,
      JSON.stringify({ cpuLimit: newCpu, memoryLimitMb: newMem }, null, 2),
      'utf-8'
    );
    this.logger.log(
      `Updated user sandbox quota for [${userId}]: ${newCpu} CPU, ${newMem} MB RAM`
    );
    return { cpuLimit: newCpu, memoryLimitMb: newMem };
  }

  /**
   * 获取宿主机上用户的持久化工作区路径与集中插件库、技能库路径，并确保目录初始化与赋权
   */
  getUserWorkspacePaths(userId: string): UserWorkspacePaths {
    const sanitized = this.sanitizeUserId(userId);
    const hostUserRoot = path.join(this.hostProjectRoot, 'data', 'users', sanitized);
    const hostWorkspace = path.join(hostUserRoot, 'workspace');
    const hostKnowledge = path.join(hostUserRoot, 'knowledge');
    const hostSharedPlugins = path.join(this.hostProjectRoot, 'data', 'shared', 'dsh-plugins');
    const hostSharedSkills = path.join(this.hostProjectRoot, 'data', 'shared', 'dsh-skills');

    const localUserRoot = path.join(this.localProjectRoot, 'data', 'users', sanitized);
    const localWorkspace = path.join(localUserRoot, 'workspace');
    const localKnowledge = path.join(localUserRoot, 'knowledge');
    const localSharedPlugins = path.join(this.localProjectRoot, 'data', 'shared', 'dsh-plugins');
    const localSharedSkills = path.join(this.localProjectRoot, 'data', 'shared', 'dsh-skills');

    // 自动确保工作区与个人知识库物理存在，并赋予非 root 沙箱用户读写权限
    if (!fs.existsSync(localWorkspace)) {
      fs.mkdirSync(localWorkspace, { recursive: true });
    }
    try {
      fs.chmodSync(localWorkspace, 0o777);
    } catch {
      // 忽略 chmod 在部分宿主机环境下的非致命警告
    }

    if (!fs.existsSync(localKnowledge)) {
      fs.mkdirSync(localKnowledge, { recursive: true });
    }
    try {
      fs.chmodSync(localKnowledge, 0o777);
    } catch {
      // 忽略 chmod 在部分环境下的非致命警告
    }

    // 确保个人空间下的自定义 skills 目录存在，并赋予读写权限
    const localKnowledgeSkills = path.join(localKnowledge, 'skills');
    if (!fs.existsSync(localKnowledgeSkills)) {
      fs.mkdirSync(localKnowledgeSkills, { recursive: true });
    }
    try {
      fs.chmodSync(localKnowledgeSkills, 0o777);
    } catch {
      // best-effort permissions for container mounting
    }

    // 自动确保管理员统一共享插件目录存在，并同步预置插件
    if (!fs.existsSync(localSharedPlugins)) {
      fs.mkdirSync(localSharedPlugins, { recursive: true });
    }
    const defaultPluginsDir = path.join(this.localProjectRoot, 'docker', 'user-sandbox', 'plugins');
    if (fs.existsSync(defaultPluginsDir)) {
      try {
        const defaultPlugins = fs.readdirSync(defaultPluginsDir);
        for (const p of defaultPlugins) {
          const src = path.join(defaultPluginsDir, p);
          const dest = path.join(localSharedPlugins, p);
          if (!fs.existsSync(dest) || fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs) {
            fs.copyFileSync(src, dest);
            try {
              fs.chmodSync(dest, 0o755);
            } catch {
              // best-effort permissions for container mounting
            }
          }
        }
      } catch (e: any) {
        this.logger.warn(`Failed to seed default plugins: ${e.message}`);
      }
    }

    // 自动确保管理员统一共享技能模版目录存在，并同步预置技能
    if (!fs.existsSync(localSharedSkills)) {
      fs.mkdirSync(localSharedSkills, { recursive: true });
    }
    const defaultSkillsDir = path.join(this.localProjectRoot, 'docker', 'user-sandbox', 'skills');
    if (fs.existsSync(defaultSkillsDir)) {
      try {
        const defaultSkills = fs.readdirSync(defaultSkillsDir);
        for (const s of defaultSkills) {
          const src = path.join(defaultSkillsDir, s);
          const dest = path.join(localSharedSkills, s);
          if (!fs.existsSync(dest)) {
            fs.cpSync(src, dest, { recursive: true });
          }
        }
      } catch (e: any) {
        this.logger.warn(`Failed to seed default skills: ${e.message}`);
      }
    }

    return {
      workspace: hostWorkspace,
      knowledge: hostKnowledge,
      sharedPlugins: hostSharedPlugins,
      sharedSkills: hostSharedSkills,
    };
  }

  /**
   * 将多轮历史记录持久化至工作区 session 文件中供 dsh 运行时消费
   */
  writeSessionHistory(
    userId: string,
    sessionId: string,
    history: Array<{ role: string; content: string }>
  ): void {
    if (!Array.isArray(history) || history.length === 0) {
      return;
    }
    const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedUser = this.sanitizeUserId(userId);
    const localWorkspace = path.join(this.localProjectRoot, 'data', 'users', sanitizedUser, 'workspace');

    try {
      const validHistory = history
        .filter((item) => item && typeof item === 'object' && !Array.isArray(item) && item.role && item.content)
        .map((item) => ({ role: String(item.role), content: String(item.content) }));

      if (validHistory.length === 0) {
        return;
      }

      const sessionsDir = path.join(localWorkspace, '.dsh', 'sessions');
      if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
        try {
          fs.chmodSync(sessionsDir, 0o777);
        } catch {
          // best-effort permissions for container mounting
        }
      }
      const historyFile = path.join(sessionsDir, `${sanitizedSessionId}.json`);
      fs.writeFileSync(historyFile, JSON.stringify(validHistory, null, 2), 'utf-8');
      try {
        fs.chmodSync(historyFile, 0o666);
      } catch {
        // best-effort permissions for container mounting
      }
    } catch (err: any) {
      this.logger.warn(`Failed to persist session history for sandbox: ${err.message}`);
    }
  }
}
