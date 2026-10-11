import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort, isContainerRuntime } from '../ports';
import { STORAGE_DRIVER, type StorageDriver } from './storage/storage-driver.interface';
import type { SaveTextNoteDto } from './dto/workspace.dto';

export interface SyncedArtifactInfo {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: bigint;
  storagePath: string;
}

@Injectable()
export class WorkspaceArtifactSyncHelper {
  private readonly logger = new Logger(WorkspaceArtifactSyncHelper.name);

  constructor(
    @Inject(WORKBENCH_PRISMA) private readonly prisma: WorkbenchPrismaPort,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver
  ) {}

  /**
   * 自动同步会话及沙箱中引用的交付成果物（HTML、Word、PDF、图表等）到指定的归档目标文件夹下
   */
  public async syncReferencedArtifactsToWorkspace(
    userId: string,
    workspace: any,
    targetFolderId: string,
    dto: SaveTextNoteDto
  ): Promise<SyncedArtifactInfo[]> {
    const syncedList: SyncedArtifactInfo[] = [];
    try {
      const isTaskMode = dto.type === 'task_result' || Boolean(dto.executionId);
      const foundFiles = new Set<string>();
      const fileUrlMap = new Map<string, string>();
      const combinedText = [
        dto.content || '',
        dto.userQuery || '',
        dto.title || '',
        typeof dto.rawResultData === 'string'
          ? dto.rawResultData
          : JSON.stringify(dto.rawResultData || ''),
      ].join('\n');

      // 0. 优先提取当前消息正文中内联的最新最终版 HTML 代码块
      const inlineHtmlBlocks = this.extractInlineHtmlBlocks(combinedText);
      for (const [inlineName] of inlineHtmlBlocks.entries()) {
        foundFiles.add(inlineName);
      }

      // 1. 从当前会话的 rawResultData 中精准提取显式交付物与工具生成物
      this.extractFilesFromRawResultData(dto.rawResultData, foundFiles, fileUrlMap);

      // 2. 从当前会话专属附件索引读取本轮关联附件（精准会话作用域隔离）
      this.extractSessionAttachments(userId, dto.sessionId, foundFiles);

      // 3. 匹配 Markdown 引用（图片与超链接）
      const linkRegex = /(?:!\[.*?\]\((.*?)\)|\[.*?\]\((.*?)\))/g;
      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(combinedText)) !== null) {
        const src = match[1] || match[2];
        if (src) {
          const fileMatch = src.match(
            /(?:workspace-files\/[^/]+\/|\/workspace\/|^)([a-zA-Z0-9_\-.\u4e00-\u9fa5]+\.(?:png|jpg|jpeg|webp|gif|svg|html|htm|pdf|docx|pptx|xlsx|csv|json|py|txt|md))/i
          );
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

      // 4. 匹配沙箱路径如 /workspace/xxx.html 或文档渲染路径 /renders/xxx
      const directMatches = combinedText.match(
        /(?:\/workspace\/|\/api\/renders\/|\/renders\/)([a-zA-Z0-9_\-.\u4e00-\u9fa5]+\.(?:png|jpg|jpeg|webp|gif|svg|html|htm|pdf|docx|pptx|xlsx|csv|json|py|txt|md))/gi
      );
      if (directMatches) {
        for (const dm of directMatches) {
          foundFiles.add(path.basename(dm));
        }
      }

      // 5. 匹配正文中独立出现的完整产物文件名（支持中英文且文件名长度 >= 2，避免单字符误匹配）
      const artifactWordRegex =
        /(?:^|[^\w/])([a-zA-Z0-9_\-.\u4e00-\u9fa5]{2,}\.(?:png|jpg|jpeg|webp|gif|svg|html|htm|pdf|docx|pptx|xlsx|csv|json|py|txt|md))(?=[^\w/]|$)/gi;
      let wordMatch: RegExpExecArray | null;
      while ((wordMatch = artifactWordRegex.exec(combinedText)) !== null) {
        if (wordMatch[1]) {
          foundFiles.add(wordMatch[1].trim());
        }
      }

      // 6. 工作模式关联查询：若携带 executionId，读取 execution_artifacts 表中登记的所有任务交付物
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
          this.logger.warn(
            `Failed to query execution_artifacts for execution ${dto.executionId}: ${artErr.message}`
          );
        }
      }

      // 严格会话边界过滤：若指定了 sessionId，任何只通过正文模糊正则匹配命中、
      // 但既不在本轮会话附件列表、也不在工具输出、也不在 .sessions 目录中的历史无关文件予以剔除
      if (dto.sessionId) {
        const cleanSid = dto.sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const sessionWhitelist = new Set<string>();
        // 1) 内联 HTML
        for (const k of inlineHtmlBlocks.keys()) sessionWhitelist.add(k);
        // 2) 显式交付物与工具生成物
        if (dto.rawResultData) {
          const rFiles = new Set<string>();
          this.extractFilesFromRawResultData(dto.rawResultData, rFiles, new Map());
          for (const rf of rFiles) sessionWhitelist.add(rf);
        }
        // 3) 会话附件清单与 .sessions 目录文件
        const sAtts = new Set<string>();
        this.extractSessionAttachments(userId, dto.sessionId, sAtts);
        for (const sa of sAtts) sessionWhitelist.add(sa);
        // 4) 正文中显式以 /workspace/ 或 workspace-files/ 链接的有效交付物
        let lMatch: RegExpExecArray | null;
        const linkFilterRegex =
          /(?:workspace-files\/[^/]+\/|\/workspace\/)([a-zA-Z0-9_\-.\u4e00-\u9fa5]+\.[a-zA-Z0-9]+)/gi;
        while ((lMatch = linkFilterRegex.exec(combinedText)) !== null) {
          if (lMatch[1]) sessionWhitelist.add(lMatch[1]);
        }
        // 5) 物理存在于当前会话 Scratchpad .sessions/<cleanSid>/ 中的文件
        const candSessionDirs = [
          path.join(process.cwd(), 'data/users', userId, 'workspace', '.sessions', cleanSid),
          path.join('/workspace/data/users', userId, 'workspace', '.sessions', cleanSid),
        ];
        for (const sDir of candSessionDirs) {
          if (fs.existsSync(sDir)) {
            try {
              for (const f of fs.readdirSync(sDir)) {
                if (!f.startsWith('.')) sessionWhitelist.add(f);
              }
            } catch {
              // ignore
            }
          }
        }

        // 剔除所有不在白名单中的历史无关杂质文件
        for (const f of Array.from(foundFiles)) {
          if (!sessionWhitelist.has(f)) {
            this.logger.log(
              `Filtered out cross-session historical file: "${f}" for session ${dto.sessionId}`
            );
            foundFiles.delete(f);
          }
        }
      }

      if (foundFiles.size === 0) return syncedList;

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
        path.join(
          process.cwd(),
          '..',
          '..',
          '..',
          'var',
          'outputs',
          'document-engine',
          'renders'
        ),
        path.join(process.cwd(), 'data/renders'),
        '/workspace/data/renders',
      ];

      for (const fileName of foundFiles) {
        let fileBuffer: Buffer | null = null;
        let physicalPath: string | null = null;

        // 优先级 1: 消息正文中直接内联包含的最新最终版 HTML（最高优先级，确保修复版本准确入夹）
        if (inlineHtmlBlocks.has(fileName)) {
          fileBuffer = inlineHtmlBlocks.get(fileName)!;
          this.logger.log(
            `Using latest inline HTML from message content for "${fileName}" (${fileBuffer.length} bytes)`
          );

          // 同步回写沙箱工作区，确保沙箱磁盘文件也更新为最终版
          const sandboxDirs = [
            path.join('/workspace/data/users', userId, 'workspace'),
            path.join(process.cwd(), 'data/users', userId, 'workspace'),
          ];
          for (const sDir of sandboxDirs) {
            try {
              if (fs.existsSync(sDir)) {
                const targetP = path.join(sDir, fileName);
                fs.writeFileSync(targetP, fileBuffer);
                physicalPath = targetP;
                this.logger.log(
                  `Synchronized latest HTML to sandbox workspace: ${targetP}`
                );
              }
            } catch (wErr: any) {
              this.logger.warn(`Failed to update sandbox file: ${wErr.message}`);
            }
          }
        }

        // 优先级 2: 本地沙箱磁盘扫描
        if (!fileBuffer) {
          const cleanSid = dto.sessionId ? dto.sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') : null;
          const candidateRoots = [
            ...(cleanSid
              ? [
                  path.join('/workspace/data/users', userId, 'workspace', '.sessions', cleanSid, fileName),
                  path.join(process.cwd(), 'data/users', userId, 'workspace', '.sessions', cleanSid, fileName),
                ]
              : []),
            path.join('/workspace/data/users', userId, 'workspace', fileName),
            path.join(process.cwd(), 'data/users', userId, 'workspace', fileName),
            path.join('/workspace/data/users', userId, 'knowledge', fileName),
            path.join(process.cwd(), 'data/users', userId, 'knowledge', fileName),
            ...renderDirs.map((d) => path.join(d, fileName)),
          ];

          for (const p of candidateRoots) {
            if (fs.existsSync(p)) {
              physicalPath = p;
              break;
            }
          }

          if (physicalPath) {
            fileBuffer = fs.readFileSync(physicalPath);
          }
        }

        // 若本地磁盘未直接命中且有远程 URL，通过 HTTP 下载文件流
        if (!fileBuffer && fileUrlMap.has(fileName)) {
          const remoteUrl = fileUrlMap.get(fileName)!;
          try {
            let fetchUrl = remoteUrl;
            if (
              isContainerRuntime() &&
              /https?:\/\/(localhost|127\.0\.0\.1):3009/i.test(fetchUrl)
            ) {
              fetchUrl = fetchUrl.replace(
                /https?:\/\/(localhost|127\.0\.0\.1):3009/i,
                'http://carbone-engine:3009'
              );
            }
            const resp = await axios.get<any>(fetchUrl, {
              responseType: 'arraybuffer',
              timeout: 8000,
            });
            if (resp.data) {
              fileBuffer = Buffer.isBuffer(resp.data)
                ? resp.data
                : Buffer.from(resp.data);
            }
          } catch (httpErr: any) {
            this.logger.warn(
              `Failed to fetch artifact via HTTP (${remoteUrl}): ${httpErr.message}`
            );
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

        // 检查该目标专属文件夹下是否已存在同名节点
        const existing = await this.prisma.workspaceNode.findFirst({
          where: {
            workspaceId: workspace.id,
            parentId: targetFolderId,
            name: fileName,
          },
        });

        if (existing) {
          if (existing.storagePath && (existing.fileSize !== fileSize || inlineHtmlBlocks.has(fileName))) {
            await this.storage.putFile(existing.storagePath, fileBuffer);
            const diff = fileSize - existing.fileSize;
            await this.prisma.workspaceNode.update({
              where: { id: existing.id },
              data: { fileSize },
            });
            await this.prisma.workspace.update({
              where: { id: workspace.id },
              data: { usedBytes: BigInt(workspace.usedBytes) + diff },
            });
          }
          syncedList.push({
            id: existing.id,
            name: existing.name,
            mimeType: existing.mimeType || mimeType,
            sizeBytes: fileSize,
            storagePath: existing.storagePath || '',
          });
        } else {
          const artifactNodeId = randomUUID();
          const artifactStorageKey = `${workspace.type}/${workspace.id}/${artifactNodeId}_${fileName}`;
          await this.storage.putFile(artifactStorageKey, fileBuffer);

          const createdNode = await this.prisma.workspaceNode.create({
            data: {
              id: artifactNodeId,
              workspaceId: workspace.id,
              parentId: targetFolderId,
              name: fileName,
              type: 'file',
              fileSize,
              mimeType,
              storagePath: artifactStorageKey,
              createdBy: userId,
            },
          });

          await this.prisma.workspace.update({
            where: { id: workspace.id },
            data: { usedBytes: BigInt(workspace.usedBytes) + fileSize },
          });

          syncedList.push({
            id: createdNode.id,
            name: createdNode.name,
            mimeType: createdNode.mimeType || mimeType,
            sizeBytes: fileSize,
            storagePath: artifactStorageKey,
          });

          this.logger.log(
            `Synchronized artifact "${fileName}" (${fileSize} bytes) into folder ${targetFolderId}`
          );
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to sync companion artifacts to folder: ${err.message}`);
    }

    return syncedList;
  }

  /**
   * 优先从当前对话消息文本中提取内联生成的 HTML 产物（代表当前轮次最新的最终版成果）
   */
  private extractInlineHtmlBlocks(combinedText: string): Map<string, Buffer> {
    const inlineMap = new Map<string, Buffer>();

    // 匹配 ```html ... ``` 或 ```htm ... ``` 代码块
    const htmlBlockRegex = /```(?:html|htm)\s*\n([\s\S]*?)\n```/gi;
    let match: RegExpExecArray | null;

    // 查找正文中提及的文件名，如：`/workspace/xxx.html` 或 `输出文件：xxx.html` 或 `xxx.html`
    const mentionedNames: string[] = [];
    const nameRegex =
      /(?:\/workspace\/|workspace\/|`|:|\*\*输出文件\*\*[:：]\s*)([a-zA-Z0-9_\-.\u4e00-\u9fa5]+\.(?:html|htm))/gi;
    let nm: RegExpExecArray | null;
    while ((nm = nameRegex.exec(combinedText)) !== null) {
      if (nm[1]) {
        mentionedNames.push(path.basename(nm[1].trim()));
      }
    }

    const matches: string[] = [];
    while ((match = htmlBlockRegex.exec(combinedText)) !== null) {
      const code = match[1]?.trim();
      if (
        code &&
        (code.includes('<!DOCTYPE html') ||
          code.includes('<html') ||
          code.includes('<canvas') ||
          code.includes('<body') ||
          code.includes('<svg'))
      ) {
        matches.push(code);
      }
    }

    if (matches.length === 0) {
      // 容错：处理未闭合代码块或直接输出 HTML 的场景
      const docMatch = combinedText.match(/<!DOCTYPE html[\s\S]*?<\/html>/i);
      if (docMatch) {
        matches.push(docMatch[0].trim());
      }
    }

    if (matches.length > 0) {
      // 最新生成的 HTML 为最后一个代码块
      const latestHtmlCode = matches[matches.length - 1];

      // 确定文件名：优先从正文中提及的名字中选取
      let targetFileName = mentionedNames.length > 0 ? mentionedNames[0] : null;

      if (!targetFileName) {
        // 尝试从 HTML <title> 提取
        const titleMatch = latestHtmlCode.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          const cleanTitle = titleMatch[1].trim().replace(/[\\/:*?"<>|]/g, '_');
          if (cleanTitle) {
            targetFileName = `${cleanTitle}.html`;
          }
        }
      }

      // 兜底命名
      if (!targetFileName) {
        const isPresentation =
          latestHtmlCode.includes('class="slide') ||
          latestHtmlCode.includes('swiper') ||
          latestHtmlCode.includes('presentation');
        targetFileName = isPresentation ? 'presentation.html' : 'index.html';
      }

      inlineMap.set(targetFileName, Buffer.from(latestHtmlCode, 'utf-8'));
    }

    return inlineMap;
  }

  private guessMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      case '.svg':
        return 'image/svg+xml';
      case '.html':
      case '.htm':
        return 'text/html';
      case '.pdf':
        return 'application/pdf';
      case '.docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case '.pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case '.xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case '.csv':
        return 'text/csv';
      case '.json':
        return 'application/json';
      case '.txt':
        return 'text/plain';
      case '.py':
        return 'text/x-python';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * 从当前会话的原始执行数据中精准提取显式交付物与工具调用的产物文件
   */
  private extractFilesFromRawResultData(
    rawResultData: any,
    foundFiles: Set<string>,
    fileUrlMap: Map<string, string>
  ): void {
    if (!rawResultData) return;
    let dataObj: any = rawResultData;
    if (typeof rawResultData === 'string') {
      try {
        dataObj = JSON.parse(rawResultData);
      } catch {
        return;
      }
    }
    if (!dataObj || typeof dataObj !== 'object') return;

    // 1) 显式分发的交付产物清单（如 deepseek-harness 的 outboundFiles）
    if (Array.isArray(dataObj.outboundFiles)) {
      for (const item of dataObj.outboundFiles) {
        const name = item?.fileName || (item?.filePath ? path.basename(item.filePath) : null);
        if (name) {
          foundFiles.add(name);
          if (item?.url) fileUrlMap.set(name, item.url);
        }
      }
    }

    // 2) 调用的工具产生的目标文件（如 send_file, write_file, write_markdown）
    const toolCalls =
      dataObj.sandbox?.metrics?.toolCalls ||
      dataObj.sandbox?.toolCalls ||
      dataObj.toolCalls;
    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        if (!tc || !tc.params) continue;
        if (tc.name === 'send_file' && tc.params.file_path) {
          foundFiles.add(path.basename(tc.params.file_path));
        } else if (
          (tc.name === 'write_file' || tc.name === 'write_markdown') &&
          tc.params.path
        ) {
          foundFiles.add(path.basename(tc.params.path));
        }
      }
    }

    // 3) 显式 artifacts / files 列表
    const artifacts = dataObj.artifacts || dataObj.files;
    if (Array.isArray(artifacts)) {
      for (const art of artifacts) {
        const name =
          typeof art === 'string'
            ? path.basename(art)
            : art?.name || (art?.filePath ? path.basename(art.filePath) : null);
        if (name) {
          foundFiles.add(name);
          if (art?.url || art?.downloadUrl) {
            fileUrlMap.set(name, art.url || art.downloadUrl);
          }
        }
      }
    }
  }

  /**
   * 从当前会话持久化的专属附件索引读取本轮绑定的有效附件
   */
  private extractSessionAttachments(
    userId: string,
    sessionId: string | undefined,
    foundFiles: Set<string>
  ): void {
    if (!sessionId) return;
    const cleanSid = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const candSessionPaths = [
      path.join(
        '/workspace/data/users',
        userId,
        'workspace',
        '.sessions',
        cleanSid,
        'attachments.json'
      ),
      path.join(
        process.cwd(),
        'data/users',
        userId,
        'workspace',
        '.sessions',
        cleanSid,
        'attachments.json'
      ),
      path.join(
        '/workspace/data/users',
        userId,
        'workspace',
        '.dsh',
        'sessions',
        `${cleanSid}.attachments.json`
      ),
      path.join(
        process.cwd(),
        'data/users',
        userId,
        'workspace',
        '.dsh',
        'sessions',
        `${cleanSid}.attachments.json`
      ),
    ];
    for (const p of candSessionPaths) {
      if (fs.existsSync(p)) {
        try {
          const list = JSON.parse(fs.readFileSync(p, 'utf-8'));
          if (Array.isArray(list)) {
            for (const item of list) {
              if (typeof item === 'string' && item.trim()) {
                foundFiles.add(path.basename(item.trim()));
              }
            }
          }
        } catch {
          // ignore parse errors
        }
        break;
      }
    }

    // 扫描 .sessions/<cleanSid>/ 会话暂存区中的真实文件（排除隐藏文件与 attachments.json）
    const sessionDirs = [
      path.join('/workspace/data/users', userId, 'workspace', '.sessions', cleanSid),
      path.join(process.cwd(), 'data/users', userId, 'workspace', '.sessions', cleanSid),
    ];
    for (const sDir of sessionDirs) {
      if (fs.existsSync(sDir)) {
        try {
          const entries = fs.readdirSync(sDir);
          for (const entry of entries) {
            if (!entry.startsWith('.') && entry !== 'attachments.json') {
              foundFiles.add(entry);
            }
          }
        } catch {
          // ignore
        }
        break;
      }
    }
  }
}
