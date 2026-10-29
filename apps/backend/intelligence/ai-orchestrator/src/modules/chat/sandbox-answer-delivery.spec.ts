import { createSandboxAnswerEmitter } from './sandbox-answer-delivery';
import { embedWorkspaceDeliverablesAndImagesInAnswer } from './user-sandbox-presentation.util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('stable sandbox answer delivery', () => {
  it('keeps provisional model drafts out of body and commits the verified answer once', () => {
    const events: any[] = [];
    const emit = createSandboxAnswerEmitter((e: any) => events.push(e));
    emit({ type: 'observation', content: 'draft numbers', data: { isDelta: true } });
    emit({ type: 'observation', content: 'different draft'.repeat(20), data: { isDelta: true } });
    emit({ type: 'observation', content: '正在发布' });
    emit({ type: 'result', content: '核验后的正式结果', data: { artifacts: [{ name: 'result.xlsx' }] } });
    expect(events).toHaveLength(4);
    expect(events.slice(0, 3).every(e => e.data.progressOnly)).toBe(true);
    expect(events[0].content).toContain('等待校验');
    expect(events[1].content).toContain('已处理 300 字符');
    expect(events[1].data.isDelta).toBeUndefined();
    expect(JSON.stringify(events)).not.toContain('draft');
    expect(events.filter(e => e.type === 'result').map(e => e.content)).toEqual(['核验后的正式结果']);
  });

  it('collects validated files separately without appending a card to the Markdown', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'answer-delivery-'));
    try {
      const file = path.join(root, 'result.xlsx');
      fs.writeFileSync(file, 'fixture');
      const artifacts: any[] = [];
      const text = '已完成更新，注意一项保留预测。';
      const rendered = embedWorkspaceDeliverablesAndImagesInAnswer({
        userId: 'owner', text,
        outboundFiles: [{ filePath: file, fileName: 'result.xlsx' }],
        getWorkspaceFilePath: () => file,
        embedDownloadCards: false,
        onArtifact: artifact => artifacts.push(artifact),
      });
      expect(rendered).toBe(text);
      expect(artifacts).toEqual([{ type: 'file', name: 'result.xlsx',
        downloadUrl: '/api/ai/chat/workspace-files/owner/result.xlsx' }]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
