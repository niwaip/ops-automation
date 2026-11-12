import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as httpFetch } from 'undici';
import { QueryCredential } from './transport-auth';

export function publicAddress(address: string): boolean {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
      parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    }
    return parsed.range() === 'unicast';
  } catch { return false; }
}

function forbiddenAddress(address: string, trustedLocal = false): boolean {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    return !['unicast', 'private', 'uniqueLocal', ...(trustedLocal ? ['loopback'] : [])].includes(parsed.range());
  } catch { return true; }
}

function trustedEndpoint(endpoint: URL): boolean {
  return (process.env.MCP_TRUSTED_ENDPOINTS || '').split(',').some(value => {
    try {
      const allowed = new URL(value.trim());
      return ['http:', 'https:'].includes(allowed.protocol) && !allowed.username && !allowed.password &&
        !allowed.search && !allowed.hash && allowed.href === endpoint.href;
    } catch { return false; }
  });
}

export function validateEndpoint(endpoint: string, privateHosts: string[] = []): URL {
  const url = new URL(endpoint);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (url.username || url.password || url.hash || url.search) throw new Error('MCP_ENDPOINT_CREDENTIALS_FORBIDDEN');
  // An exact operator-authored endpoint also permits personal connections to vetted local services.
  const trusted = trustedEndpoint(url);
  const allowed = privateHosts.includes(host) || trusted;
  if ((!trusted && (host === 'localhost' || host.endsWith('.localhost'))) || (isIP(host) && forbiddenAddress(host, trusted))) throw new Error('MCP_NETWORK_DENIED');
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('MCP_PROTOCOL_DENIED');
  if (!allowed && (host === 'localhost' || host.endsWith('.localhost') || (isIP(host) && !publicAddress(host)))) {
    throw new Error('MCP_NETWORK_DENIED');
  }
  if (!allowed && url.protocol === 'https:' && !['', '443'].includes(url.port)) throw new Error('MCP_PORT_DENIED');
  return url;
}

export function createProtectedFetch(endpoint: string, requestedPrivateHosts: string[] = [], queryCredential?: QueryCredential) {
  const operatorHosts = (process.env.MCP_PRIVATE_HOST_ALLOWLIST || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const privateHosts = requestedPrivateHosts.filter(h => operatorHosts.includes(h));
  const target = validateEndpoint(endpoint, privateHosts);
  const host = target.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const trusted = trustedEndpoint(target);
  const agent = new Agent({ connect: {
    lookup: ((hostname: string, options: any, callback: any) => {
      lookup(hostname, { all: true }).then(addresses => {
        if (!addresses.length || addresses.some(a => forbiddenAddress(a.address, trusted)) ||
            (!trusted && !privateHosts.includes(host) && addresses.some(a => !publicAddress(a.address)))) {
          callback(new Error('MCP_NETWORK_DENIED')); return;
        }
        // DNS is resolved and validated in the actual socket lookup, rather than before a separate fetch.
        callback(null, options?.all ? addresses : addresses[0].address, addresses[0].family);
      }).catch(callback);
    }) as any,
  }});
  const guardedFetch: typeof globalThis.fetch = async (input, init) => {
    const requested = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (requested.origin !== target.origin || requested.pathname !== target.pathname || requested.search
        || requested.hash || requested.username || requested.password) {
      throw new Error('MCP_TARGET_CHANGED');
    }
    // Keep the secret out of the SDK URL/configuration; inject only after target validation.
    // The same guarded fetch handles initialization, tool calls, SSE and session cleanup.
    if (queryCredential) requested.searchParams.set(queryCredential.parameter, queryCredential.value);
    const response = await httpFetch(requested, { ...init as any, dispatcher: agent, redirect: 'error' });
    // Streaming byte budget covers both JSON and SSE without buffering unbounded remote output.
    let bytes = 0;
    const limited = response.body?.pipeThrough(new TransformStream({
      transform(chunk: Uint8Array, controller) {
        bytes += chunk.byteLength;
        if (bytes > 2 * 1024 * 1024) throw new Error('MCP_RESULT_TOO_LARGE');
        controller.enqueue(chunk);
      },
    }) as any);
    return new Response(limited as any, { status: response.status, statusText: response.statusText, headers: response.headers as any });
  };
  return { fetch: guardedFetch, close: () => agent.close() };
}
