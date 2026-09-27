import * as fs from 'fs';
import * as path from 'path';

/**
 * 剔除沙箱执行过程中可能遗留的工具调用内部标记、XML/DSML 标签与裸露 JSON，防止泄露至最终回答
 */
export function stripToolCallArtifacts(raw: string): string {
  let res = (raw || '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/<tool_call>[\s\S]*$/g, '')
    .replace(/<(?:[a-zA-Z0-9_-]+_tool|tool_[a-zA-Z0-9_-]+|arguments)[^>]*>[\s\S]*?<\/(?:[a-zA-Z0-9_-]+_tool|tool_[a-zA-Z0-9_-]+|arguments)>/g, '')
    .replace(/<\/?(?:[a-zA-Z0-9_-]+_tool|tool_[a-zA-Z0-9_-]+|arguments)[^>]*>/g, '')
    .replace(/<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*(?:calls|tool_calls)>[\s\S]*?<\/[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*(?:calls|tool_calls)>/g, '')
    .replace(/<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*invoke[\s\S]*?<\/[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*invoke>/g, '')
    .replace(/<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}[\s\S]*$/g, '')
    .replace(/<\/?(?:tool_call|tool_calls|[｜|]{1,2}\s*DSML\s*[｜|]{1,2}[^>]*)>/g, '')
    .replace(/<[｜|]{1,2}[\s\S]*?[｜|]{1,2}>/g, '');

  // 剔除可能残留的裸 JSON 工具调用（支持多层嵌套与未闭合截断）
  const toolHeader = /\{\s*"(?:name|tool|action)"\s*:\s*"[^"]+"/;
  let match: RegExpExecArray | null;
  while ((match = toolHeader.exec(res)) !== null) {
    const idx = match.index;
    let inString = false;
    let escape = false;
    let depth = 0;
    let endIdx = idx;
    for (let i = idx; i < res.length; i++) {
      const c = res[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            endIdx = i + 1;
            break;
          }
        }
      }
    }
    if (depth > 0) {
      res = res.slice(0, idx).trim();
      break;
    } else {
      res = (res.slice(0, idx) + res.slice(endIdx)).trim();
    }
  }
  return res.replace(/```(?:json)?\s*```/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 剥除可能包裹在整个 Markdown 回复外层的围栏代码块
 */
export function unwrapOuterMarkdownFence(content: string): string {
  if (!content) return '';
  let cleaned = content.trim();
  cleaned = cleaned.replace(/^len=\d+:\s*/, '').trim();

  const fullMatch = cleaned.match(/^```(?:markdown|md)\s*\n([\s\S]*?)\n```\s*$/i);
  if (fullMatch && fullMatch[1]) {
    return fullMatch[1].trim();
  }

  const blockMatch = cleaned.match(/^([\s\S]*?)```(?:markdown|md)\s*\n([\s\S]*?)\n```([\s\S]*)$/i);
  if (blockMatch) {
    const pre = (blockMatch[1] || '').trim();
    const body = (blockMatch[2] || '').trim();
    const post = (blockMatch[3] || '').trim();
    return [pre, body, post].filter(Boolean).join('\n\n');
  }

  const unclosedMatch = cleaned.match(/^([\s\S]*?)```(?:markdown|md)\s*\n([\s\S]*)$/i);
  if (unclosedMatch) {
    const pre = (unclosedMatch[1] || '').trim();
    const body = (unclosedMatch[2] || '').trim();
    return [pre, body].filter(Boolean).join('\n\n');
  }

  return cleaned;
}

export interface EmbedWorkspaceDeliverablesOptions {
  userId: string;
  text: string;
  outboundFiles: Array<{ filePath: string; fileName: string; comment?: string }>;
  sessionFiles?: string[];
  turnStartTime?: number;
  getWorkspaceFilePath: (userId: string, fileName: string) => string | null;
  onImageResolveError?: (fileName: string, err: any) => void;
}

/**
 * 将沙箱工作区生成或提及的图片转换为 Markdown 图片链接，直接呈现在聊天界面
 */
export function embedWorkspaceImagesInAnswer(
  userId: string,
  text: string,
  outboundFiles: Array<{ filePath: string; fileName: string; comment?: string }>,
  getWorkspaceFilePath: (userId: string, fileName: string) => string | null,
  onImageResolveError?: (fileName: string, err: any) => void
): string {
  let result = text;
  const handledFiles = new Set<string>();
  const imageExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

  const getFileUrl = (fileName: string): string | null => {
    try {
      const cleanName = path.basename(fileName);
      const filePath = getWorkspaceFilePath(userId, cleanName);
      if (!filePath) return null;
      const ext = path.extname(cleanName).toLowerCase();
      if (!imageExts.has(ext)) return null;
      return `/api/ai/chat/workspace-files/${encodeURIComponent(userId)}/${encodeURIComponent(cleanName)}`;
    } catch (err: any) {
      onImageResolveError?.(fileName, err);
      return null;
    }
  };

  // 1. 如果文本中已包含 ![](/workspace/...) 或 ![](filename)
  result = result.replace(
    /!\[(.*?)\]\((?:(?:\/workspace\/)?([a-zA-Z0-9_\-.]+\.(?:png|jpg|jpeg|webp|gif|svg)))\)/gi,
    (match, alt, fileName) => {
      const fileUrl = getFileUrl(fileName);
      if (fileUrl) {
        handledFiles.add(path.basename(fileName));
        return `![${alt || fileName}](${fileUrl})`;
      }
      return match;
    }
  );

  // 2. 检查 outboundFiles 中未渲染的图片文件
  for (const f of outboundFiles) {
    const cleanName = path.basename(f.fileName || f.filePath);
    if (handledFiles.has(cleanName)) continue;
    const ext = path.extname(cleanName).toLowerCase();
    if (imageExts.has(ext)) {
      const fileUrl = getFileUrl(cleanName);
      if (fileUrl) {
        handledFiles.add(cleanName);
        result += `\n\n![${f.comment || cleanName}](${fileUrl})\n`;
      }
    }
  }

  // 3. 检查正文中可能提到的 /workspace/xxx.(png|jpg|jpeg|webp|gif|svg)
  const mentionedMatches = result.match(/\/workspace\/([a-zA-Z0-9_\-.]+\.(?:png|jpg|jpeg|webp|gif|svg))/gi);
  if (mentionedMatches) {
    for (const m of mentionedMatches) {
      const cleanName = path.basename(m);
      if (handledFiles.has(cleanName)) continue;
      const fileUrl = getFileUrl(cleanName);
      if (fileUrl) {
        handledFiles.add(cleanName);
        result += `\n\n![${cleanName}](${fileUrl})\n`;
      }
    }
  }

  return result;
}

/**
 * 将沙箱工作区生成或提及的交付物（图片、Office 文档、PDF、压缩包等）转换为 Markdown 内联呈现或专属下载卡片
 */
export function embedWorkspaceDeliverablesAndImagesInAnswer(
  options: EmbedWorkspaceDeliverablesOptions
): string {
  const {
    userId,
    text,
    outboundFiles,
    sessionFiles = [],
    turnStartTime,
    getWorkspaceFilePath,
    onImageResolveError,
  } = options;

  // 1. 先进行图片内联转换
  let result = embedWorkspaceImagesInAnswer(userId, text, outboundFiles, getWorkspaceFilePath, onImageResolveError);

  // 2. 文档与交付物扩展名
  const deliverableExts = new Set([
    '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
    '.pdf', '.zip', '.tar', '.gz', '.csv', '.txt', '.md', '.markdown', '.html'
  ]);

  // 记录用户上传的原始输入附件文件名，严禁将其作为“新生成产物”推荐给用户
  const inputFiles = new Set(sessionFiles.map((f) => path.basename(f).toLowerCase().trim()));

  const getFileIcon = (ext: string): string => {
    if (ext === '.docx' || ext === '.doc') return '📄';
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') return '📊';
    if (ext === '.pptx' || ext === '.ppt') return '📑';
    if (ext === '.pdf') return '📕';
    if (ext === '.md' || ext === '.markdown') return '📝';
    if (ext === '.zip' || ext === '.tar' || ext === '.gz') return '📦';
    if (ext === '.html') return '🌐';
    return '📎';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handledFiles = new Set<string>();

  // 2.1 将正文中现存的 Markdown 链接中的 /workspace/xxx 或本地文件名改写为直链下载地址
  result = result.replace(
    /\[(.*?)\]\((?:(?:\/workspace\/)?([a-zA-Z0-9_\-\u4e00-\u9fa5 ]+\.(?:docx?|xlsx?|pptx?|pdf|zip|tar|gz|csv|md|markdown|html)))\)/gi,
    (match, label, fileName) => {
      const cleanName = path.basename(fileName.trim());
      const filePath = getWorkspaceFilePath(userId, cleanName);
      if (filePath && fs.existsSync(filePath)) {
        handledFiles.add(cleanName);
        const fileUrl = `/api/ai/chat/workspace-files/${encodeURIComponent(userId)}/${encodeURIComponent(cleanName)}`;
        return `[${label || cleanName}](${fileUrl})`;
      }
      return match;
    }
  );

  // 2.2 收集外发及文本中提及的文件
  const candidateDeliverables: Array<{ fileName: string; filePath?: string; comment?: string }> = [];

  const isTemporaryDeliverableFile = (fileName: string): boolean => {
    const clean = path.basename(fileName).toLowerCase().trim();
    const nameWithoutExt = clean.replace(/\.[^.]+$/, '');
    const tempPrefixes = ['test', 'temp', 'tmp', 'dummy', 'sample', 'demo', 'untitled'];
    const matchesPrefix = tempPrefixes.some(
      (prefix) =>
        nameWithoutExt === prefix ||
        nameWithoutExt.startsWith(`${prefix}_`) ||
        nameWithoutExt.startsWith(`${prefix}-`) ||
        nameWithoutExt.startsWith(`${prefix}.`)
    );
    const matchesSuffix = nameWithoutExt.endsWith('_test') || nameWithoutExt.endsWith('-test');
    return matchesPrefix || matchesSuffix || nameWithoutExt.startsWith('_');
  };

  for (const f of outboundFiles) {
    const cleanName = path.basename(f.fileName || f.filePath || '').trim();
    if (!cleanName) continue;
    // 过滤输入文件
    if (inputFiles.has(cleanName.toLowerCase())) continue;
    // 过滤未在最终正文中作为交付物明确提及的临时/测试文件（如 test.pdf, tmp.docx 等）
    if (isTemporaryDeliverableFile(cleanName) && !result.includes(cleanName)) continue;
    const ext = path.extname(cleanName).toLowerCase();
    if (deliverableExts.has(ext) && !candidateDeliverables.some((c) => c.fileName === cleanName)) {
      candidateDeliverables.push({
        fileName: cleanName,
        filePath: f.filePath,
        comment: f.comment,
      });
    }
  }

  // 扫描正文提及的文件名（如 《保密合同_审查意见书.docx》 或 保密合同_审查意见书.docx）
  const mentionRegex = /(?:《|【|“|"|'|`|\/workspace\/)?([a-zA-Z0-9_\-\u4e00-\u9fa5 ]+\.(?:docx?|xlsx?|pptx?|pdf|zip|tar|gz|csv|md|markdown|html))(?:》|】|”|"|'|`|\b)?/gi;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(result)) !== null) {
    const foundName = match[1]?.trim();
    if (!foundName) continue;
    // 严禁将用户本轮上传的原始输入附件作为“AI生成产物”挂载
    if (inputFiles.has(foundName.toLowerCase())) continue;

    // 语意排除：若文件名紧随在示例/引用/历史说明词之后（如 “例如 xxx.xlsx”、“(如 xxx.xlsx)”、“历史文件 xxx.xlsx”、“最后更新 ... (如 xxx.xlsx)”），不视为生成交付物
    const matchIndex = match.index;
    const prefixText = result.slice(Math.max(0, matchIndex - 40), matchIndex);
    if (
      /(?:(?:例如|比如|样例|示例|例[：:]?|e\.g\.|eg\.|最后更新|更新于|历史文件|旧文件)|(?:^|[（(【\s])如[：:]?)\s*$/i.test(
        prefixText
      )
    ) {
      continue;
    }

    if (!candidateDeliverables.some((c) => c.fileName === foundName)) {
      const ext = path.extname(foundName).toLowerCase();
      if (deliverableExts.has(ext)) {
        const filePath = getWorkspaceFilePath(userId, foundName);
        if (filePath && fs.existsSync(filePath)) {
          // 物理时间戳防误判：如果提供了 turnStartTime，且文件修改时间明确早于本轮交互开始前（缓冲3秒），说明该文件是历史遗留文件而非本轮生成，不自动作为产物挂载
          if (turnStartTime) {
            try {
              const stats = fs.statSync(filePath);
              const mtime =
                typeof stats.mtimeMs === 'number'
                  ? stats.mtimeMs
                  : stats.mtime instanceof Date
                    ? stats.mtime.getTime()
                    : undefined;
              if (typeof mtime === 'number' && mtime < turnStartTime - 3000) {
                continue;
              }
            } catch {
              // 读取失败则忽略异常
            }
          }

          candidateDeliverables.push({ fileName: foundName, filePath });
        }
      }
    }
  }

  // 2.3 生成下载卡片
  const downloadCards: string[] = [];
  for (const item of candidateDeliverables) {
    if (handledFiles.has(item.fileName)) continue;
    const filePath = item.filePath && fs.existsSync(item.filePath)
      ? item.filePath
      : getWorkspaceFilePath(userId, item.fileName);
    if (!filePath || !fs.existsSync(filePath)) continue;

    handledFiles.add(item.fileName);
    const ext = path.extname(item.fileName).toLowerCase();
    if (ext === '.html' && result.includes('```html')) continue;
    const icon = getFileIcon(ext);
    let sizeInfo = '';
    try {
      const stats = fs.statSync(filePath);
      sizeInfo = ` · ${formatFileSize(stats.size)}`;
    } catch {
      // ignore
    }
    const fileUrl = `/api/ai/chat/workspace-files/${encodeURIComponent(userId)}/${encodeURIComponent(item.fileName)}`;
    const displayName = item.fileName.startsWith('《') && item.fileName.endsWith('》')
      ? item.fileName
      : `《${item.fileName}》`;
    downloadCards.push(`- ${icon} **[${displayName}](${fileUrl})** (点击直接下载${sizeInfo})`);
  }

  if (downloadCards.length > 0) {
    result = result.trimEnd() + `\n\n> 📥 **生成产物已就绪**：\n` + downloadCards.map((c) => `> ${c}`).join('\n') + '\n';
  }

  return result;
}
