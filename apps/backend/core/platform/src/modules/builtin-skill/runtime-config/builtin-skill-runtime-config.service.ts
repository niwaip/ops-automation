import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BuiltinSkillAuditService } from '../audit/builtin-skill-audit.service';
import { BuiltinSkillRuntimeConfigCipher } from './builtin-skill-runtime-config.crypto';

export type BuiltinSkillConfigDefinition = {
  key: string;
  label: string;
  description: string;
  secret: boolean;
  required: boolean;
};

const DEFINITIONS: Record<string, BuiltinSkillConfigDefinition[]> = {
  'platform.search.web': [
    {
      key: 'TAVILY_API_KEY',
      label: 'Tavily API Key',
      description: '用于内置联网搜索访问 Tavily Search API，支持逗号分隔配置多个 Key 自动轮换。',
      secret: true,
      required: false,
    },
    {
      key: 'FIRECRAWL_API_KEY',
      label: 'Firecrawl API Key',
      description: '用于 Firecrawl 网页检索与抓取，支持多 Key 轮换。',
      secret: true,
      required: false,
    },
    {
      key: 'EXA_API_KEY',
      label: 'Exa API Key',
      description: '用于 Exa AI 语义与网页检索，支持逗号分隔配置多个 Key 自动轮换。',
      secret: true,
      required: false,
    },
    {
      key: 'DUCKDUCKGO_ENABLED',
      label: 'DuckDuckGo 免密兜底',
      description: '默认启用；填写 false 可关闭无需 API Key 的 DuckDuckGo 故障转移通道。',
      secret: false,
      required: false,
    },
    {
      key: 'SEARCH_PROVIDER_ORDER',
      label: '搜索引擎通道优先级',
      description: '自定义搜索故障转移通道顺序，例如: tavily,firecrawl,exa,duckduckgo。',
      secret: false,
      required: false,
    },
  ],
  'platform.email.messages': [
    {
      key: 'EMAIL_PROVIDER_TYPE',
      label: '服务商类型',
      description: '邮箱协议与服务商类型，默认 smtp_imap。',
      secret: false,
      required: false,
    },
    {
      key: 'EMAIL_ADDRESS',
      label: '邮箱账号',
      description: '用于收发邮件的用户完整邮箱地址（如 user@example.com 或 user@qq.com）。',
      secret: false,
      required: true,
    },
    {
      key: 'EMAIL_AUTH_PASSWORD',
      label: '密码 / 专用授权码',
      description: '邮箱登录密码或第三方应用专用授权码（如 QQ/163 授权码），系统已加密存储。',
      secret: true,
      required: true,
    },
    {
      key: 'EMAIL_IMAP_HOST',
      label: 'IMAP 收件服务器',
      description: 'IMAP 服务器主机地址（如 imap.qq.com, imap.163.com）。',
      secret: false,
      required: false,
    },
    {
      key: 'EMAIL_IMAP_PORT',
      label: 'IMAP 端口',
      description: 'IMAP 端口号，SSL/TLS 默认为 993。',
      secret: false,
      required: false,
    },
    {
      key: 'EMAIL_IMAP_SECURE',
      label: 'IMAP SSL/TLS',
      description: '是否启用 SSL/TLS 安全连接，默认为 true。',
      secret: false,
      required: false,
    },
    {
      key: 'EMAIL_SMTP_HOST',
      label: 'SMTP 发件服务器',
      description: 'SMTP 服务器主机地址（如 smtp.qq.com, smtp.163.com）。',
      secret: false,
      required: false,
    },
    {
      key: 'EMAIL_SMTP_PORT',
      label: 'SMTP 端口',
      description: 'SMTP 端口号，SSL 默认为 465。',
      secret: false,
      required: false,
    },
    {
      key: 'EMAIL_SMTP_SECURE',
      label: 'SMTP SSL/TLS',
      description: '是否启用 SSL/TLS 安全发信，默认为 true。',
      secret: false,
      required: false,
    },
    {
      key: 'EMAIL_SENDER_NAME',
      label: '发件人显示名称',
      description: '邮件外显的发件人姓名或组织名称。',
      secret: false,
      required: false,
    },
  ],
  'platform.email.send': [
    {
      key: 'EMAIL_PROVIDER_TYPE',
      label: '服务商类型',
      description: '邮箱协议与服务商类型，默认 smtp_imap。',
      secret: false,
      required: false,
    },
    {
      key: 'EMAIL_ADDRESS',
      label: '邮箱账号',
      description: '用于收发邮件的用户完整邮箱地址（如 user@example.com 或 user@qq.com）。',
      secret: false,
      required: true,
    },
    {
      key: 'EMAIL_AUTH_PASSWORD',
      label: '密码 / 专用授权码',
      description: '邮箱登录密码或第三方应用专用授权码（如 QQ/163 授权码），系统已加密存储。',
      secret: true,
      required: true,
    },
    {
      key: 'EMAIL_SMTP_HOST',
      label: 'SMTP 发件服务器',
      description: 'SMTP 服务器主机地址（如 smtp.qq.com, smtp.163.com）。',
      secret: false,
      required: false,
    },
    {
      key: 'EMAIL_SMTP_PORT',
      label: 'SMTP 端口',
      description: 'SMTP 端口号，SSL 默认为 465。',
      secret: false,
      required: false,
    },
    {
      key: 'EMAIL_SMTP_SECURE',
      label: 'SMTP SSL/TLS',
      description: '是否启用 SSL/TLS 安全发信，默认为 true。',
      secret: false,
      required: false,
    },
    {
      key: 'EMAIL_IMAP_HOST',
      label: 'IMAP 收件服务器',
      description: 'IMAP 服务器主机地址（用于读取和搜索历史邮件）。',
      secret: false,
      required: false,
    },
    {
      key: 'EMAIL_IMAP_PORT',
      label: 'IMAP 端口',
      description: 'IMAP 端口号，SSL/TLS 默认为 993。',
      secret: false,
      required: false,
    },
    {
      key: 'EMAIL_SENDER_NAME',
      label: '发件人显示名称',
      description: '邮件外显的发件人姓名或组织名称。',
      secret: false,
      required: false,
    },
  ],
  'platform.email': [
    {
      key: 'EMAIL_ADDRESS',
      label: '邮箱账号',
      description: '用于收发邮件的用户完整邮箱地址。',
      secret: false,
      required: true,
    },
    {
      key: 'EMAIL_AUTH_PASSWORD',
      label: '密码 / 专用授权码',
      description: '邮箱登录密码或第三方应用专用授权码。',
      secret: true,
      required: true,
    },
  ],
};

@Injectable()
export class BuiltinSkillRuntimeConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: BuiltinSkillRuntimeConfigCipher,
    private readonly audit: BuiltinSkillAuditService
  ) {}

  definitionsFor(capabilityKey: string): BuiltinSkillConfigDefinition[] {
    return DEFINITIONS[capabilityKey] || [];
  }

  async getStatus(capabilityKey: string) {
    const skill = await this.requireSkill(capabilityKey);
    const rows = await this.prisma.builtinSkillRuntimeConfig.findMany({
      where: { builtinSkillId: skill.id },
    });
    const byKey = new Map(rows.map((row) => [row.configKey, row]));
    return {
      capabilityKey: skill.capabilityKey,
      fields: this.definitionsFor(skill.capabilityKey).map((definition) => ({
        ...definition,
        configured: byKey.has(definition.key),
        updatedAt: byKey.get(definition.key)?.updatedAt || null,
      })),
    };
  }

  async update(
    capabilityKey: string,
    values: Record<string, string | null | undefined>,
    operator?: string
  ) {
    const skill = await this.requireSkill(capabilityKey);
    const allowed = new Set(this.definitionsFor(skill.capabilityKey).map((item) => item.key));
    const unknown = Object.keys(values || {}).filter((key) => !allowed.has(key));
    if (unknown.length)
      throw new BadRequestException(`Unsupported runtime config: ${unknown.join(', ')}`);

    await this.prisma.$transaction(async (tx) => {
      for (const [configKey, rawValue] of Object.entries(values || {})) {
        const value = rawValue?.trim();
        if (!value) {
          await tx.builtinSkillRuntimeConfig.deleteMany({
            where: { builtinSkillId: skill.id, configKey },
          });
          continue;
        }
        await tx.builtinSkillRuntimeConfig.upsert({
          where: { builtinSkillId_configKey: { builtinSkillId: skill.id, configKey } },
          create: {
            builtinSkillId: skill.id,
            configKey,
            encryptedValue: this.cipher.encrypt(value),
            updatedBy: operator,
          },
          update: { encryptedValue: this.cipher.encrypt(value), updatedBy: operator },
        });
      }
    });
    await this.audit.logEvent({
      builtinSkillId: skill.id,
      action: 'runtime_config_updated',
      operator,
      payload: { keys: Object.keys(values || {}) },
    });
    return this.getStatus(skill.capabilityKey);
  }

  async resolve(capabilityKey: string): Promise<Record<string, string>> {
    const skill = await this.requireSkill(capabilityKey);
    const rows = await this.prisma.builtinSkillRuntimeConfig.findMany({
      where: { builtinSkillId: skill.id },
    });
    return Object.fromEntries(
      rows.map((row) => [row.configKey, this.cipher.decrypt(row.encryptedValue)])
    );
  }

  private async requireSkill(capabilityKey: string) {
    const skill = await this.prisma.builtinSkill.findUnique({ where: { capabilityKey } });
    if (!skill) throw new NotFoundException(`Builtin skill '${capabilityKey}' not found`);
    return skill;
  }
}
