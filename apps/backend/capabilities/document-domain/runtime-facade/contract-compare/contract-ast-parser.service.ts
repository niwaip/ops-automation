import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as mammoth from 'mammoth';
import type {
  ContractClauseNode,
  DocumentAstMetadata,
  ContractAstParseResult,
} from './contract-compare.types';
import { PdfContentExtractorService } from '../content-extraction/pdf-content-extractor.service';
import { parseDocxOpenXml } from './docx-openxml-parser.util';
import {
  parseTextToClauses,
  parseHtmlToClauses,
  cleanMarkdownFormatting,
  TIER1_CHAPTER_REGEX,
  TIER2_ARTICLE_REGEX,
  ANNEX_BOUNDARY_REGEX,
} from './contract-clause-segmenter.util';

function findWorkspaceRoot(startDir: string): string {
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

const WORKSPACE_ROOT = process.env.PROJECT_ROOT || findWorkspaceRoot(process.cwd());

export interface ContractAstParseInput {
  base64?: string;
  fileName?: string;
  text?: string;
}

@Injectable()
export class ContractAstParserService {
  private readonly logger = new Logger(ContractAstParserService.name);

  constructor(
    private readonly pdfExtractor: PdfContentExtractorService = new PdfContentExtractorService()
  ) {}

  public cleanMarkdownFormatting(text: string): string {
    return cleanMarkdownFormatting(text);
  }

  public parseHtmlToClauses(html: string): ContractClauseNode[] {
    return parseHtmlToClauses(html);
  }

  public parseTextToClauses(text: string): ContractClauseNode[] {
    return parseTextToClauses(text);
  }

  public parseDocxOpenXml(buffer: Buffer): Promise<ContractClauseNode[]> {
    return parseDocxOpenXml(buffer);
  }

  /**
   * Parse input to structured AST Clause nodes (backward-compatible)
   */
  public async parseToAst(input: ContractAstParseInput): Promise<ContractClauseNode[]> {
    const result = await this.parseToAstDetailed(input);
    return result.clauses;
  }

  /**
   * Main entry: parse input to structured Clause AST Nodes and comprehensive document metadata
   */
  public async parseToAstDetailed(input: ContractAstParseInput): Promise<ContractAstParseResult> {
    const defaultMetadata: DocumentAstMetadata = {
      isTruncated: false,
      format: 'unknown',
    };

    // 1. Authoritative binary base64 takes precedence over text (e.g. uploaded docx/pdf)
    if (input.base64 && input.base64.trim()) {
      const buffer = Buffer.from(input.base64, 'base64');

      // Reject legacy .doc (OLE2 magic: 0xD0 0xCF 0x11 0xE0)
      const isLegacyDoc =
        input.fileName?.toLowerCase().endsWith('.doc') ||
        (buffer.length >= 4 &&
          buffer[0] === 0xd0 &&
          buffer[1] === 0xcf &&
          buffer[2] === 0x11 &&
          buffer[3] === 0xe0);

      if (isLegacyDoc) {
        throw new BadRequestException(
          '系统仅支持现代 .docx、.pdf、.txt、.md 格式，暂不支持旧版二进制 .doc 格式。请在 Word 中另存为 .docx 或导出为 .pdf 后重新上传。'
        );
      }

      const isDocx =
        input.fileName?.toLowerCase().endsWith('.docx') ||
        (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b); // PK zip header

      const isPdf =
        input.fileName?.toLowerCase().endsWith('.pdf') ||
        (buffer.length > 4 &&
          buffer[0] === 0x25 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x44 &&
          buffer[3] === 0x46); // %PDF

      if (isDocx) {
        try {
          const openXmlClauses = await this.parseDocxOpenXml(buffer);
          if (openXmlClauses && openXmlClauses.length > 0) {
            return { clauses: openXmlClauses, metadata: { isTruncated: false, format: 'docx' } };
          }
        } catch (err) {
          this.logger.warn(`OpenXML direct parsing failed, falling back to Mammoth: ${(err as Error).message}`);
        }

        try {
          const { value: html } = await mammoth.convertToHtml({ buffer });
          return {
            clauses: this.parseHtmlToClauses(html),
            metadata: { isTruncated: false, format: 'docx' },
          };
        } catch (err) {
          this.logger.warn(`Mammoth docx html extraction failed, falling back to raw text: ${(err as Error).message}`);
          try {
            const raw = await mammoth.extractRawText({ buffer });
            return {
              clauses: this.parseTextToClauses(raw.value || ''),
              metadata: { isTruncated: false, format: 'docx' },
            };
          } catch {
            throw new BadRequestException('Word 文档 (.docx) 结构损坏或无法解包解析，请核对文件后重试。');
          }
        }
      } else if (isPdf) {
        try {
          const extraction = await this.pdfExtractor.extract({
            fileBase64: input.base64,
            fileName: input.fileName || 'contract.pdf',
          });
          if (extraction?.text && extraction.text.trim()) {
            return {
              clauses: this.parseTextToClauses(extraction.text),
              metadata: {
                isTruncated: extraction.truncated,
                pageCount: extraction.pageCount,
                extractedPageCount: extraction.extractedPageCount,
                characterCount: extraction.characterCount,
                warnings: extraction.warnings,
                format: 'pdf',
              },
            };
          }
        } catch (err) {
          this.logger.warn(`PDF extraction failed: ${(err as Error).message}`);
        }
        return { clauses: [], metadata: { isTruncated: false, format: 'pdf' } };
      } else {
        // Binary buffer that is neither DOCX nor PDF
        if (buffer.includes(0)) {
          throw new BadRequestException(
            '上传的文档内容格式损坏或为不支持的未知二进制格式，请上传合规的 .docx、.pdf、.txt 或 .md 文档。'
          );
        }
        return {
          clauses: this.parseTextToClauses(buffer.toString('utf8')),
          metadata: { isTruncated: false, format: 'text' },
        };
      }
    } else if (input.text && input.text.trim()) {
      const trimmed = input.text.trim();

      if (trimmed.toLowerCase().endsWith('.doc')) {
        throw new BadRequestException(
          '系统仅支持现代 .docx、.pdf、.txt、.md 格式，暂不支持旧版二进制 .doc 格式。请在 Word 中另存为 .docx 或导出为 .pdf 后重新上传。'
        );
      }

      const isFileNameCandidate =
        trimmed.length < 150 &&
        !trimmed.includes('\n') &&
        (trimmed === input.fileName || /\.(docx|pdf|txt|md)$/i.test(trimmed));

      if (isFileNameCandidate) {
        const resolvedPath = this.resolveFileOnDisk(trimmed);
        if (resolvedPath && fs.existsSync(resolvedPath)) {
          try {
            const buffer = await fs.promises.readFile(resolvedPath);

            const isLegacyDoc =
              resolvedPath.toLowerCase().endsWith('.doc') ||
              (buffer.length >= 4 &&
                buffer[0] === 0xd0 &&
                buffer[1] === 0xcf &&
                buffer[2] === 0x11 &&
                buffer[3] === 0xe0);

            if (isLegacyDoc) {
              throw new BadRequestException(
                '系统仅支持现代 .docx、.pdf、.txt、.md 格式，暂不支持旧版二进制 .doc 格式。请在 Word 中另存为 .docx 或导出为 .pdf 后重新上传。'
              );
            }

            const isDocx =
              resolvedPath.toLowerCase().endsWith('.docx') ||
              (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b);
            const isPdf =
              resolvedPath.toLowerCase().endsWith('.pdf') ||
              (buffer.length > 4 &&
                buffer[0] === 0x25 &&
                buffer[1] === 0x50 &&
                buffer[2] === 0x44 &&
                buffer[3] === 0x46);

            if (isDocx) {
              try {
                const openXmlClauses = await this.parseDocxOpenXml(buffer);
                if (openXmlClauses && openXmlClauses.length > 0) {
                  return { clauses: openXmlClauses, metadata: { isTruncated: false, format: 'docx' } };
                }
              } catch (err) {
                this.logger.warn(`OpenXML direct parsing failed for ${resolvedPath}: ${(err as Error).message}`);
              }
              const { value: html } = await mammoth.convertToHtml({ buffer });
              return {
                clauses: this.parseHtmlToClauses(html),
                metadata: { isTruncated: false, format: 'docx' },
              };
            } else if (isPdf) {
              try {
                const extraction = await this.pdfExtractor.extract({
                  fileBase64: buffer.toString('base64'),
                  fileName: path.basename(resolvedPath),
                });
                if (extraction?.text && extraction.text.trim()) {
                  return {
                    clauses: this.parseTextToClauses(extraction.text),
                    metadata: {
                      isTruncated: extraction.truncated,
                      pageCount: extraction.pageCount,
                      extractedPageCount: extraction.extractedPageCount,
                      characterCount: extraction.characterCount,
                      warnings: extraction.warnings,
                      format: 'pdf',
                    },
                  };
                }
              } catch (err) {
                this.logger.warn(`PDF candidate extraction failed for ${resolvedPath}: ${(err as Error).message}`);
              }
              return { clauses: [], metadata: { isTruncated: false, format: 'pdf' } };
            } else {
              if (buffer.includes(0)) {
                throw new BadRequestException(
                  '上传的文档内容格式损坏或为不支持的未知二进制格式，请上传合规的 .docx、.pdf、.txt 或 .md 文档。'
                );
              }
              return {
                clauses: this.parseTextToClauses(buffer.toString('utf8')),
                metadata: { isTruncated: false, format: 'text' },
              };
            }
          } catch (err) {
            if (err instanceof BadRequestException) throw err;
            this.logger.warn(`Failed reading candidate file ${resolvedPath}: ${(err as Error).message}`);
          }
        }
      }

      return {
        clauses: this.parseTextToClauses(trimmed),
        metadata: { isTruncated: false, format: 'text' },
      };
    }

    return { clauses: [], metadata: defaultMetadata };
  }

  /**
   * Helper: try to locate a file on disk by name or relative path
   */
  private resolveFileOnDisk(filename: string): string | null {
    const outputsDir =
      process.env.OUTPUTS_DIR ||
      path.resolve(WORKSPACE_ROOT, 'apps', 'backend', 'var', 'outputs', 'document-engine');
    const searchCandidates = [
      path.resolve(process.cwd(), filename),
      path.resolve(WORKSPACE_ROOT, filename),
      path.resolve(outputsDir, filename),
      path.resolve(outputsDir, `${filename}.docx`),
      path.resolve(outputsDir, `${filename}.pdf`),
      path.resolve(outputsDir, 'renders', filename),
      path.resolve(outputsDir, 'renders', `${filename}.docx`),
      path.resolve(WORKSPACE_ROOT, 'tests', 'contract', filename),
      path.resolve(WORKSPACE_ROOT, 'apps', 'backend', 'intelligence', 'ai-orchestrator', 'data', 'storage', 'uploads', filename),
    ];

    for (const candidate of searchCandidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    if (fs.existsSync(outputsDir)) {
      try {
        const files = fs.readdirSync(outputsDir);
        const match = files.find((f) => f.includes(filename) || f.endsWith(`-${filename}`));
        if (match) {
          return path.join(outputsDir, match);
        }
      } catch {
        // ignore
      }
    }

    // Check uploads dir for prefix matching (e.g. file-xxxx-contract_v1_baseline.docx)
    const uploadsDir = path.resolve(WORKSPACE_ROOT, 'apps', 'backend', 'intelligence', 'ai-orchestrator', 'data', 'storage', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      try {
        const files = fs.readdirSync(uploadsDir);
        const match = files.find((f) => f.endsWith(`-${filename}`) || f === filename);
        if (match) {
          return path.join(uploadsDir, match);
        }
      } catch {
        // ignore
      }
    }

    return null;
  }
}
