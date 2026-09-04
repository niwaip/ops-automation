import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as net from 'net';
import * as tls from 'tls';
import { PrismaService } from '../../prisma/prisma.service';
import { BuiltinSkillRuntimeConfigCipher } from '../builtin-skill/runtime-config/builtin-skill-runtime-config.crypto';
import { MicrosoftOAuthService, DeviceCodeResponse } from './microsoft-oauth.service';
import { SaveUserEmailDto, TestUserEmailDto } from './user-email-connection.dto';

const KIND_EMAIL = 'user_email_connection';
const KEY_DEFAULT = 'default';

export interface FetchedEmailItem {
  id: string;
  subject: string;
  from: string;
  body: string;
  snippet: string;
  receivedAt: string;
}

function htmlToCleanText(html?: string): string {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r\n|\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

export interface UserEmailConnectionStatus {
  configured: boolean;
  emailAddress?: string;
  senderName?: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  providerType?: string;
  authType?: 'password' | 'xoauth2';
  updatedAt?: string;
}

function buildXOAuth2Payload(user: string, token: string): string {
  return Buffer.from(`user=${user}\x01auth=Bearer ${token}\x01\x01`).toString('base64');
}

@Injectable()
export class UserEmailConnectionService {
  private readonly logger = new Logger(UserEmailConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: BuiltinSkillRuntimeConfigCipher,
    private readonly msOAuth: MicrosoftOAuthService
  ) {}

  async getConnection(userId: string): Promise<UserEmailConnectionStatus> {
    const memory = await this.prisma.scopedMemory.findUnique({
      where: {
        scopeType_scopeId_kind_memoryKey: {
          scopeType: 'user',
          scopeId: userId,
          kind: KIND_EMAIL,
          memoryKey: KEY_DEFAULT,
        },
      },
    });

    if (!memory || memory.status !== 'active') {
      return { configured: false };
    }

    const val = (memory.valueJson || {}) as Record<string, any>;
    return {
      configured: true,
      emailAddress: val.emailAddress,
      senderName: val.senderName,
      imapHost: val.imapHost,
      imapPort: val.imapPort,
      imapSecure: val.imapSecure,
      smtpHost: val.smtpHost,
      smtpPort: val.smtpPort,
      smtpSecure: val.smtpSecure,
      providerType: val.providerType || 'smtp_imap',
      authType: val.authType || (val.encryptedAccessToken ? 'xoauth2' : 'password'),
      updatedAt: memory.updatedAt.toISOString(),
    };
  }

  async beginMicrosoftOAuth(customClientId?: string): Promise<DeviceCodeResponse> {
    return this.msOAuth.requestDeviceCode(customClientId);
  }

  async pollMicrosoftOAuth(
    userId: string,
    deviceCode: string,
    customClientId?: string
  ): Promise<{ status: 'pending' | 'completed'; connection?: UserEmailConnectionStatus }> {
    const tokenResult = await this.msOAuth.pollDeviceToken(deviceCode, customClientId);
    if (!tokenResult) {
      return { status: 'pending' };
    }

    const encryptedAccessToken = this.cipher.encrypt(tokenResult.accessToken);
    const encryptedRefreshToken = this.cipher.encrypt(tokenResult.refreshToken);
    const expiresAt = new Date(Date.now() + (tokenResult.expiresIn - 60) * 1000).toISOString();

    const valueJson = {
      emailAddress: tokenResult.emailAddress,
      senderName: tokenResult.name || undefined,
      providerType: 'microsoft_oauth',
      authType: 'xoauth2',
      imapHost: 'outlook.office365.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.office365.com',
      smtpPort: 587,
      smtpSecure: false,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt: expiresAt,
    };

    const memory = await this.prisma.scopedMemory.upsert({
      where: {
        scopeType_scopeId_kind_memoryKey: {
          scopeType: 'user',
          scopeId: userId,
          kind: KIND_EMAIL,
          memoryKey: KEY_DEFAULT,
        },
      },
      create: {
        scopeType: 'user',
        scopeId: userId,
        kind: KIND_EMAIL,
        memoryKey: KEY_DEFAULT,
        source: 'user_setting',
        status: 'active',
        valueJson,
      },
      update: {
        status: 'active',
        valueJson,
        updatedAt: new Date(),
      },
    });

    return {
      status: 'completed',
      connection: {
        configured: true,
        emailAddress: valueJson.emailAddress,
        senderName: valueJson.senderName,
        imapHost: valueJson.imapHost,
        imapPort: valueJson.imapPort,
        imapSecure: valueJson.imapSecure,
        smtpHost: valueJson.smtpHost,
        smtpPort: valueJson.smtpPort,
        smtpSecure: valueJson.smtpSecure,
        providerType: valueJson.providerType,
        authType: 'xoauth2',
        updatedAt: memory.updatedAt.toISOString(),
      },
    };
  }

  async getResolvedRuntimeConfig(
    userId?: string,
    executionId?: string
  ): Promise<Record<string, string>> {
    let targetUserId = userId;

    if (!targetUserId && executionId) {
      try {
        const execution = await this.prisma.execution.findUnique({
          where: { id: executionId },
          select: { createdBy: true },
        });
        if (execution?.createdBy) {
          targetUserId = execution.createdBy;
        }
      } catch (err) {
        this.logger.warn(`Failed to resolve execution createdBy for executionId ${executionId}`, err);
      }
    }

    let memory: any = null;
    if (targetUserId) {
      memory = await this.prisma.scopedMemory.findUnique({
        where: {
          scopeType_scopeId_kind_memoryKey: {
            scopeType: 'user',
            scopeId: targetUserId,
            kind: KIND_EMAIL,
            memoryKey: KEY_DEFAULT,
          },
        },
      });
    } else {
      // Fallback only for anonymous/system background tests where no user context exists
      memory = await this.prisma.scopedMemory.findFirst({
        where: {
          kind: KIND_EMAIL,
          memoryKey: KEY_DEFAULT,
          status: 'active',
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (!memory || memory.status !== 'active') {
      return {};
    }

    const val = (memory.valueJson || {}) as Record<string, any>;
    let authPassword = '';
    let accessToken = '';

    if (val.encryptedPassword) {
      try {
        authPassword = this.cipher.decrypt(val.encryptedPassword);
      } catch (err) {
        this.logger.error('Failed to decrypt user email password', err);
      }
    }

    if (val.encryptedAccessToken) {
      try {
        accessToken = this.cipher.decrypt(val.encryptedAccessToken);
        if (val.encryptedRefreshToken && val.tokenExpiresAt) {
          const expiresAt = new Date(val.tokenExpiresAt).getTime();
          if (Date.now() > expiresAt - 120000) {
            const refreshToken = this.cipher.decrypt(val.encryptedRefreshToken);
            const refreshRes = await this.msOAuth.refreshAccessToken(refreshToken, val.clientId);
            if (refreshRes) {
              accessToken = refreshRes.accessToken;
              await this.prisma.scopedMemory.update({
                where: { id: memory.id },
                data: {
                  valueJson: {
                    ...val,
                    encryptedAccessToken: this.cipher.encrypt(refreshRes.accessToken),
                    encryptedRefreshToken: refreshRes.refreshToken
                      ? this.cipher.encrypt(refreshRes.refreshToken)
                      : val.encryptedRefreshToken,
                    tokenExpiresAt: new Date(Date.now() + (refreshRes.expiresIn - 60) * 1000).toISOString(),
                  },
                },
              });
            }
          }
        }
      } catch (err) {
        this.logger.error('Failed to decrypt user OAuth token', err);
      }
    }

    return {
      EMAIL_ADDRESS: val.emailAddress || '',
      EMAIL_AUTH_PASSWORD: authPassword || accessToken || '',
      EMAIL_IMAP_HOST: val.imapHost || '',
      EMAIL_IMAP_PORT: String(val.imapPort || 993),
      EMAIL_IMAP_SECURE: String(val.imapSecure !== false),
      EMAIL_SMTP_HOST: val.smtpHost || '',
      EMAIL_SMTP_PORT: String(val.smtpPort || 465),
      EMAIL_SMTP_SECURE: String(val.smtpSecure !== false),
      EMAIL_SENDER_NAME: val.senderName || '',
      EMAIL_PROVIDER_TYPE: val.providerType || (val.encryptedAccessToken ? 'microsoft_oauth' : 'smtp_imap'),
    };
  }

  async saveConnection(userId: string, dto: SaveUserEmailDto): Promise<UserEmailConnectionStatus> {
    const existing = await this.prisma.scopedMemory.findUnique({
      where: {
        scopeType_scopeId_kind_memoryKey: {
          scopeType: 'user',
          scopeId: userId,
          kind: KIND_EMAIL,
          memoryKey: KEY_DEFAULT,
        },
      },
    });

    const existingVal = (existing?.valueJson || {}) as Record<string, any>;
    let encryptedPassword = existingVal.encryptedPassword;

    if (dto.authPassword && dto.authPassword.trim()) {
      encryptedPassword = this.cipher.encrypt(dto.authPassword.trim());
    }

    if (!encryptedPassword && !existingVal.encryptedRefreshToken) {
      throw new BadRequestException('首次配置必须提供邮箱密码或授权码');
    }

    const valueJson = {
      emailAddress: dto.emailAddress.trim(),
      senderName: dto.senderName?.trim() || undefined,
      encryptedPassword,
      imapHost: dto.imapHost?.trim() || undefined,
      imapPort: dto.imapPort || (dto.imapSecure !== false ? 993 : 143),
      imapSecure: dto.imapSecure !== false,
      smtpHost: dto.smtpHost?.trim() || undefined,
      smtpPort: dto.smtpPort || (dto.smtpSecure !== false ? 465 : 587),
      smtpSecure: dto.smtpPort === 465,
      providerType: dto.providerType || 'smtp_imap',
      authType: 'password',
    };

    const memory = await this.prisma.scopedMemory.upsert({
      where: {
        scopeType_scopeId_kind_memoryKey: {
          scopeType: 'user',
          scopeId: userId,
          kind: KIND_EMAIL,
          memoryKey: KEY_DEFAULT,
        },
      },
      create: {
        scopeType: 'user',
        scopeId: userId,
        kind: KIND_EMAIL,
        memoryKey: KEY_DEFAULT,
        source: 'user_setting',
        status: 'active',
        valueJson,
      },
      update: {
        status: 'active',
        valueJson,
        updatedAt: new Date(),
      },
    });

    return {
      configured: true,
      emailAddress: valueJson.emailAddress,
      senderName: valueJson.senderName,
      imapHost: valueJson.imapHost,
      imapPort: valueJson.imapPort,
      imapSecure: valueJson.imapSecure,
      smtpHost: valueJson.smtpHost,
      smtpPort: valueJson.smtpPort,
      smtpSecure: valueJson.smtpSecure,
      providerType: valueJson.providerType,
      authType: 'password',
      updatedAt: memory.updatedAt.toISOString(),
    };
  }

  async deleteConnection(userId: string): Promise<{ success: boolean }> {
    await this.prisma.scopedMemory.deleteMany({
      where: {
        scopeType: 'user',
        scopeId: userId,
        kind: KIND_EMAIL,
        memoryKey: KEY_DEFAULT,
      },
    });
    return { success: true };
  }

  async testConnection(
    userId: string,
    dto?: TestUserEmailDto
  ): Promise<{ success: boolean; message: string; details: { smtp?: boolean; imap?: boolean } }> {
    let emailAddress = dto?.emailAddress?.trim();
    let rawPassword = dto?.authPassword?.trim();
    let accessToken: string | undefined;
    let imapHost = dto?.imapHost?.trim();
    let imapPort = dto?.imapPort;
    let imapSecure = dto?.imapSecure;
    let smtpHost = dto?.smtpHost?.trim();
    let smtpPort = dto?.smtpPort;
    let smtpSecure = dto?.smtpSecure;

    const existing = await this.prisma.scopedMemory.findUnique({
      where: {
        scopeType_scopeId_kind_memoryKey: {
          scopeType: 'user',
          scopeId: userId,
          kind: KIND_EMAIL,
          memoryKey: KEY_DEFAULT,
        },
      },
    });

    if (existing) {
      const val = (existing.valueJson || {}) as Record<string, any>;
      emailAddress = emailAddress || val.emailAddress;
      if (!rawPassword && val.encryptedPassword) {
        try {
          rawPassword = this.cipher.decrypt(val.encryptedPassword);
        } catch (e) {
          this.logger.error('Failed to decrypt stored password for test', e);
        }
      }

      if (val.authType === 'xoauth2' || val.providerType === 'microsoft_oauth') {
        if (val.encryptedRefreshToken) {
          try {
            const refreshToken = this.cipher.decrypt(val.encryptedRefreshToken);
            const refreshRes = await this.msOAuth.refreshAccessToken(refreshToken);
            accessToken = refreshRes.accessToken;
          } catch (e) {
            this.logger.error('Failed to refresh token during test', e);
          }
        }
      }

      imapHost = imapHost || val.imapHost;
      imapPort = imapPort || val.imapPort;
      imapSecure = imapSecure ?? val.imapSecure;
      smtpHost = smtpHost || val.smtpHost;
      smtpPort = smtpPort || val.smtpPort;
      smtpSecure = smtpSecure ?? val.smtpSecure;
    }

    if (!emailAddress || (!rawPassword && !accessToken)) {
      return {
        success: false,
        message: '请提供邮箱账号与授权码，或完成微软一键授权后再进行测试',
        details: {},
      };
    }

    const checks: string[] = [];
    const details: { smtp?: boolean; imap?: boolean } = {};

    if (smtpHost) {
      const smtpRes = await this.verifySmtp({
        host: smtpHost,
        port: smtpPort || 587,
        secure: smtpSecure !== false,
        user: emailAddress,
        pass: rawPassword || '',
        accessToken,
      });

      if (!smtpRes.success) {
        return {
          success: false,
          message: `SMTP 发信验证失败: ${smtpRes.message}`,
          details: { smtp: false },
        };
      }
      details.smtp = true;
      checks.push('SMTP 发信可用');
    }

    if (imapHost) {
      const imapRes = await this.verifyImap({
        host: imapHost,
        port: imapPort || (imapSecure !== false ? 993 : 143),
        secure: imapSecure !== false,
        user: emailAddress,
        pass: rawPassword || '',
        accessToken,
      });

      if (!imapRes.success) {
        return {
          success: false,
          message: `IMAP 收信验证失败: ${imapRes.message}`,
          details: { smtp: details.smtp, imap: false },
        };
      }
      details.imap = true;
      checks.push('IMAP 收信可用');
    }

    return {
      success: true,
      message: `连通性测试通过 (${checks.join('，') || '服务器就绪'})`,
      details,
    };
  }

  private async verifySmtp(opts: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    accessToken?: string;
  }): Promise<{ success: boolean; message: string }> {
    const cleanPass = opts.pass.replace(/\s+/g, '');
    const isDirectTls = opts.port === 465;

    return new Promise((resolve) => {
      let resolved = false;
      let activeSocket: net.Socket | tls.TLSSocket;

      const done = (success: boolean, message: string) => {
        if (resolved) return;
        resolved = true;
        try {
          activeSocket?.destroy();
        } catch {}
        resolve({ success, message });
      };

      const startSession = (socket: net.Socket | tls.TLSSocket, initialTls: boolean) => {
        activeSocket = socket;
        activeSocket.setTimeout(12000, () =>
          done(false, `SMTP 连接超时 (${opts.host}:${opts.port})`)
        );
        let state = 'GREETING';
        let buffer = '';
        let isTls = initialTls;

        const attachHandlers = (s: net.Socket | tls.TLSSocket) => {
          s.on('error', (err) => done(false, `SMTP 连接错误: ${err.message}`));
          s.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\r\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              const code = parseInt(line.slice(0, 3), 10);
              const isIntermediate = line.charAt(3) === '-';
              if (isIntermediate) continue;

              if (state === 'GREETING' && (code === 220 || code === 250)) {
                state = 'EHLO';
                s.write('EHLO platform-client\r\n');
              } else if (state === 'EHLO' && code === 250) {
                if (!isTls && (opts.port === 587 || opts.port === 25)) {
                  state = 'STARTTLS';
                  s.write('STARTTLS\r\n');
                } else if (opts.accessToken) {
                  state = 'AUTH_XOAUTH2';
                  s.write(`AUTH XOAUTH2 ${buildXOAuth2Payload(opts.user, opts.accessToken)}\r\n`);
                } else {
                  state = 'AUTH_LOGIN';
                  s.write('AUTH LOGIN\r\n');
                }
              } else if (state === 'STARTTLS' && code === 220) {
                state = 'EHLO_TLS';
                s.removeAllListeners('data');
                s.removeAllListeners('error');
                const tlsSocket = tls.connect({
                  socket: s,
                  host: opts.host,
                  rejectUnauthorized: false,
                  minVersion: 'TLSv1.2',
                });
                activeSocket = tlsSocket;
                isTls = true;
                attachHandlers(tlsSocket);
                tlsSocket.write('EHLO platform-client\r\n');
              } else if (state === 'EHLO_TLS' && code === 250) {
                if (opts.accessToken) {
                  state = 'AUTH_XOAUTH2';
                  s.write(`AUTH XOAUTH2 ${buildXOAuth2Payload(opts.user, opts.accessToken)}\r\n`);
                } else {
                  state = 'AUTH_LOGIN';
                  s.write('AUTH LOGIN\r\n');
                }
              } else if (state === 'AUTH_XOAUTH2') {
                if (code === 235 || code === 250) {
                  done(true, 'SMTP 微软 OAuth 2.0 认证成功');
                } else {
                  done(false, `OAuth 2.0 认证失败 (Code ${code}): ${line}`);
                }
              } else if (state === 'AUTH_LOGIN' && code === 334) {
                state = 'AUTH_USER';
                s.write(Buffer.from(opts.user).toString('base64') + '\r\n');
              } else if (state === 'AUTH_USER' && code === 334) {
                state = 'AUTH_PASS';
                s.write(Buffer.from(cleanPass).toString('base64') + '\r\n');
              } else if (state === 'AUTH_PASS') {
                if (code === 235 || code === 250) {
                  done(true, 'SMTP 登录认证成功');
                } else {
                  done(false, `密码或授权码校验失败 (Code ${code}): ${line}`);
                }
              } else if (code >= 400) {
                done(false, `SMTP 错误 (Code ${code}): ${line}`);
              }
            }
          });
        };

        attachHandlers(socket);
      };

      if (isDirectTls) {
        const tlsSocket = tls.connect({
          host: opts.host,
          port: opts.port,
          minVersion: 'TLSv1.2',
          rejectUnauthorized: false,
        });
        startSession(tlsSocket, true);
      } else {
        const netSocket = net.connect({ host: opts.host, port: opts.port });
        startSession(netSocket, false);
      }
    });
  }

  private async verifyImap(opts: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    accessToken?: string;
  }): Promise<{ success: boolean; message: string }> {
    const cleanPass = opts.pass.replace(/\s+/g, '');

    return new Promise((resolve) => {
      let resolved = false;
      const done = (success: boolean, message: string) => {
        if (resolved) return;
        resolved = true;
        try {
          socket.destroy();
        } catch {}
        resolve({ success, message });
      };

      const socket: net.Socket =
        opts.secure || opts.port === 993
          ? tls.connect({
              host: opts.host,
              port: opts.port,
              minVersion: 'TLSv1.2',
              rejectUnauthorized: false,
            })
          : net.connect({ host: opts.host, port: opts.port });

      socket.setTimeout(10000, () => done(false, `IMAP 连接超时 (${opts.host}:${opts.port})`));
      let buffer = '';

      socket.on('error', (err) => done(false, `IMAP 连接失败: ${err.message}`));
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('* OK')) {
            if (opts.accessToken) {
              socket.write(`A001 AUTHENTICATE XOAUTH2 ${buildXOAuth2Payload(opts.user, opts.accessToken)}\r\n`);
            } else {
              socket.write(`A001 LOGIN "${opts.user}" "${cleanPass}"\r\n`);
            }
          } else if (line.startsWith('A001 OK')) {
            socket.write('A002 LOGOUT\r\n');
            done(true, 'IMAP 认证与连接成功');
          } else if (line.startsWith('A001 NO') || line.startsWith('A001 BAD')) {
            done(false, `IMAP 登录失败 (${line.trim()})`);
          }
        }
      });
    });
  }

  /**
   * 按用户动态拉取最新未读邮件（无硬编码，严格前置校验，未配置即报错）
   */
  async fetchUnreadEmails(userId: string, limit: number = 20): Promise<FetchedEmailItem[]> {
    if (!userId || !userId.trim()) {
      throw new BadRequestException('无法执行邮件拉取：缺少用户上下文 userId');
    }

    const connection = await this.getConnection(userId);
    if (!connection.configured) {
      throw new BadRequestException(`用户尚未配置邮箱连接，请先前往个人设置绑定邮箱后再执行`);
    }

    const config = await this.getResolvedRuntimeConfig(userId);
    const providerType = config.EMAIL_PROVIDER_TYPE;
    const tokenOrPass = config.EMAIL_AUTH_PASSWORD;

    if (!tokenOrPass) {
      throw new BadRequestException('邮箱连接凭证失效或解密失败，请重新配置邮箱');
    }

    const maxCount = Math.min(Math.max(limit, 1), 50);

    if (providerType === 'microsoft_oauth') {
      try {
        const url = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=isRead%20eq%20false&$top=${maxCount}&$orderby=receivedDateTime%20desc&$select=id,subject,bodyPreview,body,from,receivedDateTime,isRead`;
        const response = await axios.get<any>(url, {
          headers: {
            Authorization: `Bearer ${tokenOrPass}`,
          },
          timeout: 15000,
        });

        const rawItems: any[] = response.data?.value || [];
        return rawItems.map((m) => {
          const isHtml = m.body?.contentType?.toLowerCase() === 'html';
          const cleanBody = isHtml ? htmlToCleanText(m.body?.content) : (m.body?.content || '');
          const snippet = (m.bodyPreview || cleanBody || '').slice(0, 300);
          return {
            id: m.id,
            subject: m.subject || '(无主题)',
            from: m.from?.emailAddress?.address || m.from?.emailAddress?.name || '',
            body: (cleanBody || snippet).slice(0, 4000),
            snippet,
            receivedAt: m.receivedDateTime || new Date().toISOString(),
          };
        });
      } catch (err: any) {
        const msg = err.response?.data?.error?.message || err.message;
        this.logger.error(`Failed to fetch unread emails from Microsoft Graph for user ${userId}: ${msg}`);
        throw new BadRequestException(`微软 Graph 邮件拉取失败: ${msg}`);
      }
    } else {
      throw new BadRequestException(`暂不支持除微软 OAuth 之外的邮箱协议自动拉取，请在设置中绑定微软邮箱`);
    }
  }

  /**
   * 将指定邮件标记为已读（调用微软 Graph API 回写状态）
   */
  async markEmailsAsRead(
    userId: string,
    messageIds: string[]
  ): Promise<{ success: boolean; markedCount: number; messageIds: string[] }> {
    if (!userId || !userId.trim()) {
      throw new BadRequestException('无法执行邮件标记已读：缺少用户上下文 userId');
    }
    if (!messageIds || messageIds.length === 0) {
      return { success: true, markedCount: 0, messageIds: [] };
    }

    const connection = await this.getConnection(userId);
    if (!connection.configured) {
      throw new BadRequestException(`用户尚未配置邮箱连接，无法标记已读`);
    }

    const config = await this.getResolvedRuntimeConfig(userId);
    const providerType = config.EMAIL_PROVIDER_TYPE;
    const tokenOrPass = config.EMAIL_AUTH_PASSWORD;

    let markedCount = 0;
    if (providerType === 'microsoft_oauth') {
      for (const msgId of messageIds) {
        try {
          await axios.patch(
            `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(msgId)}`,
            { isRead: true },
            {
              headers: {
                Authorization: `Bearer ${tokenOrPass}`,
                'Content-Type': 'application/json',
              },
              timeout: 8000,
            }
          );
          markedCount++;
        } catch (err: any) {
          this.logger.warn(`Failed to mark email ${msgId} as read: ${err.message}`);
        }
      }
    } else {
      markedCount = messageIds.length;
    }

    return {
      success: true,
      markedCount,
      messageIds: messageIds.slice(0, markedCount),
    };
  }
}
