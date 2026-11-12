import axios from 'axios';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../ports';
import { UserCredentialCrypto } from './user-credential.crypto';
import {
  CreateUserCredentialDto,
  UpdateUserCredentialDto,
  UserCredentialResponseDto,
} from './user-credential.dto';

@Injectable()
export class UserCredentialVaultService {
  constructor(
    @Inject(WORKBENCH_PRISMA)
    private readonly prisma: WorkbenchPrismaPort,
    private readonly crypto: UserCredentialCrypto
  ) {}

  async listUserCredentials(
    userId: string,
    category?: string
  ): Promise<UserCredentialResponseDto[]> {
    const where: Record<string, any> = { userId };
    if (category) {
      where.category = category;
    }

    const rows = await this.prisma.userCredential.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { bindings: true },
        },
      },
    });

    return rows.map((row: any) => ({
      id: row.id,
      userId: row.userId,
      orgId: row.orgId,
      name: row.name,
      category: row.category,
      description: row.description,
      maskedPreview: row.maskedPreview,
      status: row.status,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      bindingCount: row._count?.bindings ?? 0,
    }));
  }

  async getUserCredential(
    userId: string,
    id: string
  ): Promise<UserCredentialResponseDto> {
    const row = await this.prisma.userCredential.findFirst({
      where: { id, userId },
      include: {
        _count: {
          select: { bindings: true },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('未找到指定的凭证记录');
    }

    return {
      id: row.id,
      userId: row.userId,
      orgId: row.orgId,
      name: row.name,
      category: row.category,
      description: row.description,
      maskedPreview: row.maskedPreview,
      status: row.status,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      bindingCount: row._count?.bindings ?? 0,
    };
  }

  async createUserCredential(
    userId: string,
    orgId: string | null | undefined,
    dto: CreateUserCredentialDto
  ): Promise<UserCredentialResponseDto> {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('凭证名称不能为空');
    }
    if (!dto.category) {
      throw new BadRequestException('凭证类型不能为空');
    }
    if (!dto.payload || typeof dto.payload !== 'object' || Object.keys(dto.payload).length === 0) {
      throw new BadRequestException('凭证数据内容不能为空');
    }

    const encryptedData = this.crypto.encrypt(dto.payload);
    const maskedPreview = this.crypto.buildMaskedPreview(dto.category, dto.payload);

    const created = await this.prisma.userCredential.create({
      data: {
        userId,
        orgId: orgId || null,
        name: dto.name.trim(),
        category: dto.category,
        description: dto.description?.trim() || null,
        encryptedData,
        maskedPreview: maskedPreview as any,
        status: 'active',
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    return {
      id: created.id,
      userId: created.userId,
      orgId: created.orgId,
      name: created.name,
      category: created.category,
      description: created.description,
      maskedPreview: created.maskedPreview,
      status: created.status,
      expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      bindingCount: 0,
    };
  }

  async updateUserCredential(
    userId: string,
    id: string,
    dto: UpdateUserCredentialDto
  ): Promise<UserCredentialResponseDto> {
    const existing = await this.prisma.userCredential.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('未找到指定的凭证记录');
    }

    const data: Record<string, any> = {};
    // MCP authorizations are rotated through the connection-specific endpoint, never generic payload editing.
    if (existing.purpose === 'mcp_transport' && dto.payload) {
      throw new BadRequestException('请在对应外部工具连接中更新凭证');
    }
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    if (dto.payload && Object.keys(dto.payload).length > 0) {
      let mergedPayload = dto.payload;
      try {
        const oldPayload = this.crypto.decrypt(existing.encryptedData);
        if (oldPayload && typeof oldPayload === 'object') {
          mergedPayload = { ...oldPayload, ...dto.payload };
        }
      } catch {
        // ignore
      }
      data.encryptedData = this.crypto.encrypt(mergedPayload);
      data.maskedPreview = this.crypto.buildMaskedPreview(existing.category, mergedPayload);
    }

    const updated = await this.prisma.userCredential.update({
      where: { id },
      data,
      include: {
        _count: {
          select: { bindings: true },
        },
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      orgId: updated.orgId,
      name: updated.name,
      category: updated.category,
      description: updated.description,
      maskedPreview: updated.maskedPreview,
      status: updated.status,
      expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      bindingCount: updated._count?.bindings ?? 0,
    };
  }

  async deleteUserCredential(userId: string, id: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.userCredential.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('未找到指定的凭证记录');
    }

    await this.prisma.userCredential.delete({
      where: { id },
    });

    return { success: true };
  }

  async getDecryptedPayload(
    userId: string,
    credentialId: string
  ): Promise<Record<string, any>> {
    const credential = await this.prisma.userCredential.findFirst({
      where: { id: credentialId, userId, status: 'active',
        AND: [{ OR: [{ purpose: null }, { purpose: { not: 'mcp_transport' } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }] },
    });

    if (!credential) {
      throw new NotFoundException(`无法加载有效凭证 [${credentialId}]`);
    }

    return this.crypto.decrypt(credential.encryptedData);
  }

  /**
   * 获取指定用户的沙箱运行时环境变量
   * 自动汇集该用户已配置的 JINA_API_KEY 及其他专用 API Key，供沙箱隔离注入
   */
  async getUserEnv(userId: string): Promise<Record<string, string>> {
    const env: Record<string, string> = {};
    if (!userId || !userId.trim()) {
      return env;
    }

    const credentials = await this.prisma.userCredential.findMany({
      where: {
        userId,
        status: 'active',
        category: { in: ['api_key', 'custom'] },
        AND: [{ OR: [{ purpose: null }, { purpose: { not: 'mcp_transport' } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
      },
    });

    for (const cred of credentials) {
      try {
        const payload = this.crypto.decrypt(cred.encryptedData);
        if (!payload || typeof payload !== 'object') continue;

        const rawName = (cred.name || '').trim();
        const upperName = rawName.toUpperCase();

        // 1. 优先提取 token / key 值
        const extractedVal =
          payload.token ??
          payload.apiKey ??
          payload.key ??
          payload.customValue ??
          (typeof payload === 'object' ? Object.values(payload)[0] : '');

        const strVal = String(extractedVal ?? '').trim();

        // 2. 识别常用标准服务 Key
        if (/JINA/i.test(rawName)) {
          if (strVal) env['JINA_API_KEY'] = strVal;
          if (payload.proxyUrl) {
            env['JINA_PROXY_URL'] = String(payload.proxyUrl).trim();
          }
          if (payload.baseUrl) {
            env['JINA_BASE_URL'] = String(payload.baseUrl).trim();
          }
        } else if (/TAVILY/i.test(rawName)) {
          if (strVal) env['TAVILY_API_KEY'] = strVal;
        } else if (/SERPER/i.test(rawName)) {
          if (strVal) env['SERPER_API_KEY'] = strVal;
        } else if (/BING/i.test(rawName)) {
          if (strVal) env['BING_API_KEY'] = strVal;
        } else if (cred.category === 'custom' && payload.customKey && payload.customValue) {
          const customKey = String(payload.customKey).trim();
          const customVal = String(payload.customValue).trim();
          if (customKey && customVal) {
            env[customKey] = customVal;
          }
        } else if (cred.category === 'api_key' && strVal) {
          const sanitizedKey = upperName.replace(/[^A-Z0-9_]/g, '_');
          if (sanitizedKey) {
            env[sanitizedKey] = strVal;
          }
        }
      } catch (err: any) {
        // 单个凭证解密异常不阻断全局环境解析
        continue;
      }
    }

    return env;
  }

  /**
   * 解析测试用 API Key（支持传入明文或从用户加密凭证库自动解密）
   */
  private async resolveTestToken(
    tokenInput: string,
    userId?: string,
    credentialId?: string,
    fallbackKeyName?: string
  ): Promise<string> {
    const trimmed = (tokenInput || '').trim();
    if (trimmed && trimmed !== 'SAVED_KEY') {
      return trimmed;
    }

    if (!userId) {
      return '';
    }

    let credential: any = null;
    if (credentialId) {
      credential = await this.prisma.userCredential.findFirst({
        where: { id: credentialId, userId, status: 'active' },
      });
    }

    if (!credential && fallbackKeyName) {
      credential = await this.prisma.userCredential.findFirst({
        where: {
          userId,
          status: 'active',
          category: 'api_key',
          name: { contains: fallbackKeyName, mode: 'insensitive' },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (credential && credential.purpose !== 'mcp_transport' &&
        (!credential.expiresAt || new Date(credential.expiresAt).getTime() > Date.now())) {
      try {
        const payload = this.crypto.decrypt(credential.encryptedData);
        return String(payload?.token ?? payload?.apiKey ?? payload?.key ?? '').trim();
      } catch {
        return '';
      }
    }

    return '';
  }

  /**
   * 验证 Jina API Key 连通性与合法性（支持自定义代理服务器与国内镜像加速）
   */
  async verifyJinaApiKey(
    token: string,
    userId?: string,
    credentialId?: string,
    proxyUrl?: string,
    baseUrl?: string
  ): Promise<{ valid: boolean; message: string; httpStatus?: number; proxyUsed?: string }> {
    const finalToken = await this.resolveTestToken(token, userId, credentialId, 'JINA');
    if (!finalToken) {
      return { valid: false, message: '未找到可供验证的 Jina API Key (API Key 不能为空)' };
    }

    let resolvedProxy = (proxyUrl || '').trim();
    let resolvedBaseUrl = (baseUrl || '').trim();

    // 若未显式传入代理或镜像地址，尝试从已有凭证 payload 中恢复
    if ((!resolvedProxy || !resolvedBaseUrl) && (credentialId || userId)) {
      try {
        const where: any = credentialId
          ? { id: credentialId, userId, status: 'active' }
          : { userId, status: 'active', category: 'api_key', name: { contains: 'JINA', mode: 'insensitive' } };
        const existingCred = await this.prisma.userCredential.findFirst({ where, orderBy: { updatedAt: 'desc' } });
        if (existingCred && existingCred.userId === userId && existingCred.purpose !== 'mcp_transport' &&
            (!existingCred.expiresAt || new Date(existingCred.expiresAt).getTime() > Date.now())) {
          const payload = this.crypto.decrypt(existingCred.encryptedData);
          if (!resolvedProxy && payload.proxyUrl) resolvedProxy = String(payload.proxyUrl).trim();
          if (!resolvedBaseUrl && payload.baseUrl) resolvedBaseUrl = String(payload.baseUrl).trim();
        }
      } catch {
        // ignore
      }
    }

    // 系统环境变量兜底
    if (!resolvedProxy) {
      resolvedProxy = (process.env.JINA_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
    }
    if (!resolvedBaseUrl) {
      resolvedBaseUrl = (process.env.JINA_BASE_URL || 'https://r.jina.ai').trim();
    }
    resolvedBaseUrl = resolvedBaseUrl.replace(/\/+$/, '');

    const targetEndpoint = `${resolvedBaseUrl}/https://example.com`;

    try {
      const axiosConfig: any = {
        method: 'get',
        url: targetEndpoint,
        headers: {
          Authorization: `Bearer ${finalToken}`,
          Accept: 'text/markdown',
          'X-No-Cache': 'true',
        },
        timeout: 8000,
      };

      if (resolvedProxy) {
        try {
          const { HttpsProxyAgent } = require('https-proxy-agent');
          axiosConfig.httpsAgent = new HttpsProxyAgent(resolvedProxy);
          axiosConfig.httpAgent = new HttpsProxyAgent(resolvedProxy);
          axiosConfig.proxy = false;
        } catch {
          const pUrl = new URL(resolvedProxy);
          axiosConfig.proxy = {
            protocol: pUrl.protocol.replace(':', ''),
            host: pUrl.hostname,
            port: parseInt(pUrl.port, 10) || (pUrl.protocol === 'https:' ? 443 : 80),
            ...(pUrl.username ? { auth: { username: pUrl.username, password: pUrl.password } } : {}),
          };
        }
      }

      const res = await axios(axiosConfig);

      const proxyNote = resolvedProxy ? ` (已通过代理 ${resolvedProxy} 连通)` : '';
      if (res.status === 200 || (res.status >= 200 && res.status < 300)) {
        return {
          valid: true,
          message: `Jina API Key 验证通过，服务连接正常！${proxyNote}`,
          httpStatus: res.status,
          proxyUsed: resolvedProxy || undefined,
        };
      }

      return {
        valid: false,
        message: `Jina 服务返回状态码 ${res.status}`,
        httpStatus: res.status,
      };
    } catch (err: any) {
      const status = err.response?.status;
      const proxyNote = resolvedProxy ? ` (代理: ${resolvedProxy})` : ' (直连官方 r.jina.ai)';
      if (status === 401) {
        return { valid: false, message: 'Jina API Key 无效或未激活 (401 Unauthorized)', httpStatus: 401 };
      }
      if (status === 402) {
        return { valid: false, message: 'Jina 账户额度已用尽 (402 Payment Required)', httpStatus: 402 };
      }
      if (status === 403) {
        return { valid: false, message: 'Jina API Key 权限不足或被禁用 (403 Forbidden)', httpStatus: 403 };
      }
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        return {
          valid: false,
          message: `网络连接超时${proxyNote}。中国大陆地区若直连受阻，请配置代理服务器或反代镜像地址。`,
        };
      }
      return {
        valid: false,
        message: `连接验证失败${proxyNote}: ${err?.message || '网络连接异常'}`,
        httpStatus: status,
      };
    }
  }

  /**
   * 验证 Firecrawl API Key 连通性与合法性
   */
  async verifyFirecrawlApiKey(
    token: string,
    userId?: string,
    credentialId?: string
  ): Promise<{ valid: boolean; message: string; httpStatus?: number; credits?: number }> {
    const finalToken = await this.resolveTestToken(token, userId, credentialId, 'FIRECRAWL');
    if (!finalToken) {
      return { valid: false, message: '未找到可供验证的 Firecrawl API Key' };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('https://api.firecrawl.dev/v1/team/credit-usage', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${finalToken}`,
          'User-Agent': 'Mozilla/5.0 Ops-Automation-Verifier',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok || res.status === 200) {
        const body: any = await res.json().catch(() => ({}));
        const remaining = body?.data?.remaining_credits;
        const creditsMsg = remaining !== undefined ? `（剩余额度: ${remaining}）` : '';
        return {
          valid: true,
          message: `Firecrawl API Key 验证通过，服务连接正常${creditsMsg}`,
          httpStatus: res.status,
          credits: remaining,
        };
      }

      if (res.status === 401) {
        return { valid: false, message: 'Firecrawl API Key 无效或未激活 (401 Unauthorized)', httpStatus: 401 };
      }

      if (res.status === 402) {
        return { valid: false, message: 'Firecrawl 账户额度已用尽 (402 Payment Required)', httpStatus: 402 };
      }

      if (res.status === 403) {
        return { valid: false, message: 'Firecrawl API Key 权限不足或被禁用 (403 Forbidden)', httpStatus: 403 };
      }

      return {
        valid: false,
        message: `Firecrawl 服务返回状态码 ${res.status}`,
        httpStatus: res.status,
      };
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError' || err?.message?.includes('aborted');
      return {
        valid: false,
        message: isTimeout
          ? '验证超时 (6s)，请检查网络连接或稍后重试'
          : `连接验证失败: ${err?.message || '未知网络错误'}`,
      };
    }
  }

  /**
   * 验证 Tavily API Key 连通性与合法性
   */
  async verifyTavilyApiKey(
    token: string,
    userId?: string,
    credentialId?: string
  ): Promise<{ valid: boolean; message: string; httpStatus?: number }> {
    const finalToken = await this.resolveTestToken(token, userId, credentialId, 'TAVILY');
    if (!finalToken) {
      return { valid: false, message: '未找到可供验证的 Tavily API Key' };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 Ops-Automation-Verifier',
        },
        body: JSON.stringify({
          api_key: finalToken,
          query: 'connectivity test',
          max_results: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok || res.status === 200) {
        return { valid: true, message: 'Tavily API Key 验证通过，搜索通道连接正常', httpStatus: res.status };
      }

      if (res.status === 401) {
        return { valid: false, message: 'Tavily API Key 无效或未激活 (401 Unauthorized)', httpStatus: 401 };
      }

      if (res.status === 402) {
        return { valid: false, message: 'Tavily 账户额度已用尽 (402 Payment Required)', httpStatus: 402 };
      }

      if (res.status === 403) {
        return { valid: false, message: 'Tavily API Key 权限不足或被禁用 (403 Forbidden)', httpStatus: 403 };
      }

      return {
        valid: false,
        message: `Tavily 服务返回状态码 ${res.status}`,
        httpStatus: res.status,
      };
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError' || err?.message?.includes('aborted');
      return {
        valid: false,
        message: isTimeout
          ? '验证超时 (6s)，请检查网络连接或稍后重试'
          : `连接验证失败: ${err?.message || '未知网络错误'}`,
      };
    }
  }
}
