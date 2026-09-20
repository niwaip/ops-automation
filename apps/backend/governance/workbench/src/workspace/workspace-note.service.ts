import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort, getAiOrchestratorUrl, isContainerRuntime } from '../ports';
import { STORAGE_DRIVER, type StorageDriver } from './storage/storage-driver.interface';
import { WorkspaceContentIndexerService } from './workspace-content-indexer.service';
import { WorkspaceDigestService } from './workspace-digest.service';
import type { SaveTextNoteDto, WorkspaceNodeDto, WorkspaceFileDigest } from './dto/workspace.dto';

@Injectable()
export class WorkspaceNoteService {
  private readonly logger = new Logger(WorkspaceNoteService.name);

  constructor(
    @Inject(WORKBENCH_PRISMA) private readonly prisma: WorkbenchPrismaPort,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    private readonly contentIndexer: WorkspaceContentIndexerService,
    private readonly digestService: WorkspaceDigestService
  ) {}

  /**
   * 将文本/AI对话产物以带 FrontMatter 的结构化 Markdown 形式保存到工作空间（默认用户个人空间）
   */
  public async saveTextNote(
    userId: string,
    dto: SaveTextNoteDto,
    departmentId?: string,
    userRoles: string[] = []
  ): Promise<WorkspaceNodeDto> {
    if (!dto.title || !dto.title.trim()) {
      throw new BadRequestException('文档标题不能为空');
    }
    if (!dto.content || !dto.content.trim()) {
      throw new BadRequestException('文档内容不能为空');
    }

    // 1. 确定目标工作空间（默认个人空间）
    let workspace: any;
    if (dto.workspaceId) {
      workspace = await this.prisma.workspace.findUnique({
        where: { id: dto.workspaceId },
      });
      if (!workspace) {
        throw new NotFoundException('指定的工作空间不存在');
      }
      this.assertWorkspaceAccess(workspace, userId, departmentId, userRoles);
    } else {
      workspace = await this.prisma.workspace.findFirst({
        where: { type: 'personal', ownerUserId: userId },
      });
      if (!workspace) {
        workspace = await this.prisma.workspace.create({
          data: {
            name: '我的空间',
            type: 'personal',
            ownerUserId: userId,
          },
        });
        this.logger.log(`Created personal workspace for user: ${userId}`);
      }
    }

    // 2. 确定保存目录（工作模式默认为 "工作任务成果 (tasks)"，个人模式默认为 "沙盒保存内容 (saved)"）
    const now = new Date();
    const isTaskMode = dto.type === 'task_result' || Boolean(dto.executionId);
    const defaultFolder = isTaskMode ? '工作任务成果 (tasks)' : '沙盒保存内容 (saved)';
    const rawFolderPath = (dto.folderPath && dto.folderPath.trim()) || defaultFolder;
    const folderSegments = rawFolderPath
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);

    let currentParentId: string | null = null;
    for (const segment of folderSegments) {
      let folderNode: any = await this.prisma.workspaceNode.findFirst({
        where: {
          workspaceId: workspace.id,
          parentId: currentParentId,
          name: segment,
          type: 'folder',
        },
      });

      if (!folderNode) {
        folderNode = await this.prisma.workspaceNode.create({
          data: {
            workspaceId: workspace.id,
            parentId: currentParentId,
            name: segment,
            type: 'folder',
            createdBy: userId,
          },
        });
      }
      currentParentId = folderNode.id;
    }

    // 3. 构建带 FrontMatter 的结构化 Markdown 内容
    const markdownContent = this.buildStructuredMarkdown(dto, now);
    const fileBuffer = Buffer.from(markdownContent, 'utf-8');
    const fileSize = BigInt(fileBuffer.length);

    // 4. 检查工作空间配额
    const nextUsedBytes = BigInt(workspace.usedBytes) + fileSize;
    if (nextUsedBytes > BigInt(workspace.quotaBytes)) {
      throw new BadRequestException('工作空间存储配额已满，无法保存文档');
    }

    // 5. 确定唯一文件名
    const safeTitle = dto.title.trim().replace(/[\\/:*?"<>|]/g, '_');
    const baseFileName = safeTitle.toLowerCase().endsWith('.md') ? safeTitle : `${safeTitle}.md`;
    let finalFileName = baseFileName;

    const existingFile = await this.prisma.workspaceNode.findFirst({
      where: {
        workspaceId: workspace.id,
        parentId: currentParentId,
        name: finalFileName,
      },
    });

    if (existingFile) {
      const createdRecently = Math.abs(now.getTime() - new Date(existingFile.createdAt).getTime()) < 300_000;
      if (createdRecently && existingFile.fileSize === fileSize) {
        this.logger.log(
          `Duplicate note detected within 5 minutes for "${finalFileName}", returning existing node: ${existingFile.id}`
        );
        return this.toNodeDto(existingFile);
      }
      const timeTag = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const nameWithoutExt = baseFileName.replace(/\.md$/i, '');
      finalFileName = `${nameWithoutExt}_${timeTag}.md`;
    }

    // 6. 物理落盘与数据库记录
    const nodeId = randomUUID();
    const storageKey = `${workspace.type}/${workspace.id}/${nodeId}_${finalFileName}`;

    await this.storage.putFile(storageKey, fileBuffer);

    const node = await this.prisma.workspaceNode.create({
      data: {
        id: nodeId,
        workspaceId: workspace.id,
        parentId: currentParentId,
        name: finalFileName,
        type: 'file',
        fileSize,
        mimeType: 'text/markdown',
        storagePath: storageKey,
        createdBy: userId,
      },
    });

    // 7. 更新已用空间配额
    await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: { usedBytes: nextUsedBytes },
    });

    // 自动关联同步正文与沙箱中引用的成果物（HTML应用、图表、文档、图片）至相同工作区目录及沙箱知识库
    try {
      await this.syncReferencedArtifactsToWorkspace(userId, workspace, currentParentId, dto);
    } catch (err: any) {
      this.logger.warn(`Failed to sync companion artifacts: ${err.message}`);
    }

    // 8. 异步触发纯文本索引与卡片提取
    this.contentIndexer
      .extractText(fileBuffer, finalFileName, 'text/markdown')
      .then(async (extractedText) => {
        if (extractedText) {
          await this.contentIndexer.cacheExtractedText(storageKey, extractedText);
          await this.digestService.generateAndSaveDigest(
            nodeId,
            storageKey,
            finalFileName,
            'text/markdown'
          );
        }
      })
      .catch((err) => {
        this.logger.warn(`Background text indexing/digesting failed for ${finalFileName}: ${err.message}`);
      });

    // 9. 异步唤起大模型自动深度提炼与重构（无感异步）
    setImmediate(() => {
      this.refineNoteWithAi(
        nodeId,
        storageKey,
        finalFileName,
        dto,
        userId
      ).catch((err) => {
        this.logger.warn(`Background AI refinement failed for ${finalFileName}: ${err.message}`);
      });
    });

    return this.toNodeDto(node);
  }

  /**
   * 构造标准 YAML FrontMatter 与分块正文
   */
  private buildStructuredMarkdown(dto: SaveTextNoteDto, date: Date): string {
    const rawContent = dto.content.trim();

    // 如果用户传入的内容已经自带 FrontMatter，则直接使用
    if (rawContent.startsWith('---')) {
      return rawContent;
    }

    const tags = Array.isArray(dto.tags) && dto.tags.length > 0
      ? dto.tags.map((t) => String(t).trim()).filter(Boolean)
      : ['AI沉淀', '知识候选'];

    const frontMatterLines = [
      '---',
      `title: ${JSON.stringify(dto.title.trim())}`,
      `type: ${JSON.stringify(dto.type || 'task_result')}`,
      'status: "candidate"',
      `created_at: ${JSON.stringify(date.toISOString())}`,
      `tags: ${JSON.stringify(tags)}`,
      'source:',
      '  channel: "chat"',
      `  session_id: ${JSON.stringify(dto.sessionId || '')}`,
      `  message_id: ${JSON.stringify(dto.messageId || '')}`,
      `  execution_id: ${JSON.stringify(dto.executionId || '')}`,
      `  skill_used: ${JSON.stringify(dto.skillUsed || '')}`,
      `ai_model: ${JSON.stringify(dto.aiModel || '')}`,
      '---',
      '',
    ];

    const bodySections: string[] = [];

    // 一级主标题
    bodySections.push(`# ${dto.title.trim()}`);
    bodySections.push('');

    // 用户提问背景
    if (dto.userQuery && dto.userQuery.trim()) {
      bodySections.push('## 📌 提问背景');
      bodySections.push(`> ${dto.userQuery.trim()}`);
      bodySections.push('');
    }

    // 核心结论 / AI 回复内容
    if (!rawContent.startsWith('#')) {
      bodySections.push('## 💡 核心结论与 AI 总结');
    }
    bodySections.push(rawContent);
    bodySections.push('');

    // 原始结构化数据佐证（若存在）
    if (dto.rawResultData) {
      bodySections.push('## 🔍 原始佐证与执行详情');
      bodySections.push('<details>');
      bodySections.push('<summary>展开查看原始结构化数据</summary>');
      bodySections.push('');
      bodySections.push('```json');
      try {
        const jsonText =
          typeof dto.rawResultData === 'string'
            ? JSON.stringify(JSON.parse(dto.rawResultData), null, 2)
            : JSON.stringify(dto.rawResultData, null, 2);
        bodySections.push(jsonText);
      } catch {
        bodySections.push(String(dto.rawResultData));
      }
      bodySections.push('```');
      bodySections.push('</details>');
      bodySections.push('');
    }

    // 人工核验与批注
    bodySections.push('## 📝 知识核验与批注');
    bodySections.push('- [ ] 待人工确认准确性');
    bodySections.push('- 状态：个人知识候选 (Candidate)');
    bodySections.push('');

    return `${frontMatterLines.join('\n')}\n${bodySections.join('\n')}`;
  }

  /**
   * 鉴权检查
   */
  private assertWorkspaceAccess(
    workspace: any,
    userId: string,
    departmentId?: string,
    userRoles: string[] = []
  ): void {
    const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin');
    if (workspace.type === 'personal') {
      if (workspace.ownerUserId !== userId && !isAdmin) {
        throw new ForbiddenException('您无权向他人的个人空间写入文件');
      }
    } else if (workspace.type === 'department') {
      if (!departmentId || workspace.departmentId !== departmentId) {
        if (!isAdmin) {
          throw new ForbiddenException('您无权向非本部门空间写入文件');
        }
      }
    }
  }

  /**
   * 后台异步唤起 LLM 进行知识自动提炼与归档重构
   */
  public async refineNoteWithAi(
    nodeId: string,
    storageKey: string,
    currentFileName: string,
    dto: SaveTextNoteDto,
    userId: string
  ): Promise<void> {
    try {
      this.logger.log(`Starting background AI refinement for note: ${nodeId} (${currentFileName})`);
      const aiOrchestratorUrl = getAiOrchestratorUrl();

      const userQuestion = dto.userQuery?.trim() || '（用户未显式提问）';
      const rawContent = dto.content.trim();
      const rawDataText = dto.rawResultData
        ? typeof dto.rawResultData === 'string'
          ? dto.rawResultData
          : JSON.stringify(dto.rawResultData, null, 2)
        : null;

      const prompt = [
        '你是一个企业级 AI 智能运维与专家知识资产工程师。',
        '请根据以下对话提问、AI 答复及底层原始执行数据，将其自动提炼整理为高质量的企业知识候选文档（Markdown 格式）：',
        '',
        `【用户原始提问】: ${userQuestion}`,
        '',
        '【AI 回答与分析】:',
        rawContent,
        '',
        rawDataText ? `【底层原始执行数据】:\n${rawDataText.slice(0, 8000)}` : '',
        '',
        '请严格输出合法 JSON（不要输出 markdown 代码块以外的冗余文本），JSON 结构定义如下：',
        '{',
        '  "title": "高度凝练、结构清晰的中文文档标题（不超过 30 个字，包含关键实体与事件，如：2026-09-04 上海实时气温与午后阵雨出行指南）",',
        '  "tags": ["3~6个精准分类标签，如天气预报、生活出行、上海等"],',
        '  "summary": "150~250字的高浓度业务与运维执行摘要",',
        '  "refinedContent": "清洗去噪、层级分明的结构化 Markdown 正文（包含核心结论、关键细节与实操建议，不要包含一级标题，使用 ## 与 ### 分块。若原文包含图片语法 ![...](...)，请务必在正文相应位置原样保留完整的图片引用语法，严禁丢弃图片！）"',
        '}',
      ].filter(Boolean).join('\n\n');

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
        this.logger.warn(`AI refinement returned invalid JSON structure for ${nodeId}, keeping baseline note.`);
        return;
      }

      const refinedTitle = String(parsed.title).trim();
      const refinedTags = Array.isArray(parsed.tags) && parsed.tags.length > 0
        ? parsed.tags.map(String).slice(0, 6)
        : (dto.tags || ['AI沉淀', '知识候选']);
      const refinedSummary = String(parsed.summary || '').trim();
      let refinedBody = String(parsed.refinedContent).trim();

      // 提取原文中的所有图片标签，确保 AI 提炼时绝不丢失任何视觉素材
      const imageTags: string[] = [];
      const imgMatchRegex = /!\[(.*?)\]\((.*?)\)/g;
      let m: RegExpExecArray | null;
      while ((m = imgMatchRegex.exec(rawContent)) !== null) {
        imageTags.push(m[0]);
      }
      if (imageTags.length > 0 && !refinedBody.includes('![')) {
        refinedBody = `${imageTags.join('\n\n')}\n\n${refinedBody}`;
      }

      const now = new Date();
      const frontMatterLines = [
        '---',
        `title: ${JSON.stringify(refinedTitle)}`,
        `type: ${JSON.stringify(dto.type || 'task_result')}`,
        'status: "candidate"',
        `created_at: ${JSON.stringify(now.toISOString())}`,
        `tags: ${JSON.stringify(refinedTags)}`,
        'ai_refined: true',
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

      bodySections.push('## 💡 核心结论与 AI 精炼总结');
      bodySections.push(refinedBody);
      bodySections.push('');

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
      bodySections.push('- 状态：个人知识候选 (Candidate) · AI 深度提炼');
      bodySections.push('');

      const newMarkdownText = `${frontMatterLines.join('\n')}\n${bodySections.join('\n')}`;
      const newBuffer = Buffer.from(newMarkdownText, 'utf-8');

      // 更新物理存储文件
      await this.storage.putFile(storageKey, newBuffer);

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

      // 数据库记录更新
      await this.prisma.workspaceNode.update({
        where: { id: nodeId },
        data: {
          name: newFileName,
          fileSize: BigInt(newBuffer.length),
          digestJson: digest as any,
        },
      });

      // 伴生落盘
      try {
        await this.storage.putFile(
          `${storageKey}.digest.json`,
          Buffer.from(JSON.stringify(digest, null, 2), 'utf-8')
        );
      } catch {
        // ignore
      }

      // 更新缓存
      await this.contentIndexer.cacheExtractedText(storageKey, newMarkdownText);
      this.logger.log(`Completed AI refinement for note: ${nodeId} -> "${newFileName}"`);
    } catch (err: any) {
      this.logger.warn(`AI refinement background task failed for note ${nodeId}: ${err.message}`);
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

  private toNodeDto(node: any): WorkspaceNodeDto {
    return {
      id: node.id,
      workspaceId: node.workspaceId,
      parentId: node.parentId,
      name: node.name,
      type: node.type,
      fileSize: node.fileSize.toString(),
      mimeType: node.mimeType,
      storagePath: node.storagePath,
      digest: node.digestJson || null,
      createdBy: node.createdBy,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    };
  }

  /**
   * 自动同步并保存正文与沙箱中引用的交付成果物（HTML应用、图表、文档、图片等）到工作空间与沙箱知识库
   */
  public async syncReferencedArtifactsToWorkspace(
    userId: string,
    workspace: any,
    parentId: string | null,
    dto: SaveTextNoteDto
  ): Promise<void> {
    try {
      const isTaskMode = dto.type === 'task_result' || Boolean(dto.executionId);
      const foundFiles = new Set<string>();
      const fileUrlMap = new Map<string, string>();
      const combinedText = [
        dto.content || '',
        dto.userQuery || '',
        dto.title || '',
        typeof dto.rawResultData === 'string' ? dto.rawResultData : JSON.stringify(dto.rawResultData || ''),
      ].join('\n');

      // 1. 匹配 Markdown 引用（图片与超链接）
      const linkRegex = /(?:!\[.*?\]\((.*?)\)|\[.*?\]\((.*?)\))/g;
      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(combinedText)) !== null) {
        const src = match[1] || match[2];
        if (src) {
          const fileMatch = src.match(/(?:workspace-files\/[^/]+\/|\/workspace\/|^)([a-zA-Z0-9_\-.\u4e00-\u9fa5]+\.(?:png|jpg|jpeg|webp|gif|svg|html|htm|pdf|docx|pptx|xlsx|csv|json|py|txt))/i);
          if (fileMatch && fileMatch[1]) {
            foundFiles.add(fileMatch[1]);
          }
          if (src.startsWith('http://') || src.startsWith('https://')) {
            const parsedName = path.basename(src.split('?')[0]);
            if (parsedName && parsedName.includes('.')) {
              foundFiles.add(parsedName);
              fileUrlMap.set(parsedName, src);
            }
          }
        }
      }

      // 2. 匹配沙箱路径如 /workspace/xxx.html 或文档渲染路径 /renders/xxx
      const directMatches = combinedText.match(/(?:\/workspace\/|\/api\/renders\/|\/renders\/)([a-zA-Z0-9_\-.\u4e00-\u9fa5]+\.(?:png|jpg|jpeg|webp|gif|svg|html|htm|pdf|docx|pptx|xlsx|csv|json|py|txt))/gi);
      if (directMatches) {
        for (const dm of directMatches) {
          foundFiles.add(path.basename(dm));
        }
      }

      // 3. 匹配正文中独立出现的产物文件名（如 gomoku.html, presentation.html 等）
      const artifactWordRegex = /\b([a-zA-Z0-9_\-.\u4e00-\u9fa5]+\.(?:html|htm|pdf|docx|pptx|xlsx))\b/gi;
      let wordMatch: RegExpExecArray | null;
      while ((wordMatch = artifactWordRegex.exec(combinedText)) !== null) {
        if (wordMatch[1]) {
          foundFiles.add(wordMatch[1]);
        }
      }

      // 4. 工作模式关联查询：若携带 executionId，读取 execution_artifacts 表中登记的所有任务交付物
      if (dto.executionId) {
        try {
          let rawArtifacts: any[] = [];
          if (this.prisma.executionArtifact) {
            rawArtifacts = await this.prisma.executionArtifact.findMany({
              where: { executionId: dto.executionId },
              orderBy: { createdAt: 'asc' },
            });
          } else {
            rawArtifacts = await this.prisma.$queryRawUnsafe(
              `SELECT id, execution_id as "executionId", name, url, mime_type as "mimeType", size_bytes as "sizeBytes" FROM "execution_artifacts" WHERE "execution_id" = $1::uuid ORDER BY "created_at" ASC`,
              dto.executionId
            );
          }
          if (Array.isArray(rawArtifacts)) {
            for (const art of rawArtifacts) {
              if (art && art.name) {
                foundFiles.add(art.name);
                if (art.url) {
                  fileUrlMap.set(art.name, art.url);
                }
              }
            }
          }
        } catch (artErr: any) {
          this.logger.warn(`Failed to query execution_artifacts for execution ${dto.executionId}: ${artErr.message}`);
        }
      }

      // 5. 自动扫描沙箱 workspace 中最近 2 小时生成的交付产物（个人模式）
      const candDirs = [
        path.join('/workspace/data/users', userId, 'workspace'),
        path.join(process.cwd(), 'data/users', userId, 'workspace'),
      ];
      for (const cDir of candDirs) {
        if (fs.existsSync(cDir)) {
          try {
            const dirents = fs.readdirSync(cDir, { withFileTypes: true });
            const now = Date.now();
            for (const d of dirents) {
              if (d.isFile() && /\.(?:html|htm|pdf|pptx|docx)$/i.test(d.name) && !d.name.startsWith('.')) {
                try {
                  const stat = fs.statSync(path.join(cDir, d.name));
                  if (now - stat.mtimeMs < 2 * 3600 * 1000 || combinedText.includes(d.name.split('.')[0])) {
                    foundFiles.add(d.name);
                  }
                } catch {}
              }
            }
          } catch {}
          break;
        }
      }

      if (foundFiles.size === 0) return;

      const targetKnowledgeDirs = [
        path.join('/workspace/data/users', userId, 'knowledge'),
        path.join(process.cwd(), 'data/users', userId, 'knowledge'),
      ];
      let activeKnowledgeDir: string | null = null;
      for (const kd of targetKnowledgeDirs) {
        if (fs.existsSync(kd)) {
          activeKnowledgeDir = kd;
          break;
        }
      }

      const renderDirs = [
        '/workspace/apps/backend/var/outputs/document-engine/renders',
        path.join(process.cwd(), 'apps/backend/var/outputs/document-engine/renders'),
        path.join(process.cwd(), 'var/outputs/document-engine/renders'),
        path.join(process.cwd(), '..', '..', '..', 'var', 'outputs', 'document-engine', 'renders'),
        path.join(process.cwd(), 'data/renders'),
        '/workspace/data/renders',
      ];

      for (const fileName of foundFiles) {
        const candidateRoots = [
          path.join('/workspace/data/users', userId, 'workspace', fileName),
          path.join(process.cwd(), 'data/users', userId, 'workspace', fileName),
          path.join('/workspace/data/users', userId, 'knowledge', fileName),
          path.join(process.cwd(), 'data/users', userId, 'knowledge', fileName),
          ...renderDirs.map((d) => path.join(d, fileName)),
        ];

        let physicalPath: string | null = null;
        for (const p of candidateRoots) {
          if (fs.existsSync(p)) {
            physicalPath = p;
            break;
          }
        }

        let fileBuffer: Buffer | null = null;
        if (physicalPath) {
          fileBuffer = fs.readFileSync(physicalPath);
        } else {
          const globalRoots = ['/workspace/data/users', path.join(process.cwd(), 'data/users')];
          for (const gRoot of globalRoots) {
            if (fs.existsSync(gRoot)) {
              try {
                const uDirs = fs.readdirSync(gRoot);
                for (const u of uDirs) {
                  const cand = path.join(gRoot, u, 'workspace', fileName);
                  if (fs.existsSync(cand)) {
                    physicalPath = cand;
                    fileBuffer = fs.readFileSync(cand);
                    break;
                  }
                }
              } catch {}
            }
            if (fileBuffer) break;
          }
        }

        // 若本地磁盘未直接命中且有远程 URL，通过 HTTP 下载文件流
        if (!fileBuffer && fileUrlMap.has(fileName)) {
          const remoteUrl = fileUrlMap.get(fileName)!;
          try {
            let fetchUrl = remoteUrl;
            if (isContainerRuntime() && /https?:\/\/(localhost|127\.0\.0\.1):3009/i.test(fetchUrl)) {
              fetchUrl = fetchUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1):3009/i, 'http://carbone-engine:3009');
            }
            const resp = await axios.get<any>(fetchUrl, { responseType: 'arraybuffer', timeout: 8000 });
            if (resp.data) {
              fileBuffer = Buffer.isBuffer(resp.data) ? resp.data : Buffer.from(resp.data);
            }
          } catch (httpErr: any) {
            this.logger.warn(`Failed to fetch artifact via HTTP (${remoteUrl}): ${httpErr.message}`);
          }
        }

        if (!fileBuffer || fileBuffer.length === 0) continue;

        // 物理同步到沙箱 /knowledge 目录（仅非任务模式或沙箱产物）
        if (physicalPath && activeKnowledgeDir && !isTaskMode) {
          const targetPersistPath = path.join(activeKnowledgeDir, fileName);
          if (!fs.existsSync(targetPersistPath)) {
            try {
              fs.copyFileSync(physicalPath, targetPersistPath);
            } catch (copyErr: any) {
              this.logger.warn(`Failed to copy artifact to knowledge: ${copyErr.message}`);
            }
          }
        }

        const fileSize = BigInt(fileBuffer.length);
        const mimeType = this.guessMimeType(fileName);

        const existing = await this.prisma.workspaceNode.findFirst({
          where: {
            workspaceId: workspace.id,
            parentId,
            name: fileName,
          },
        });

        if (existing) {
          if (existing.storagePath && existing.fileSize !== fileSize) {
            await this.storage.putFile(existing.storagePath, fileBuffer);
            const diff = fileSize - existing.fileSize;
            await this.prisma.workspaceNode.update({
              where: { id: existing.id },
              data: { fileSize, updatedAt: new Date() },
            });
            await this.prisma.workspace.update({
              where: { id: workspace.id },
              data: { usedBytes: BigInt(workspace.usedBytes) + diff },
            });
          }
          continue;
        }

        const fileNodeId = randomUUID();
        const storageKey = `${workspace.type}/${workspace.id}/${fileNodeId}_${fileName}`;
        await this.storage.putFile(storageKey, fileBuffer);

        await this.prisma.workspaceNode.create({
          data: {
            id: fileNodeId,
            workspaceId: workspace.id,
            parentId,
            name: fileName,
            type: 'file',
            fileSize,
            mimeType,
            storagePath: storageKey,
            createdBy: userId,
          },
        });

        await this.prisma.workspace.update({
          where: { id: workspace.id },
          data: { usedBytes: BigInt(workspace.usedBytes) + fileSize },
        });

        this.logger.log(`Successfully archived companion artifact to workspace: ${fileName} (${fileNodeId})`);

        if (['text/markdown', 'text/plain', 'text/html', 'application/json'].includes(mimeType)) {
          this.contentIndexer
            .extractText(fileBuffer, fileName, mimeType)
            .then(async (extractedText) => {
              if (extractedText) {
                await this.contentIndexer.cacheExtractedText(storageKey, extractedText);
                await this.digestService.generateAndSaveDigest(fileNodeId, storageKey, fileName, mimeType);
              }
            })
            .catch(() => {});
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to auto-sync referenced artifacts to workspace: ${err.message}`);
    }
  }

  private guessMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.md': return 'text/markdown';
      case '.txt': return 'text/plain';
      case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case '.pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case '.pdf': return 'application/pdf';
      case '.html': case '.htm': return 'text/html';
      case '.json': return 'application/json';
      case '.csv': return 'text/csv';
      case '.py': return 'text/x-python';
      case '.png': return 'image/png';
      case '.jpg': case '.jpeg': return 'image/jpeg';
      case '.webp': return 'image/webp';
      case '.gif': return 'image/gif';
      case '.svg': return 'image/svg+xml';
      default: return 'application/octet-stream';
    }
  }
}
