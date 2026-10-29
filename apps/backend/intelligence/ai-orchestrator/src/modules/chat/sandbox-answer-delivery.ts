/** Sandbox deltas are provisional until workbook/evidence and publication gates finish. */
export function createSandboxAnswerEmitter<T extends { type?: unknown; content?: unknown; data?: any }>(
  emit: (event: T) => void,
): (event: T) => void {
  let lastDraftBucket = -1;
  return (event) => {
    if (event.type === 'observation' || event.type === 'action') {
      if (event.data?.isDelta) {
        const chars = typeof event.content === 'string' ? event.content.length : 0;
        const bucket = Math.floor(chars / 100);
        if (bucket === lastDraftBucket) return;
        lastDraftBucket = bucket;
        emit({ ...event, content: `正在整理回答（已处理 ${chars} 字符），等待校验…`,
          data: { mode: 'chat', progressOnly: true } });
        return;
      }
      emit({ ...event, data: { ...event.data, progressOnly: true } });
      return;
    }
    emit(event);
  };
}
