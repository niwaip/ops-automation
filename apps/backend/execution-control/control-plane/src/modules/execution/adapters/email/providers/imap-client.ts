import * as tls from 'tls';
import * as net from 'net';
import * as crypto from 'crypto';
import type {
  EmailAddress,
  EmailConnectionConfig,
  EmailMessagesInput,
  NormalizedEmailMessage,
} from '../email-engine.types';

export interface ImapFetchOptions {
  folder?: string;
  searchCriteria?: string;
  limit?: number;
  unreadOnly?: boolean;
}

function decodeRfc2047(text: string): string {
  if (!text) return '';
  const regex = /=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g;
  return text.replace(regex, (_, charset, encoding, encoded) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(encoded, 'base64').toString(
          charset.toLowerCase().includes('gb') ? 'latin1' : 'utf-8'
        );
      } else if (encoding.toUpperCase() === 'Q') {
        const decoded = encoded
          .replace(/_/g, ' ')
          .replace(/=([0-9A-Fa-f]{2})/g, (_m: string, hex: string) =>
            String.fromCharCode(parseInt(hex, 16))
          );
        return decoded;
      }
    } catch {
      return encoded;
    }
    return encoded;
  });
}

function parseAddressHeader(headerValue?: string): EmailAddress[] {
  if (!headerValue) return [];
  const results: EmailAddress[] = [];
  const parts = headerValue.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(?:\"?([^\"]*)\"?\s*)?<([^>]+)>$/) || trimmed.match(/^([^<]+)$/);
    if (match) {
      if (match[2]) {
        results.push({
          name: decodeRfc2047(match[1]?.trim() || ''),
          address: match[2].trim().toLowerCase(),
        });
      } else {
        results.push({
          address: match[1].trim().toLowerCase(),
        });
      }
    }
  }
  return results;
}

function parseHeaderBlock(rawHeaders: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, ' ');
  const lines = unfolded.split(/\r?\n/);

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      headers[key] = decodeRfc2047(value);
    }
  }
  return headers;
}

function buildXOAuth2Payload(user: string, token: string): string {
  return Buffer.from(`user=${user}\x01auth=Bearer ${token}\x01\x01`).toString('base64');
}

export class ImapClient {
  static async verify(config: EmailConnectionConfig): Promise<{ success: boolean; message: string }> {
    const host = config.imapHost || 'localhost';
    const port = config.imapPort || (config.imapSecure ? 993 : 143);
    const user = config.emailAddress || '';
    const pass = (config.authPassword || '').replace(/\s+/g, '');
    const accessToken = config.accessToken;
    const isOAuth = Boolean(accessToken || config.authType === 'xoauth2');
    const secure = config.imapSecure !== false && port === 993;
    const timeout = config.timeoutMs || 10000;

    return new Promise((resolve) => {
      let resolved = false;
      const done = (success: boolean, message: string) => {
        if (resolved) return;
        resolved = true;
        try {
          socket.destroy();
        } catch {
          // ignore
        }
        resolve({ success, message });
      };

      const socket: net.Socket = secure
        ? tls.connect({ host, port, minVersion: 'TLSv1.2', rejectUnauthorized: false })
        : net.connect({ host, port });

      socket.setTimeout(timeout, () => {
        done(false, `IMAP 连接超时 (${timeout}ms)`);
      });

      let buffer = '';

      socket.on('error', (err) => {
        done(false, `IMAP 连接失败: ${err.message}`);
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('* OK')) {
            if (isOAuth && accessToken) {
              socket.write(`A001 AUTHENTICATE XOAUTH2 ${buildXOAuth2Payload(user, accessToken)}\r\n`);
            } else {
              socket.write(`A001 LOGIN "${user}" "${pass}"\r\n`);
            }
          } else if (line.startsWith('A001 OK')) {
            socket.write(`A002 LOGOUT\r\n`);
            done(true, 'IMAP 认证与连接成功');
          } else if (line.startsWith('A001 NO') || line.startsWith('A001 BAD')) {
            done(false, `IMAP 登录失败: ${line}`);
          }
        }
      });
    });
  }

  static async fetchMessages(
    input: EmailMessagesInput,
    config: EmailConnectionConfig
  ): Promise<NormalizedEmailMessage[]> {
    const host = config.imapHost || 'localhost';
    const port = config.imapPort || (config.imapSecure ? 993 : 143);
    const user = config.emailAddress || '';
    const pass = (config.authPassword || '').replace(/\s+/g, '');
    const accessToken = config.accessToken;
    const isOAuth = Boolean(accessToken || config.authType === 'xoauth2');
    const secure = config.imapSecure !== false && port === 993;
    const timeout = config.timeoutMs || 15000;
    const limit = Math.min(input.limit || 20, 50);

    let folder = 'INBOX';
    if (input.selector.kind === 'recent' && input.selector.folder) {
      folder = input.selector.folder.toUpperCase();
    }

    let searchCriteria = 'ALL';
    if (input.selector.kind === 'recent') {
      if (input.selector.unreadOnly) {
        searchCriteria = 'UNSEEN';
      }
    } else if (input.selector.kind === 'search') {
      const parts: string[] = [];
      if (input.selector.text) {
        parts.push(`TEXT "${input.selector.text}"`);
      }
      if (input.selector.filters?.from && input.selector.filters.from.length > 0) {
        parts.push(`FROM "${input.selector.filters.from[0]}"`);
      }
      if (input.selector.filters?.subjectContains) {
        parts.push(`SUBJECT "${input.selector.filters.subjectContains}"`);
      }
      if (input.selector.filters?.unreadOnly) {
        parts.push('UNSEEN');
      }
      searchCriteria = parts.length > 0 ? parts.join(' ') : 'ALL';
    }

    return new Promise((resolve, reject) => {
      let resolved = false;
      const done = (err: Error | null, items?: NormalizedEmailMessage[]) => {
        if (resolved) return;
        resolved = true;
        try {
          socket.destroy();
        } catch {
          // ignore
        }
        if (err) {
          reject(err);
        } else {
          resolve(items || []);
        }
      };

      const socket: net.Socket = secure
        ? tls.connect({ host, port, minVersion: 'TLSv1.2', rejectUnauthorized: false })
        : net.connect({ host, port });

      socket.setTimeout(timeout, () => {
        done(new Error(`IMAP 请求超时 (${timeout}ms)`));
      });

      let tagState = 'CONNECT';
      let buffer = '';
      let messageIds: number[] = [];
      const messages: NormalizedEmailMessage[] = [];
      let currentRawMessage = '';
      let isFetching = false;

      socket.on('error', (err) => {
        done(new Error(`IMAP 通信异常: ${err.message}`));
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (tagState === 'CONNECT' && line.startsWith('* OK')) {
            tagState = 'LOGIN';
            if (isOAuth && accessToken) {
              socket.write(`A001 AUTHENTICATE XOAUTH2 ${buildXOAuth2Payload(user, accessToken)}\r\n`);
            } else {
              socket.write(`A001 LOGIN "${user}" "${pass}"\r\n`);
            }
          } else if (tagState === 'LOGIN') {
            if (line.startsWith('A001 OK')) {
              tagState = 'SELECT';
              socket.write(`A002 SELECT "${folder}"\r\n`);
            } else if (line.startsWith('A001 NO') || line.startsWith('A001 BAD')) {
              done(new Error(`IMAP 登录失败: ${line}`));
              return;
            }
          } else if (tagState === 'SELECT') {
            if (line.startsWith('A002 OK')) {
              tagState = 'SEARCH';
              socket.write(`A003 SEARCH ${searchCriteria}\r\n`);
            } else if (line.startsWith('A002 NO') || line.startsWith('A002 BAD')) {
              done(new Error(`IMAP 邮箱目录打开失败 (${folder}): ${line}`));
              return;
            }
          } else if (tagState === 'SEARCH') {
            if (line.startsWith('* SEARCH')) {
              const ids = line
                .replace('* SEARCH', '')
                .trim()
                .split(/\s+/)
                .map((s) => parseInt(s, 10))
                .filter((n) => !isNaN(n));
              messageIds = ids.slice(-limit); // Take newest 'limit'
            } else if (line.startsWith('A003 OK')) {
              if (messageIds.length === 0) {
                socket.write('A004 LOGOUT\r\n');
                done(null, []);
                return;
              }
              tagState = 'FETCH';
              isFetching = true;
              const idRange = messageIds.join(',');
              socket.write(`A004 FETCH ${idRange} (BODY.PEEK[])\r\n`);
            }
          } else if (tagState === 'FETCH') {
            if (line.includes('FETCH (BODY[') || line.includes('FETCH (BODY.PEEK[')) {
              currentRawMessage = '';
            }
            currentRawMessage += line + '\r\n';

            if (line === ')') {
              // End of a message fetch item
              const parsed = parseRawRfc822(currentRawMessage);
              if (parsed) {
                messages.push(parsed);
              }
              currentRawMessage = '';
            }

            if (line.startsWith('A004 OK')) {
              tagState = 'DONE';
              socket.write('A005 LOGOUT\r\n');
              done(null, messages);
              return;
            } else if (line.startsWith('A004 NO') || line.startsWith('A004 BAD')) {
              done(new Error(`IMAP 邮件拉取失败: ${line}`));
              return;
            }
          }
        }
      });
    });
  }
}

function parseRawRfc822(raw: string): NormalizedEmailMessage | null {
  try {
    const headerEndIndex = raw.indexOf('\r\n\r\n');
    const headerPart = headerEndIndex > 0 ? raw.slice(0, headerEndIndex) : raw;
    const bodyPart = headerEndIndex > 0 ? raw.slice(headerEndIndex + 4) : '';

    const headers = parseHeaderBlock(headerPart);
    const subject = headers['subject'] || '(无主题)';
    const fromList = parseAddressHeader(headers['from']);
    const toList = parseAddressHeader(headers['to']);
    const ccList = parseAddressHeader(headers['cc']);
    const messageId = headers['message-id'];
    const dateStr = headers['date'];

    const opaqueDigest = crypto
      .createHash('sha256')
      .update(messageId || subject + (dateStr || ''))
      .digest('hex')
      .slice(0, 16);
    const messageRef = `emsg_v1_${opaqueDigest}`;

    let bodyContent = bodyPart.slice(0, 4000);
    const isTruncated = bodyPart.length > 4000;

    return {
      messageRef,
      internetMessageId: messageId,
      folder: 'inbox',
      subject,
      from: fromList[0],
      to: toList,
      cc: ccList,
      sentAt: dateStr ? new Date(dateStr).toISOString() : undefined,
      receivedAt: new Date().toISOString(),
      isRead: true,
      snippet: bodyContent.slice(0, 200).replace(/\s+/g, ' ').trim(),
      body: {
        format: 'text',
        content: bodyContent,
        truncated: isTruncated,
      },
      attachments: [],
      contentTrust: 'untrusted_external',
    };
  } catch {
    return null;
  }
}
