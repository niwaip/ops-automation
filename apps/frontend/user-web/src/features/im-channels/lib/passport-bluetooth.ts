import { encodePassportMessage, PassportDecoder, PASSPORT_UUID, type PassportMessage } from './passport-protocol';

// Minimal browser interfaces, kept local so no global browser type is overridden.
export interface BleCharacteristic extends EventTarget {
  value?: DataView;
  properties: { writeWithoutResponse?: boolean; write?: boolean; notify?: boolean };
  startNotifications(): Promise<BleCharacteristic>;
  writeValueWithoutResponse(value: Uint8Array): Promise<void>;
  writeValueWithResponse(value: Uint8Array): Promise<void>;
}
interface BleServer {
  connected: boolean;
  connect(): Promise<BleServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<BleCharacteristic> }>;
}
export interface PassportBleDevice extends EventTarget { id: string; name?: string; gatt?: BleServer }
export interface PassportBluetooth {
  requestDevice(options: {
    filters?: ({ services: string[] } | { name: string })[];
    acceptAllDevices?: boolean;
    optionalServices: string[];
  }): Promise<PassportBleDevice>;
}
export type PairingState = {
  status: 'disconnected' | 'scanning' | 'connecting' | 'pairing_required' | 'pairing' | 'paired' | 'error';
  name?: string; deviceId?: string; error?: string;
};
interface Trust { deviceId: string; token: string }
export interface TrustStore { load(id: string): Trust | null; save(id: string, trust: Trust): void; remove(id: string): void }
export interface PassportEvents {
  message?: (message: PassportMessage) => void;
  audio?: (frame: DataView) => void;
  disconnect?: () => void;
}

export class PassportBluetoothClient {
  private device?: PassportBleDevice;
  private rx?: BleCharacteristic;
  private tx?: BleCharacteristic;
  private voice?: BleCharacteristic;
  private delivered = new Map<string, number>();
  private decoder = new PassportDecoder();
  private sequence = 0;
  private epoch = 0;
  private queue: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  private lastSeen = 0;
  private trust?: Trust;
  private waiters = new Set<{ types: string[]; resolve: (m: PassportMessage) => void; reject: (e: Error) => void }>();
  private state: PairingState = { status: 'disconnected' };

  constructor(private bluetooth: PassportBluetooth, private store: TrustStore, private onState: (s: PairingState) => void, private events: PassportEvents = {}) {}

  async sendControl(message: PassportMessage) {
    if (this.state.status !== 'paired') throw new Error('设备尚未完成配对');
    const epoch = this.epoch;
    for (let attempt=0; attempt<2; attempt++) {
      this.assertEpoch(epoch);
      if (this.state.status !== 'paired') throw new Error('设备尚未完成配对');
      const id = this.sequence & 4095;
      try {
        await this.exchange(['ack'], message, (answer) => answer.msgId === id, 2500, true);
        return;
      } catch (error) { if (attempt === 1) throw error; }
    }
  }

  private update(patch: Partial<PairingState>) { this.state = { ...this.state, ...patch }; this.onState(this.state); }
  private assertEpoch(epoch: number) { if (epoch !== this.epoch) throw new Error('连接已取消'); }

  async connect(showAllDevices = false) {
    this.disconnect();
    const epoch = this.epoch;
    this.update({ status: 'scanning', error: undefined, name: undefined, deviceId: undefined });
    try {
      // requestDevice must run directly from a user click, before any await.
      const device = await this.bluetooth.requestDevice({
        ...(showAllDevices ? { acceptAllDevices: true } : {
          // Filters are ORed: older/fallback firmware may advertise only its name.
          filters: [
            { services: [PASSPORT_UUID.service] },
            { name: 'FoloPassport-DSH' },
            { name: 'Folo-PSP' },
          ],
        }),
        // Name-only and diagnostic selections still require permission to access GATT.
        optionalServices: [PASSPORT_UUID.service],
      });
      this.assertEpoch(epoch);
      this.device = device;
      this.update({ status: 'connecting', name: device.name || 'AI Passport' });
      device.addEventListener('gattserverdisconnected', this.onDisconnect);
      if (!device.gatt) throw new Error('该设备不支持 GATT 蓝牙连接');
      const connection = device.gatt.connect().then((server) => {
        // Web Bluetooth cannot cancel an in-flight connect; close late results.
        if (epoch !== this.epoch) server.disconnect();
        return server;
      });
      const server = await this.withTimeout(connection, '蓝牙连接超时，请重试');
      if (epoch !== this.epoch) { server.disconnect(); this.assertEpoch(epoch); }
      const service = await this.withTimeout(server.getPrimaryService(PASSPORT_UUID.service), '未发现兼容的 AI Passport 服务');
      this.assertEpoch(epoch);
      this.rx = await this.withTimeout(service.getCharacteristic(PASSPORT_UUID.rx), '设备缺少控制写入特征');
      this.assertEpoch(epoch);
      this.tx = await this.withTimeout(service.getCharacteristic(PASSPORT_UUID.tx), '设备缺少消息通知特征');
      this.assertEpoch(epoch);
      this.tx.addEventListener('characteristicvaluechanged', this.onNotification);
      await this.withTimeout(this.tx.startNotifications(), '蓝牙通知订阅超时');
      this.assertEpoch(epoch);
      if (this.events.audio) {
        this.voice = await this.withTimeout(service.getCharacteristic(PASSPORT_UUID.voice), '设备缺少录音通知特征');
        this.assertEpoch(epoch);
        this.voice.addEventListener('characteristicvaluechanged', this.onAudio);
        await this.withTimeout(this.voice.startNotifications(), '设备录音订阅超时');
        this.assertEpoch(epoch);
      }
      this.trust = this.store.load(device.id) ?? undefined;
      const answer = await this.exchange(['hello.ack', 'pair.required'], { type: 'hello', protocolVersion: 1, capabilities: 0, ...(this.trust ? { token: this.trust.token } : {}) });
      this.assertEpoch(epoch);
      if (answer.type === 'hello.ack' && this.trust) this.update({ status: 'paired', deviceId: this.trust.deviceId });
      else this.update({ status: 'pairing_required', error: answer.reason === 'token' ? '设备不信任当前浏览器。请在设备上重置配对，或点击“重置设备配对”。' : undefined });
      this.lastSeen = Date.now();
      this.timer = setInterval(() => {
        if (Date.now() - this.lastSeen > 30000) { this.fail(new Error('设备心跳超时，连接已断开')); return; }
        void this.send({ type: 'ping', t: Date.now() }, 2).catch((e) => this.fail(e));
      }, 5000);
    } catch (error) {
      if (epoch === this.epoch) this.fail(error);
    }
  }

  async pair(code: string) {
    if (!/^\d{6}$/.test(code)) throw new Error('请输入设备屏幕上的六位配对码');
    if (this.state.status !== 'pairing_required') throw new Error('请先扫描并连接设备');
    const epoch = this.epoch;
    this.update({ status: 'pairing', error: undefined });
    try {
      const answer = await this.exchange(['pair.ok', 'pair.failed'], { type: 'pair.begin', code, host: 'ops-web' });
      this.assertEpoch(epoch);
      if (answer.type === 'pair.failed') {
        const remaining = typeof answer.remaining === 'number' ? `，剩余 ${answer.remaining} 次` : '';
        throw new Error(`设备拒绝配对，请核对屏幕配对码${remaining}`);
      }
      if (typeof answer.token !== 'string' || !/^[a-f0-9]{32}$/i.test(answer.token) || typeof answer.deviceId !== 'string' || !answer.deviceId) throw new Error('设备返回的配对凭据无效');
      const trust = { token: answer.token, deviceId: answer.deviceId };
      const ready = await this.exchange(['hello.ack', 'pair.required'], { type: 'hello', protocolVersion: 1, capabilities: 0, token: trust.token });
      this.assertEpoch(epoch);
      if (ready.type !== 'hello.ack') throw new Error('设备未确认信任握手，请重新配对');
      this.store.save(this.device!.id, trust);
      this.trust = trust;
      this.update({ status: 'paired', deviceId: trust.deviceId, error: undefined });
    } catch (error) {
      if (epoch === this.epoch) this.update({ status: 'pairing_required', error: error instanceof Error ? error.message : '配对失败，请重试' });
    }
  }

  async unpair() {
    if (!this.device || !['paired', 'pairing_required'].includes(this.state.status)) throw new Error('请先连接设备');
    const epoch = this.epoch;
    const id = this.device.id;
    this.events.disconnect?.();
    this.update({ status: 'pairing', error: undefined });
    try {
      // Only clear local trust after the device confirms its reset.
      await this.exchange(['pair.required'], { type: 'pair.reset' });
      this.assertEpoch(epoch);
      this.store.remove(id);
      this.trust = undefined;
      this.update({ status: 'pairing_required', deviceId: undefined, error: undefined });
    } catch (error) {
      if (epoch === this.epoch) this.fail(error);
    }
  }

  disconnect() {
    this.epoch++;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.tx?.removeEventListener('characteristicvaluechanged', this.onNotification);
    this.voice?.removeEventListener('characteristicvaluechanged', this.onAudio);
    this.device?.removeEventListener('gattserverdisconnected', this.onDisconnect);
    this.device?.gatt?.disconnect();
    for (const waiter of this.waiters) waiter.reject(new Error('蓝牙连接已断开'));
    this.waiters.clear();
    this.rx = undefined; this.tx = undefined; this.voice = undefined; this.device = undefined; this.trust = undefined;
    this.delivered.clear();
    this.events.disconnect?.();
    this.decoder.reset(); this.queue = Promise.resolve();
    this.update({ status: 'disconnected', error: undefined, name: undefined, deviceId: undefined });
  }

  private fail(error: unknown) {
    const wasScanning = this.state.status === 'scanning';
    this.disconnect();
    const name = error instanceof Error ? error.name : '';
    this.update({ status: 'error', error: name === 'NotFoundError' ? wasScanning ? '未选择设备。请确认设备已开机并处于蓝牙配对模式。' : '所选设备缺少 DSH Passport 蓝牙服务或特征，请确认设备与固件版本。' : name === 'SecurityError' || name === 'NotAllowedError' ? '蓝牙访问被拒绝，请检查浏览器权限并使用 HTTPS 或 localhost。' : error instanceof Error ? error.message : '蓝牙连接失败' });
  }
  private onDisconnect = () => this.fail(new Error('设备蓝牙已断开，请重新连接'));
  private onAudio = () => {
    if (this.state.status !== 'paired' || !this.voice?.value) return;
    this.lastSeen = Date.now();
    this.events.audio?.(this.voice.value);
  };
  private onNotification = () => {
    try {
      const value = this.tx?.value;
      if (!value) return;
      const result = this.decoder.push(value);
      if (!result) return;
      this.lastSeen = Date.now();
      const { message } = result;
      if (result.ack) void this.send({ type: 'ack', msgId: result.id }).catch((e) => this.fail(e));
      if (['hello', 'hello.ack'].includes(message.type) && message.protocolVersion !== undefined && message.protocolVersion !== 1) throw new Error('设备蓝牙协议版本不兼容');
      if (message.type === 'ping') void this.send({ type: 'pong', t: message.t }, 2).catch((e) => this.fail(e));
      if (message.type === 'pair.required' && this.state.status === 'paired') {
        this.events.disconnect?.();
        this.update({ status: 'pairing_required', error: '设备已要求重新配对' });
      }
      for (const waiter of this.waiters) if (waiter.types.includes(message.type)) { waiter.resolve(message); }
      if (this.state.status === 'paired' && message.type.startsWith('voice.')) {
        const key = `${result.id}:${JSON.stringify(message)}`;
        const now = Date.now();
        for (const [id, at] of this.delivered) if (now - at > 10000) this.delivered.delete(id);
        if (!this.delivered.has(key)) {
          if (this.delivered.size >= 128) this.delivered.clear();
          this.delivered.set(key, now);
          this.events.message?.(message);
        }
      }
    } catch (error) { this.fail(error); }
  };

  private send(message: PassportMessage, channel = 0, ack = false): Promise<void> {
    const rx = this.rx;
    const epoch = this.epoch;
    const frames = encodePassportMessage(message, this.sequence++ & 4095, channel);
    if (ack) for (const frame of frames) frame[0] |= 4;
    const operation = this.queue.then(async () => {
      if (!rx) throw new Error('设备未连接');
      for (const frame of frames) {
        this.assertEpoch(epoch);
        if (rx.properties.writeWithoutResponse) await this.withTimeout(rx.writeValueWithoutResponse(frame), '蓝牙写入超时');
        else if (rx.properties.write) await this.withTimeout(rx.writeValueWithResponse(frame), '蓝牙写入超时');
        else throw new Error('设备控制特征不可写');
      }
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private exchange(types: string[], message: PassportMessage, matches: (message: PassportMessage) => boolean = () => true, timeoutMs = 10000, ack = false): Promise<PassportMessage> {
    return new Promise((resolve, reject) => {
      const done = (error?: Error, answer?: PassportMessage) => {
        clearTimeout(timer); this.waiters.delete(waiter);
        if (error) reject(error); else resolve(answer!);
      };
      const waiter = { types, resolve: (answer: PassportMessage) => { if (matches(answer)) done(undefined, answer); }, reject: (error: Error) => done(error) };
      const timer = setTimeout(() => done(new Error('设备响应超时，请检查固件是否支持 DSH Passport 协议 v1')), timeoutMs);
      this.waiters.add(waiter);
      void this.send(message,0,ack).catch((error) => done(error));
    });
  }

  private withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), 10000);
      promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
    });
  }
}
