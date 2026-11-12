import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../ports';
import { STORAGE_DRIVER, StorageDriver } from './storage/storage-driver.interface';
import { WorkspaceContentIndexerService } from './workspace-content-indexer.service';
import { knowledgeExcerpt, parseKnowledgeFrontmatter, scorePersonalKnowledge } from './personal-knowledge-relevance';

type KnowledgeNode = {
  id: string; workspaceId: string; parentId: string | null; name: string; type: string;
  storagePath: string | null; mimeType?: string | null; updatedAt: Date;
  digestJson?: { keyTopics?: string[]; summary?: string; cleanedContent?: string };
};

@Injectable()
export class PersonalKnowledgeService {
  private readonly logger = new Logger(PersonalKnowledgeService.name);

  constructor(
    @Inject(WORKBENCH_PRISMA) private readonly prisma: WorkbenchPrismaPort,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    private readonly indexer: WorkspaceContentIndexerService
  ) {}

  private async library(userId: string): Promise<KnowledgeNode[]> {
    if (!userId || ['anonymous', 'system'].includes(userId)) throw new BadRequestException('缺少已认证用户');
    const workspace = await this.prisma.workspace.findFirst({ where: { type: 'personal', ownerUserId: userId } });
    if (!workspace) return [];
    // Never call getMyWorkspaces here: a read must not re-import sandbox files.
    const nodes: KnowledgeNode[] = await this.prisma.workspaceNode.findMany({ where: { workspaceId: workspace.id } });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const archived = (node: KnowledgeNode) => {
      const seen = new Set<string>();
      let parent = node.parentId;
      while (parent) {
        if (seen.has(parent)) return false;
        seen.add(parent);
        const folder = byId.get(parent);
        if (!folder) return false;
        if (/临时工作区|\(temp\)|^temp$/i.test(folder.name)) return false;
        parent = folder.parentId;
      }
      return true;
    };
    return nodes.filter((n) => n.type === 'file' && n.storagePath
      && n.storagePath.startsWith(`personal/${workspace.id}/`)
      && !/\.(?:extracted\.txt|digest\.json|pdf\.txt|docx\.txt|pptx\.txt|xlsx\.txt)$/i.test(n.name)
      && archived(n));
  }

  private async document(node: KnowledgeNode) {
    const storagePath = node.storagePath!;
    const isText = this.indexer.isTextFile(node.name, node.mimeType);
    // Text originals are authoritative; never prefer an extracted-text cache to a Markdown original.
    const text = isText
      ? (await this.storage.getFile(storagePath)).toString('utf8')
      : await this.indexer.getExtractedText(storagePath, node.name, node.mimeType) || '';
    const fm = parseKnowledgeFrontmatter(text);
    const topics = Array.isArray(node.digestJson?.keyTopics)
      ? node.digestJson!.keyTopics!.filter((tag) => typeof tag === 'string') : [];
    // A stale derived digest must not restore tags removed from a text original.
    const tags = isText ? fm.tags : topics;
    return {
      id: node.id, workspaceId: node.workspaceId, name: node.name, title: fm.title || node.name, tags,
      content: text, contentSha256: createHash('sha256').update(text).digest('hex'),
      updatedAt: node.updatedAt,
      path: `personal-knowledge://${node.workspaceId}/${node.id}`,
      url: `/workspaces?tab=personal&workspaceId=${encodeURIComponent(node.workspaceId)}&fileId=${encodeURIComponent(node.id)}`,
    };
  }

  async search(userId: string, query: string, browse = false) {
    if (typeof query !== 'string' || query.length > 2000) throw new BadRequestException('检索问题长度无效');
    const nodes = await this.library(userId);
    const matches: Array<Awaited<ReturnType<PersonalKnowledgeService['document']>> & { score: number }> = [];
    let failedDocuments = 0;
    for (const node of nodes) {
      // Binary extraction only follows a metadata match; plain-text originals supply their own tags.
      if (!this.indexer.isTextFile(node.name, node.mimeType) && !browse
          && scorePersonalKnowledge(query, node.name, '', node.digestJson?.keyTopics || [], '') < 200) continue;
      try {
        const doc = await this.document(node);
        const score = scorePersonalKnowledge(query, doc.name, doc.title, doc.tags, doc.content);
        if (score >= 200 || browse) matches.push({ ...doc, score: Math.max(200, score) });
      } catch (error: any) {
        failedDocuments++;
        this.logger.warn(`Personal document ${node.id} unavailable: ${error?.message}`);
      }
    }
    matches.sort((a, b) => b.score - a.score || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    let budget = 32000;
    const documents: typeof matches = [];
    for (const doc of matches.slice(0, 8)) {
      if (budget <= 0) break;
      const content = knowledgeExcerpt(doc.content, query, Math.min(6000, budget));
      budget = Math.max(0, budget - content.length);
      documents.push({ ...doc, content });
    }
    return { source: 'personal_workspace', scannedCount: nodes.length, matchedCount: matches.length, failedDocuments, documents };
  }

  async read(userId: string, workspaceId: string, documentId: string, startLine = 1, endLine?: number) {
    if (!Number.isSafeInteger(startLine) || startLine < 1
        || (endLine !== undefined && (!Number.isSafeInteger(endLine) || endLine < startLine))) {
      throw new BadRequestException('行号无效');
    }
    const node = (await this.library(userId)).find((n) => n.id === documentId && n.workspaceId === workspaceId);
    if (!node) throw new NotFoundException('个人资料不存在或无权读取');
    const doc = await this.document(node);
    const lines = doc.content.split(/\r?\n/);
    const lastLine = Math.min(endLine ?? startLine + 199, startLine + 499, lines.length);
    const content = lines.slice(startLine - 1, lastLine).map((line, i) => `${startLine + i}: ${line}`).join('\n');
    return { ...doc, content: content.slice(0, 24000), totalLines: lines.length, startLine, endLine: lastLine };
  }
}
