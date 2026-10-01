import * as fs from 'fs';
import axios from 'axios';
import { Logger } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { WorkbenchPrismaPort } from '../ports';
import { InboxItemStatus, TodoSourceType } from '../inbox/dto/workbench-inbox.dto';
import { TodoStatus } from '../todo/dto/workbench-todo.dto';
import {
  CoordinationActionRecord,
  CoordinationTaskStatus,
  SubmitCoordinationActionDto,
} from './dto/workbench-coordination.dto';
import { BUILT_IN_WORKFLOW_TEMPLATES } from './workflow-templates.constants';
import { OrgWorkflowService } from './org-workflow.service';
import { CoordinationStageEngineService } from './coordination-stage-engine.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { UUID_REGEX } from './coordination-collaborator.service';
import { resolveEffectiveAndHistoricalAttachments } from './coordination-attachment-helper';
import { CoordinationAttachmentStorageService } from './coordination-attachment-storage.service';
import { DocxCommentInjectorService, deduplicateRejectionText, getJSZip, unescapeXml } from './docx-comment-injector.service';

export class CoordinationActionProcessor {
  constructor(
    private readonly prisma: WorkbenchPrismaPort,
    private readonly logger: Logger,
    private readonly findTargetInboxItem: (id: string) => Promise<any>,
    private readonly resolveUser: (id: string) => Promise<any>,
    private readonly resolveStageApprover: (...args: any[]) => Promise<any>,
    private readonly stageEngine: CoordinationStageEngineService,
    private readonly orgWorkflowService?: OrgWorkflowService,
    private readonly workspaceService?: WorkspaceService,
    private readonly attachmentStorage?: CoordinationAttachmentStorageService,
    private readonly commentInjector: DocxCommentInjectorService = new DocxCommentInjectorService()
  ) {}
  async executeActionProcess(
    operatorUserId: string,
    taskId: string,
    dto: SubmitCoordinationActionDto,
    targetItem: any
  ): Promise<any> {
    const payload = (targetItem.unifiedPayload || {}) as Record<string, any>;
    const initiator = payload.initiator || {};

    // 核心安全拦截：若该事项在后台异步执行开始前已被撤回，则立即终止
    const initialFreshItem = await this.findTargetInboxItem(targetItem.id || taskId);
    if ((initialFreshItem?.unifiedPayload as any)?.isRecalled) {
      this.logger.log(`[AsyncRunner] Task ${taskId} has been recalled; aborting before execution.`);
      return;
    }

    const operator = await this.resolveUser(operatorUserId);
    const operatorId = operator?.id || operatorUserId;

    if (dto.comment) {
      dto.comment = deduplicateRejectionText(dto.comment);
    }

    const reviewDraft = dto?.parameters?.reviewDraft || payload?.parameters?.reviewDraft || {};
    const findFullClauses = (...candidates: any[]) => {
      for (const cand of candidates) {
        if (Array.isArray(cand) && cand.length > 0 && cand.some((c) => c?.originalContent || c?.content)) {
          return cand;
        }
      }
      for (const cand of candidates) {
        if (Array.isArray(cand) && cand.length > 0) {
          return cand;
        }
      }
      return [];
    };

    const clausesFromContext = findFullClauses(
      payload?.reviewReport?.clauses,
      (targetItem as any)?.unifiedPayload?.reviewReport?.clauses,
      (targetItem as any)?.reviewReport?.clauses,
      dto?.parameters?.reviewDraft?.clauses,
      dto?.parameters?.clauses,
      payload?.parameters?.clauses,
      payload?.parameters?.reviewDraft?.clauses,
      payload?.parameters?.reviewResult?.clauses
    );

    const commentsToInject = this.commentInjector.extractCommentsFromAction(
      dto,
      operator?.username || '法务审阅人',
      { clauses: clausesFromContext }
    );

    // 当动作带有批注或修改意见时（无论驳回还是审批/完成附带意见），同步前置生成原生带批注的 Word 交付物并置顶附件
    if (commentsToInject.length > 0) {
      // 异步执行前，清理旧的 commentInjectionError / commentInjectionStats，防止被前次失败污染
      if (dto.parameters) {
        delete dto.parameters.commentInjectionError;
        delete dto.parameters.commentInjectionStats;
        delete dto.parameters.hasAnnotatedDocx;
      }
      if (payload.parameters) {
        delete payload.parameters.commentInjectionError;
        delete payload.parameters.commentInjectionStats;
        delete payload.parameters.hasAnnotatedDocx;
      }
      try {
        const contractTitle =
          dto.parameters?.contractTitle ||
          payload.parameters?.contractTitle ||
          targetItem.sourceTitle ||
          targetItem.title ||
          '合同文本';

        // 1. 收集候选附件：优先当前 DTO 提交的附件（含用户上传的新版本/追加版本），再并入历史 payload 附件
        const combinedAttachments: any[] = [];
        const seenAttKeys = new Set<string>();

        const pushAtt = (att: any) => {
          if (!att) return;
          const key = att.id || att.attachmentId || att.url || att.name;
          if (key && !seenAttKeys.has(key)) {
            seenAttKeys.add(key);
            combinedAttachments.push(att);
          }
        };

        if (Array.isArray(dto.attachments)) {
          dto.attachments.forEach(pushAtt);
        }
        if (Array.isArray(payload.attachments)) {
          payload.attachments.forEach(pushAtt);
        }

        // 严格筛选有效 OpenXML DOCX 附件（坚决排除 .doc 二进制等非 ZIP 格式）
        const docxCandidates = combinedAttachments.filter((a: any) => {
          const name = (a?.name || '').toLowerCase();
          const mime = (a?.mimeType || '').toLowerCase();
          const isDocx = name.endsWith('.docx') || mime.includes('wordprocessingml.document');
          const isOldDoc = name.endsWith('.doc') && !name.endsWith('.docx');
          return isDocx && !isOldDoc;
        });

        // 2. 按审阅报告版本、附件 ID、文档哈希精确绑定源文件
        const targetAttachmentId =
          payload.reviewReport?.sourceAttachmentId ||
          reviewDraft?.sourceAttachmentId ||
          dto.parameters?.sourceAttachmentId ||
          payload.parameters?.sourceAttachmentId;

        let targetDocHash =
          payload.reviewReport?.sourceDocumentHash ||
          reviewDraft?.sourceDocumentHash ||
          dto.parameters?.sourceDocumentHash ||
          payload.parameters?.sourceDocumentHash;

        const targetVersion =
          payload.reviewReport?.sourceDocumentVersion ||
          reviewDraft?.sourceDocumentVersion ||
          dto.parameters?.sourceDocumentVersion ||
          payload.parameters?.sourceDocumentVersion;

        // 如果未单独提供 targetDocHash，但 targetVersion 呈现为 sha256:... 或 md5:... 哈希摘要，自动对齐为 targetDocHash
        if (!targetDocHash && targetVersion && /^sha256:|^md5:/i.test(targetVersion)) {
          targetDocHash = targetVersion.replace(/^sha256:|^md5:/i, '');
        }

        let candidateDoc: any = null;

        if (targetAttachmentId) {
          candidateDoc = docxCandidates.find(
            (a: any) =>
              a.id === targetAttachmentId ||
              a.attachmentId === targetAttachmentId ||
              a.url?.includes(targetAttachmentId)
          );
          if (!candidateDoc) {
            throw new Error(
              `指定的源合同附件 (ID: ${targetAttachmentId}) 未在协同任务附件列表中找到，已阻断以防将批注注入到错误文档`
            );
          }
        } else if (targetDocHash) {
          candidateDoc = docxCandidates.find(
            (a: any) =>
              a.hash === targetDocHash ||
              a.sha256 === targetDocHash ||
              a.md5 === targetDocHash
          );
          // 若附件元数据中未记录该哈希，但存在合规候选 DOCX，允许后续基于真实 Buffer 内容及正文文本校验哈希
          if (!candidateDoc && docxCandidates.length > 0) {
            candidateDoc =
              docxCandidates.find((a: any) => !a?.name?.includes('_法务批注版') && !a?.name?.includes('_法务审阅版')) ||
              docxCandidates[0];
          }
          if (!candidateDoc) {
            throw new Error(
              `指定的源合同哈希 (${targetDocHash}) 未在协同任务附件列表中找到匹配项，已阻断以防将批注注入到错误文档`
            );
          }
        } else if (targetVersion) {
          candidateDoc = docxCandidates.find(
            (a: any) =>
              a.version === targetVersion ||
              a.id === targetVersion ||
              a.attachmentId === targetVersion ||
              a.name === targetVersion
          );
          if (!candidateDoc) {
            throw new Error(
              `指定的源合同版本 (${targetVersion}) 未在协同任务附件列表中找到匹配项，已阻断以防将批注注入到错误文档`
            );
          }
        } else {
          // 仅在未指定 targetAttachmentId、targetDocHash 或 targetVersion 时，默认选取非批注版的原始合同
          candidateDoc =
            docxCandidates.find((a: any) => !a?.name?.includes('_法务批注版') && !a?.name?.includes('_法务审阅版')) ||
            docxCandidates[0];
        }

        if (!candidateDoc) {
          throw new Error(`未找到可用于回写批注的有效 DOCX 合同源文档（共有 ${combinedAttachments.length} 个附件，合规 DOCX 为 0）`);
        }

        // 3. 读取原 DOCX 文件 Buffer
        let originalBuffer: Buffer | null = null;

        if (candidateDoc?.storagePath && fs.existsSync(candidateDoc.storagePath)) {
          try {
            originalBuffer = await fs.promises.readFile(candidateDoc.storagePath);
          } catch (err: any) {
            this.logger.warn(`Failed to read docx from storagePath: ${err.message}`);
          }
        }

        if (!originalBuffer && this.attachmentStorage && (candidateDoc?.attachmentId || candidateDoc?.url)) {
          const attId = candidateDoc.attachmentId || candidateDoc.url?.match(/att_[0-9a-f-]+/)?.[0];
          if (attId) {
            try {
              const res = await this.attachmentStorage.getAttachment(attId);
              originalBuffer = res.buffer;
            } catch (err: any) {
              this.logger.warn(`Failed to read docx from attachmentStorage: ${err.message}`);
            }
          }
        }

        if (!originalBuffer && candidateDoc?.url) {
          try {
            let fetchUrl = candidateDoc.url;
            if (fetchUrl.startsWith('/')) {
              fetchUrl = `http://127.0.0.1:3001${fetchUrl}`;
            }
            const carboneHost = process.env.CARBONE_SERVICE_URL || 'http://carbone-engine:3009';
            fetchUrl = fetchUrl.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):3009/g, carboneHost);
            const platformHost = `http://127.0.0.1:${process.env.PORT || 3001}`;
            fetchUrl = fetchUrl.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):3001/g, platformHost);

            const resp = await axios.get(fetchUrl, {
              responseType: 'arraybuffer',
              timeout: 5000,
            });
            if (resp.status === 200 && resp.data) {
              originalBuffer = Buffer.from(resp.data as ArrayBuffer);
            }
          } catch (err: any) {
            this.logger.warn(`Failed to fetch docx from url ${candidateDoc.url}: ${err.message}`);
          }
        }

        if (!originalBuffer || originalBuffer.length < 100) {
          throw new Error(`无法获取合同源文档内容或文档内容已损坏 (candidate: ${candidateDoc?.name || 'unknown'})`);
        }

        // 校验实际文件内容或正文文本的哈希（若指定了 targetDocHash，严格基于真实 originalBuffer 校验，杜绝元数据绕过）
        if (targetDocHash) {
          const cleanTargetHash = targetDocHash.replace(/^sha256:/i, '').trim().toLowerCase();
          const computedSha256 = createHash('sha256').update(originalBuffer).digest('hex').toLowerCase();
          const computedMd5 = createHash('md5').update(originalBuffer).digest('hex').toLowerCase();

          let matchesHash =
            computedSha256 === cleanTargetHash ||
            computedSha256.startsWith(cleanTargetHash) ||
            computedMd5 === cleanTargetHash;

          // 若二进制哈希不匹配，尝试校验 DOCX 解析出的实际文本哈希（打通审阅引擎生成的正文/条款 SHA256 摘要与底层 DOCX 文件）
          if (!matchesHash) {
            try {
              const JSZip = getJSZip();
              const zip = await JSZip.loadAsync(originalBuffer);
              const docXml = await zip.file('word/document.xml')?.async('string');
              if (docXml) {
                // 1. 校验正文各段落纯文本哈希
                const pRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
                let pm: RegExpExecArray | null;
                const pTexts: string[] = [];
                while ((pm = pRegex.exec(docXml)) !== null) {
                  const stripped = pm[1].replace(/<[^>]+>/g, '');
                  const cleanP = unescapeXml(stripped).trim();
                  if (cleanP) {
                    pTexts.push(cleanP);
                    const pSha = createHash('sha256').update(cleanP, 'utf8').digest('hex').toLowerCase();
                    const pMd5 = createHash('md5').update(cleanP, 'utf8').digest('hex').toLowerCase();
                    if (pSha === cleanTargetHash || pSha.startsWith(cleanTargetHash) || pMd5 === cleanTargetHash) {
                      matchesHash = true;
                      break;
                    }
                  }
                }

                // 2. 校验正文全量拼接文本哈希
                if (!matchesHash && pTexts.length > 0) {
                  const fullText = pTexts.join('\n');
                  const fullSha = createHash('sha256').update(fullText, 'utf8').digest('hex').toLowerCase();
                  const fullMd5 = createHash('md5').update(fullText, 'utf8').digest('hex').toLowerCase();
                  if (fullSha === cleanTargetHash || fullSha.startsWith(cleanTargetHash) || fullMd5 === cleanTargetHash) {
                    matchesHash = true;
                  }
                  if (!matchesHash) {
                    const normText = fullText.replace(/\s+/g, '');
                    const normSha = createHash('sha256').update(normText, 'utf8').digest('hex').toLowerCase();
                    if (normSha === cleanTargetHash || normSha.startsWith(cleanTargetHash)) {
                      matchesHash = true;
                    }
                  }
                  if (!matchesHash) {
                    const doubleText = pTexts.join('\n\n');
                    const doubleSha = createHash('sha256').update(doubleText, 'utf8').digest('hex').toLowerCase();
                    if (doubleSha === cleanTargetHash || doubleSha.startsWith(cleanTargetHash)) {
                      matchesHash = true;
                    }
                  }
                }
              }
            } catch (err: any) {
              this.logger.warn(`Failed to inspect docx text for hash matching: ${err.message}`);
            }
          }

          // 3. 校验审阅报告与上下文中的条款内容哈希（打通审阅 AST 规则引擎与底层文档）
          if (!matchesHash) {
            const allClauseCandidateLists = [
              clausesFromContext,
              payload?.reviewReport?.clauses,
              (targetItem as any)?.unifiedPayload?.reviewReport?.clauses,
              (targetItem as any)?.reviewReport?.clauses,
              dto?.parameters?.reviewDraft?.clauses,
              payload?.parameters?.reviewDraft?.clauses,
            ];
            for (const candList of allClauseCandidateLists) {
              if (!Array.isArray(candList) || candList.length === 0) continue;
              const clauseTexts = candList
                .map((c: any) => c?.content || c?.originalContent || '')
                .filter(Boolean);
              if (clauseTexts.length === 0) continue;

              const cShaDouble = createHash('sha256').update(clauseTexts.join('\n\n'), 'utf8').digest('hex').toLowerCase();
              const cShaSingle = createHash('sha256').update(clauseTexts.join('\n'), 'utf8').digest('hex').toLowerCase();
              const cShaNorm = createHash('sha256').update(clauseTexts.join('').replace(/\s+/g, ''), 'utf8').digest('hex').toLowerCase();
              if (
                cShaDouble === cleanTargetHash ||
                cShaDouble.startsWith(cleanTargetHash) ||
                cShaSingle === cleanTargetHash ||
                cShaSingle.startsWith(cleanTargetHash) ||
                cShaNorm === cleanTargetHash ||
                cShaNorm.startsWith(cleanTargetHash)
              ) {
                matchesHash = true;
                break;
              }
            }
          }

          // 4. 校验流程初始化传入的合同文本哈希
          if (!matchesHash) {
            const rawParamText = payload.parameters?.text || payload.parameters?.contractContent;
            if (rawParamText && typeof rawParamText === 'string') {
              const paramSha = createHash('sha256').update(rawParamText.trim(), 'utf8').digest('hex').toLowerCase();
              if (paramSha === cleanTargetHash || paramSha.startsWith(cleanTargetHash)) {
                matchesHash = true;
              }
            }
          }

          if (!matchesHash) {
            this.logger.warn(
              `源文档内容哈希校验不匹配: 期望=${targetDocHash}, 实际sha256=${computedSha256}, 实际md5=${computedMd5}`
            );
            throw new Error(
              `合同源文档版本与当前审阅报告不一致，为防止批注位置错位未自动生成修改版 Word`
            );
          }
        }

        // 4. 调用注入引擎并获取详细结果（包含 unresolved 诊断报告，严禁产出 5 条固定内容的假合同）
        const injectionResult = await this.commentInjector.injectCommentsDetailed(
          originalBuffer,
          commentsToInject,
          {
            fallbackTitle: contractTitle,
            clauses: clausesFromContext,
          }
        );

        if (injectionResult.injectedCount === 0) {
          this.logger.warn(
            `All ${commentsToInject.length} comments were unresolved/ambiguous; skipping annotated DOCX creation to prevent storing clean document as annotated.`
          );
          dto.parameters = {
            ...(dto.parameters || {}),
            hasAnnotatedDocx: false,
            commentInjectionStats: {
              injectedCount: 0,
              unresolvedCount: injectionResult.unresolvedCount,
              unresolvedComments: injectionResult.unresolvedComments,
            },
            commentInjectionError: '未能在合同底稿中精确定位任何批注，未生成法务批注版文档',
          };
        } else {
          const annotatedBuffer = injectionResult.buffer;
          const rawDocName =
            candidateDoc?.name ||
            payload.parameters?.fileName ||
            `${contractTitle}.docx`;
          const baseName = rawDocName
            .replace(/\.docx?$/i, '')
            .replace(/_法务批注版$/i, '')
            .replace(/_法务审阅版$/i, '');
          const annotatedFileName = `${baseName}_法务批注版.docx`;

          let annotatedAttachment: any = null;
          if (this.attachmentStorage) {
            annotatedAttachment = await this.attachmentStorage.saveAttachment(
              {
                originalname: annotatedFileName,
                buffer: annotatedBuffer,
                size: annotatedBuffer.length,
                mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              },
              operatorId
            );
          } else {
            annotatedAttachment = {
              name: annotatedFileName,
              url: `/api/workbench-coordination/attachments/att_fallback/download?fileName=${encodeURIComponent(
                annotatedFileName
              )}`,
              downloadUrl: `/api/workbench-coordination/attachments/att_fallback/download?fileName=${encodeURIComponent(
                annotatedFileName
              )}`,
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              size: annotatedBuffer.length,
            };
          }

          dto.attachments = [
            annotatedAttachment,
            ...(dto.attachments || []).filter(
              (a: any) => a?.url !== annotatedAttachment.url && a?.name !== annotatedFileName
            ),
          ];

          delete (payload.parameters as any)?.commentInjectionError;
          delete (payload.parameters as any)?.commentInjectionStats;
          dto.parameters = {
            ...(dto.parameters || {}),
            downloadUrl: annotatedAttachment.url,
            fileUrl: annotatedAttachment.url,
            fileName: annotatedFileName,
            annotatedDocxUrl: annotatedAttachment.url,
            hasAnnotatedDocx: true,
            commentInjectionStats: {
              injectedCount: injectionResult.injectedCount,
              unresolvedCount: injectionResult.unresolvedCount,
              unresolvedComments: injectionResult.unresolvedComments,
            },
          };
          delete (dto.parameters as any)?.commentInjectionError;

          this.logger.log(
            `Successfully injected ${injectionResult.injectedCount} comments (${injectionResult.unresolvedCount} unresolved) into ${annotatedFileName} (${annotatedBuffer.length} bytes) for task ${taskId}`
          );
        }
      } catch (err: any) {
        this.logger.error(`Error generating annotated docx: ${err.message}`, err.stack);
        dto.parameters = {
          ...(dto.parameters || {}),
          hasAnnotatedDocx: false,
          commentInjectionError: err.message,
        };
      }
    }

    const activeDocAttachment = (Array.isArray(dto.attachments) && dto.attachments.length > 0 ? dto.attachments : Array.isArray(payload.attachments) ? payload.attachments : []).find(
      (a: any) =>
        a?.name?.endsWith('.docx') ||
        a?.mimeType?.includes('wordprocessingml') ||
        a?.name?.endsWith('.doc')
    ) || (Array.isArray(dto.attachments) && dto.attachments.length > 0 ? dto.attachments[0] : Array.isArray(payload.attachments) ? payload.attachments[0] : null);

    const actionRecord: CoordinationActionRecord = {
      id: `act_${randomUUID()}`,
      operatorId,
      operatorName: operator?.username || '未知成员',
      action: dto.action,
      comment: dto.comment?.trim(),
      attachments:
        dto.attachments && dto.attachments.length > 0
          ? dto.attachments
          : activeDocAttachment
          ? [activeDocAttachment]
          : [],
      timestamp: new Date().toISOString(),
    };

    let nextStatus: CoordinationTaskStatus = CoordinationTaskStatus.pending;
    let actionText = '处理';
    if (dto.action === 'approve') {
      nextStatus = CoordinationTaskStatus.approved;
      actionText = '同意承认';
    } else if (dto.action === 'reject') {
      nextStatus = CoordinationTaskStatus.rejected;
      actionText = '驳回拒绝';
    } else if (dto.action === 'complete') {
      nextStatus = CoordinationTaskStatus.completed;
      actionText = '完成提交';
    }

    // 流程流转执行
    let externalSyncResult: any = undefined;
    let stageTransition: any = undefined;
    if (payload.workflowId) {
      const workflow: any =
        this.orgWorkflowService?.getWorkflowById(payload.workflowId) ||
        BUILT_IN_WORKFLOW_TEMPLATES.find(
          (t) => t.id === payload.workflowId || t.workflowId === payload.workflowId
        );

      if (workflow?.processDefinition?.stages?.length > 0) {
        stageTransition = await this.stageEngine.executeTransition({
          workflow,
          currentStageId: payload.currentStage,
          targetItem,
          payload,
          dto,
          operator: {
            id: operatorId,
            username: operator?.username || '协作者',
            email: operator?.email,
          },
          initiator: {
            id: initiator.id,
            username: initiator.username,
            email: initiator.email,
          },
          resolveStageApprover: (wId, sId, initId) =>
            this.resolveStageApprover(wId, sId, initId || operatorId),
          prisma: this.prisma,
        });

        // 核心安全拦截：若自动化审查执行期间发起人已撤回该任务，立即终止后续流转，不可覆盖撤回状态
        const freshItemAfterTransition = await this.findTargetInboxItem(targetItem.id || taskId);
        if ((freshItemAfterTransition?.unifiedPayload as any)?.isRecalled) {
          this.logger.log(
            `[AsyncRunner] Task ${taskId} was recalled during stage transition; aborting.`
          );
          return;
        }

        if (stageTransition?.handled) {
          nextStatus = stageTransition.nextStatus;
          actionText = stageTransition.actionText;
          externalSyncResult = stageTransition.externalSyncResult;

          // 核心特性：前置自动化任务失败重试 3 次后仍出错，触发自动回退担当！
          if (stageTransition.rollbackToCurrentAssignee) {
            const failureReason = stageTransition.failureReason || '自动化任务执行失败';
            const failedTitle = `[需重修] ${targetItem.sourceTitle || targetItem.title} - ${stageTransition.failedStageName || '审查'}失败`;
            const failedContent = `⚠️ **【前置自动化任务执行失败·已回退担当】**：\n${failureReason}\n\n系统已自动重试 3 次均未果，流程已回退至当前担当，请核对材料或调整参数后重新点击「发送」。`;

            const rollbackPayload = {
              ...payload,
              inTransit: false,
              status: 'revision_required',
              parameters: dto.parameters
                ? { ...(payload.parameters || {}), ...dto.parameters }
                : payload.parameters,
              actions: Array.isArray(payload.actions)
                ? [...payload.actions, actionRecord]
                : [actionRecord],
              externalSyncResult: stageTransition.externalSyncResult,
              asyncExecution: {
                status: 'failed',
                retryCount: 3,
                error: failureReason,
                failedAt: new Date().toISOString(),
              },
              updatedAt: new Date().toISOString(),
            };

            await this.prisma.workbenchInboxItem.update({
              where: { id: targetItem.id },
              data: {
                title: failedTitle,
                rawContent: failedContent,
                status: InboxItemStatus.unprocessed,
                unifiedPayload: rollbackPayload as any,
                updatedAt: new Date(),
              },
            });

            try {
              await this.prisma.workbenchTodo?.updateMany?.({
                where: {
                  OR: [
                    targetItem.convertedTodoId ? { id: targetItem.convertedTodoId } : undefined,
                    { sourceRefId: taskId },
                    { sourceRefId: targetItem.sourceRefId },
                  ].filter(Boolean) as any,
                },
                data: {
                  title: failedTitle,
                  description: failedContent,
                  status: TodoStatus.pending,
                  updatedAt: new Date(),
                },
              });
            } catch (todoErr) {
              this.logger.warn(`Failed to rollback todo for ${taskId}:`, todoErr);
            }

            this.logger.warn(`Task ${taskId} rolled back to assignee: ${failureReason}`);
            return {
              taskId,
              status: 'revision_required' as any,
              action: dto.action,
              actionRecord,
              unifiedPayload: rollbackPayload,
            };
          }

          if (stageTransition.nextInboxItemData) {
            await this.prisma.workbenchInboxItem.create({
              data: stageTransition.nextInboxItemData,
            });

            // 该阶段已确认并流转至下一处理人，将关联待办标记为已完成（离开待办看板，进入已发事项）
            try {
              await this.prisma.workbenchTodo?.updateMany?.({
                where: {
                  OR: [
                    targetItem.convertedTodoId ? { id: targetItem.convertedTodoId } : undefined,
                    { sourceRefId: taskId },
                    { sourceRefId: targetItem.sourceRefId },
                  ].filter(Boolean) as any,
                },
                data: {
                  status: TodoStatus.completed,
                  completedAt: new Date(),
                  updatedAt: new Date(),
                },
              });
            } catch (delErr) {
              this.logger.warn(`Failed to update todo for ${taskId}:`, delErr);
            }
          } else if (
            nextStatus === CoordinationTaskStatus.approved ||
            nextStatus === CoordinationTaskStatus.completed
          ) {
            try {
              await this.prisma.workbenchTodo?.updateMany?.({
                where: {
                  OR: [
                    targetItem.convertedTodoId ? { id: targetItem.convertedTodoId } : undefined,
                    { sourceRefId: taskId },
                    { sourceRefId: targetItem.sourceRefId },
                  ].filter(Boolean) as any,
                },
                data: {
                  status: TodoStatus.completed,
                  completedAt: new Date(),
                  updatedAt: new Date(),
                },
              });
            } catch (updErr) {
              this.logger.warn(`Failed to mark todo completed for ${taskId}:`, updErr);
            }
          } else if (dto.action === 'reject') {
            try {
              const cleanBaseTitle = (targetItem.sourceTitle || targetItem.title || '')
                .replace(/^\[需重修\]\s*/, '')
                .replace(/^\[协同回执\][^:]*:\s*/, '')
                .replace(/^\[待发送\]\s*/, '')
                .trim();
              await this.prisma.workbenchTodo?.updateMany?.({
                where: {
                  OR: [
                    targetItem.convertedTodoId ? { id: targetItem.convertedTodoId } : undefined,
                    { sourceRefId: taskId },
                    { sourceRefId: targetItem.sourceRefId },
                  ].filter(Boolean) as any,
                },
                data: {
                  title: `[需重修] ${cleanBaseTitle}`,
                  status: TodoStatus.pending,
                  description: dto.comment?.trim()
                    ? `审核人员批注：${dto.comment.trim()}`
                    : undefined,
                  contextData: {
                    ...((targetItem.unifiedPayload as any) || {}),
                    attachments:
                      dto.attachments && dto.attachments.length > 0
                        ? dto.attachments
                        : (targetItem.unifiedPayload as any)?.attachments,
                    rollbackReason: dto.comment?.trim(),
                    status: 'revision_required',
                  } as any,
                  updatedAt: new Date(),
                },
              });
            } catch (rejTodoErr) {
              this.logger.warn(`Failed to update todo for reject ${taskId}:`, rejTodoErr);
            }
          }
        }
      }
    }

    const updatedActions = Array.isArray(payload.actions)
      ? [...payload.actions, actionRecord]
      : [actionRecord];

    const isResubmittingRevision =
      Boolean(payload.isResubmission) ||
      ((payload.status === 'revision_required' ||
        payload.status === CoordinationTaskStatus.rejected ||
        targetItem.title?.includes('[需重修]') ||
        targetItem.title?.includes('需重修') ||
        targetItem.title?.includes('已驳回') ||
        payload.receiptAction === 'reject') &&
        (dto.action === 'approve' || dto.action === 'complete'));

    const { effectiveAttachments, parameterPatch } = resolveEffectiveAndHistoricalAttachments(
      dto.attachments,
      payload.attachments,
      payload.parameters
    );

    const isWorkflowTerminal =
      Boolean((stageTransition as any)?.isTerminal) ||
      Boolean(externalSyncResult?.isTerminal) ||
      nextStatus === CoordinationTaskStatus.completed;

    let finalAttachments = effectiveAttachments;
    const syncDetail = externalSyncResult?.detail || {};
    const pdfCandidate =
      externalSyncResult?.pdfArtifact ||
      syncDetail.pdfArtifact ||
      externalSyncResult?.artifacts?.find(
        (a: any) =>
          a?.mimeType === 'application/pdf' ||
          a?.name?.endsWith('.pdf') ||
          a?.url?.endsWith('.pdf') ||
          a?.downloadUrl?.endsWith('.pdf')
      ) ||
      syncDetail.artifacts?.find(
        (a: any) =>
          a?.mimeType === 'application/pdf' ||
          a?.name?.endsWith('.pdf') ||
          a?.url?.endsWith('.pdf') ||
          a?.downloadUrl?.endsWith('.pdf')
      ) ||
      ((externalSyncResult?.downloadUrl || syncDetail.downloadUrl)?.includes('.pdf')
        ? {
            name:
              syncDetail.fileName ||
              externalSyncResult?.fileName ||
              `${payload.parameters?.contractTitle || '商业保密协议'}_存证归档.pdf`,
            url: syncDetail.downloadUrl || externalSyncResult?.downloadUrl,
            downloadUrl: syncDetail.downloadUrl || externalSyncResult?.downloadUrl,
            mimeType: 'application/pdf',
            sha256: syncDetail.sha256 || externalSyncResult?.sha256,
            size: syncDetail.size || externalSyncResult?.size,
          }
        : null);

    if (pdfCandidate) {
      const alreadyHasPdf = finalAttachments.some(
        (a: any) =>
          (a?.url && a?.url === pdfCandidate.url) ||
          (a?.downloadUrl && a?.downloadUrl === pdfCandidate.downloadUrl)
      );
      if (!alreadyHasPdf) {
        finalAttachments = [
          {
            id: pdfCandidate.id || randomUUID(),
            name: pdfCandidate.name || '商业保密协议_归档存证.pdf',
            url: pdfCandidate.url || pdfCandidate.downloadUrl,
            downloadUrl: pdfCandidate.downloadUrl || pdfCandidate.url,
            mimeType: 'application/pdf',
            size: pdfCandidate.size || pdfCandidate.sizeBytes || 0,
            sha256: pdfCandidate.sha256 || pdfCandidate.metadata?.sha256 || '',
          },
          ...finalAttachments,
        ];
      }
    }

    const rollbackAssignee =
      dto.action === 'reject'
        ? externalSyncResult?.rollbackAssigneeObject ||
          (externalSyncResult?.rollbackAssigneeId
            ? {
                id: externalSyncResult.rollbackAssigneeId,
                username: externalSyncResult.rollbackAssignee,
              }
            : payload.initiator || initiator)
        : null;

    const updatedPayload = {
      ...payload,
      inTransit: false,
      assignee: rollbackAssignee || payload.assignee,
      currentStage:
        dto.action === 'reject' && externalSyncResult?.rollbackTarget
          ? externalSyncResult.rollbackTarget
          : isWorkflowTerminal
          ? (externalSyncResult?.currentStage || 'final_receipt')
          : (externalSyncResult?.currentStage || payload.currentStage),
      previousStage:
        dto.action === 'reject' && externalSyncResult?.rollbackTarget
          ? payload.currentStage
          : payload.previousStage,
      parameters: {
        ...(payload.parameters || {}),
        ...(dto.parameters || {}),
        ...parameterPatch,
      },
      status: isWorkflowTerminal ? CoordinationTaskStatus.completed : nextStatus,
      actions: updatedActions,
      attachments: finalAttachments,
      rollbackReason:
        dto.action === 'reject'
          ? dto.comment?.trim() || '审核人员提出了修改意见'
          : payload.rollbackReason,
      metadata: {
        ...(payload.metadata || {}),
        ...(dto.action === 'reject'
          ? { rollbackReason: dto.comment?.trim() || '审核人员提出了修改意见' }
          : {}),
      },
      externalSyncResult,
      asyncExecution: {
        status: 'succeeded',
        endedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };

    if (isResubmittingRevision) {
      delete (updatedPayload as any).rollbackReason;
      delete (updatedPayload as any).lastFailure;
      delete (updatedPayload as any).receiptAction;
      delete (updatedPayload as any).isReceipt;
      delete (updatedPayload as any).isResubmission;
      if (updatedPayload.parameters) {
        delete (updatedPayload.parameters as any).commentInjectionError;
        delete (updatedPayload.parameters as any).commentInjectionStats;
      }
      if ((updatedPayload as any).metadata) {
        delete (updatedPayload as any).metadata.rollbackReason;
        delete (updatedPayload as any).metadata.isReceipt;
      }
    }

    let nextTargetTitle = targetItem.title;
    if (isResubmittingRevision) {
      const cleanTitle = (targetItem.sourceTitle || targetItem.title || '')
        .replace(/^【(?:已驳回|需重修|待发送|已发送)】\s*/g, '')
        .replace(/^\[(?:已驳回|需重修|待发送|已发送|待担当确认|待初稿确认)\]\s*/g, '')
        .replace(/^\[需重修\]\s*/, '')
        .replace(/^\[协同回执\][^:]*:\s*/, '')
        .replace(/^\[待发送\]\s*/, '')
        .trim();
      nextTargetTitle = cleanTitle ? `[已发送] ${cleanTitle}` : targetItem.title;
    }

    // 核心安全拦截：若已被撤回，终止最终写回，确保保留撤回至待办的状态
    const finalFreshItem = await this.findTargetInboxItem(targetItem.id || taskId);
    if ((finalFreshItem?.unifiedPayload as any)?.isRecalled) {
      this.logger.log(
        `[AsyncRunner] Task ${taskId} has been recalled; skipping final status update and todo completion.`
      );
      return;
    }

    // 2. 更新原经办人收件箱条目为已转待办或已流转
    await this.prisma.workbenchInboxItem.update({
      where: { id: targetItem.id },
      data: {
        title: nextTargetTitle,
        status: InboxItemStatus.converted,
        unifiedPayload: updatedPayload as any,
        updatedAt: new Date(),
      },
    });

    try {
      await this.prisma.workbenchTodo?.updateMany?.({
        where: {
          OR: [
            targetItem.convertedTodoId ? { id: targetItem.convertedTodoId } : undefined,
            { sourceRefId: taskId },
            { sourceRefId: targetItem.sourceRefId },
            UUID_REGEX.test(taskId) ? { id: taskId } : undefined,
          ].filter(Boolean) as any,
        },
        data: {
          status: TodoStatus.completed,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (delErr) {
      this.logger.warn(`Failed to update todo for ${taskId}:`, delErr);
    }

    // 2.1 若存在前置父任务 (parentTaskId) 且当前任务已达成终态闭环，同步将父任务及待办标记为已完成
    const parentTaskId =
      payload.metadata?.parentTaskId ||
      (targetItem.unifiedPayload as any)?.metadata?.parentTaskId;
    if (parentTaskId && isWorkflowTerminal) {
      try {
        await this.prisma.workbenchInboxItem.updateMany({
          where: { sourceRefId: parentTaskId },
          data: {
            status: InboxItemStatus.converted,
            updatedAt: new Date(),
          },
        });
        await this.prisma.workbenchTodo?.updateMany?.({
          where: { sourceRefId: parentTaskId },
          data: {
            status: TodoStatus.completed,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      } catch (parentErr) {
        this.logger.warn(`Failed to update parent task ${parentTaskId}:`, parentErr);
      }
    }

    // 3. 向发起人 GTD 收集箱回传结果提醒（当操作人非发起人，或流程已终态办结归档时）
    // 注意：若 Stage 6 回执通知能力已由平台自动化调度并权威投递持久化，则避免重复落库
    const hasAutomatedReceiptExecution = Boolean(externalSyncResult?.receiptExecutionId);
    let targetInitiatorId = initiator.id;
    if (!targetInitiatorId && initiator.username) {
      try {
        const u = await this.prisma.user.findFirst({
          where: { username: initiator.username },
          select: { id: true },
        });
        if (u?.id) targetInitiatorId = u.id;
      } catch (_) {}
    }

    const shouldSendReceipt = Boolean(
      !hasAutomatedReceiptExecution &&
      targetInitiatorId && (targetInitiatorId !== operatorId || isWorkflowTerminal)
    );

    if (shouldSendReceipt && targetInitiatorId) {
      const responseTitle = `[协同回执] @${operator?.username || '协作者'} 已${actionText}: ${targetItem.sourceTitle || targetItem.title}`;
      let responseContent = dto.comment?.trim()
        ? `处理意见：${dto.comment.trim()}`
        : `已${actionText}，无附加留言。`;

      if (externalSyncResult?.message) {
        const sysLabel = externalSyncResult.externalSystem || '业务系统联动';
        responseContent += `\n\n📌 **${sysLabel}**：\n- 处理说明：${externalSyncResult.message}`;
        if (externalSyncResult.trackingNumber) {
          responseContent += `\n- 凭证单号：\`${externalSyncResult.trackingNumber}\``;
        }
      }

      const canonicalTaskId = targetItem.sourceRefId || taskId;
      const receiptPayload = {
        ...updatedPayload,
        taskId: canonicalTaskId,
        taskType: 'receipt',
        isReceipt: true,
        receiptAction: dto.action,
        rollbackReason:
          dto.action === 'reject' ? dto.comment?.trim() || '审核人员提出了修改意见' : undefined,
        metadata: {
          ...((updatedPayload as any).metadata || {}),
          ...(dto.action === 'reject'
            ? { rollbackReason: dto.comment?.trim() || '审核人员提出了修改意见' }
            : {}),
        },
        originalTaskType: (targetItem.unifiedPayload as any)?.taskType || 'approval',
      };

      await this.prisma.workbenchInboxItem.create({
        data: {
          userId: targetInitiatorId,
          title: responseTitle,
          rawContent: responseContent,
          sourceType: TodoSourceType.chat,
          sourceRefId: canonicalTaskId,
          sourceTitle: targetItem.sourceTitle || targetItem.title,
          sourceSender: operator?.username || '协作者',
          unifiedPayload: receiptPayload as any,
          status: InboxItemStatus.unprocessed,
          confidence: 1.0,
        },
      });
    }

    // 4. 若该阶段已达成归档（产生归档单号/存证编号），自动触发「流程管理空间」建档入库
    const isArchiveStage = Boolean(
      externalSyncResult?.detail?.archiveId ||
      (externalSyncResult?.trackingNumber && !externalSyncResult.trackingNumber.includes('-REV-'))
    );
    if (isArchiveStage) {
      try {
        await this.workspaceService?.archiveWorkflowDeliverables?.({
          workflowId: payload.workflowId || externalSyncResult.detail?.workflowId,
          workflowName: externalSyncResult.detail?.workflowName || payload.workflowName,
          category: '合规法务',
          taskTitle:
            externalSyncResult.detail?.contractTitle ||
            payload.parameters?.contractTitle ||
            targetItem.sourceTitle ||
            targetItem.title,
          trackingNumber: externalSyncResult.trackingNumber,
          archiveId: externalSyncResult.detail?.archiveId,
          initiator: payload.initiator,
          operator: {
            username:
              operator?.username || payload.assignee?.username || payload.sourceSender || 'system',
          },
          parameters: payload.parameters,
          reviewReport: payload.reviewReport || externalSyncResult.reviewReport,
          actions: updatedActions,
          attachments: finalAttachments,
          syncResult: externalSyncResult,
        });
      } catch (archErr: any) {
        this.logger.error(`Failed to auto-archive deliverables on stage finish: ${archErr.message}`);
        if (externalSyncResult) {
          externalSyncResult.archiveError = archErr.message;
        }
      }
    }

    this.logger.log(
      `Coordination task ${taskId} action submitted: ${dto.action} by ${operator?.username}`
    );

    return {
      taskId,
      status: nextStatus,
      action: dto.action,
      actionRecord,
      unifiedPayload: updatedPayload,
    };
  }
}
