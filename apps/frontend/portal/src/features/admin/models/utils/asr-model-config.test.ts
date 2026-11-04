import { describe, expect, it } from 'vitest';
import { buildConfigFromValues, mapConfigToFormValues } from '../types';
import { recognizeModelProfile } from './modelProfileRecognizer';

describe('ASR model configuration', () => {
  it('preserves the model-specific transcription URL across edit and save', () => {
    const url='https://api.siliconflow.cn/v1/audio/transcriptions';
    const form=mapConfigToFormValues({audio_transcription_endpoint:url});
    expect(buildConfigFromValues(form).audio_transcription_endpoint).toBe(url);
    expect(buildConfigFromValues({...form,audio_transcription_endpoint:' '}).audio_transcription_endpoint).toBeUndefined();
  });
  it('recognizes XingChen as a dedicated audio transcription model', () => {
    const profile=recognizeModelProfile('XingChenAGI/XingChenASR-V3.2','siliconflow');
    expect(profile?.input).toEqual(['audio']);
    expect(profile?.defaultScopes).toContain('audio_transcription');
    expect(profile?.routing_tags).toEqual(['audio_transcription']);
  });
});
