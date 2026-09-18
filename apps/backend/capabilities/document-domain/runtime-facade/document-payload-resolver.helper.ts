import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { BadRequestException, Logger } from '@nestjs/common';
import type { ContractCompareInput } from './contract-compare/contract-compare.types';
import type { BuiltinContractReviewInput } from './contract-review/contract-review.types';
import { fixFilenameEncoding } from './filename-encoding.util';

export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let current = startDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(current, 'pnpm-lock.yaml')) || fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
}

export const WORKSPACE_ROOT = process.env.PROJECT_ROOT || findWorkspaceRoot();

export function getCandidateStorageDirs(workspaceRoot: string = WORKSPACE_ROOT): string[] {
  const customOutputs = process.env.OUTPUTS_DIR;
  const customRenders = process.env.STORAGE_RENDER_DIR || process.env.MEDIA_STORAGE_PATH;
  const customCoordinationStorage = process.env.COORDINATION_STORAGE_ROOT;

  const dirs = [
    customOutputs,
    customRenders,
    customCoordinationStorage,
    path.join(workspaceRoot, 'apps', 'backend', 'var', 'outputs', 'document-engine'),
    path.join(workspaceRoot, 'apps', 'backend', 'var', 'outputs', 'document-engine', 'renders'),
    path.join(workspaceRoot, 'data', 'storage', 'attachments'),
    path.join(workspaceRoot, 'data', 'storage', 'uploads'),
    path.join(workspaceRoot, 'data', 'storage'),
    path.join(workspaceRoot, 'apps', 'backend', 'intelligence', 'ai-orchestrator', 'data', 'storage', 'uploads'),
    path.join(workspaceRoot, 'tests', 'contract'),
    path.join(workspaceRoot, 'docs', 'artifacts', 'sample-contracts'),
    path.join(process.cwd(), 'outputs'),
    path.join(process.cwd(), '.tmp', 'renders'),
    path.resolve(process.cwd(), 'data/storage/attachments'),
    path.resolve(process.cwd(), '../../../data/storage/attachments'),
    path.resolve(process.cwd(), '../../../../data/storage/attachments'),
    '/workspace/data/storage/attachments',
    '/tmp/coordination-attachments',
  ];

  return dirs.filter((d): d is string => typeof d === 'string' && d.trim().length > 0);
}

export function tryReadFileById(
  fileId: string,
  candidateDirs: string[] = getCandidateStorageDirs(),
  logger?: Logger
): Buffer | null {
  if (!fileId || typeof fileId !== 'string') return null;

  const cleanId = fileId.replace(/^att_/, '');
  const idVariants = Array.from(new Set([fileId, cleanId, `att_${cleanId}`])).filter(Boolean);

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;

    // 1. Check metadata files (.meta.json for coordination attachments, or .json for document-engine)
    for (const variant of idVariants) {
      const metaCandidates = [
        path.join(dir, `${variant}.meta.json`),
        path.join(dir, `${variant}.json`),
      ];

      for (const metaPath of metaCandidates) {
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            if (meta.storagePath && fs.existsSync(meta.storagePath)) {
              const stat = fs.statSync(meta.storagePath);
              if (stat.isFile() && stat.size > 0) {
                logger?.log(`Found contract document via attachment meta storagePath: ${meta.storagePath} (${stat.size} bytes)`);
                return fs.readFileSync(meta.storagePath);
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    // 2. Direct exact or prefixed file match in the directory
    try {
      const files = fs.readdirSync(dir);
      for (const variant of idVariants) {
        for (const file of files) {
          if (
            file === `${variant}.docx` ||
            file === `${variant}.pdf` ||
            file === `${variant}.doc` ||
            file.startsWith(`${variant}_`) ||
            file.startsWith(`${variant}.`)
          ) {
            if (file.endsWith('.json') || file.endsWith('.meta.json')) continue;
            const filePath = path.join(dir, file);
            try {
              const stat = fs.statSync(filePath);
              if (stat.isFile() && stat.size > 0) {
                logger?.log(`Found contract document by ID pattern: ${filePath} (${stat.size} bytes)`);
                return fs.readFileSync(filePath);
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export function tryReadFileByName(
  fileName: string,
  candidateDirs: string[] = getCandidateStorageDirs(),
  workspaceRoot: string = WORKSPACE_ROOT,
  logger?: Logger
): Buffer | null {
  if (!fileName || typeof fileName !== 'string') return null;

  const normalizedName = fixFilenameEncoding(fileName.trim());

  // 1. Check if direct absolute or workspace-relative path
  const directCandidates = [
    normalizedName,
    path.resolve(workspaceRoot, normalizedName),
    path.resolve(process.cwd(), normalizedName),
  ];
  for (const candidate of directCandidates) {
    if (fs.existsSync(candidate)) {
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile() && stat.size > 0) {
          logger?.log(`Found contract document by direct path: ${candidate} (${stat.size} bytes)`);
          return fs.readFileSync(candidate);
        }
      } catch {
        // ignore
      }
    }
  }

  // 2. Check candidate directories directly
  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    const candidatePath = path.join(dir, normalizedName);
    if (fs.existsSync(candidatePath)) {
      try {
        const stat = fs.statSync(candidatePath);
        if (stat.isFile() && stat.size > 0) {
          logger?.log(`Found contract document by name: ${candidatePath} (${stat.size} bytes)`);
          return fs.readFileSync(candidatePath);
        }
      } catch {
        // ignore
      }
    }

    // 3. Scan metadata .json files in candidate directory
    try {
      const files = fs.readdirSync(dir);
      const scoredCandidates: Array<{ filePath: string; score: number; mtime: number }> = [];

      for (const f of files) {
        if (f.endsWith('.json')) {
          try {
            const metaPath = path.join(dir, f);
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            const id = meta.id || meta.attachmentId || f.replace(/\.(?:meta\.)?json$/, '');
            const ext = meta.format ? `.${meta.format}` : '.docx';
            const matchedFilePath = meta.storagePath && fs.existsSync(meta.storagePath)
              ? meta.storagePath
              : path.join(dir, `${id}${ext}`);
            if (!fs.existsSync(matchedFilePath)) continue;

            if (meta.fileName === normalizedName || meta.outputName === normalizedName) {
              const stat = fs.statSync(matchedFilePath);
              scoredCandidates.push({ filePath: matchedFilePath, score: 100, mtime: stat.mtimeMs });
              continue;
            }

            let score = 0;
            const normClean = normalizedName.replace(/\.(docx|pdf|doc)$/i, '');
            const metaFileClean = String(meta.fileName || '').replace(/\.(docx|pdf|doc)$/i, '');

            if (
              normClean &&
              metaFileClean &&
              (normClean.startsWith(metaFileClean.slice(0, 4)) || metaFileClean.startsWith(normClean.slice(0, 4)))
            ) {
              score += 20;
            }

            if (meta.params && typeof meta.params === 'object') {
              for (const pv of Object.values(meta.params)) {
                if (typeof pv === 'string' && pv.length >= 2) {
                  if (normalizedName.includes(pv) || (normClean.length >= 4 && pv.includes(normClean.slice(0, 4)))) {
                    score += 15;
                  }
                }
              }
            }

            if (score > 0) {
              const stat = fs.statSync(matchedFilePath);
              scoredCandidates.push({ filePath: matchedFilePath, score, mtime: stat.mtimeMs });
            }
          } catch {
            // ignore
          }
        }
      }

      if (scoredCandidates.length > 0) {
        scoredCandidates.sort((a, b) => (b.score !== a.score ? b.score - a.score : b.mtime - a.mtime));
        const best = scoredCandidates[0];
        if (best && best.score >= 20) {
          logger?.log(`Found document matched via metadata fuzzy score (${best.score}): ${best.filePath}`);
          return fs.readFileSync(best.filePath);
        }
      }
    } catch {
      // ignore
    }
  }

  // 4. If filename contains UUID, try matching by ID
  const uuidMatch = normalizedName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (uuidMatch && uuidMatch[1]) {
    const fromId = tryReadFileById(uuidMatch[1], candidateDirs, logger);
    if (fromId) return fromId;
  }

  return null;
}

export async function fetchFileFromUrl(targetUrl: string, logger?: Logger): Promise<Buffer | null> {
  if (!targetUrl || typeof targetUrl !== 'string') return null;

  let resolvedUrl = targetUrl;
  if (resolvedUrl.startsWith('/')) {
    const platformHost = process.env.PLATFORM_HOST || process.env.HOST_IP || 'platform';
    const platformPort = process.env.AUTH_PORT || '3001';
    resolvedUrl = `http://${platformHost}:${platformPort}${resolvedUrl}`;
  }

  if (!/^https?:\/\//i.test(resolvedUrl)) return null;
  try {
    logger?.log(`Fetching contract document from URL: ${resolvedUrl}`);
    const resp = await axios.get(resolvedUrl, { responseType: 'arraybuffer', timeout: 15000 });
    if (resp.status >= 200 && resp.status < 300 && resp.data) {
      return Buffer.from(resp.data as ArrayBuffer);
    }
  } catch (err) {
    logger?.warn(`Failed fetching document from ${resolvedUrl}: ${(err as Error).message}`);
  }
  return null;
}

export interface DocumentResolutionTarget {
  fileBase64?: string;
  fileName?: string;
  text?: string;
  url?: string;
  downloadUrl?: string;
  fileUrl?: string;
}

export async function resolveDocumentBuffer(
  target: DocumentResolutionTarget,
  candidateDirs: string[] = getCandidateStorageDirs(),
  workspaceRoot: string = WORKSPACE_ROOT,
  logger?: Logger
): Promise<{ buffer: Buffer | null; resolvedFileName?: string; fallbackText?: string }> {
  let fileBuffer: Buffer | null = null;
  let resolvedFileName = target.fileName;

  // 1. Try resolving via URL (UUID or download path on disk first, then remote fetch)
  const targetUrl = target.downloadUrl || target.fileUrl || target.url;
  if (targetUrl) {
    const queryNameMatch = targetUrl.match(/[\?&]fileName=([^&#]+)/i);
    if (queryNameMatch && !resolvedFileName) {
      try {
        resolvedFileName = decodeURIComponent(queryNameMatch[1]);
      } catch {
        resolvedFileName = queryNameMatch[1];
      }
    }

    const attMatch = targetUrl.match(/attachments\/(att_[0-9a-f\-]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const pathIdMatch = targetUrl.match(/\/(?:studio\/download|download|renders|outputs|attachments)\/([a-zA-Z0-9_\-]+?)(?:\.[a-z0-9]+)?(?:[?#]|$)/i);
    const uuidMatch = targetUrl.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const targetFileId = attMatch?.[1] || pathIdMatch?.[1] || uuidMatch?.[1];
    if (targetFileId) {
      fileBuffer = tryReadFileById(targetFileId, candidateDirs, logger);
      if (fileBuffer && !resolvedFileName) {
        for (const dir of candidateDirs) {
          const metaCandidates = [
            path.join(dir, `${targetFileId}.meta.json`),
            path.join(dir, `${targetFileId}.json`),
          ];
          for (const mp of metaCandidates) {
            if (fs.existsSync(mp)) {
              try {
                const meta = JSON.parse(fs.readFileSync(mp, 'utf8'));
                if (meta.fileName || meta.outputName) {
                  resolvedFileName = meta.fileName || meta.outputName;
                  break;
                }
              } catch {
                // ignore
              }
            }
          }
          if (resolvedFileName) break;
        }
      }
    }
    if (!fileBuffer) {
      fileBuffer = await fetchFileFromUrl(targetUrl, logger);
    }
  }

  // 2. Try resolving via fileName
  if (!fileBuffer && target.fileName) {
    fileBuffer = tryReadFileByName(target.fileName, candidateDirs, workspaceRoot, logger);
  }

  return {
    buffer: fileBuffer,
    resolvedFileName,
    fallbackText: target.text,
  };
}

export async function resolveReviewDocumentPayload(
  input: BuiltinContractReviewInput,
  candidateDirs: string[] = getCandidateStorageDirs(),
  workspaceRoot: string = WORKSPACE_ROOT,
  logger?: Logger
): Promise<void> {
  if (input.fileBase64 || input.text) {
    return;
  }

  let targetUrl = input.downloadUrl || input.fileUrl || input.url;
  let targetFileName = input.fileName;
  let fallbackText: string | undefined;

  // 1. Check input.files array (e.g. from chat uploaded files)
  const filesArray = (input as any).files;
  if (Array.isArray(filesArray) && filesArray.length > 0) {
    const f0 = filesArray[0];
    if (f0.content && !input.fileBase64) input.fileBase64 = f0.content;
    if (f0.fileName && !targetFileName) targetFileName = f0.fileName;
    if (!targetUrl) targetUrl = f0.url || f0.downloadUrl || f0.fileUrl || f0.storagePath;
  }

  // 2. Check taskContext attachments
  if (input.taskContext?.attachments && Array.isArray(input.taskContext.attachments)) {
    for (const att of input.taskContext.attachments) {
      if (!targetUrl && (att.url || att.downloadUrl || att.storagePath)) {
        targetUrl = att.url || att.downloadUrl || att.storagePath;
      }
      if (!targetFileName && att.name) {
        targetFileName = att.name;
      }
    }
  }

  // 3. Check taskContext references
  if (input.taskContext?.references && Array.isArray(input.taskContext.references)) {
    for (const ref of input.taskContext.references) {
      if (!ref) continue;
      const struct = ref.structuredData;
      const resultObj = struct?.result || struct;
      if (!targetUrl && resultObj?.downloadUrl) {
        targetUrl = resultObj.downloadUrl;
      }
      if (!targetUrl && resultObj?.fileUrl) {
        targetUrl = resultObj.fileUrl;
      }
      if (!targetFileName && resultObj?.fileName) {
        targetFileName = resultObj.fileName;
      }
      if (!fallbackText && typeof ref.detailText === 'string') {
        fallbackText = ref.detailText;
      }
      if (!targetUrl && typeof ref.detailText === 'string') {
        const urlMatch = ref.detailText.match(/https?:\/\/[^\s\)\"\'\<\>]+/i);
        if (urlMatch) {
          targetUrl = urlMatch[0];
        }
      }
    }
  }

  // 4. Scan all string fields in input for markdown links or URLs
  if (!targetUrl) {
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      if (typeof val === 'string' && val.length > 0) {
        const mdMatch = val.match(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+|\/[^\s\)]+)\)/i);
        if (mdMatch && mdMatch[2]) {
          targetUrl = mdMatch[2];
          if (!targetFileName && mdMatch[1]) targetFileName = mdMatch[1];
          break;
        }
        const urlMatch = val.match(/(https?:\/\/[^\s\)\"\'\<\>]+)/i);
        if (urlMatch && urlMatch[1]) {
          targetUrl = urlMatch[1];
          break;
        }
      }
    }
  }

  const { buffer, resolvedFileName, fallbackText: resolvedFallback } = await resolveDocumentBuffer(
    {
      fileBase64: input.fileBase64,
      fileName: targetFileName,
      text: input.text || fallbackText,
      url: targetUrl,
    },
    candidateDirs,
    workspaceRoot,
    logger
  );

  if (buffer && buffer.length > 0) {
    input.fileBase64 = buffer.toString('base64');
    const finalName = targetFileName || resolvedFileName;
    if (finalName && !input.fileName) {
      input.fileName = finalName;
    }
    logger?.log(
      `Successfully auto-resolved review document payload (${buffer.length} bytes, fileName=${input.fileName || finalName})`
    );
  } else if (resolvedFallback && !input.text) {
    input.text = resolvedFallback;
    logger?.log(`Fallback to detailText from taskContext references (${resolvedFallback.length} chars)`);
  }
}

export async function resolveCompareDocumentPayloads(
  input: ContractCompareInput,
  candidateDirs: string[] = getCandidateStorageDirs(),
  workspaceRoot: string = WORKSPACE_ROOT,
  logger?: Logger
): Promise<void> {
  // 1. Support input.files array if provided (e.g. from chat uploaded files)
  const filesArray = (input as any).files;
  if (Array.isArray(filesArray) && filesArray.length > 0) {
    if (!input.fileBase64A && !input.textA && filesArray[0]) {
      const f0 = filesArray[0];
      if (f0.content) input.fileBase64A = f0.content;
      if (f0.fileName && !input.fileNameA) input.fileNameA = f0.fileName;
      if (f0.url && !(input as any).downloadUrlA) (input as any).downloadUrlA = f0.url;
    }
    if (!input.fileBase64B && !input.textB && filesArray[1]) {
      const f1 = filesArray[1];
      if (f1.content) input.fileBase64B = f1.content;
      if (f1.fileName && !input.fileNameB) input.fileNameB = f1.fileName;
      if (f1.url && !(input as any).downloadUrlB) (input as any).downloadUrlB = f1.url;
    }
  }

  // 2. Resolve Document A
  const hasDocA = Boolean(input.fileBase64A || input.textA);
  if (!hasDocA) {
    const targetA: DocumentResolutionTarget = {
      fileName: input.fileNameA,
      downloadUrl: (input as any).downloadUrlA || (input as any).fileUrlA || (input as any).urlA,
    };

    // If taskContext references exist, extract reference 0
    const taskRefs = (input as any).taskContext?.references;
    if (Array.isArray(taskRefs) && taskRefs.length > 0) {
      const ref0 = taskRefs[0];
      const struct0 = ref0?.structuredData?.result || ref0?.structuredData;
      if (!targetA.downloadUrl && struct0?.downloadUrl) targetA.downloadUrl = struct0.downloadUrl;
      if (!targetA.downloadUrl && struct0?.fileUrl) targetA.downloadUrl = struct0.fileUrl;
      if (!targetA.fileName && struct0?.fileName) targetA.fileName = struct0.fileName;
      if (!targetA.text && typeof ref0?.detailText === 'string') targetA.text = ref0.detailText;
    }

    const { buffer: bufA, resolvedFileName: nameA, fallbackText: textA } = await resolveDocumentBuffer(
      targetA,
      candidateDirs,
      workspaceRoot,
      logger
    );

    if (bufA && bufA.length > 0) {
      input.fileBase64A = bufA.toString('base64');
      if (nameA && !input.fileNameA) input.fileNameA = nameA;
      logger?.log(`Successfully auto-resolved contract A payload (${bufA.length} bytes, fileName=${input.fileNameA})`);
    } else if (textA && !input.textA) {
      input.textA = textA;
    }
  }

  // 3. Resolve Document B
  const hasDocB = Boolean(input.fileBase64B || input.textB);
  if (!hasDocB) {
    const targetB: DocumentResolutionTarget = {
      fileName: input.fileNameB,
      downloadUrl: (input as any).downloadUrlB || (input as any).fileUrlB || (input as any).urlB,
    };

    // If taskContext references exist, extract reference 1 (or check matching filename)
    const taskRefs = (input as any).taskContext?.references;
    if (Array.isArray(taskRefs) && taskRefs.length > 1) {
      const ref1 = taskRefs[1];
      const struct1 = ref1?.structuredData?.result || ref1?.structuredData;
      if (!targetB.downloadUrl && struct1?.downloadUrl) targetB.downloadUrl = struct1.downloadUrl;
      if (!targetB.downloadUrl && struct1?.fileUrl) targetB.downloadUrl = struct1.fileUrl;
      if (!targetB.fileName && struct1?.fileName) targetB.fileName = struct1.fileName;
      if (!targetB.text && typeof ref1?.detailText === 'string') targetB.text = ref1.detailText;
    }

    const { buffer: bufB, resolvedFileName: nameB, fallbackText: textB } = await resolveDocumentBuffer(
      targetB,
      candidateDirs,
      workspaceRoot,
      logger
    );

    if (bufB && bufB.length > 0) {
      input.fileBase64B = bufB.toString('base64');
      if (nameB && !input.fileNameB) input.fileNameB = nameB;
      logger?.log(`Successfully auto-resolved contract B payload (${bufB.length} bytes, fileName=${input.fileNameB})`);
    } else if (textB && !input.textB) {
      input.textB = textB;
    }
  }

  // 4. Validate existence of both documents with descriptive messages
  const finalHasA = Boolean(input.fileBase64A || input.textA);
  const finalHasB = Boolean(input.fileBase64B || input.textB);

  if (!finalHasA && !finalHasB) {
    throw new BadRequestException('请提供基准合同（合同A）和比对合同（合同B）的文件或正文内容。');
  }
  if (!finalHasA) {
    const identifier = input.fileNameA ? `“${input.fileNameA}”` : '';
    throw new BadRequestException(`未找到基准合同（合同A ${identifier}）的文件内容，请核对上传文件或输入合同正文。`);
  }
  if (!finalHasB) {
    const identifier = input.fileNameB ? `“${input.fileNameB}”` : '';
    throw new BadRequestException(`未找到比对合同（合同B ${identifier}）的文件内容，请核对上传文件或输入合同正文。`);
  }
}
