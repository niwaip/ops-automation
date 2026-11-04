// Wire format verified against dsh-ai-passport-plugin 3b2daee (MIT).
// See scripts/ai-passport/UPSTREAM-LICENSE.txt for upstream attribution.
export const PASSPORT_UUID = {
  service: '0000a900-a900-5041-5353-544f524f5350',
  rx: 'a9005041-5353-544f-524f-5350f0a90002',
  tx: 'a9005041-5353-544f-524f-5350f0a90003',
  voice: 'a9005041-5353-544f-524f-5350f0a90004',
};

export type PassportMessage = { type: string; [key: string]: unknown };

export function encodePassportMessage(message: PassportMessage, id: number, channel = 0): Uint8Array[] {
  const bytes = new TextEncoder().encode(JSON.stringify(message));
  // 20 byte ATT packets work even when the browser does not expose negotiated MTU.
  const count = Math.max(1, Math.ceil(bytes.length / 16));
  if (bytes.length > 2048 || count > 16) throw new Error('蓝牙控制消息过长');
  return Array.from({ length: count }, (_, seq) => {
    const slice = bytes.slice(seq * 16, (seq + 1) * 16);
    const frame = new Uint8Array(4 + slice.length);
    frame.set([0x10 | (seq === 0 ? 1 : 0) | (seq === count - 1 ? 2 : 0), channel, (id >> 4) & 255, ((id & 15) << 4) | seq]);
    frame.set(slice, 4);
    return frame;
  });
}

export class PassportDecoder {
  private pending = new Map<string, { bytes: number[]; next: number; at: number }>();

  reset() { this.pending.clear(); }

  push(value: DataView): { message: PassportMessage; id: number; ack: boolean } | null {
    if (value.byteLength < 4 || value.getUint8(0) >> 4 !== 1) throw new Error('设备蓝牙协议版本不兼容');
    const flags = value.getUint8(0) & 15;
    const channel = value.getUint8(1);
    if (channel !== 0 && channel !== 2) return null;
    const id = (value.getUint8(2) << 4) | (value.getUint8(3) >> 4);
    const seq = value.getUint8(3) & 15;
    const key = `${channel}:${id}`;
    for (const [k, part] of this.pending) if (Date.now() - part.at > 5000) this.pending.delete(k);
    if (flags & 1) {
      if (seq !== 0) throw new Error('设备蓝牙分片顺序错误');
      if (this.pending.size >= 8) this.pending.clear();
      this.pending.set(key, { bytes: [], next: 0, at: Date.now() });
    }
    const part = this.pending.get(key);
    if (!part) return null;
    if (seq < part.next) return null;
    if (seq !== part.next) { this.pending.delete(key); throw new Error('设备蓝牙消息缺片，请重连'); }
    for (let i = 4; i < value.byteLength; i++) part.bytes.push(value.getUint8(i));
    part.next++;
    if (part.bytes.length > 2048) { this.pending.delete(key); throw new Error('设备蓝牙消息过长'); }
    if (!(flags & 2)) return null;
    this.pending.delete(key);
    const message: unknown = JSON.parse(new TextDecoder().decode(new Uint8Array(part.bytes)));
    if (!message || typeof message !== 'object' || !('type' in message) || typeof message.type !== 'string') throw new Error('设备蓝牙消息格式错误');
    return { message: message as PassportMessage, id, ack: Boolean(flags & 4) };
  }
}
