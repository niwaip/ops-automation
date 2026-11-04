import { afterEach, describe, expect, it, vi } from 'vitest';
import { PassportVoice } from './passport-voice';
import { passportAudioWav, PassportRecording } from './passport-audio';
import type { PassportMessage } from './passport-protocol';

const begin = { type: 'voice.begin', sessionId: 1, sampleRate: 16000, bits: 16, channels: 1, codec: 'ima-adpcm' };

// Eight complete blocks, 8 * 1008 PCM samples = 504ms at 16kHz.
function audioFrames() {
  const bytes = new Uint8Array(508 * 8);
  const frames: DataView[] = [];
  for (let offset = 0; offset < bytes.length; offset += 1600) {
    const message = bytes.slice(offset, offset + 1600);
    const count = Math.ceil(message.length / 200);
    for (let seq=0; seq<count; seq++) {
      const slice = message.slice(seq*200,(seq+1)*200);
      const frame = new Uint8Array(4+slice.length);
      frame.set([0x10 | (seq===0 ? 1 : 0) | (seq===count-1 ? 2 : 0),1,0,0x10|seq]);
      frame.set(slice,4); frames.push(new DataView(frame.buffer));
    }
  }
  return frames;
}
function fixture() {
  const ports = {
    send: vi.fn(async (_message: PassportMessage): Promise<void> => {}),
    transcribe: vi.fn(async (_audio: Blob, _signal: AbortSignal): Promise<string> => '检查当前服务状态'),
    deliver: vi.fn(async (_text: string, _send: boolean): Promise<void> => {}), status: vi.fn(),
  };
  return { voice: new PassportVoice(ports), ports };
}
afterEach(() => { vi.useRealTimers(); });

describe('Bluetooth voice direct to chat', () => {
  it('decodes device ADPCM into an actual WAV upload', async () => {
    const blob = passportAudioWav(new Uint8Array([0,0,0,0,0x77]),16000);
    const data = new DataView(await blob.arrayBuffer());
    expect(blob.type).toBe('audio/wav');
    expect(data.getUint32(24,true)).toBe(16000);
    expect(data.getInt16(44,true)).toBe(11);
    expect(data.getInt16(46,true)).toBe(41);
  });

  it('collects multiple BLE messages, transcribes, and sends once without MCP', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.voice.message(begin);
    for (const frame of audioFrames()) f.voice.audio(frame);
    const end = { type: 'voice.end', sessionId: 1, durationMs: 504 };
    f.voice.message(end); f.voice.message(end);
    await vi.advanceTimersByTimeAsync(200);
    expect(f.ports.transcribe).toHaveBeenCalledTimes(1);
    expect(f.ports.transcribe.mock.calls[0][0].type).toBe('audio/wav');
    expect(f.ports.deliver).toHaveBeenCalledTimes(1);
    expect(f.ports.deliver).toHaveBeenCalledWith('检查当前服务状态',true);
    const result = f.ports.send.mock.calls.map(([m]) => m).find((m) => m.type === 'voice.result');
    f.voice.message({ type: 'voice.action', resultId: result?.resultId, mode: 'send' });
    f.voice.message({ type: 'voice.action', resultId: result?.resultId, mode: 'send' });
    expect(f.ports.deliver).toHaveBeenCalledTimes(1);
    f.voice.reset();
  });

  it('refuses incomplete audio rather than sending a corrupted transcription', async () => {
    vi.useFakeTimers();
    const f = fixture(); f.voice.message(begin);
    audioFrames().filter((_,i) => i!==1).forEach((frame) => f.voice.audio(frame));
    f.voice.message({ type:'voice.end',sessionId:1,durationMs:504 });
    await vi.advanceTimersByTimeAsync(200);
    expect(f.ports.transcribe).not.toHaveBeenCalled();
    expect(f.ports.deliver).not.toHaveBeenCalled();
    expect(f.ports.status).toHaveBeenCalledWith(expect.stringContaining('不完整'),true);
    f.voice.reset();
  });

  it('ignores a late transcription after disconnect or account change', async () => {
    vi.useFakeTimers();
    const f = fixture(); let resolve!: (text:string) => void;
    f.ports.transcribe.mockImplementation(() => new Promise((r) => { resolve=r; }));
    f.voice.message(begin); audioFrames().forEach((frame) => f.voice.audio(frame));
    f.voice.message({ type:'voice.end',sessionId:1,durationMs:504 });
    await vi.advanceTimersByTimeAsync(200);
    f.voice.reset(); resolve('旧账户语音');
    await vi.advanceTimersByTimeAsync(0);
    expect(f.ports.deliver).not.toHaveBeenCalled();
  });

  it('detects loss of a whole audio message using the declared recording duration', () => {
    const recording = new PassportRecording(1,16000);
    // First message is eight 200-byte frames; all remaining frames are valid.
    audioFrames().slice(8).forEach((frame) => recording.push(frame));
    expect(() => recording.finish(504)).toThrow('不完整');
  });
});
