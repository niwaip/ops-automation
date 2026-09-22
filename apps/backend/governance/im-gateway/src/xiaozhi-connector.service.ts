import { BadRequestException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { ImCredentialCipher } from './im-channel.crypto';
import { IM_GATEWAY_PRISMA, ImGatewayPrismaPort } from './ports';
import { XiaozhiTaskService } from './xiaozhi-task.service';
import WebSocket from 'ws';

const TOOLS = [
  { name: 'ops_submit_task', description: '提交 ops 工作任务，只表示已受理。稍后请查询状态。', inputSchema: { type: 'object', properties: { instruction: { type: 'string', description: '完整任务指令' } }, required: ['instruction'], additionalProperties: false } },
  { name: 'ops_get_task_status', description: '查询刚才任务或完整请求编号的真实状态。待审批时请用户在网页处理。', inputSchema: { type: 'object', properties: { request_id: { type: 'string', description: '可选的完整请求编号；省略则查询当前连接最近任务' } }, additionalProperties: false } },
];

type Runtime = { socket: any; epoch: string; connected: boolean; fingerprint: string | null };

@Injectable()
export class XiaozhiConnectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(XiaozhiConnectorService.name);
  private readonly workerId = randomUUID();
  private readonly runtimes = new Map<string, Runtime>();
  private readonly retries = new Map<string, { failures: number; after: number }>();
  private readonly recoveredConnections = new Set<string>();
  private timer?: NodeJS.Timeout;
  private reconciling = false;

  constructor(
    @Inject(IM_GATEWAY_PRISMA) private readonly prisma: ImGatewayPrismaPort,
    private readonly cipher: ImCredentialCipher,
    private readonly tasks: XiaozhiTaskService,
  ) {}

  async onModuleInit() {
    await this.reconcile();
    this.timer = setInterval(() => void this.reconcile(), 5000);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    for (const [id, runtime] of this.runtimes) {
      runtime.socket.close();
      await this.release(id);
    }
    this.runtimes.clear();
  }

  private async reconcile() {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const connections = await this.prisma.imChannelConnection.findMany({ where: { channel: 'xiaozhi', enabled: true, encryptedCredential: { not: null } } });
      const owned: string[] = [];
      const desired = new Set<string>(connections.map((connection: any) => connection.id));
      for (const [id, runtime] of this.runtimes) {
        if (!desired.has(id)) {
          runtime.socket.terminate();
          this.runtimes.delete(id);
          this.recoveredConnections.delete(id);
          await this.release(id);
        }
      }
      for (const connection of connections) {
        const current = this.runtimes.get(connection.id);
        if (current && current.fingerprint !== connection.credentialFingerprint) {
          current.socket.terminate();
          this.runtimes.delete(connection.id);
          this.retries.delete(connection.id);
          this.recoveredConnections.delete(connection.id);
          await this.release(connection.id);
        }
        const acquired = await this.acquire(connection.id);
        if (!acquired) {
          this.recoveredConnections.delete(connection.id);
          const stale = this.runtimes.get(connection.id);
          if (stale) { stale.socket.terminate(); this.runtimes.delete(connection.id); }
          continue;
        }
        owned.push(connection.id);
        if (!this.recoveredConnections.has(connection.id)) {
          await this.tasks.recoverInterrupted(connection.id);
          this.recoveredConnections.add(connection.id);
        }
        if (!this.runtimes.has(connection.id) && Date.now() >= (this.retries.get(connection.id)?.after ?? 0)) {
          this.connect(connection);
        }
      }
      await this.tasks.drain(owned);
    } catch (error) {
      this.logger.warn(`小智连接巡检失败: ${error instanceof Error ? error.name : 'unknown'}`);
    } finally { this.reconciling = false; }
  }

  private async acquire(connectionId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw`
      INSERT INTO "xiaozhi_connector_leases" ("connection_id", "worker_id", "lease_until", "heartbeat_at")
      VALUES (${connectionId}::uuid, ${this.workerId}, NOW() + INTERVAL '20 seconds', NOW())
      ON CONFLICT ("connection_id") DO UPDATE
        SET "worker_id" = EXCLUDED."worker_id", "lease_until" = EXCLUDED."lease_until", "heartbeat_at" = EXCLUDED."heartbeat_at"
      WHERE "xiaozhi_connector_leases"."worker_id" = ${this.workerId} OR "xiaozhi_connector_leases"."lease_until" < NOW()
      RETURNING "worker_id"`;
    return Array.isArray(rows) && rows.length > 0;
  }

  private async release(connectionId: string) {
    await this.prisma.xiaozhiConnectorLease.deleteMany({ where: { connectionId, workerId: this.workerId } });
  }

  private connect(connection: any) {
    let endpoint: string;
    try { endpoint = this.cipher.decrypt(connection.encryptedCredential); }
    catch { void this.setStatus(connection.id, 'error', '凭据无法解密'); return; }
    const socket = new WebSocket(endpoint, { handshakeTimeout: 10000 });
    const runtime: Runtime = { socket, epoch: randomUUID(), connected: false, fingerprint: connection.credentialFingerprint };
    this.runtimes.set(connection.id, runtime);
    void this.setStatus(connection.id, 'connecting');
    socket.on('open', () => { runtime.connected = true; this.retries.delete(connection.id); void this.setStatus(connection.id, 'online'); });
    socket.on('message', (data: Buffer) => void this.handleMessage(connection.id, runtime, data.toString('utf8')));
    socket.on('error', () => { void this.setStatus(connection.id, 'error', 'WebSocket 连接失败'); });
    socket.on('close', () => {
      if (this.runtimes.get(connection.id) === runtime) {
        this.runtimes.delete(connection.id);
        const failures = Math.min((this.retries.get(connection.id)?.failures ?? 0) + 1, 6);
        this.retries.set(connection.id, { failures, after: Date.now() + Math.min(60_000, 1000 * 2 ** failures) });
        void this.setStatus(connection.id, 'connecting', '连接已断开，正在重试');
      }
    });
  }

  private async setStatus(id: string, status: string, error?: string) {
    await this.prisma.imChannelConnection.updateMany({ where: { id, enabled: true }, data: { status, lastError: error ?? null, ...(status === 'online' ? { lastConnectedAt: new Date() } : {}) } });
  }

  private async handleMessage(connectionId: string, runtime: Runtime, raw: string) {
    if (raw.length > 16_384) return;
    let request: any;
    try { request = JSON.parse(raw); } catch { return; }
    if (!request || request.jsonrpc !== '2.0' || request.id === undefined) return;
    const respond = (result: any) => {
      if (runtime.socket.readyState === WebSocket.OPEN) runtime.socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
    };
    try {
      if (request.method === 'initialize') respond({ protocolVersion: request.params?.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'ops-voice-mcp', version: '1.0.0' } });
      else if (request.method === 'ping') respond({});
      else if (request.method === 'tools/list') {
        respond({ tools: TOOLS });
        await this.prisma.imChannelConnection.updateMany({ where: { id: connectionId }, data: { lastMessageAt: new Date() } });
      }
      else if (request.method === 'tools/call') {
        const connection = await this.prisma.imChannelConnection.findUnique({ where: { id: connectionId } });
        if (!connection?.enabled) throw new Error('小智连接已停用');
        const name = request.params?.name;
        const args = request.params?.arguments ?? {};
        if (typeof args !== 'object' || Array.isArray(args)) throw new Error('工具参数错误');
        let result: any;
        if (name === 'ops_submit_task' && Object.keys(args).join() === 'instruction' && typeof args.instruction === 'string') {
          const callKey = createHash('sha256').update(`${runtime.epoch}:${JSON.stringify(request.id)}`).digest('hex');
          result = await this.tasks.submit(connectionId, args.instruction, callKey);
        } else if (name === 'ops_get_task_status' && (Object.keys(args).length === 0 || (Object.keys(args).join() === 'request_id' && typeof args.request_id === 'string' && /^[0-9a-f-]{36}$/i.test(args.request_id)))) {
          result = await this.tasks.get(connectionId, args.request_id);
        } else throw new Error('未开放此工具或参数错误');
        await this.prisma.imChannelConnection.updateMany({ where: { id: connectionId }, data: { lastMessageAt: new Date() } });
        respond(this.toolResult(result));
      } else if (runtime.socket.readyState === WebSocket.OPEN) {
        runtime.socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } }));
      }
    } catch (error) {
      const speech = error instanceof BadRequestException || error instanceof NotFoundException
        ? error.message.slice(0, 120)
        : '工具暂时不可用，请稍后查询。';
      respond(this.toolResult({ status: 'unknown', speech }, true));
    }
  }

  private toolResult(data: any, isError = false) {
    let value = { ...data };
    let text = JSON.stringify(value);
    if (Buffer.byteLength(text) > 900) {
      value = { request_id: value.request_id, status: value.status, speech: String(value.speech).slice(0, 100) };
      text = JSON.stringify(value);
    }
    return { content: [{ type: 'text', text }], isError };
  }
}
