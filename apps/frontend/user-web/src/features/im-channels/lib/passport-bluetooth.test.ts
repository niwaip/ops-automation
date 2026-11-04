import { afterEach, describe, expect, it, vi } from 'vitest';
import { PassportBluetoothClient, type BleCharacteristic, type PassportBleDevice, type TrustStore, type PassportEvents } from './passport-bluetooth';
import { encodePassportMessage, PassportDecoder, PASSPORT_UUID, type PassportMessage } from './passport-protocol';

class Characteristic extends EventTarget implements BleCharacteristic {
  value?: DataView;
  properties = { writeWithoutResponse: true, notify: true };
  receive?: (frame: Uint8Array) => void;
  async startNotifications() { return this; }
  async writeValueWithoutResponse(frame: Uint8Array) { this.receive?.(frame); }
  async writeValueWithResponse(frame: Uint8Array) { this.receive?.(frame); }
  emit(message: PassportMessage) {
    for (const frame of encodePassportMessage(message, 5)) {
      if (message.type === 'pair.ok' || message.type === 'pair.failed') frame[0] |= 4;
      this.value = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
      this.dispatchEvent(new Event('characteristicvaluechanged'));
    }
  }
}

function fixture({ rejectCode = false, confirmTrust = true, acknowledge = true } = {}, events: PassportEvents = {}) {
  const rx = new Characteristic();
  const tx = new Characteristic();
  const voice = new Characteristic();
  const decoder = new PassportDecoder();
  const messages: PassportMessage[] = [];
  rx.receive = (frame) => {
    const result = decoder.push(new DataView(frame.buffer, frame.byteOffset, frame.byteLength));
    if (!result) return;
    messages.push(result.message);
    const m = result.message;
    if (result.ack && acknowledge) tx.emit({type:'ack',msgId:result.id});
    if (m.type === 'hello') {
      if (!m.token) tx.emit({ type: 'pair.required', reason: 'unpaired' });
      else if (confirmTrust) tx.emit({ type: 'hello.ack', protocolVersion: 1 });
    }
    if (m.type === 'pair.begin') tx.emit(rejectCode ? { type: 'pair.failed', reason: 'code', remaining: 2 } : { type: 'pair.ok', deviceId: 'passport-123', token: 'a'.repeat(32) });
    if (m.type === 'pair.reset') tx.emit({ type: 'pair.required' });
  };
  const server: NonNullable<PassportBleDevice['gatt']> = {
    connected: true, connect: vi.fn(async (): Promise<NonNullable<PassportBleDevice['gatt']>> => server), disconnect: vi.fn(),
    getPrimaryService: vi.fn(async () => ({ getCharacteristic: async (uuid: string) => uuid === PASSPORT_UUID.rx ? rx : uuid === PASSPORT_UUID.voice ? voice : tx })),
  };
  const device: PassportBleDevice = Object.assign(new EventTarget(), { id: 'browser-device', name: 'Folo-PSP', gatt: server });
  const store: TrustStore = { load: vi.fn(() => null), save: vi.fn(), remove: vi.fn() };
  const state = vi.fn();
  const bluetooth = { requestDevice: vi.fn(async () => device) };
  const client = new PassportBluetoothClient(bluetooth, store, state, events);
  return { client, bluetooth, store, state, tx, voice, device, messages, server };
}

afterEach(() => { vi.useRealTimers(); });

describe('AI Passport pairing', () => {
  it('waits for a matching device ACK before confirming result delivery', async () => {
    const f=fixture();
    try {
      await f.client.connect(); await f.client.pair('123456');
      await expect(f.client.sendControl({type:'task.state',state:'completed',title:'回复摘要'})).resolves.toBeUndefined();
    } finally {f.client.disconnect();}
  });
  it('rejects missing ACKs even when unrelated acknowledgements arrive', async () => {
    vi.useFakeTimers(); const f=fixture({acknowledge:false});
    try {
      await f.client.connect(); await f.client.pair('123456');
      const pending=f.client.sendControl({type:'task.state',state:'completed',title:'回复摘要'});
      const assertion=expect(pending).rejects.toThrow('超时');
      f.tx.emit({type:'ack',msgId:999});
      await vi.advanceTimersByTimeAsync(5100); await assertion;
      expect(f.messages.filter(m=>m.type==='task.state')).toHaveLength(2);
    } finally {f.client.disconnect();}
  });
  it('subscribes to recording notifications and forwards authenticated voice messages only once', async () => {
    const message = vi.fn(); const audio = vi.fn();
    const f = fixture({}, { message, audio });
    const raw = new DataView(new Uint8Array([0x13,1,0,0x10,0]).buffer);
    try {
      await f.client.connect();
      f.voice.value = raw; f.voice.dispatchEvent(new Event('characteristicvaluechanged'));
      expect(audio).not.toHaveBeenCalled();
      await f.client.pair('123456');
      f.voice.dispatchEvent(new Event('characteristicvaluechanged'));
      expect(audio).toHaveBeenCalledWith(raw);
      f.tx.emit({ type:'voice.end',sessionId:1,durationMs:1000 });
      f.tx.emit({ type:'voice.end',sessionId:1,durationMs:1000 });
      expect(message).toHaveBeenCalledTimes(1);
      f.client.disconnect();
      f.voice.dispatchEvent(new Event('characteristicvaluechanged'));
      expect(audio).toHaveBeenCalledTimes(1);
    } finally { f.client.disconnect(); }
  });
  it('discovers service advertisements and name-only firmware with explicit GATT permission', async () => {
    const f = fixture();
    try {
      await f.client.connect();
      expect(f.bluetooth.requestDevice).toHaveBeenCalledWith({
        filters: [{ services: [PASSPORT_UUID.service] }, { name: 'FoloPassport-DSH' }, { name: 'Folo-PSP' }],
        optionalServices: [PASSPORT_UUID.service],
      });
    } finally { f.client.disconnect(); }
  });

  it('allows diagnostic discovery without skipping the actual GATT service check', async () => {
    const f = fixture();
    try {
      await f.client.connect(true);
      expect(f.bluetooth.requestDevice).toHaveBeenCalledWith({ acceptAllDevices: true, optionalServices: [PASSPORT_UUID.service] });
      expect(f.server.getPrimaryService).toHaveBeenCalledWith(PASSPORT_UUID.service);
      expect(f.state.mock.lastCall?.[0].status).toBe('pairing_required');
    } finally { f.client.disconnect(); }
  });

  it('reports incompatible devices without misreporting a cancelled chooser', async () => {
    const f = fixture();
    vi.mocked(f.server.getPrimaryService).mockRejectedValue(Object.assign(new Error('No matching service'), { name: 'NotFoundError' }));
    try {
      await f.client.connect(true);
      expect(f.state.mock.lastCall?.[0]).toMatchObject({ status: 'error', error: expect.stringContaining('缺少 DSH Passport') });
      expect(f.store.save).not.toHaveBeenCalled();
    } finally { f.client.disconnect(); }
  });

  it('requires pair.ok AND token hello.ack before saving trust or displaying paired', async () => {
    const f = fixture();
    try {
      await f.client.connect();
      expect(f.state.mock.lastCall?.[0].status).toBe('pairing_required');
      expect(f.store.save).not.toHaveBeenCalled();
      await f.client.pair('123456');
      expect(f.messages).toContainEqual({ type: 'pair.begin', code: '123456', host: 'ops-web' });
      expect(f.messages).toContainEqual({ type: 'ack', msgId: 5 });
      expect(f.store.save).toHaveBeenCalledWith('browser-device', { deviceId: 'passport-123', token: 'a'.repeat(32) });
      expect(f.state.mock.lastCall?.[0]).toMatchObject({ status: 'paired', deviceId: 'passport-123' });
      await f.client.unpair();
      expect(f.store.remove).toHaveBeenCalledWith('browser-device');
      expect(f.state.mock.lastCall?.[0].status).toBe('pairing_required');
    } finally { f.client.disconnect(); }
  });

  it('keeps failed codes unpaired and shows remaining attempts', async () => {
    const f = fixture({ rejectCode: true });
    try {
      await f.client.connect(); await f.client.pair('123456');
      expect(f.store.save).not.toHaveBeenCalled();
      expect(f.state.mock.lastCall?.[0]).toMatchObject({ status: 'pairing_required', error: expect.stringContaining('剩余 2 次') });
    } finally { f.client.disconnect(); }
  });

  it('does not trust pair.ok when the authenticated handshake times out', async () => {
    vi.useFakeTimers();
    const f = fixture({ confirmTrust: false });
    try {
      await f.client.connect();
      const pending = f.client.pair('123456');
      await vi.advanceTimersByTimeAsync(11000);
      await pending;
      expect(f.store.save).not.toHaveBeenCalled();
      expect(f.state.mock.lastCall?.[0].status).toBe('pairing_required');
    } finally { f.client.disconnect(); }
  });

  it('clears live paired status when the device disconnects', async () => {
    const f = fixture();
    try {
      await f.client.connect(); await f.client.pair('123456');
      f.device.dispatchEvent(new Event('gattserverdisconnected'));
      expect(f.state.mock.lastCall?.[0]).toMatchObject({ status: 'error', deviceId: undefined });
      expect(f.server.disconnect).toHaveBeenCalled();
    } finally { f.client.disconnect(); }
  });

  it('does not reconnect after the user cancels an open chooser', async () => {
    const f = fixture();
    let select!: (device: PassportBleDevice) => void;
    f.bluetooth.requestDevice.mockImplementation(() => new Promise((resolve) => { select = resolve; }));
    const pending = f.client.connect();
    f.client.disconnect(); select(f.device); await pending;
    expect(f.server.connect).not.toHaveBeenCalled();
    expect(f.state.mock.lastCall?.[0].status).toBe('disconnected');
  });

  it('reuses session trust only after a fresh device handshake', async () => {
    const f = fixture();
    vi.mocked(f.store.load).mockReturnValue({ deviceId: 'passport-123', token: 'a'.repeat(32) });
    try {
      await f.client.connect();
      expect(f.state.mock.lastCall?.[0].status).toBe('paired');
      expect(f.messages[0].token).toBe('a'.repeat(32));
    } finally { f.client.disconnect(); }
  });
});

describe('wire framing', () => {
  it('reassembles multibyte JSON in 20-byte ATT frames', () => {
    const value = { type: 'pair.begin', code: '123456', host: '测试电脑' };
    const frames = encodePassportMessage(value, 4095);
    expect(frames.every((f) => f.length <= 20)).toBe(true);
    const decoder = new PassportDecoder();
    let result;
    for (const f of frames) result = decoder.push(new DataView(f.buffer));
    expect(result?.message).toEqual(value);
    expect(result?.id).toBe(4095);
  });

  it('rejects missing fragments and unsupported frame versions', () => {
    const frames = encodePassportMessage({ type: 'pair.begin', code: '123456', host: 'computer' }, 1);
    const decoder = new PassportDecoder();
    decoder.push(new DataView(frames[0].buffer));
    expect(() => decoder.push(new DataView(frames[2].buffer))).toThrow('缺片');
    expect(() => decoder.push(new DataView(new Uint8Array([0x23, 0, 0, 0]).buffer))).toThrow('版本');
  });
});
