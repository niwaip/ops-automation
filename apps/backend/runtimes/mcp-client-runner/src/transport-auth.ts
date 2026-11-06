export interface TransportAuth {
  location?: 'header' | 'query'; // Missing location is the legacy header form.
  header?: string;
  parameter?: string;
  value: string;
}
export interface QueryCredential { parameter: string; value: string }

export function resolveTransportAuth(auth?: TransportAuth): { headers: Record<string, string>; query?: QueryCredential } {
  if (!auth) return { headers: {} };
  if (typeof auth.value !== 'string' || !auth.value || auth.value.length > 16384 || /[\r\n]/.test(auth.value)) {
    throw new Error('MCP_AUTH_VALUE_INVALID');
  }
  if (auth.location === 'query') {
    if (auth.header || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(auth.parameter || '')) throw new Error('MCP_AUTH_QUERY_INVALID');
    return { headers: {}, query: { parameter: auth.parameter!, value: auth.value } };
  }
  if ((auth.location !== undefined && auth.location !== 'header') || auth.parameter
      || !/^(authorization|x-api-key|api-key)$/i.test(auth.header || '')) throw new Error('MCP_AUTH_HEADER_INVALID');
  return { headers: { [auth.header!]: auth.value } };
}
