import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import { STORAGE_DRIVER, type StorageDriver } from './storage/storage-driver.interface';
import { WorkspaceContentIndexerService } from './workspace-content-indexer.service';
import type { WorkspaceFileDigest, RegenerateDigestDto } from './dto/workspace.dto';

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上',
  '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
  '以及', '对于', '通过', '进行', '可以', '使用', '基于', '作为', '为了', '从而', '同时',
  '该', '其', '等', '之', '与', '由', '从', '及', '向', '对', '把', '被', '让', '使',
  'the', 'and', 'of', 'to', 'a', 'in', 'is', 'that', 'for', 'it', 'as', 'was', 'with',
  'be', 'by', 'on', 'not', 'he', 'at', 'this', 'are', 'from', 'or', 'an', 'we', 'they',
  'which', 'will', 'can', 'has', 'have', 'more', 'about', 'such', 'into', 'then', 'than',
]);

@Injectable()
export class WorkspaceDigestService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkspaceDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    private readonly contentIndexer: WorkspaceContentIndexerService
  ) {}

  /**
   * 应用启动后异步扫描未建立卡片的文件并自动补齐
   */
  async onApplicationBootstrap() {
    setTimeout(() => {
      void this.backfillExistingDigests();
    }, 2000);
  }

  /**
   * 后台静默补齐所有存量文件的结构化摘要卡片
   */
  public async backfillExistingDigests(): Promise<void> {
    try {
      const pendingNodes = await this.prisma.$queryRaw<
        Array<{ id: string; name: string; storage_path: string; mime_type: string | null }>
      >`SELECT id, name, storage_path, mime_type FROM workspace_nodes WHERE type = 'file' AND storage_path IS NOT NULL AND digest_json IS NULL LIMIT 50;`;

      if (!pendingNodes || pendingNodes.length === 0) {
        return;
      }

      this.logger.log(`Found ${pendingNodes.length} files without digest. Starting background digestion...`);
      for (const node of pendingNodes) {
        if (!node.storage_path) continue;
        await this.generateAndSaveDigest(
          node.id,
          node.storage_path,
          node.name,
          node.mime_type
        ).catch((err) => {
          this.logger.warn(`Failed to auto-digest ${node.name}: ${err.message}`);
        });
      }
      this.logger.log(`Completed background digestion for ${pendingNodes.length} files.`);
    } catch (err: any) {
      this.logger.warn(`Backfill digests encountered error: ${err.message}`);
    }
  }

  /**
   * 从纯文本内容中提取结构化摘要卡片
   */
  public extractDigestFromText(
    text: string,
    fileName: string,
    mimeType?: string | null
  ): WorkspaceFileDigest {
    const lines = text.split(/\r?\n/);
    const headings: string[] = [];
    const paragraphs: string[] = [];

    // 1. 抽取大纲标题与有效段落
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // 匹配 Markdown 标题或分级标题
      if (/^#{1,4}\s+(.+)/.test(line)) {
        const title = line.replace(/^#{1,4}\s+/, '').trim();
        if (title && headings.length < 12) headings.push(title);
        continue;
      }
      if (/^(?:[0-9一二三四五六七八九十]+[、.．]|\([0-9一二三四五六七八九十]+\))\s*(.+)/.test(line)) {
        if (line.length <= 40 && headings.length < 12) {
          headings.push(line);
          continue;
        }
      }

      // 收集正文段落
      if (line.length > 20 && !line.startsWith('---') && !line.startsWith('```')) {
        paragraphs.push(line);
      }
    }

    // 2. 提取 Executive Summary (100~200 字精简摘要)
    let summary = '';
    for (const p of paragraphs) {
      const cleanP = p.replace(/[*_`[\]]/g, '').trim();
      if (cleanP.length >= 25) {
        summary += (summary ? ' ' : '') + cleanP;
        if (summary.length >= 160) break;
      }
    }
    if (!summary && lines.length > 0) {
      summary = lines.slice(0, 5).join(' ').replace(/[*_`[\]]/g, '').trim();
    }
    if (summary.length > 220) {
      summary = summary.slice(0, 215) + '...';
    }

    // 3. 统计指标
    const charCount = text.length;
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const readingTimeMinutes = Math.max(1, Math.ceil(charCount / 500));

    // 4. 抽取关键主题标签 (Key Topics)
    const keyTopics = this.extractKeyTopics(text, fileName);

    return {
      summary: summary || '（文档内容精简，未包含足够段落描述）',
      keyTopics,
      headings: headings.slice(0, 10),
      charCount,
      wordCount,
      readingTimeMinutes,
      extractedAt: new Date().toISOString(),
      hasExtractedText: true,
    };
  }

  /**
   * 抽取高频核心主题关键词 / 领域实体
   */
  private extractKeyTopics(text: string, fileName: string): string[] {
    const topicsMap = new Map<string, number>();

    // 优先将文件名中显著词纳入候选（去掉扩展名与前缀 uuid）
    const cleanFileName = fileName.replace(/^[0-9a-fA-F-]{36}_/, '').replace(/\.[^.]+$/, '');
    const fileNameSegments = cleanFileName.split(/[-_.\s]+/).filter((s) => s.length >= 2);
    for (const seg of fileNameSegments) {
      if (!STOP_WORDS.has(seg.toLowerCase())) {
        topicsMap.set(seg, 20); // 高权重
      }
    }

    // 匹配大写缩写与专业英文名词 (如 SWE-CI, RAG, API, Docker, Agent)
    const acronyms = text.match(/\b[A-Z]{2,}(?:-[A-Za-z0-9]+)?\b/g) || [];
    for (const ac of acronyms) {
      if (ac.length >= 2 && ac.length <= 15 && !STOP_WORDS.has(ac.toLowerCase())) {
        topicsMap.set(ac, (topicsMap.get(ac) || 0) + 3);
      }
    }

    // 匹配中文关键词（2~6 个汉字的名词短语）
    const chineseWords = text.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
    for (const word of chineseWords) {
      if (word.length >= 2 && !STOP_WORDS.has(word)) {
        topicsMap.set(word, (topicsMap.get(word) || 0) + 1);
      }
    }

    // 按频次排序并过滤
    const sorted = Array.from(topicsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);

    // 保持最多 6 个不重复的核心标签
    const uniqueTopics: string[] = [];
    for (const item of sorted) {
      if (!uniqueTopics.some((existing) => existing.includes(item) || item.includes(existing))) {
        uniqueTopics.push(item);
        if (uniqueTopics.length >= 6) break;
      }
    }

    return uniqueTopics;
  }

  /**
   * 为指定文件生成结构化卡片并持久化（磁盘伴生文件 + 数据库）
   */
  public async generateAndSaveDigest(
    nodeId: string,
    storagePath: string,
    fileName: string,
    mimeType?: string | null,
    options?: RegenerateDigestDto
  ): Promise<WorkspaceFileDigest | null> {
    const text = await this.contentIndexer.getExtractedText(storagePath, fileName, mimeType);
    if (!text) {
      return null;
    }

    let digest: WorkspaceFileDigest;
    if (options?.useAi) {
      digest = await this.extractDigestWithAi(text, fileName, mimeType, options);
    } else {
      digest = this.extractDigestFromText(text, fileName, mimeType);
    }

    // 1. 伴生落盘: ${storagePath}.digest.json
    try {
      const digestKey = `${storagePath}.digest.json`;
      await this.storage.putFile(digestKey, Buffer.from(JSON.stringify(digest, null, 2), 'utf-8'));
    } catch (err: any) {
      this.logger.warn(`Failed to write digest file for ${storagePath}: ${err.message}`);
    }

    // 2. 数据库落盘
    try {
      await this.prisma.workspaceNode.update({
        where: { id: nodeId },
        data: {
          digestJson: digest as any,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to update workspaceNode digestJson in DB: ${err.message}`);
    }

    return digest;
  }

  /**
   * 使用大模型进行深度数据清洗、结构化摘要与特定数据提取
   */
  public async extractDigestWithAi(
    text: string,
    fileName: string,
    mimeType?: string | null,
    options?: RegenerateDigestDto
  ): Promise<WorkspaceFileDigest> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const mode = options?.extractMode || 'clean_summary';
    const customPrompt = (options?.promptInstructions || '').trim();

    // 截取前 24000 个字符保证在大模型上下文容纳范围内
    const sampleText = text.length > 24000 ? `${text.slice(0, 24000)}\n\n...(后文略)...` : text;

    let systemTaskPrompt = '';
    if (mode === 'extract_data') {
      systemTaskPrompt = [
        '【任务模式：特定业务数据抽取与结构化清洗】',
        '请从文档中提取出关键实体与特定数据（如业务指标、配置参数、IP与端口、账户人员、联系方式、流程规范等）。',
        customPrompt ? `特别抽取需求：${customPrompt}` : '',
        '请在 extractedData 中返回结构化键值对或对象数组，在 summary 中给出要点总结。',
      ].filter(Boolean).join('\n');
    } else if (mode === 'custom' && customPrompt) {
      systemTaskPrompt = [
        '【任务模式：自定义清洗指令】',
        `用户指定的特别清洗与提炼要求：${customPrompt}`,
      ].join('\n');
    } else {
      systemTaskPrompt = [
        '【任务模式：企业文档深度清洗与摘要】',
        '请对文档进行深度去噪（去除分页符、格式乱码、版权与重复页眉页脚），提炼出高业务浓度的执行摘要、核心关键词标签及章节层级目录。',
        customPrompt ? `补充要求：${customPrompt}` : '',
      ].filter(Boolean).join('\n');
    }

    const prompt = [
      '你是一个专业的企业知识库数据清洗与提炼专家。',
      systemTaskPrompt,
      `文件名：${fileName}`,
      '【文档正文开始】',
      sampleText,
      '【文档正文结束】',
      '',
      '请严格输出合法 JSON（不要输出 markdown 代码块以外的额外废话），JSON 结构定义如下：',
      '{',
      '  "summary": "150~300字的精简业务执行摘要，突出核心结论与价值",',
      '  "keyTopics": ["核心标签1", "核心标签2", "核心标签3", "核心标签4"],',
      '  "headings": ["第1章 概述", "第2章 架构设计", ...],',
      '  "cleanedContent": "清洗去噪后的核心精要正文（200~600字，保留最重要规程与关键结论）",',
      '  "extractedData": { /* 提取的关键数据键值对或列表，无则设为 null */ }',
      '}',
    ].join('\n\n');

    try {
      const response = await axios.post<{ response?: string }>(
        `${aiOrchestratorUrl}/ai/chat`,
        {
          message: prompt,
          modelId: options?.modelId || 'default',
          config: { mode: 'chat' },
        },
        { timeout: 90000 }
      );

      const reply = String(response.data?.response || '').trim();
      const parsed = this.parseAiJsonResponse(reply);
      if (parsed && typeof parsed === 'object') {
        const charCount = text.length;
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        const readingTimeMinutes = Math.max(1, Math.ceil(charCount / 500));

        return {
          summary: parsed.summary || this.extractDigestFromText(text, fileName, mimeType).summary,
          keyTopics:
            Array.isArray(parsed.keyTopics) && parsed.keyTopics.length > 0
              ? parsed.keyTopics.map(String).slice(0, 10)
              : this.extractKeyTopics(text, fileName),
          headings:
            Array.isArray(parsed.headings) && parsed.headings.length > 0
              ? parsed.headings.map(String).slice(0, 15)
              : this.extractDigestFromText(text, fileName, mimeType).headings,
          charCount,
          wordCount,
          readingTimeMinutes,
          extractedAt: new Date().toISOString(),
          hasExtractedText: true,
          cleanedContent:
            typeof parsed.cleanedContent === 'string' ? parsed.cleanedContent : undefined,
          extractedData: parsed.extractedData || null,
          cleanedByAi: true,
          aiModel: options?.modelId || 'default',
          cleanPrompt: customPrompt || undefined,
        };
      }
    } catch (err: any) {
      this.logger.warn(
        `AI digest extraction failed for ${fileName}: ${err.message}. Falling back to heuristic.`
      );
    }

    // 优雅降级到启发式规则提取
    const fallback = this.extractDigestFromText(text, fileName, mimeType);
    return {
      ...fallback,
      cleanedByAi: false,
      cleanedContent: `（AI 清洗未能成功响应，已降级为规则启发式摘要）`,
    };
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
