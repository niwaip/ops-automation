import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import axios from 'axios';
import {
  WORKBENCH_PRISMA,
  type WorkbenchPrismaPort,
  getAiOrchestratorUrl,
  getInternalServiceHeaders,
} from '../ports';
import { STORAGE_DRIVER, type StorageDriver } from './storage/storage-driver.interface';
import { WorkspaceContentIndexerService } from './workspace-content-indexer.service';
import type {
  WorkspaceFileDigest,
  RegenerateDigestDto,
  BatchRegenerateDigestDto,
  WorkspaceDigestStatsDto,
} from './dto/workspace.dto';
import { GENERIC_ACTION_TERMS } from './workspace-search-relevance.helper';

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上',
  '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
  '以及', '对于', '通过', '进行', '可以', '使用', '基于', '作为', '为了', '从而', '同时',
  '该', '其', '等', '之', '与', '由', '从', '及', '向', '对', '把', '被', '让', '使',
  'the', 'and', 'of', 'to', 'a', 'in', 'is', 'that', 'for', 'it', 'as', 'was', 'with',
  'be', 'by', 'on', 'not', 'he', 'at', 'this', 'are', 'from', 'or', 'an', 'we', 'they',
  'which', 'will', 'can', 'has', 'have', 'more', 'about', 'such', 'into', 'then', 'than',
]);

function cleanNullBytes<T>(obj: T): T {
  if (typeof obj === 'string') {
    return obj.replace(/\0/g, '') as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanNullBytes) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const res: any = {};
    for (const key of Object.keys(obj)) {
      res[key] = cleanNullBytes((obj as any)[key]);
    }
    return res;
  }
  return obj;
}

@Injectable()
export class WorkspaceDigestService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkspaceDigestService.name);

  constructor(
    @Inject(WORKBENCH_PRISMA) private readonly prisma: WorkbenchPrismaPort,
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
    _mimeType?: string | null
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

    // 4. 抽取关键主题标签 (Key Topics) 与特定业务指标事实 (Extracted Data)
    const keyTopics = this.extractKeyTopics(text, fileName);

    const extractedData: Record<string, any> = {};
    const FACT_PATTERNS = [
      { key: '预算', regex: /(?:预算|金额|总计|报价)[：:\s]+([0-9,.]+(?:元|万元|USD|RMB)?)/i },
      { key: '负责人', regex: /(?:负责人|联系人|责任人|指派人|经办人)[：:\s]+([^\r\n,，。；;\s]+)/ },
      { key: '验收口令', regex: /(?:验收口令|口令|校验码|密码|密钥)[：:\s]+([A-Za-z0-9\-_]{4,32})/ },
      { key: '截止日期', regex: /(?:截止日|截止日期|有效期限|交付时间)[：:\s]+([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2})/ },
      { key: '项目代号', regex: /(?:项目代号|项目编号|任务编号|编号)[：:\s]+([A-Za-z0-9\-_]{4,32})/ },
    ];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      for (const pattern of FACT_PATTERNS) {
        if (!extractedData[pattern.key]) {
          const match = line.match(pattern.regex);
          if (match && match[1]) {
            const val = match[1].trim();
            extractedData[pattern.key] = val;
            if (val.length >= 2 && !keyTopics.includes(val)) {
              keyTopics.unshift(val);
            }
          }
        }
      }
    }

    // 5. 组装高信息密度精炼正文 (cleanedContent，保留全部有效正文段落，最大 32KB，杜绝正文关键事实在非 AI 模式下丢失)
    const cleanedContent = (paragraphs.length > 0 ? paragraphs.join('\n') : text).slice(0, 32000);

    return {
      summary: summary || '（文档内容精简，未包含足够段落描述）',
      keyTopics: keyTopics.slice(0, 32),
      headings: headings.slice(0, 16),
      charCount,
      wordCount,
      readingTimeMinutes,
      extractedAt: new Date().toISOString(),
      hasExtractedText: true,
      cleanedContent: cleanedContent || summary || undefined,
      extractedData: Object.keys(extractedData).length > 0 ? extractedData : null,
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
      const lower = seg.toLowerCase();
      if (!STOP_WORDS.has(lower) && !GENERIC_ACTION_TERMS.has(lower) && !GENERIC_ACTION_TERMS.has(seg)) {
        topicsMap.set(seg, 20); // 高权重
      }
    }

    // 匹配复合标识符与专业英文名词 (如 SWE-CI, AD-Q8VN-6173, RAG, API, Docker, Agent)
    const identifiers = text.match(/\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+\b|\b[A-Z]{2,}\b/g) || [];
    for (const id of identifiers) {
      const lower = id.toLowerCase();
      if (id.length >= 2 && id.length <= 32 && !STOP_WORDS.has(lower) && !GENERIC_ACTION_TERMS.has(lower)) {
        topicsMap.set(id, (topicsMap.get(id) || 0) + 4);
      }
    }

    // 匹配中文关键词（2~6 个汉字的名词短语，过滤通用操作词）
    const chineseWords = text.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
    for (const word of chineseWords) {
      if (word.length >= 2 && !STOP_WORDS.has(word) && !GENERIC_ACTION_TERMS.has(word)) {
        topicsMap.set(word, (topicsMap.get(word) || 0) + 1);
      }
    }

    // 按频次排序并过滤
    const sorted = Array.from(topicsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);

    // 保持最多 32 个不重复的核心标签（保留重要业务复合代号与专有实体）
    const uniqueTopics: string[] = [];
    for (const item of sorted) {
      if (!uniqueTopics.some((existing) => existing.toLowerCase() === item.toLowerCase() || existing.includes(item) || item.includes(existing))) {
        uniqueTopics.push(item);
        if (uniqueTopics.length >= 32) break;
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

    const sanitizedDigest = cleanNullBytes(digest);

    // 1. 伴生落盘: ${storagePath}.digest.json
    try {
      const digestKey = `${storagePath}.digest.json`;
      await this.storage.putFile(digestKey, Buffer.from(JSON.stringify(sanitizedDigest, null, 2), 'utf-8'));
    } catch (err: any) {
      this.logger.warn(`Failed to write digest file for ${storagePath}: ${err.message}`);
    }

    // 2. 数据库落盘
    try {
      await this.prisma.workspaceNode.update({
        where: { id: nodeId },
        data: {
          digestJson: sanitizedDigest as any,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to update workspaceNode digestJson in DB: ${err.message}`);
    }

    return sanitizedDigest;
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
        '请在 extractedData 中返回结构化键值对或对象，在 summary 中给出要点总结。',
      ].filter(Boolean).join('\n');
    } else if (mode === 'custom' && customPrompt) {
      systemTaskPrompt = [
        '【任务模式：自定义清洗指令】',
        `用户指定的特别清洗与提炼要求：${customPrompt}`,
      ].join('\n');
    } else {
      systemTaskPrompt = [
        '【任务模式：企业知识库文档深度AI清洗、关键实体提炼与核心数据抽取】',
        '目标要求：',
        '1. 深度去噪：去除分页符、无意义格式排版符号、冗长客套话与重复页眉页脚；',
        '2. 提取高价值核心标签（keyTopics）：提炼5~8个高信息熵、领域专有的实体或技术/业务代号。严禁提取无区分度的动作词或通用词（如“安装”、“使用”、“说明”、“教程”、“指南”、“部署”、“配置”等），优先提取具体系统名称、专有代号、规范名、专有名词；',
        '3. 提取结构化核心事实（extractedData）：提取文档中出现的关键业务参数与事实（如：预算金额、负责人、验收口令/密码、交付截止时间、项目代号、服务端口/端点、核心配置参数），以清晰的键值对形式存储；若无明确结构化数据则设为 null；',
        '4. 精炼高密度正文（cleanedContent）：生成200~800字的信息高密度正文，保留核心逻辑、关键决策依据、核心指标与操作规程，以便知识检索系统直接作为精准知识片段引用；',
        '5. 执行摘要（summary）：150~300字的业务执行摘要，突出核心结论与价值。',
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
      '  "keyTopics": ["核心专有实体标签1", "核心专有实体标签2", "核心专有实体标签3", "核心专有实体标签4"],',
      '  "headings": ["第1章 概述", "第2章 架构设计", ...],',
      '  "cleanedContent": "清洗去噪后的高信息密度精要正文（200~800字，保留最重要规程、结论与事实）",',
      '  "extractedData": { /* 提取的关键业务数据键值对，若无则设为 null */ }',
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
        {
          timeout: 90000,
          headers: getInternalServiceHeaders(),
        }
      );

      const reply = String(response.data?.response || '').trim();
      const parsed = this.parseAiJsonResponse(reply);
      if (parsed && typeof parsed === 'object') {
        const charCount = text.length;
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        const readingTimeMinutes = Math.max(1, Math.ceil(charCount / 500));

        // 启发式兜底数据，用于事实数据合并
        const heuristicDigest = this.extractDigestFromText(text, fileName, mimeType);

        // 过滤 keyTopics 中的通用动作词与停用词
        let rawTopics: string[] = [];
        if (Array.isArray(parsed.keyTopics) && parsed.keyTopics.length > 0) {
          rawTopics = parsed.keyTopics.map(String);
        } else {
          rawTopics = heuristicDigest.keyTopics;
        }

        const filteredTopics = rawTopics
          .map((t) => t.trim())
          .filter((t) => {
            const lower = t.toLowerCase();
            return (
              t.length >= 2 &&
              !STOP_WORDS.has(lower) &&
              !GENERIC_ACTION_TERMS.has(lower) &&
              !GENERIC_ACTION_TERMS.has(t)
            );
          })
          .slice(0, 8);

        // 深度合并结构化事实数据（AI 提取与规则模式提取互补）
        const mergedExtractedData: Record<string, any> = {
          ...(heuristicDigest.extractedData || {}),
        };
        if (parsed.extractedData && typeof parsed.extractedData === 'object' && !Array.isArray(parsed.extractedData)) {
          for (const [k, v] of Object.entries(parsed.extractedData)) {
            if (v !== null && v !== undefined && String(v).trim()) {
              mergedExtractedData[k] = v;
            }
          }
        }

        return {
          summary: parsed.summary || heuristicDigest.summary,
          keyTopics: filteredTopics.length > 0 ? filteredTopics : heuristicDigest.keyTopics,
          headings:
            Array.isArray(parsed.headings) && parsed.headings.length > 0
              ? parsed.headings.map(String).slice(0, 15)
              : heuristicDigest.headings,
          charCount,
          wordCount,
          readingTimeMinutes,
          extractedAt: new Date().toISOString(),
          hasExtractedText: true,
          cleanedContent:
            typeof parsed.cleanedContent === 'string' && parsed.cleanedContent.trim().length > 0
              ? parsed.cleanedContent.trim()
              : undefined,
          extractedData: Object.keys(mergedExtractedData).length > 0 ? mergedExtractedData : null,
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

  /**
   * 统计工作空间内文档的 AI 清洗与卡片覆盖情况
   */
  public async getDigestStats(workspaceId: string): Promise<WorkspaceDigestStatsDto> {
    const tempFolders = await this.prisma.workspaceNode.findMany({
      where: {
        workspaceId,
        type: 'folder',
        OR: [
          { name: { contains: 'temp', mode: 'insensitive' } },
          { name: { contains: '临时工作区' } },
        ],
      },
      select: { id: true },
    });
    const tempFolderIds = new Set(tempFolders.map((f: any) => f.id));

    const files = await this.prisma.workspaceNode.findMany({
      where: { workspaceId, type: 'file' },
      select: { id: true, parentId: true, digestJson: true },
    });

    const validFiles =
      tempFolderIds.size > 0
        ? files.filter((f: any) => !f.parentId || !tempFolderIds.has(f.parentId))
        : files;

    const totalFiles = validFiles.length;
    let aiCleanedFiles = 0;
    let ruleDigestFiles = 0;
    let noDigestFiles = 0;

    for (const f of validFiles) {
      if (!f.digestJson) {
        noDigestFiles++;
      } else if ((f.digestJson as any)?.cleanedByAi) {
        aiCleanedFiles++;
      } else {
        ruleDigestFiles++;
      }
    }

    const coveragePercent =
      totalFiles > 0 ? Math.round((aiCleanedFiles / totalFiles) * 100) : 100;

    return {
      totalFiles,
      aiCleanedFiles,
      ruleDigestFiles,
      noDigestFiles,
      coveragePercent,
    };
  }

  /**
   * 批量调用重新生成文档结构化摘要卡片 / AI 批量与全量清洗
   */
  public async batchRegenerateDigest(
    workspaceId: string,
    nodeIds: string[] | undefined,
    options?: BatchRegenerateDigestDto
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: Array<{ nodeId: string; name: string; success: boolean; error?: string }>;
  }> {
    const tempFolders = await this.prisma.workspaceNode.findMany({
      where: {
        workspaceId,
        type: 'folder',
        OR: [
          { name: { contains: 'temp', mode: 'insensitive' } },
          { name: { contains: '临时工作区' } },
        ],
      },
      select: { id: true },
    });
    const tempFolderIds = new Set(tempFolders.map((f: any) => f.id));

    const scope = options?.scope || (nodeIds && nodeIds.length > 0 ? 'selected' : 'all');
    const whereCondition: any = { workspaceId, type: 'file' };

    if (scope === 'selected' && nodeIds && nodeIds.length > 0) {
      whereCondition.id = { in: nodeIds };
    } else if (scope === 'folder' && options?.folderId) {
      whereCondition.parentId = options.folderId;
    }

    let nodes = await this.prisma.workspaceNode.findMany({
      where: whereCondition,
    });

    if (tempFolderIds.size > 0 && scope !== 'selected') {
      nodes = nodes.filter((n: any) => !n.parentId || !tempFolderIds.has(n.parentId));
    }

    if (scope === 'uncleaned') {
      nodes = nodes.filter((n: any) => !n.digestJson || !(n.digestJson as any)?.cleanedByAi);
    }

    const results: Array<{ nodeId: string; name: string; success: boolean; error?: string }> = [];
    let successful = 0;
    let failed = 0;

    const CONCURRENCY = 3;
    for (let i = 0; i < nodes.length; i += CONCURRENCY) {
      const chunk = nodes.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (node: any) => {
          if (!node.storagePath) {
            results.push({ nodeId: node.id, name: node.name, success: false, error: '无存储路径' });
            failed++;
            return;
          }
          try {
            const digest = await this.generateAndSaveDigest(
              node.id,
              node.storagePath,
              node.name,
              node.mimeType,
              options
            );
            if (!digest) {
              results.push({ nodeId: node.id, name: node.name, success: false, error: '文本提取返回空或格式不受支持' });
              failed++;
              return;
            }
            results.push({ nodeId: node.id, name: node.name, success: true });
            successful++;
          } catch (err: any) {
            results.push({ nodeId: node.id, name: node.name, success: false, error: err.message });
            failed++;
          }
        })
      );
    }

    return {
      total: nodes.length,
      successful,
      failed,
      results,
    };
  }
}
