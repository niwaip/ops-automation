// DSH Passport uses a custom ADPCM step table, not the standard IMA table.
// Adapted from ai-passport-dsh / dsh-ai-passport-plugin (MIT, slinxiaosun-blip).
// License: scripts/ai-passport/UPSTREAM-LICENSE.txt.
const STEPS = [
  7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,40,43,48,52,56,60,64,68,73,78,83,89,
  94,99,105,112,117,124,130,137,144,151,157,163,170,177,184,191,198,205,212,219,226,233,240,
  247,255,262,270,278,286,294,303,312,321,331,341,351,362,373,384,396,408,420,433,446,459,473,
  487,502,517,532,548,564,581,598,616,634,653,672,691,
];
const INDEX = [-1,-1,-1,-1,2,4,6,8,-1,-1,-1,-1,2,4,6,8];

export function passportAudioWav(bytes: Uint8Array, sampleRate: number): Blob {
  if (![8000,16000].includes(sampleRate) || bytes.length < 5 || bytes.length > 250000) throw new Error('设备录音格式无效');
  const pcm: number[] = [];
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    let predictor = data.getInt16(offset, true);
    let index = data.getUint8(offset + 2);
    if (index > 88) throw new Error('设备录音损坏，请重新说话');
    offset += 4;
    const end = Math.min(bytes.length, offset + 504);
    while (offset < end) {
      const byte = bytes[offset++];
      for (const nibble of [byte & 15, byte >> 4]) {
        const step = STEPS[index];
        const delta = (step >> 3) + ((nibble & 1) ? step >> 2 : 0) + ((nibble & 2) ? step >> 1 : 0) + ((nibble & 4) ? step : 0);
        predictor = Math.max(-32768, Math.min(32767, predictor + ((nibble & 8) ? -delta : delta)));
        index = Math.max(0, Math.min(88, index + INDEX[nibble]));
        pcm.push(predictor);
      }
    }
  }
  if (offset !== bytes.length || pcm.length > sampleRate * 31) throw new Error('设备录音长度异常');
  const wav = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(wav);
  const text = (at: number, value: string) => { for (let i=0; i<value.length; i++) view.setUint8(at+i, value.charCodeAt(i)); };
  text(0,'RIFF'); view.setUint32(4, wav.byteLength-8, true); text(8,'WAVE'); text(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
  text(36,'data'); view.setUint32(40,pcm.length*2,true);
  pcm.forEach((sample,i) => view.setInt16(44+i*2,sample,true));
  return new Blob([wav], { type: 'audio/wav' });
}

export class PassportRecording {
  readonly bytes: number[] = [];
  private next = 0;
  private inMessage = false;
  private damaged = false;
  constructor(readonly sessionId: number, readonly sampleRate: number) {}

  push(frame: DataView) {
    if (frame.byteLength <= 4 || frame.getUint8(0) >> 4 !== 1 || frame.getUint8(1) !== 1) return;
    const id = (frame.getUint8(2) << 4) | (frame.getUint8(3) >> 4);
    if (id !== this.sessionId) return;
    const flags = frame.getUint8(0) & 15;
    const seq = frame.getUint8(3) & 15;
    if (flags & 1) {
      if (this.inMessage) this.damaged = true;
      this.next = 0; this.inMessage = true;
    }
    if (!this.inMessage || seq !== this.next) this.damaged = true;
    this.next = seq + 1;
    if (flags & 2) this.inMessage = false;
    if (this.bytes.length + frame.byteLength - 4 > 250000) { this.damaged = true; return; }
    for (let i=4; i<frame.byteLength; i++) this.bytes.push(frame.getUint8(i));
  }

  finish(durationMs: number) {
    // Every byte after the 4-byte block header represents two PCM samples.
    const blockHeaders = Math.ceil(this.bytes.length / 508) * 4;
    const samples = Math.max(0, this.bytes.length - blockHeaders) * 2;
    const expected = Math.floor(durationMs * this.sampleRate / 1000);
    if (this.damaged || this.inMessage || samples !== expected) throw new Error('蓝牙录音不完整，请靠近设备后重试');
    return passportAudioWav(new Uint8Array(this.bytes), this.sampleRate);
  }
}
