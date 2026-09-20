import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as path from 'path';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort, getAiOrchestratorUrl } from '../ports';
import { STORAGE_DRIVER, type StorageDriver } from './storage/storage-driver.interface';
import { WorkspaceContentIndexerService } from './workspace-content-indexer.service';
import { WorkspaceDigestService } from './workspace-digest.service';
import type { SaveTextNoteDto, WorkspaceFileDigest } from './dto/workspace.dto';
import type { SyncedArtifactInfo } from './workspace-artifact-sync.helper';

export interface RefineFolderAndNoteParams {
  folderNodeId: string;
  baseFolderId: string | null;
  currentFolderName: string;
  noteNodeId: string;
  noteStorageKey: string;
  currentNoteFileName: string;
  dto: SaveTextNoteDto;
  userId: string;
  workspace: any;
  syncedArtifacts: SyncedArtifactInfo[];
}

@Injectable()
export class WorkspaceNoteAiHelper {
  private readonly logger = new Logger(WorkspaceNoteAiHelper.name);

  constructor(
    @Inject(WORKBENCH_PRISMA) private readonly prisma: WorkbenchPrismaPort,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    private readonly contentIndexer: WorkspaceContentIndexerService,
    private readonly digestService: WorkspaceDigestService
  ) {}

  /**
   * 后台异步调用 LLM 综合分析会话内容与归集资产，规范命名文件夹并精炼重构总结笔记
   */
  public async refineFolderAndNoteWithAi(params: RefineFolderAndNoteParams): Promise<void> {
    const {
      folderNodeId,
      baseFolderId,
      currentFolderName,
      noteNodeId,
      noteStorageKey,
      dto,
      workspace,
      syncedArtifacts,
    } = params;

    try {
      this.logger.log(
        `Starting background AI refinement for folder: ${folderNodeId} and note: ${noteNodeId}`
      );
      const aiOrchestratorUrl = getAiOrchestratorUrl();

      const userQuestion = dto.userQuery?.trim() || '（用户未显式提问）';
      const rawContent = dto.content.trim();
      const rawDataText = dto.rawResultData
        ? typeof dto.rawResultData === 'string'
          ? dto.rawResultData
          : JSON.stringify(dto.rawResultData, null, 2)
        : null;

      const artifactsSummaryList = syncedArtifacts.map((a) => `${a.name} (${a.mimeType})`);
      const artifactsContext =
        artifactsSummaryList.length > 0
          ? `【已生成的交付资产与文件清单】:\n${artifactsSummaryList.map((item) => `- ${item}`).join('\n')}`
          : '【已生成的交付资产与文件清单】: 无额外独立文件';

      const now = new Date();
      const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

      const prompt = [
        '你是一个企业级 AI 智能运维与知识资产工程师。',
        '用户在沙盒环境中进行了一次工作会话，现需要将本次会话成果归档到工作空间的一个专属文件夹中。',
        '请根据以下用户提问、AI 回答、底层原始数据以及生成的交付文件列表，完成两项任务：',
        '1. 为本次成果创建规范的专属文件夹名称，以便于日后翻阅和管理。',
        '2. 将会话与产物提炼为高浓度、结构清晰的 Markdown 总结报告。',
        '',
        `【当前日期标签】: ${dateTag}`,
        `【用户提问背景】: ${userQuestion}`,
        '',
        '【AI 回答与分析详情】:',
        rawContent,
        '',
        artifactsContext,
        '',
        rawDataText ? `【底层原始执行数据】:\n${rawDataText.slice(0, 8000)}` : '',
        '',
        '请严格输出合法 JSON（不要输出 markdown 代码块以外的冗余文本），JSON 结构定义如下：',
        '{',
        `  "folderName": "规范命名的专属文件夹名称。必须严格遵守格式：${dateTag}_[分类标签]_[核心业务主题]，例如：${dateTag}_生活出行_上海实时天气与出行指南，或者 ${dateTag}_数据分析_8月销售数据复盘。分类为2~4个汉字，核心主题为6~20个汉字，不要有特殊符号",`,
        '  "title": "高度凝练、结构清晰的中文文档标题（不超过 30 个字，包含关键实体与事件）",',
        '  "tags": ["3~6个精准分类标签，如天气预报、生活出行、上海等"],',
        '  "summary": "150~250字的高浓度业务与运维执行摘要",',
        '  "refinedContent": "清洗去噪、层级分明的结构化 Markdown 正文（包含核心结论、关键细节与实操建议，不要包含一级标题，使用 ## 与 ### 分块。若原文包含图片语法 ![...](...)，请务必在正文相应位置原样保留完整的图片引用语法，严禁丢弃图片！）",',
        '  "artifactsDescription": [',
        '    { "fileName": "文件名.ext", "description": "一句话介绍该交付文件的具体内容和作用" }',
        '  ]',
        '}',
      ]
        .filter(Boolean)
        .join('\n\n');

      const response = await axios.post<{ response?: string }>(
        `${aiOrchestratorUrl}/ai/chat`,
        {
          message: prompt,
          modelId: dto.aiModel || 'default',
          config: { mode: 'chat' },
        },
        { timeout: 90000 }
      );

      const reply = String(response.data?.response || '').trim();
      const parsed = this.parseAiJsonResponse(reply);
      if (!parsed || !parsed.title || !parsed.refinedContent) {
        this.logger.warn(
          `AI refinement returned invalid JSON structure for folder ${folderNodeId}, keeping baseline naming.`
        );
        return;
      }

      // 1. 提炼并重命名专属文件夹（若专属文件夹存在且与笔记区分）
      let finalFolderName = currentFolderName;
      if (folderNodeId && folderNodeId !== noteNodeId) {
        const rawAiFolderName = String(parsed.folderName || '').trim();
        finalFolderName = await this.resolveUniqueFolderName(
          workspace.id,
          baseFolderId,
          folderNodeId,
          rawAiFolderName,
          dateTag,
          parsed.title
        );

        await this.prisma.workspaceNode.update({
          where: { id: folderNodeId },
          data: { name: finalFolderName },
        });
        this.logger.log(`Refined folder ${folderNodeId} name to: "${finalFolderName}"`);
      }

      // 2. 组装提炼后的结构化 Markdown 内容
      const refinedTitle = String(parsed.title).trim();
      const refinedTags =
        Array.isArray(parsed.tags) && parsed.tags.length > 0
          ? parsed.tags.map(String).slice(0, 6)
          : dto.tags || ['AI沉淀', '知识候选'];
      const refinedSummary = String(parsed.summary || '').trim();
      let refinedBody = String(parsed.refinedContent).trim();

      // 保留原文中的图片标签
      const imageTags: string[] = [];
      const imgMatchRegex = /!\[(.*?)\]\((.*?)\)/g;
      let m: RegExpExecArray | null;
      while ((m = imgMatchRegex.exec(rawContent)) !== null) {
        imageTags.push(m[0]);
      }
      if (imageTags.length > 0 && !refinedBody.includes('![')) {
        refinedBody = `${imageTags.join('\n\n')}\n\n${refinedBody}`;
      }

      const frontMatterLines = [
        '---',
        `title: ${JSON.stringify(refinedTitle)}`,
        `type: ${JSON.stringify(dto.type || 'task_result')}`,
        'status: "candidate"',
        `created_at: ${JSON.stringify(now.toISOString())}`,
        `tags: ${JSON.stringify(refinedTags)}`,
        'ai_refined: true',
        `folder_name: ${JSON.stringify(finalFolderName)}`,
        `assets: ${JSON.stringify(syncedArtifacts.map((a) => a.name))}`,
        'source:',
        '  channel: "chat"',
        `  session_id: ${JSON.stringify(dto.sessionId || '')}`,
        `  message_id: ${JSON.stringify(dto.messageId || '')}`,
        `  execution_id: ${JSON.stringify(dto.executionId || '')}`,
        `  skill_used: ${JSON.stringify(dto.skillUsed || '')}`,
        `ai_model: ${JSON.stringify(dto.aiModel || 'default')}`,
        '---',
        '',
      ];

      const bodySections: string[] = [];
      bodySections.push(`# ${refinedTitle}`);
      bodySections.push('');

      if (dto.userQuery && dto.userQuery.trim()) {
        bodySections.push('## 📌 提问背景');
        bodySections.push(`> ${dto.userQuery.trim()}`);
        bodySections.push('');
      }

      bodySections.push('## 💡 核心结论与 AI 归纳总结');
      bodySections.push(refinedBody);
      bodySections.push('');

      // 插入资产清单与同级文件跳转导航
      if (syncedArtifacts.length > 0) {
        const descMap = new Map<string, string>();
        if (Array.isArray(parsed.artifactsDescription)) {
          for (const item of parsed.artifactsDescription) {
            if (item && item.fileName && item.description) {
              descMap.set(String(item.fileName).trim(), String(item.description).trim());
            }
          }
        }

        bodySections.push('## 📁 交付资产与文件清单');
        bodySections.push('> 本成果文件夹内归集了以下生成的文件资产，可直接点击同级链接查阅：');
        bodySections.push('');
        bodySections.push('| 资产文件名 | 文件格式 | 资产内容说明 |');
        bodySections.push('| :--- | :--- | :--- |');
        for (const art of syncedArtifacts) {
          const desc = descMap.get(art.name) || this.formatDefaultArtifactDesc(art.name);
          const ext = path.extname(art.name).replace(/^\./, '').toUpperCase() || 'FILE';
          bodySections.push(`| [${art.name}](./${encodeURIComponent(art.name)}) | \`${ext}\` | ${desc} |`);
        }
        bodySections.push('');
      }

      if (dto.rawResultData) {
        bodySections.push('## 🔍 原始佐证与执行详情');
        bodySections.push('<details>');
        bodySections.push('<summary>展开查看原始结构化数据</summary>');
        bodySections.push('');
        bodySections.push('```json');
        bodySections.push(
          typeof dto.rawResultData === 'string'
            ? dto.rawResultData
            : JSON.stringify(dto.rawResultData, null, 2)
        );
        bodySections.push('```');
        bodySections.push('</details>');
        bodySections.push('');
      }

      bodySections.push('## 📝 知识核验与批注');
      bodySections.push('- [ ] 待人工确认准确性');
      bodySections.push('- 状态：专属文件夹已归档 (Candidate Package)');
      bodySections.push('');

      const newMarkdownText = `${frontMatterLines.join('\n')}\n${bodySections.join('\n')}`;
      const newBuffer = Buffer.from(newMarkdownText, 'utf-8');

      // 更新物理存储文件
      await this.storage.putFile(noteStorageKey, newBuffer);

      // 计算更专业的文件名
      const safeRefinedTitle = refinedTitle.replace(/[\\/:*?"<>|]/g, '_');
      const newFileName = `${safeRefinedTitle}.md`;

      // 提取目录 headings
      const headings = newMarkdownText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^#{1,4}\s+(.+)/.test(l))
        .map((l) => l.replace(/^#{1,4}\s+/, '').trim())
        .slice(0, 12);

      const charCount = newMarkdownText.length;
      const wordCount = newMarkdownText.split(/\s+/).filter(Boolean).length;
      const digest: WorkspaceFileDigest = {
        summary: refinedSummary || refinedTitle,
        headings: headings.length > 0 ? headings : [refinedTitle],
        keyTopics: refinedTags,
        charCount,
        wordCount,
        readingTimeMinutes: Math.max(1, Math.ceil(charCount / 500)),
        extractedAt: now.toISOString(),
        hasExtractedText: true,
        cleanedContent: refinedBody.slice(0, 600),
        cleanedByAi: true,
        aiModel: dto.aiModel || 'default',
      };

      // 更新数据库记录
      await this.prisma.workspaceNode.update({
        where: { id: noteNodeId },
        data: {
          name: newFileName,
          fileSize: BigInt(newBuffer.length),
          digestJson: digest as any,
        },
      });

      // 伴生落盘 digest
      try {
        await this.storage.putFile(
          `${noteStorageKey}.digest.json`,
          Buffer.from(JSON.stringify(digest, null, 2), 'utf-8')
        );
      } catch {
        // ignore
      }

      // 更新索引缓存
      await this.contentIndexer.cacheExtractedText(noteStorageKey, newMarkdownText);
      await this.digestService.generateAndSaveDigest(
        noteNodeId,
        noteStorageKey,
        newFileName,
        'text/markdown'
      );

      this.logger.log(`Completed AI refinement for note: ${noteNodeId} -> "${newFileName}"`);
    } catch (err: any) {
      this.logger.warn(`AI refinement background task failed for folder ${folderNodeId}: ${err.message}`);
    }
  }

  private async resolveUniqueFolderName(
    workspaceId: string,
    baseFolderId: string | null,
    currentFolderId: string,
    rawName: string,
    dateTag: string,
    title: string
  ): Promise<string> {
    let candidate = rawName.replace(/[\\/:*?"<>|]/g, '_').trim();

    // 确保以当前日期 YYYYMMDD 开头
    if (!candidate || !/^\d{8}_/.test(candidate)) {
      const cleanTitle = (candidate || title)
        .replace(/^\d{8}_?/, '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .trim();
      candidate = `${dateTag}_${cleanTitle || '会话成果归档'}`;
    }

    // 检查重名冲突
    let finalName = candidate;
    let index = 1;
    while (true) {
      const existing = await this.prisma.workspaceNode.findFirst({
        where: {
          workspaceId,
          parentId: baseFolderId,
          name: finalName,
          type: 'folder',
          id: { not: currentFolderId },
        },
      });
      if (!existing) {
        break;
      }
      finalName = `${candidate}_${String(index).padStart(2, '0')}`;
      index++;
    }

    return finalName;
  }

  private formatDefaultArtifactDesc(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case '.html':
      case '.htm':
        return '交互式网页原型 / 数据可视化报表';
      case '.docx':
      case '.doc':
        return '结构化 Word 业务分析报告';
      case '.xlsx':
      case '.xls':
      case '.csv':
        return '结构化数据明细报表';
      case '.pptx':
      case '.ppt':
        return '演示文稿幻灯片';
      case '.pdf':
        return '排版印刷交付文档 (PDF)';
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.svg':
        return '数据图表 / 界面快照截图';
      default:
        return '会话伴生交付资产';
    }
  }

  private parseAiJsonResponse(content: string): any {
    if (!content) return null;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}
