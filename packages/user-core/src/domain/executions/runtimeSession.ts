export interface RuntimeSessionConnectionInfoLike {
  novnc?: string;
  cdp?: string;
  vnc?: string;
  [key: string]: unknown;
}

export interface RuntimeSessionLike {
  state?: string;
  connectionInfo?: RuntimeSessionConnectionInfoLike;
}

export const isLiveRuntimeSessionState = (state?: string): boolean =>
  state === 'busy' || state === 'ready' || state === 'frozen';

export const isPreviewRuntimeSessionState = (state?: string): boolean =>
  state === 'allocating' || isLiveRuntimeSessionState(state);

export const getRuntimeSessionNovncUrl = (
  runtimeSession?: RuntimeSessionLike
): string | undefined => {
  return typeof runtimeSession?.connectionInfo?.novnc === 'string'
    ? runtimeSession.connectionInfo.novnc
    : undefined;
};

export const getRuntimeSessionStatusLabel = (state?: string, isEnglish = false): string => {
  if (state === 'frozen') {
    return isEnglish ? 'Takeover' : '人工接管';
  }
  if (state === 'ready') {
    return isEnglish ? 'Ready' : '已就绪';
  }
  if (state === 'busy') {
    return isEnglish ? 'Running' : '执行中';
  }
  return isEnglish ? 'Runtime Active' : '运行中';
};
