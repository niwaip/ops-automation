import { PassportRecording } from './passport-audio';
import type { PassportMessage } from './passport-protocol';

export interface PassportVoicePorts {
  send(message: PassportMessage): Promise<void>;
  transcribe(audio: Blob, signal: AbortSignal): Promise<string>;
  deliver(text: string, send: boolean): Promise<void>;
  status(text: string, error?: boolean): void;
}

export class PassportVoice {
  private recording?: PassportRecording;
  private ending = false;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private results = new Map<string, { text: string; sent: boolean; at: number }>();
  private generation = 0;
  constructor(private ports: PassportVoicePorts) {}
  get isRecording() { return Boolean(this.recording); }

  reset() {
    this.generation++;
    this.controller?.abort(); this.controller = undefined;
    clearTimeout(this.timer); this.recording = undefined; this.ending = false; this.results.clear();
  }

  audio(frame: DataView) { this.recording?.push(frame); }

  message(message: PassportMessage) {
    if (message.type === 'voice.begin') {
      if (this.recording || this.controller) { this.reportError('上一段语音还在处理中，请稍后再说'); return; }
      const rate = Number(message.sampleRate);
      const id = Number(message.sessionId);
      if (![8000,16000].includes(rate) || !Number.isInteger(id) || id < 0 || id > 15 || message.bits !== 16 || message.channels !== 1 || message.codec !== 'ima-adpcm') {
        this.reportError('设备录音格式不支持'); return;
      }
      this.recording = new PassportRecording(id, rate);
      this.ports.status('正在接收设备录音…');
      this.timer = setTimeout(() => { this.recording = undefined; this.ending = false; this.reportError('设备录音超时，请重试'); }, 35000);
    } else if (message.type === 'voice.end') {
      if (!this.recording || this.ending || message.sessionId !== this.recording.sessionId) return;
      this.ending = true;
      clearTimeout(this.timer);
      const generation = this.generation;
      // Audio and control use distinct notify characteristics; drain trailing audio.
      this.timer = setTimeout(() => { if (generation === this.generation) void this.finish(Number(message.durationMs)); }, 150);
    } else if (message.type === 'voice.action') {
      const id = String(message.resultId || '');
      const result = this.results.get(id);
      if (!result || Date.now() - result.at > 120000) return;
      if (message.mode === 'discard' || message.mode === 'redo') { this.results.delete(id); return; }
      if (message.mode === 'send' && !result.sent) {
        result.sent = true;
        void this.ports.deliver(result.text, true).catch(() => { this.reportError('聊天消息未提交，请在网页检查后重试'); });
      } else if (message.mode === 'fill' && !result.sent) {
        void this.ports.deliver(result.text, false).catch(() => this.reportError('无法填入聊天窗口'));
      }
    }
  }

  private async finish(durationMs: number) {
    const recording = this.recording;
    this.recording = undefined; this.ending = false;
    if (!recording) return;
    if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 31000) { this.reportError('设备录音时长无效'); return; }
    if (durationMs < 500) { this.ports.status('录音过短，请按住设备按键说话'); return; }
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 60000);
    const generation = this.generation;
    try {
      const wav = recording.finish(durationMs);
      this.ports.status('正在识别设备语音…');
      const text = (await this.ports.transcribe(wav, controller.signal)).trim();
      clearTimeout(timeout);
      if (generation !== this.generation || controller.signal.aborted) return;
      if (!text || text.length > 10000) throw new Error('没有识别到有效语音，请重新说话');
      const resultId = `ops-${crypto.randomUUID().slice(0,8)}`;
      if (this.results.size >= 10) this.results.delete(this.results.keys().next().value!);
      // Mark before delivery so a repeated device action cannot submit a second message.
      this.results.set(resultId, { text, sent: true, at: Date.now() });
      let preview = '';
      for (const character of text) { if (new TextEncoder().encode(preview + character).length > 110) break; preview += character; }
      // Auto-send needs no confirmation card, which would obscure the reply screen.
      await this.ports.send({ type: 'voice.result', sessionId: recording.sessionId, text: preview }).catch(() => undefined);
      if (generation !== this.generation) return;
      this.ports.status('正在发送到聊天窗口…');
      await this.ports.deliver(text, true);
      if (generation !== this.generation) return;
      this.ports.status('已提交到聊天窗口');
      await this.ports.send({ type: 'toast', text: '已提交到聊天窗口' }).catch(() => undefined);
    } catch (error) {
      if (generation === this.generation) this.reportError(controller.signal.aborted ? '语音识别超时，请重试' : error instanceof Error ? error.message : '语音识别失败');
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.controller = undefined;
    }
  }

  private reportError(text: string) {
    this.ports.status(text, true);
    void this.ports.send({ type: 'voice.error', message: text.slice(0,50) }).catch(() => undefined);
  }
}
