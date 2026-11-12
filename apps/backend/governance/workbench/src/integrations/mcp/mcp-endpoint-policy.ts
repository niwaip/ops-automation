import { BadRequestException } from '@nestjs/common';

const localAliases = new Set(['localhost', '127.0.0.1', '::1']);

function trustedEndpoints(): Set<string> {
  return new Set((process.env.MCP_TRUSTED_ENDPOINTS || '').split(',').flatMap(value => {
    try {
      const url = new URL(value.trim());
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash ? [url.href] : [];
    } catch { return []; }
  }));
}

/** Localhost belongs to the platform host, not the browser user's computer. */
export function normalizeMcpEndpoint(url: URL): URL {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!localAliases.has(host)) return url;
  const mappedHost = process.env.MCP_LOCAL_HOST?.trim();
  if (mappedHost) {
    if (!/^[A-Za-z0-9.-]+$/.test(mappedHost)) throw new BadRequestException('本机 MCP 主机映射配置无效');
    url.hostname = mappedHost;
  }
  if (!trustedEndpoints().has(url.href)) {
    throw new BadRequestException('本机 MCP 地址尚未获准访问，请由运维设置 MCP_TRUSTED_ENDPOINTS；容器部署可使用 host.docker.internal');
  }
  return url;
}
