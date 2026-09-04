import * as tls from 'tls';
import * as net from 'net';
import { v4 as uuidv4 } from 'uuid';
import type { EmailAddressInput, EmailConnectionConfig } from '../email-engine.types';

export interface SmtpSendOptions {
  from: string;
  senderName?: string;
  to: EmailAddressInput[];
  cc?: EmailAddressInput[];
  bcc?: EmailAddressInput[];
  subject: string;
  textBody: string;
  inReplyTo?: string;
}

function encodeRfc2047(text: string): string {
  if (!text) return '';
  if (/^[\x20-\x7E]*$/.test(text)) {
    return text;
  }
  const base64 = Buffer.from(text, 'utf-8').toString('base64');
  return `=?UTF-8?B?${base64}?=`;
}

function formatAddressHeader(item: EmailAddressInput): string {
  if (item.name) {
    return `${encodeRfc2047(item.name)} <${item.address}>`;
  }
  return item.address;
}

export class SmtpClient {
  static async verify(config: EmailConnectionConfig): Promise<{ success: boolean; message: string }> {
    const host = config.smtpHost || 'localhost';
    const port = config.smtpPort || (config.smtpSecure ? 465 : 587);
    const user = config.emailAddress || '';
    const pass = (config.authPassword || '').replace(/\s+/g, '');
    const isDirectTls = port === 465;
    const timeout = config.timeoutMs || 12000;

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
        activeSocket.setTimeout(timeout, () => {
          done(false, `SMTP 连接超时 (${timeout}ms)`);
        });

        let state = 'GREETING';
        let buffer = '';
        let isTls = initialTls;

        const attachHandlers = (s: net.Socket | tls.TLSSocket) => {
          s.on('error', (err) => {
            done(false, `SMTP 连接失败: ${err.message}`);
          });

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
                s.write(`EHLO ops-automation\r\n`);
              } else if (state === 'EHLO' && code === 250) {
                if (!isTls && (port === 587 || port === 25)) {
                  state = 'STARTTLS';
                  s.write(`STARTTLS\r\n`);
                } else if (user && pass) {
                  state = 'AUTH_LOGIN';
                  s.write(`AUTH LOGIN\r\n`);
                } else {
                  done(true, 'SMTP 服务器已连接 (无需身份验证)');
                }
              } else if (state === 'STARTTLS' && code === 220) {
                state = 'EHLO_TLS';
                s.removeAllListeners('data');
                s.removeAllListeners('error');
                const tlsSocket = tls.connect({
                  socket: s,
                  host,
                  rejectUnauthorized: false,
                  minVersion: 'TLSv1.2',
                });
                activeSocket = tlsSocket;
                isTls = true;
                attachHandlers(tlsSocket);
                tlsSocket.write(`EHLO ops-automation\r\n`);
              } else if (state === 'EHLO_TLS' && code === 250) {
                if (user && pass) {
                  state = 'AUTH_LOGIN';
                  s.write(`AUTH LOGIN\r\n`);
                } else {
                  done(true, 'SMTP 服务器已连接 (无需身份验证)');
                }
              } else if (state === 'AUTH_LOGIN' && code === 334) {
                state = 'AUTH_USER';
                s.write(Buffer.from(user).toString('base64') + '\r\n');
              } else if (state === 'AUTH_USER' && code === 334) {
                state = 'AUTH_PASS';
                s.write(Buffer.from(pass).toString('base64') + '\r\n');
              } else if (state === 'AUTH_PASS') {
                if (code === 235 || code === 250) {
                  done(true, 'SMTP 认证成功');
                } else {
                  done(false, `SMTP 认证失败 (Code ${code}): ${line}`);
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
        const tlsSocket = tls.connect({ host, port, minVersion: 'TLSv1.2', rejectUnauthorized: false });
        startSession(tlsSocket, true);
      } else {
        const netSocket = net.connect({ host, port });
        startSession(netSocket, false);
      }
    });
  }

  static async send(
    options: SmtpSendOptions,
    config: EmailConnectionConfig
  ): Promise<{ deliveryId: string; acceptedAt: string }> {
    const host = config.smtpHost || 'localhost';
    const port = config.smtpPort || (config.smtpSecure ? 465 : 587);
    const user = config.emailAddress || options.from;
    const pass = (config.authPassword || '').replace(/\s+/g, '');
    const isDirectTls = port === 465;
    const timeout = config.timeoutMs || 15000;
    const deliveryId = `del_${uuidv4()}`;

    const recipients = [
      ...options.to.map((r) => r.address),
      ...(options.cc || []).map((r) => r.address),
      ...(options.bcc || []).map((r) => r.address),
    ].filter(Boolean);

    if (recipients.length === 0) {
      throw new Error('收件人不能为空');
    }

    const fromHeader = options.senderName
      ? `${encodeRfc2047(options.senderName)} <${options.from}>`
      : options.from;
    const toHeader = options.to.map(formatAddressHeader).join(', ');
    const ccHeader = (options.cc || []).map(formatAddressHeader).join(', ');
    const dateHeader = new Date().toUTCString();
    const messageId = `<${uuidv4()}@${host}>`;

    let rawEmail = '';
    rawEmail += `From: ${fromHeader}\r\n`;
    rawEmail += `To: ${toHeader}\r\n`;
    if (ccHeader) {
      rawEmail += `Cc: ${ccHeader}\r\n`;
    }
    rawEmail += `Subject: ${encodeRfc2047(options.subject)}\r\n`;
    rawEmail += `Date: ${dateHeader}\r\n`;
    rawEmail += `Message-ID: ${messageId}\r\n`;
    if (options.inReplyTo) {
      rawEmail += `In-Reply-To: ${options.inReplyTo}\r\n`;
      rawEmail += `References: ${options.inReplyTo}\r\n`;
    }
    rawEmail += `MIME-Version: 1.0\r\n`;
    rawEmail += `Content-Type: text/plain; charset=UTF-8\r\n`;
    rawEmail += `Content-Transfer-Encoding: base64\r\n\r\n`;
    rawEmail += Buffer.from(options.textBody || '', 'utf-8').toString('base64');
    rawEmail += `\r\n`;

    return new Promise((resolve, reject) => {
      let resolved = false;
      let activeSocket: net.Socket | tls.TLSSocket;

      const done = (err: Error | null, result?: { deliveryId: string; acceptedAt: string }) => {
        if (resolved) return;
        resolved = true;
        try {
          activeSocket?.destroy();
        } catch {}
        if (err) {
          reject(err);
        } else {
          resolve(result!);
        }
      };

      const startSession = (socket: net.Socket | tls.TLSSocket, initialTls: boolean) => {
        activeSocket = socket;
        activeSocket.setTimeout(timeout, () => {
          done(new Error(`SMTP 发信请求超时 (${timeout}ms)`));
        });

        let state = 'GREETING';
        let buffer = '';
        let isTls = initialTls;
        let recipientIndex = 0;

        const attachHandlers = (s: net.Socket | tls.TLSSocket) => {
          s.on('error', (err) => {
            done(new Error(`SMTP 发信通信异常: ${err.message}`));
          });

          s.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\r\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              const code = parseInt(line.slice(0, 3), 10);
              const isIntermediate = line.charAt(3) === '-';
              if (isIntermediate) continue;

              if (code >= 400 && state !== 'QUIT') {
                done(new Error(`SMTP 发送拒绝 (Code ${code}): ${line}`));
                return;
              }

              if (state === 'GREETING' && (code === 220 || code === 250)) {
                state = 'EHLO';
                s.write(`EHLO ops-automation\r\n`);
              } else if (state === 'EHLO' && code === 250) {
                if (!isTls && (port === 587 || port === 25)) {
                  state = 'STARTTLS';
                  s.write(`STARTTLS\r\n`);
                } else if (user && pass) {
                  state = 'AUTH_LOGIN';
                  s.write(`AUTH LOGIN\r\n`);
                } else {
                  state = 'MAIL_FROM';
                  s.write(`MAIL FROM:<${options.from}>\r\n`);
                }
              } else if (state === 'STARTTLS' && code === 220) {
                state = 'EHLO_TLS';
                s.removeAllListeners('data');
                s.removeAllListeners('error');
                const tlsSocket = tls.connect({
                  socket: s,
                  host,
                  rejectUnauthorized: false,
                  minVersion: 'TLSv1.2',
                });
                activeSocket = tlsSocket;
                isTls = true;
                attachHandlers(tlsSocket);
                tlsSocket.write(`EHLO ops-automation\r\n`);
              } else if (state === 'EHLO_TLS' && code === 250) {
                if (user && pass) {
                  state = 'AUTH_LOGIN';
                  s.write(`AUTH LOGIN\r\n`);
                } else {
                  state = 'MAIL_FROM';
                  s.write(`MAIL FROM:<${options.from}>\r\n`);
                }
              } else if (state === 'AUTH_LOGIN' && code === 334) {
                state = 'AUTH_USER';
                s.write(Buffer.from(user).toString('base64') + '\r\n');
              } else if (state === 'AUTH_USER' && code === 334) {
                state = 'AUTH_PASS';
                s.write(Buffer.from(pass).toString('base64') + '\r\n');
              } else if (state === 'AUTH_PASS' && (code === 235 || code === 250)) {
                state = 'MAIL_FROM';
                s.write(`MAIL FROM:<${options.from}>\r\n`);
              } else if (state === 'MAIL_FROM' && code === 250) {
                state = 'RCPT_TO';
                recipientIndex = 0;
                s.write(`RCPT TO:<${recipients[recipientIndex]}>\r\n`);
              } else if (state === 'RCPT_TO' && code === 250) {
                recipientIndex++;
                if (recipientIndex < recipients.length) {
                  s.write(`RCPT TO:<${recipients[recipientIndex]}>\r\n`);
                } else {
                  state = 'DATA';
                  s.write(`DATA\r\n`);
                }
              } else if (state === 'DATA' && code === 354) {
                state = 'DATA_CONTENT';
                s.write(rawEmail + '\r\n.\r\n');
              } else if (state === 'DATA_CONTENT' && code === 250) {
                state = 'QUIT';
                s.write(`QUIT\r\n`);
                done(null, {
                  deliveryId,
                  acceptedAt: new Date().toISOString(),
                });
              }
            }
          });
        };

        attachHandlers(socket);
      };

      if (isDirectTls) {
        const tlsSocket = tls.connect({ host, port, minVersion: 'TLSv1.2', rejectUnauthorized: false });
        startSession(tlsSocket, true);
      } else {
        const netSocket = net.connect({ host, port });
        startSession(netSocket, false);
      }
    });
  }
}
