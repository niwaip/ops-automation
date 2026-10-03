import { Injectable, Logger } from '@nestjs/common';
import * as JSZipModule from 'jszip';
import {
  ExtractedCommentItem,
  DocxClauseItemContext,
  DocxCommentExtractionContext,
  DocxCommentInjectionOptions,
  DocxCommentInjectionResult,
} from './docx-comment.types';
import {
  escapeXml,
  unescapeXml,
  deduplicateRejectionText,
  injectCommentRangeIntoParagraph,
  ensureRootNamespaces,
  getJSZip,
} from './docx-xml.util';
import { DocxClauseLocatorService } from './docx-clause-locator.service';

export { deduplicateRejectionText, getJSZip, unescapeXml };

@Injectable()
export class DocxCommentInjectorService {
  private readonly logger = new Logger(DocxCommentInjectorService.name);
  private readonly locator = new DocxClauseLocatorService();

  /**
   * 从动作请求参数与批注中解析出待注入 Word 的批注列表（零硬编码，保留回复关系与选区）
   */
  public extractCommentsFromAction(
    dto: any,
    operatorName: string = '法务审阅人',
    context?: DocxCommentExtractionContext
  ): ExtractedCommentItem[] {
    const results: ExtractedCommentItem[] = [];
    const seenKeys = new Set<string>();

    const reviewDraft = dto?.parameters?.reviewDraft || {};
    const stagedComments =
      Array.isArray(reviewDraft.stagedComments) && reviewDraft.stagedComments.length > 0
        ? reviewDraft.stagedComments
        : Array.isArray(dto?.parameters?.stagedComments)
        ? dto.parameters.stagedComments
        : [];

    // 构建上下文动态条款映射字典
    const clauseMap = new Map<string, { title?: string; clauseNumber?: string }>();
    const contextClauses = context?.clauses || reviewDraft.clauses || dto?.parameters?.clauses || [];
    if (Array.isArray(contextClauses)) {
      for (const cl of contextClauses) {
        if (cl.clauseIndex !== undefined) {
          clauseMap.set(String(cl.clauseIndex), {
            title: cl.title,
            clauseNumber: cl.clauseNumber,
          });
        }
      }
    }

    let currentId = 1;

    // 1. 结构化 Word 批注（来自审查报告或草稿暂存）
    for (let i = 0; i < stagedComments.length; i++) {
      const sc = stagedComments[i];
      const commentText = (sc.text || sc.comment || sc.content || '').trim();
      if (!commentText) continue;

      const clauseIndex =
        sc.clauseIndex !== undefined
          ? (typeof sc.clauseIndex === 'number' ? sc.clauseIndex : parseInt(String(sc.clauseIndex), 10))
          : undefined;
      const clauseIdStr = clauseIndex !== undefined ? String(clauseIndex) : sc.clauseId ? String(sc.clauseId) : undefined;
      const ctxClause = clauseIdStr ? clauseMap.get(clauseIdStr) : undefined;

      const uniqueKey = sc.id ? `id::${sc.id}` : `idx::${i}`;
      if (seenKeys.has(uniqueKey)) continue;
      seenKeys.add(uniqueKey);

      const dynamicTitle = sc.clauseTitle || sc.clauseName || ctxClause?.title || undefined;
      const clauseNumber = sc.clauseNumber || ctxClause?.clauseNumber || undefined;

      results.push({
        id: sc.id || currentId++,
        author: sc.author || operatorName,
        date: sc.date || new Date().toISOString(),
        initials: sc.initials || '法务',
        text: commentText.startsWith('【法务修改意见】') ? commentText : `【法务修改意见】 ${commentText}`,
        clauseIndex,
        clauseId: clauseIdStr,
        clauseNumber,
        clauseTitle: dynamicTitle,
        anchorText: sc.anchorText || sc.selectedText,
        parentCommentId: sc.parentCommentId || sc.targetCommentId || undefined,
        status: 'pending',
      });
    }

    // 2. 结构化审批修改意见（approvalOpinions）
    const approvalOpinions =
      Array.isArray(reviewDraft.approvalOpinions) && reviewDraft.approvalOpinions.length > 0
        ? reviewDraft.approvalOpinions
        : Array.isArray(dto?.parameters?.approvalOpinions)
        ? dto.parameters.approvalOpinions
        : [];

    for (let i = 0; i < approvalOpinions.length; i++) {
      const op = approvalOpinions[i];
      // 只要指定了条款信息或划词锚点，或显式声明了 isWordComment，即提取
      if (!op.isWordComment && (!op.clauseId && !op.clauseIndex && !op.anchorText)) {
        continue;
      }
      const opinionText = (op.opinion || op.comment || op.content || '').trim();
      if (!opinionText) continue;

      const cIndex = op.clauseIndex !== undefined ? op.clauseIndex : op.clauseId ? parseInt(String(op.clauseId), 10) : undefined;
      const cIdStr = cIndex !== undefined ? String(cIndex) : undefined;
      const ctxClause = cIdStr ? clauseMap.get(cIdStr) : undefined;

      const uniqueKey = op.id ? `op_id::${op.id}` : `op_idx::${i}`;
      if (seenKeys.has(uniqueKey)) continue;
      seenKeys.add(uniqueKey);

      const title = op.title || op.findingTitle || op.ruleName || '审查要件修改意见';
      const dynamicTitle = op.clauseTitle || ctxClause?.title || title;

      results.push({
        id: currentId++,
        author: operatorName,
        date: new Date().toISOString(),
        initials: '法务',
        text: `【法务修改意见】[${title}]：${opinionText}`,
        clauseIndex: cIndex,
        clauseId: cIdStr,
        clauseNumber: ctxClause?.clauseNumber,
        clauseTitle: dynamicTitle,
        anchorText: op.anchorText,
        status: 'pending',
      });
    }

    // 3. 从文本 comment 中解析（仅在结构化列表为空时作为通用兜底提取）
    const rawComment = deduplicateRejectionText(dto?.comment);
    if (rawComment && results.length === 0) {
      const blockMatch = rawComment.match(
        /本次草拟Word批注[：:]\s*([\s\S]*?)(?=\n\s*【(?:合同智能审阅|重点处置|法务审查处理)|\s*】\s*$|$)/i
      );
      if (blockMatch && blockMatch[1]) {
        const rawBlock = blockMatch[1].replace(/】\s*$/, '').trim();
        const itemRegex = /(?:^|\n)\s*(\d+)[\.、]\s*(\[.*?\])?\s*([\s\S]*?)(?=(?:\n\s*\d+[\.、])|$)/g;
        let m: RegExpExecArray | null;
        while ((m = itemRegex.exec(rawBlock)) !== null) {
          const itemNum = m[1];
          const tag = (m[2] || '').trim();
          let text = (m[3] || '').trim();
          if (!text) continue;

          text = text.replace(/^【法务修改意见】\s*/, '').trim();

          const clauseMatch = tag.match(/条款\s*#?(\d+)/i) || tag.match(/第([一二三四五六七八九十0-9]+)条/);
          const cId = clauseMatch ? clauseMatch[1] : undefined;
          const cIndex = cId ? parseInt(cId, 10) : undefined;
          const ctxClause = cId ? clauseMap.get(cId) : undefined;

          // 从 tag 中提取条款名称（如 [条款 #7 救济方法] -> 救济方法）
          let parsedTitle = tag
            .replace(/[\[\]]/g, '')
            .replace(/条款\s*#?\d+/gi, '')
            .replace(/^[0-9一二三四五六七八九十]+[、\.\s]*/, '')
            .trim();
          if (!parsedTitle && ctxClause?.title) {
            parsedTitle = ctxClause.title;
          }

          let parentCommentId: string | undefined = undefined;
          const replyMatch =
            text.match(/(?:\[|【)?(?:回复(?:批注)?|针对批注)\s*#?(\w+)(?:\]|】|：|:)?/i) ||
            tag.match(/(?:\[|【)?(?:回复(?:批注)?|针对批注)\s*#?(\w+)(?:\]|】|：|:)?/i);
          if (replyMatch) {
            parentCommentId = replyMatch[1];
            text = text
              .replace(/(?:\[|【)?(?:回复(?:批注)?|针对批注)\s*#?\w+(?:\]|】|：|:)?\s*/gi, '')
              .trim();
          }

          const uKey = `${itemNum}::${cId || ''}::${text}::${parentCommentId || ''}`;
          if (!seenKeys.has(uKey)) {
            seenKeys.add(uKey);
            results.push({
              id: currentId++,
              author: operatorName,
              date: new Date().toISOString(),
              initials: '法务',
              text: `【法务修改意见】 ${text}`,
              clauseIndex: cIndex,
              clauseId: cId,
              clauseNumber: ctxClause?.clauseNumber,
              clauseTitle: parsedTitle || undefined,
              parentCommentId,
              status: 'pending',
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * 将批注注入 Word 文档 Buffer 中，生成原生带批注的 OpenXML DOCX
   * 严禁在原稿损坏时静默生成空替代合同；未定位意见明确记录并报告
   */
  public async injectCommentsIntoDocxBuffer(
    originalBuffer: Buffer,
    comments: ExtractedCommentItem[],
    optionsOrTitle: string | DocxCommentInjectionOptions = '合同文件'
  ): Promise<Buffer> {
    const detailedResult = await this.injectCommentsDetailed(originalBuffer, comments, optionsOrTitle);
    return detailedResult.buffer;
  }

  /**
   * 详细注入接口：返回带有明细证据与未定位报告的完整结果
   */
  public async injectCommentsDetailed(
    originalBuffer: Buffer,
    comments: ExtractedCommentItem[],
    optionsOrTitle: string | DocxCommentInjectionOptions = '合同文件'
  ): Promise<DocxCommentInjectionResult> {
    if (!originalBuffer || originalBuffer.length < 100) {
      throw new Error('Cannot inject comments: input buffer is empty or too small to be a valid DOCX file');
    }

    const options: DocxCommentInjectionOptions =
      typeof optionsOrTitle === 'string'
        ? { fallbackTitle: optionsOrTitle }
        : optionsOrTitle || {};

    const JSZip = getJSZip();
    let zip: any;
    try {
      zip = await JSZip.loadAsync(originalBuffer);
    } catch (err: any) {
      // 严禁静默生成虚假合同，明确抛出错误阻断脏数据流转
      throw new Error(`Cannot inject comments: input buffer is not a valid OpenXML DOCX archive (${err.message})`);
    }

    let docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) {
      throw new Error('Cannot inject comments: DOCX archive is corrupted, missing word/document.xml');
    }

    if (!comments || comments.length === 0) {
      return {
        buffer: originalBuffer,
        injectedCount: 0,
        unresolvedCount: 0,
        injectedComments: [],
        unresolvedComments: [],
      };
    }

    // 1. 读取并统计已有的批注及最大 ID，建立已存在批注索引以提供精准幂等性保障
    let commentsXml = await zip.file('word/comments.xml')?.async('string');
    let maxId = 0;
    interface ExistingWordComment {
      id: string;
      author: string;
      date: string;
      text: string;
      paragraphIndex?: number;
      parentCommentId?: string;
      paraId?: string;
    }
    const existingComments: ExistingWordComment[] = [];
    if (commentsXml) {
      const commentRegex = /<w:comment\s+w:id="(\d+)"(?:[^>]*?w:author="([^"]*)")?(?:[^>]*?w:date="([^"]*)")?(?:[^>]*?w:parentCommentId="([^"]*)")?[^>]*>([\s\S]*?)<\/w:comment>/g;
      let cm: RegExpExecArray | null;
      while ((cm = commentRegex.exec(commentsXml)) !== null) {
        const rawBody = cm[5] || '';
        // 关键修复：解码 XML 实体，保证与内存中的原始划词文本严格一致
        const cleanBody = unescapeXml(rawBody.replace(/<[^>]+>/g, '')).trim();
        const paraIdMatch = rawBody.match(/<w:p\b[^>]*\bw14:paraId="([^"]+)"/);
        existingComments.push({
          id: cm[1],
          author: cm[2] || '',
          date: cm[3] || '',
          parentCommentId: cm[4] || undefined,
          text: cleanBody,
          paraId: paraIdMatch ? paraIdMatch[1] : undefined,
        });
        const parsed = parseInt(cm[1], 10);
        if (parsed > maxId) maxId = parsed;
      }

      // 确保所有既有批注均具备规范 8 字节 paraId，若旧版或第三方文档缺失则动态补全并写回 commentsXml
      for (const ec of existingComments) {
        if (!ec.paraId) {
          ec.paraId = ((Math.floor(Math.random() * 0x7fffffff) + 0x10000000) & 0x7fffffff)
            .toString(16)
            .toUpperCase()
            .padStart(8, '0');
          const cTagRegex = new RegExp(`(<w:comment\\s+w:id="${ec.id}"[\\s\\S]*?<w:p)(?=[\\s>])`);
          commentsXml = commentsXml.replace(cTagRegex, `$1 w14:paraId="${ec.paraId}"`);
        }
      }
    }

    // 2. 解析正文段落列表与条款物理边界，并标记已有批注所在的物理段落
    const paragraphs = this.locator.parseParagraphs(docXml);
    const clauseBoundaries = this.locator.discoverClauseBoundaries(paragraphs, options.clauses);

    for (const ec of existingComments) {
      const pWithComment = paragraphs.find((p) => p.rawXml.includes(`w:id="${ec.id}"`));
      if (pWithComment) {
        ec.paragraphIndex = pWithComment.pIdx;
      }
    }

    let commentsExtendedXml = await zip.file('word/commentsExtended.xml')?.async('string');
    const existingCommentExMap = new Map<string, string | undefined>();
    if (commentsExtendedXml) {
      const exRegex = /<w15:commentEx\s+w15:paraId="([^"]*)"(?:\s+w15:paraIdParent="([^"]*)")?[^>]*\/>/g;
      let exm: RegExpExecArray | null;
      while ((exm = exRegex.exec(commentsExtendedXml)) !== null) {
        existingCommentExMap.set(exm[1], exm[2] || undefined);
      }
    }

    const newCommentXmlBlocks: string[] = [];
    const newCommentExBlocks: string[] = [];
    const commentsByParagraph = new Map<number, Array<{ commentId: string; item: ExtractedCommentItem; matchedSnippet?: string }>>();
    const injectedDetails: Array<DocxCommentInjectionResult['injectedComments'][0] & { paraId?: string; originalId?: string }> = [];
    const unresolvedComments: ExtractedCommentItem[] = [];
    const clientToWordIdMap = new Map<string, string>();

    // 3. 对每条批注执行多层精准定位（包含基于物理段落与作者的可靠幂等去重、回复线程继承）
    for (let i = 0; i < comments.length; i++) {
      const c = comments[i];
      const commentText = c.text || '';
      const normCommentText = commentText.replace(/\s+/g, '');

      // 解析父批注（如果是回复批注）
      let resolvedParentId: string | undefined = undefined;
      let parentPIdx: number | undefined = undefined;
      let parentParaId: string | undefined = undefined;
      let prevParentDetail: (typeof injectedDetails)[0] | undefined = undefined;

      if (c.parentCommentId) {
        const rawParent = String(c.parentCommentId);
        resolvedParentId = clientToWordIdMap.get(rawParent) || rawParent;

        // 优先在本次已注入批注中查找父段落与 paraId
        prevParentDetail = injectedDetails.find((d) => d.id === resolvedParentId || d.originalId === rawParent);
        if (prevParentDetail) {
          parentPIdx = prevParentDetail.targetParagraphIndex;
          parentParaId = prevParentDetail.paraId;
        } else {
          // 在既有文档段落与已存在批注中查找父批注
          const existingParent = existingComments.find((ec) => ec.id === resolvedParentId);
          if (existingParent) {
            parentPIdx = existingParent.paragraphIndex;
            parentParaId = existingParent.paraId;
          }
        }
      }

      // 定位目标段落
      const location = this.locator.locateComment(c, paragraphs, clauseBoundaries, options.clauses, parentPIdx);

      if (location.matchedPIdx === -1 || location.matchType === 'unresolved' || location.matchType === 'ambiguous') {
        c.status = location.matchType === 'ambiguous' ? 'ambiguous' : 'unresolved';
        unresolvedComments.push(c);
        this.logger.warn(`Comment ${c.id || i + 1} could not be accurately located (Clause: ${c.clauseId || c.clauseTitle || 'none'}, status: ${location.matchType}); skipping placement.`);
        continue;
      }

      // 幂等性校验：只有同一作者在同一物理段落中提交相同文本时，才判定为重复；绝不误删不同作者或不同条款的合法意见
      const duplicateExisting = existingComments.find(
        (ec) =>
          ec.paragraphIndex === location.matchedPIdx &&
          ec.text.replace(/\s+/g, '') === normCommentText &&
          (!c.author || !ec.author || ec.author === c.author)
      );
      if (duplicateExisting) {
        this.logger.log(`Comment "${commentText.slice(0, 25)}..." already exists in Word (ID: ${duplicateExisting.id}); skipping duplicate injection.`);
        if (c.id !== undefined) clientToWordIdMap.set(String(c.id), duplicateExisting.id);
        c.status = 'matched';
        continue;
      }

      // 分配唯一递增 Word Comment ID
      const commentId = String(maxId + injectedDetails.length + 1);
      if (c.id !== undefined) {
        clientToWordIdMap.set(String(c.id), commentId);
      }

      c.status = 'matched';

      const author = escapeXml(c.author || '法务审阅人');
      const date = c.date || new Date().toISOString();
      const initials = escapeXml(c.initials || '法务');
      const text = escapeXml(commentText);

      // 生成 Word 2013+ 规范的标准 8 字节 paraId
      const paraId = ((Math.floor(Math.random() * 0x7fffffff) + 0x10000000) & 0x7fffffff)
        .toString(16)
        .toUpperCase()
        .padStart(8, '0');

      // 构建 comments.xml 中的批注项（保留 parentCommentId 等元数据）
      const parentAttr = resolvedParentId ? ` w:parentCommentId="${escapeXml(resolvedParentId)}"` : '';
      newCommentXmlBlocks.push(
        `<w:comment w:id="${commentId}" w:author="${author}" w:date="${date}" w:initials="${initials}"${parentAttr}>` +
          `<w:p w14:paraId="${paraId}" w14:textId="77777777">` +
          `<w:pPr><w:pStyle w:val="CommentText"/></w:pPr>` +
          `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>` +
          `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>` +
          `</w:p>` +
          `</w:comment>`
      );

      // 构建 commentsExtended.xml 中的原生线程关系
      const parentExAttr = parentParaId ? ` w15:paraIdParent="${parentParaId}"` : '';
      newCommentExBlocks.push(`<w15:commentEx w15:paraId="${paraId}"${parentExAttr}/>`);

      // 关键判断：是否为原生线程回复批注（Threaded Reply）
      const isThreadedReply = Boolean(
        resolvedParentId && (prevParentDetail || existingComments.some((ec) => ec.id === resolvedParentId))
      );

      if (isThreadedReply && parentParaId) {
        // 如果父批注未在 commentsExtendedXml 或 newCommentExBlocks 中声明，补充声明以确保线程树完整
        const alreadyDeclaredInEx =
          (commentsExtendedXml && commentsExtendedXml.includes(`w15:paraId="${parentParaId}"`)) ||
          newCommentExBlocks.some((b) => b.includes(`w15:paraId="${parentParaId}"`));
        if (!alreadyDeclaredInEx) {
          newCommentExBlocks.unshift(`<w15:commentEx w15:paraId="${parentParaId}"/>`);
        }
      }

      // 权威规范：原生线程回复批注挂载在父批注线程下，严禁在 document.xml 中插入独立的 commentRangeStart/End/Reference 锚点！
      // 只有非回复的顶级批注才打入正文段落中。
      if (!isThreadedReply) {
        if (!commentsByParagraph.has(location.matchedPIdx)) {
          commentsByParagraph.set(location.matchedPIdx, []);
        }
        commentsByParagraph.get(location.matchedPIdx)!.push({
          commentId,
          item: c,
          matchedSnippet: location.matchedSnippet,
        });
      }

      injectedDetails.push({
        id: commentId,
        originalId: c.id !== undefined ? String(c.id) : undefined,
        paraId,
        targetParagraphIndex: location.matchedPIdx,
        targetTextSnippet: location.matchedSnippet || paragraphs[location.matchedPIdx]?.cleanText?.slice(0, 30) || '',
        clauseTitle: c.clauseTitle,
        isReply: isThreadedReply,
        parentCommentId: resolvedParentId,
      });
    }

    // 4. 从后向前倒序将批注锚定标记注入至 document.xml（保证 XML 结构偏移量绝对稳定）
    const sortedPIndices = Array.from(commentsByParagraph.keys()).sort((a, b) => b - a);

    for (const pIdx of sortedPIndices) {
      const pInfo = paragraphs[pIdx];
      const commList = commentsByParagraph.get(pIdx)!;

      let updatedP = pInfo.rawXml;
      for (const comm of commList) {
        updatedP = injectCommentRangeIntoParagraph(updatedP, comm.commentId, comm.matchedSnippet);
      }

      docXml = docXml.slice(0, pInfo.start) + updatedP + docXml.slice(pInfo.start + pInfo.length);
    }

    // 5. 写回更新后的 document.xml
    zip.file('word/document.xml', docXml);

    // 6. 写回或创建 word/comments.xml
    if (newCommentXmlBlocks.length > 0) {
      if (commentsXml) {
        const closeTagIdx = commentsXml.lastIndexOf('</w:comments>');
        if (closeTagIdx !== -1) {
          commentsXml =
            commentsXml.slice(0, closeTagIdx) + newCommentXmlBlocks.join('') + commentsXml.slice(closeTagIdx);
        } else {
          commentsXml = `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${newCommentXmlBlocks.join(
            ''
          )}</w:comments>`;
        }
        // 关键修复：自适应补齐 w14、w15、r 命名空间，彻底杜绝 Python ElementTree 与标准 OpenXML 解析器 unbound prefix 报错
        commentsXml = ensureRootNamespaces(commentsXml, {
          w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
          r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
          w15: 'http://schemas.microsoft.com/office/word/2012/wordml',
        });
      } else {
        commentsXml =
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
          `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
          `xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ` +
          `xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">\n` +
          newCommentXmlBlocks.join('\n') +
          `\n</w:comments>`;
      }
      zip.file('word/comments.xml', commentsXml);

      // 7. 写回或创建 word/commentsExtended.xml（Word 2013+ 原生线程批注扩展）
      if (newCommentExBlocks.length > 0 || commentsExtendedXml) {
        if (commentsExtendedXml) {
          const closeTagIdx = commentsExtendedXml.lastIndexOf('</w15:commentsEx>');
          if (closeTagIdx !== -1) {
            commentsExtendedXml =
              commentsExtendedXml.slice(0, closeTagIdx) + newCommentExBlocks.join('') + commentsExtendedXml.slice(closeTagIdx);
          } else {
            commentsExtendedXml = `<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">${newCommentExBlocks.join('')}</w15:commentsEx>`;
          }
          commentsExtendedXml = ensureRootNamespaces(commentsExtendedXml, {
            w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
            w15: 'http://schemas.microsoft.com/office/word/2012/wordml',
          });
        } else {
          commentsExtendedXml =
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
            `<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">\n` +
            newCommentExBlocks.join('\n') +
            `\n</w15:commentsEx>`;
        }
        zip.file('word/commentsExtended.xml', commentsExtendedXml);
      }

      // 8. 确保 [Content_Types].xml 声明 comments.xml 与 commentsExtended.xml
      let contentTypesXml = await zip.file('[Content_Types].xml')?.async('string');
      if (contentTypesXml) {
        let updatedContentTypes = contentTypesXml;
        if (!updatedContentTypes.includes('PartName="/word/comments.xml"')) {
          const insertPos = updatedContentTypes.lastIndexOf('</Types>');
          if (insertPos !== -1) {
            updatedContentTypes =
              updatedContentTypes.slice(0, insertPos) +
              `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>` +
              updatedContentTypes.slice(insertPos);
          }
        }
        if ((newCommentExBlocks.length > 0 || commentsExtendedXml) && !updatedContentTypes.includes('PartName="/word/commentsExtended.xml"')) {
          const insertPos = updatedContentTypes.lastIndexOf('</Types>');
          if (insertPos !== -1) {
            updatedContentTypes =
              updatedContentTypes.slice(0, insertPos) +
              `<Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/>` +
              updatedContentTypes.slice(insertPos);
          }
        }
        zip.file('[Content_Types].xml', updatedContentTypes);
      }

      // 9. 确保 word/_rels/document.xml.rels 建立与 comments.xml 及 commentsExtended.xml 的关联
      let docRelsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
      if (!docRelsXml) {
        docRelsXml =
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
          `<Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>\n` +
          `<Relationship Id="rIdCommentsEx" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/>\n` +
          `</Relationships>`;
        zip.file('word/_rels/document.xml.rels', docRelsXml);
      } else {
        let updatedRels = docRelsXml;
        if (!updatedRels.includes('Target="comments.xml"')) {
          const relIds = [...updatedRels.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1], 10));
          const nextRId = `rId${(relIds.length > 0 ? Math.max(...relIds) : 0) + 1}`;
          const insertPos = updatedRels.lastIndexOf('</Relationships>');
          if (insertPos !== -1) {
            updatedRels =
              updatedRels.slice(0, insertPos) +
              `<Relationship Id="${nextRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>` +
              updatedRels.slice(insertPos);
          }
        }
        if ((newCommentExBlocks.length > 0 || commentsExtendedXml) && !updatedRels.includes('Target="commentsExtended.xml"')) {
          const relIds = [...updatedRels.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1], 10));
          const nextRId = `rId${(relIds.length > 0 ? Math.max(...relIds) : 0) + 1}`;
          const insertPos = updatedRels.lastIndexOf('</Relationships>');
          if (insertPos !== -1) {
            updatedRels =
              updatedRels.slice(0, insertPos) +
              `<Relationship Id="${nextRId}" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/>` +
              updatedRels.slice(insertPos);
          }
        }
        zip.file('word/_rels/document.xml.rels', updatedRels);
      }
    }

    // 10. 确保 Open Packaging Conventions (OPC) 根关系文件 _rels/.rels 存在（保证 LibreOffice/WPS/Word 100% 正常读取）
    const rootRelsXml = await zip.file('_rels/.rels')?.async('string');
    if (!rootRelsXml) {
      zip.file(
        '_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n` +
          `</Relationships>`
      );
    }

    const outputBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    this.logger.log(
      `Successfully injected ${injectedDetails.length} comments (unresolved: ${unresolvedComments.length}) across ${sortedPIndices.length} paragraphs (${outputBuffer.length} bytes)`
    );

    return {
      buffer: outputBuffer,
      injectedCount: injectedDetails.length,
      unresolvedCount: unresolvedComments.length,
      injectedComments: injectedDetails,
      unresolvedComments,
    };
  }
}
