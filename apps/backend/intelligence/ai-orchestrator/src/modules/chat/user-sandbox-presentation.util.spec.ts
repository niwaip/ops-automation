import * as fs from 'fs';
import * as path from 'path';
import { embedWorkspaceDeliverablesAndImagesInAnswer } from './user-sandbox-presentation.util';

describe('user-sandbox-presentation.util embedWorkspaceDeliverablesAndImagesInAnswer', () => {
  const testUserId = 'test-user-123';
  const tmpDir = path.join('/tmp', 'test-user-sandbox-' + Date.now());
  const userDir = path.join(tmpDir, testUserId);
  const sampleFileName = '工数3Q预实管理_1024.xlsx';

  beforeAll(() => {
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, sampleFileName), 'mock-content');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const getWorkspaceFilePath = (uid: string, fName: string) => path.join(tmpDir, uid, fName);

  it('rewrites plain workspace-files link lacking userId to standard link and does not duplicate cards', () => {
    const rawContent = `✅ 更新完成！\n\n📄 [《工数3Q预实管理_1024.xlsx》](/api/ai/chat/workspace-files/${encodeURIComponent(sampleFileName)})`;
    const result = embedWorkspaceDeliverablesAndImagesInAnswer({
      userId: testUserId,
      text: rawContent,
      outboundFiles: [{ fileName: sampleFileName, filePath: path.join(userDir, sampleFileName) }],
      sessionFiles: [],
      getWorkspaceFilePath,
    });

    // Link should be rewritten with userId
    expect(result).toContain(`/api/ai/chat/workspace-files/${encodeURIComponent(testUserId)}/${encodeURIComponent(sampleFileName)}`);
    // Should NOT append another "生成产物已就绪" section
    expect(result).not.toContain('生成产物已就绪');
  });

  it('detects existing standard link with userId and does not duplicate cards', () => {
    const standardUrl = `/api/ai/chat/workspace-files/${encodeURIComponent(testUserId)}/${encodeURIComponent(sampleFileName)}`;
    const rawContent = `✅ 更新完成！\n\n📄 [《工数3Q预实管理_1024.xlsx》](${standardUrl})`;
    const result = embedWorkspaceDeliverablesAndImagesInAnswer({
      userId: testUserId,
      text: rawContent,
      outboundFiles: [{ fileName: sampleFileName, filePath: path.join(userDir, sampleFileName) }],
      sessionFiles: [],
      getWorkspaceFilePath,
    });

    expect(result).not.toContain('生成产物已就绪');
  });

  it('appends standard download card when no link exists in text', () => {
    const rawContent = `✅ 更新完成！已处理工数表格。`;
    const result = embedWorkspaceDeliverablesAndImagesInAnswer({
      userId: testUserId,
      text: rawContent,
      outboundFiles: [{ fileName: sampleFileName, filePath: path.join(userDir, sampleFileName) }],
      sessionFiles: [],
      getWorkspaceFilePath,
    });

    expect(result).toContain('生成产物已就绪');
    expect(result).toContain(`[《${sampleFileName}》](/api/ai/chat/workspace-files/${encodeURIComponent(testUserId)}/${encodeURIComponent(sampleFileName)})`);
  });

  describe('HTML deliverables handling', () => {
    const htmlFileName = 'report.html';

    beforeAll(() => {
      fs.writeFileSync(path.join(userDir, htmlFileName), '<html><body>Dashboard</body></html>');
    });

    it('generates a download card for HTML files when no ```html block is in text', () => {
      const rawContent = `已为您生成网页报告 《report.html》，可点击下载后在浏览器打开。`;
      const result = embedWorkspaceDeliverablesAndImagesInAnswer({
        userId: testUserId,
        text: rawContent,
        outboundFiles: [{ fileName: htmlFileName, filePath: path.join(userDir, htmlFileName) }],
        sessionFiles: [],
        getWorkspaceFilePath,
      });

      expect(result).toContain('生成产物已就绪');
      expect(result).toContain(`🌐 **[《${htmlFileName}》](/api/ai/chat/workspace-files/${encodeURIComponent(testUserId)}/${encodeURIComponent(htmlFileName)})**`);
    });

    it('rewrites /workspace/report.html links directly in text to standard API link', () => {
      const rawContent = `已生成报告：[下载网页报告](/workspace/${htmlFileName})`;
      const result = embedWorkspaceDeliverablesAndImagesInAnswer({
        userId: testUserId,
        text: rawContent,
        outboundFiles: [{ fileName: htmlFileName, filePath: path.join(userDir, htmlFileName) }],
        sessionFiles: [],
        getWorkspaceFilePath,
      });

      // Rewrites inline link
      expect(result).toContain(`[下载网页报告](/api/ai/chat/workspace-files/${encodeURIComponent(testUserId)}/${encodeURIComponent(htmlFileName)})`);
      // Does not create duplicate card below
      expect(result).not.toContain('生成产物已就绪');
    });

    it('suppresses redundant bottom download card when text already has an interactive ```html block', () => {
      const rawContent = `下面是为您设计的单页代码：\n\`\`\`html\n<!DOCTYPE html><html><body><h1>Hello</h1></body></html>\n\`\`\``;
      const result = embedWorkspaceDeliverablesAndImagesInAnswer({
        userId: testUserId,
        text: rawContent,
        outboundFiles: [{ fileName: htmlFileName, filePath: path.join(userDir, htmlFileName) }],
        sessionFiles: [],
        getWorkspaceFilePath,
      });

      // Front-end renders the code block / preview directly, so extra download card is intentionally suppressed
      expect(result).not.toContain('生成产物已就绪');
    });
  });
});
