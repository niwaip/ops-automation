import { Injectable, Logger, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { StreamEventType } from '../react-engine/interfaces';
import type { StreamEvent } from '../react-engine/interfaces';
import type { ChatRequestDTO, ChatUploadedFileDTO } from './chat.dto';
import { ChatConversationService } from './chat-conversation.service';
import { ChatMediaService } from './chat-media.service';
import { ModelService } from '../model/model.service';
import { isWorkSlashCommand, isPersonalSlashCommand } from './chat-slash-command.util';
import { getInternalServiceHeaders } from '../../config/internal-service-auth';
import { PersonalReminderBridgeService, extractDshMarkers, stripDshMarkers } from './personal-reminder-bridge.service';

const SANDBOX_HISTORY_TURNS_LIMIT = Number(process.env.SANDBOX_HISTORY_TURNS_LIMIT || 16);
const SANDBOX_HISTORY_ITEM_CHAR_LIMIT = Number(process.env.SANDBOX_HISTORY_ITEM_CHAR_LIMIT || 12000);
const SANDBOX_ATTACHMENT_TEXT_LIMIT = Number(process.env.SANDBOX_ATTACHMENT_TEXT_LIMIT || 16000);

@Injectable()
export class UserSandboxDispatcherService {
  private readonly logger = new Logger(UserSandboxDispatcherService.name);
  private readonly sessionBrokerUrl: string;

  constructor(
    private readonly chatConversationService: ChatConversationService,
    private readonly chatMediaService: ChatMediaService,
    private readonly modelService: ModelService,
    @Optional() private readonly reminderBridge?: PersonalReminderBridgeService
  ) {
    const host =
      process.env.SESSION_BROKER_HOST ||
      (process.env.DOCKER_ENV ? 'ops-session-broker' : 'localhost');
    const port = process.env.SESSION_BROKER_PORT || '3002';
    this.sessionBrokerUrl =
      process.env.SESSION_BROKER_URL || `http://${host}:${port}`;
  }

  private getWorkspaceDir(userId: string): string {
    const candidateRoots = [
      path.join('/workspace/data/users', userId, 'workspace'),
      path.join(process.cwd(), 'data/users', userId, 'workspace'),
      path.resolve(__dirname, '../../../../../../../data/users', userId, 'workspace'),
    ];
    for (const dir of candidateRoots) {
      if (fs.existsSync(dir)) return dir;
    }
    const target = candidateRoots[0] || path.join(process.cwd(), 'data/users', userId, 'workspace');
    try {
      fs.mkdirSync(target, { recursive: true });
    } catch {
      // ignore
    }
    return target;
  }

  syncFilesToSandboxWorkspace(
    userId: string,
    files?: ChatUploadedFileDTO[],
    sessionId?: string,
    sessionFiles?: string[]
  ): void {
    const userWorkspaceDir = this.getWorkspaceDir(userId);
    if (files && files.length > 0) {
      try {
        for (const file of files as any[]) {
          const fileName = typeof file === 'string' ? path.basename(file) : file?.fileName;
          if (!fileName) continue;
          const destPath = path.join(userWorkspaceDir, fileName);
          const filePath = typeof file === 'string' ? file : file?.filePath;
          if (filePath && fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, destPath);
            try { fs.chmodSync(destPath, 0o666); } catch { /* best-effort permission setting for container mounts */ }

            // 如果存在提取的文本文件，也一并同步为 .txt 与 .extracted.txt
            const extractedSrc = `${filePath}.extracted.txt`;
            if (fs.existsSync(extractedSrc)) {
              const destTxt = path.join(userWorkspaceDir, `${fileName}.txt`);
              fs.copyFileSync(extractedSrc, destTxt);
              try { fs.chmodSync(destTxt, 0o666); } catch { /* best-effort permission setting for container mounts */ }
            }
          } else if (file?.content) {
            fs.writeFileSync(destPath, Buffer.from(file.content, 'base64'));
            try { fs.chmodSync(destPath, 0o666); } catch { /* best-effort permission setting for container mounts */ }

            if (file.extractedText) {
              const destTxt = path.join(userWorkspaceDir, `${fileName}.txt`);
              fs.writeFileSync(destTxt, file.extractedText, 'utf-8');
              try { fs.chmodSync(destTxt, 0o666); } catch { /* best-effort permission setting for container mounts */ }
            }
          }
          this.logger.log(`Synced attached file [${fileName}] to user sandbox workspace: ${destPath}`);
        }
      } catch (e: any) {
        this.logger.warn(`Failed to sync attached files to sandbox workspace: ${e.message}`);
      }
    }

    // 将会话关联的有效附件清单持久化到工作区 session 目录，保证沙箱环境上下文隔离
    if (sessionId && sessionFiles && sessionFiles.length > 0) {
      try {
        const cleanSid = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const sessionsDir = path.join(userWorkspaceDir, '.dsh', 'sessions');
        if (!fs.existsSync(sessionsDir)) {
          fs.mkdirSync(sessionsDir, { recursive: true });
          try { fs.chmodSync(sessionsDir, 0o777); } catch { /* best-effort */ }
        }
        const attFile = path.join(sessionsDir, `${cleanSid}.attachments.json`);
        fs.writeFileSync(attFile, JSON.stringify(sessionFiles, null, 2), 'utf-8');
        try { fs.chmodSync(attFile, 0o666); } catch { /* best-effort */ }
      } catch (e: any) {
        this.logger.warn(`Failed to persist session attachments index: ${e.message}`);
      }
    }
  }

  /**
   * 显式停止用户个人沙箱中正在执行的 Harness 任务
   */
  async stopPersonalSandbox(userId?: string): Promise<boolean> {
    const effectiveUserId = (userId || 'admin').trim();
    try {
      this.logger.log(`Stopping personal sandbox execution for user [${effectiveUserId}]...`);
      const res = await fetch(`${this.sessionBrokerUrl}/user-sandboxes/${effectiveUserId}/stop-exec`, {
        method: 'POST',
        headers: getInternalServiceHeaders(),
      });
      return res.ok;
    } catch (err: any) {
      this.logger.warn(`Failed to stop sandbox for user [${effectiveUserId}]: ${err.message}`);
      return false;
    }
  }

  /**
   * 调度个人专属沙箱执行 DeepSeek Harness 智能分析或命令
   */
  async dispatchPersonalSandbox(
    body: ChatRequestDTO,
    emit: (event: StreamEvent | Record<string, unknown>) => void,
    userId: string,
    abortSignal?: AbortSignal
  ): Promise<boolean> {
    const effectiveUserId = (userId || 'admin').trim();
    const sessionId = body.sessionId || 'default';

    // 纵深防御：个人模式下禁止调用工作模式专属的 Slash 技能
    if (isWorkSlashCommand(body.message)) {
      emit({
        type: StreamEventType.OBSERVATION,
        content:
          '⚠️ 个人模式下不能调用工作能力（如工作空间文档探索 `/doc`、工作邮件助手 `/email`、文档内容提取 `/extract` 等企业技能）。\n\n' +
          '💡 如需使用企业技能与自动化工作流，请在界面左下方切换至【工作模式】。',
      });
      return true;
    }

    this.logger.log(
      `Dispatching personal request to sandbox harness for user [${effectiveUserId}]`
    );

    emit({
      type: StreamEventType.THOUGHT,
      content: '正在连接并调度您的个人专属安全沙箱容器 (DeepSeek Harness)...',
    });

    try {
      // 1. 获取当前会话上下文历史并收集属于当前会话的全部有效附件（会话作用域隔离）
      let recentHistory: Array<{ role: string; content: string }> = [];
      const sessionAttachedFiles: string[] = [];
      const currentTurnFiles: string[] = [];
      const addSessionFile = (name?: string) => {
        if (!name) return;
        const clean = path.basename(name).trim();
        if (clean && !sessionAttachedFiles.includes(clean)) {
          sessionAttachedFiles.push(clean);
        }
      };

      if (body.files && Array.isArray(body.files)) {
        for (const f of body.files as any[]) {
          const fn = typeof f === 'string' ? f : (f?.fileName || f?.filePath);
          if (fn) {
            const clean = path.basename(fn).trim();
            if (clean && !currentTurnFiles.includes(clean)) {
              currentTurnFiles.push(clean);
            }
          }
          addSessionFile(fn);
        }
      }

      try {
        const historyItems = await this.chatConversationService.getChatHistory(
          sessionId,
          effectiveUserId
        );
        if (historyItems && Array.isArray(historyItems)) {
          for (const item of historyItems) {
            const metaFiles = (item as any).metadata?.files;
            if (Array.isArray(metaFiles)) {
              for (const mf of metaFiles) {
                const fn = typeof mf === 'string' ? mf : (mf as any)?.fileName;
                addSessionFile(fn);
              }
            }
          }

          recentHistory = historyItems
            .slice(-SANDBOX_HISTORY_TURNS_LIMIT)
            .filter((item) => item.role === 'user' || item.role === 'assistant')
            .map((item) => {
              let contentStr = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
              if (contentStr.length > SANDBOX_HISTORY_ITEM_CHAR_LIMIT) {
                contentStr = contentStr.slice(0, SANDBOX_HISTORY_ITEM_CHAR_LIMIT) + '...[⚠️ 历史单条内容较长已截断]';
              }
              return {
                role: item.role,
                content: contentStr,
              };
            });
        }
      } catch (histErr: any) {
        this.logger.warn(`Failed to retrieve chat history for session [${sessionId}]: ${histErr.message}`);
      }

      // 2. 同步本轮附加文件到沙箱工作区并写入当前会话附件索引
      this.syncFilesToSandboxWorkspace(effectiveUserId, body.files, sessionId, sessionAttachedFiles);

      // 3. 构造面向沙箱的高保真 Prompt（明确区分本轮上传附件与历史参考附件，避免越界联想）
      let promptForSandbox = body.message;
      if (currentTurnFiles.length > 0) {
        let prefix = `【当前轮次用户上传附件】: ${currentTurnFiles.join(', ')}（这是用户本轮刚上传的新文件，为本次指令的主要处理对象）\n`;
        const historicalFiles = sessionAttachedFiles.filter((f) => !currentTurnFiles.includes(f));
        if (historicalFiles.length > 0) {
          prefix += `【历史会话参考附件】: ${historicalFiles.join(', ')}（仅作为历史背景，除非用户指令明确要求对比或关联历史文件，否则默认只处理本轮上传附件）\n`;
        }
        if (body.files && body.files.length > 0) {
          for (const f of body.files) {
            if (f.extractedText) {
              const textLimit = SANDBOX_ATTACHMENT_TEXT_LIMIT;
              let preview = f.extractedText.slice(0, textLimit);
              if (f.extractedText.length > textLimit) {
                preview += `\n...[⚠️ 附件文本预览已截取前 ${textLimit} 字符，完整内容请直接读取工作区 /workspace/${f.fileName} 文件]`;
              }
              prefix += `【本轮附件 ${f.fileName} 提取文本预览】:\n${preview}\n\n`;
            }
          }
        }
        promptForSandbox = `${prefix}用户指令：${body.message}`;
      } else if (sessionAttachedFiles.length > 0) {
        const prefix = `【当前会话有效附件清单】: ${sessionAttachedFiles.join(', ')}\n`;
        promptForSandbox = `${prefix}用户指令：${body.message}`;
      }

      // 若用户指令涉及提醒/日程/闹钟，注入数据库中真实的提醒规则列表，防止模型幻觉或无法回答当前列表
      if (this.reminderBridge && /(?:提醒|日程|闹钟|待办|通知)/.test(body.message)) {
        try {
          const list = await this.reminderBridge.listReminders(effectiveUserId);
          if (list && list.length > 0) {
            const lines = list.slice(0, 10).map((r: any, idx: number) => {
              const timeDesc = r.runAt || r.cronExpression || '未指定时间';
              const ch = r.sendWechat ? '微信+站内' : '站内';
              const st = r.isActive ? '运行中' : '已停用';
              return `${idx + 1}. 【${r.title}】内容: ${r.message} | 时间: ${timeDesc} | 推送渠道: ${ch} | 状态: ${st}`;
            });
            promptForSandbox = `【系统真实提醒日程列表 (来自数据库已生效数据，请直接据此回答)】:\n${lines.join('\n')}\n\n` + promptForSandbox;
          } else {
            promptForSandbox = `【系统真实提醒日程列表 (来自数据库)】: 当前系统内暂无任何已生效的提醒日程。\n\n` + promptForSandbox;
          }
        } catch {
          // 降级容错
        }
      }

      // 立即向前端发送沙箱连接状态，消除白屏与挂起感
      emit({
        type: StreamEventType.OBSERVATION,
        content: `⚡ 正在连接个人安全沙箱 [${effectiveUserId}]，启动智能分析与执行引擎...`,
      });

      const controller = new AbortController();
      const onAbort = () => {
        controller.abort();
        void this.stopPersonalSandbox(effectiveUserId);
      };
      if (abortSignal?.aborted) {
        onAbort();
        return false;
      }
      if (abortSignal) {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      // 记录当前轮次任务启动时间戳，用于准确区分新产物与历史遗留文件
      const turnStartTime = Date.now();

      // 尝试向 Session Broker 发起 run-harness 请求
      const timeoutMs =
        typeof (body.config as any)?.timeoutMs === 'number' && (body.config as any).timeoutMs > 0
          ? (body.config as any).timeoutMs
          : typeof (body as any).timeoutMs === 'number' && (body as any).timeoutMs > 0
            ? (body as any).timeoutMs
            : 300000;
      let timeoutId: NodeJS.Timeout | undefined = undefined;
      let harnessResult: {
        success: boolean;
        output: string;
        containerName: string;
        durationMs: number;
        exitCode: number;
      } | null = null;

      const isExplicitModel = Boolean(
        body.modelId &&
        body.modelId !== 'default' &&
        body.modelId !== 'deepseek-chat'
      );
      let effectiveModel = body.modelId;
      let targetModelId = effectiveModel;
      if (!isExplicitModel) {
        const preferred =
          this.modelService.getPreferredDefaultModel({ mode: 'chat' }) ||
          this.modelService.getDefaultModel();
        targetModelId = preferred?.id || 'default';
        effectiveModel = 'default';
      }

      try {
        timeoutId = setTimeout(async () => {
          this.logger.warn(`Execution timeout (${timeoutMs / 1000}s) reached for user [${effectiveUserId}], stopping sandbox processes...`);
          controller.abort();
          try {
            await this.stopPersonalSandbox(effectiveUserId);
          } catch (e: any) {
            this.logger.warn(`Failed to stop personal sandbox on timeout: ${e.message}`);
          }
        }, timeoutMs);

        const modelEntity = await this.modelService.getModel(targetModelId || 'default');
        const modelDisplayName = modelEntity?.name || (targetModelId && targetModelId !== 'default' ? targetModelId : undefined);
        const payload = {
          userId: effectiveUserId,
          prompt: promptForSandbox,
          sessionId,
          files: currentTurnFiles.length > 0 ? currentTurnFiles : sessionAttachedFiles,
          history: recentHistory,
          webSearch: body.config?.webSearch !== undefined ? Boolean(body.config.webSearch) : true,
          research: Boolean((body.config as any)?.research),
          model: effectiveModel,
          modelDisplayName,
          timeoutMs,
        };

        let res = await fetch(`${this.sessionBrokerUrl}/user-sandboxes/run-harness-stream`, {
          method: 'POST',
          headers: getInternalServiceHeaders(),
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (res.status === 404) {
          this.logger.log('Streaming endpoint not available, falling back to standard run-harness');
          res = await fetch(`${this.sessionBrokerUrl}/user-sandboxes/run-harness`, {
            method: 'POST',
            headers: getInternalServiceHeaders(),
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
        }

        if (!res.ok) {
          const errorText = await res.text();
          this.logger.warn(
            `Session broker user sandbox returned ${res.status}: ${errorText}`
          );
          if (res.status === 409) {
            emit({
              type: StreamEventType.ERROR,
              content: '⚠️ 该沙箱当前正在执行前一个任务，请稍后再试或点击停止。',
            });
            return true;
          }
          emit({
            type: StreamEventType.OBSERVATION,
            content: `⚠️ 沙箱执行返回异常 (${res.status})，正在自动切换到云端模型直连模式...`,
          });
          return false;
        }

        if (res.headers.get('content-type')?.includes('text/event-stream') && res.body) {
          const reader = (res.body as any).getReader();
          const decoder = new TextDecoder('utf-8');
          let sseBuffer = '';
          let deltaAccumulator = '';

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            sseBuffer += decoder.decode(value, { stream: true });
            const sseEvents = sseBuffer.split('\n\n');
            sseBuffer = sseEvents.pop() || '';

            for (const evt of sseEvents) {
              const lines = evt.split('\n');
              let eventType = 'message';
              let eventData = '';
              for (const l of lines) {
                if (l.startsWith('event:')) {
                  eventType = l.slice(6).trim();
                } else if (l.startsWith('data:')) {
                  eventData += l.slice(5).trim();
                }
              }
              if (!eventData) continue;

              let parsed: any;
              try {
                parsed = JSON.parse(eventData);
              } catch {
                // ignore malformed JSON chunk
                continue;
              }

              if (eventType === 'observation' && parsed?.content) {
                // 当沙箱开始调用工具或命中技能意图时，说明进入中间行动阶段，清空上一轮的过渡垫话累加器
                const contentStr = String(parsed.content);
                if (contentStr.includes('⚡') || contentStr.includes('🎯') || contentStr.includes('🔍')) {
                  deltaAccumulator = '';
                }
                emit({
                  type: StreamEventType.OBSERVATION,
                  content: parsed.content,
                });
              } else if (eventType === 'delta_reset') {
                deltaAccumulator = '';
              } else if (eventType === 'delta' && parsed?.content) {
                deltaAccumulator += parsed.content;
                emit({
                  type: StreamEventType.OBSERVATION,
                  content: deltaAccumulator,
                  data: { mode: 'chat', isDelta: true },
                });
              } else if (eventType === 'done') {
                harnessResult = parsed;
              } else if (eventType === 'error') {
                throw new Error(parsed?.message || parsed?.error || 'Sandbox execution error');
              }
            }
          }
        } else {
          harnessResult = await res.json();
        }

        if (!harnessResult) {
          throw new Error('Sandbox stream ended unexpectedly without completion event');
        }

        if (harnessResult.success === false) {
          throw new Error(
            harnessResult.output || `Sandbox process failed with exit code ${harnessResult.exitCode}`
          );
        }
      } catch (fetchErr: any) {
        if (abortSignal?.aborted) {
          this.logger.log(`Run harness cancelled by client for user [${effectiveUserId}]`);
          return true;
        }
        if (controller.signal.aborted) {
          this.logger.warn(`Run harness timed out for user [${effectiveUserId}]`);
          emit({
            type: StreamEventType.ERROR,
            content: `⚠️ 沙箱任务执行超时（超过 ${timeoutMs / 1000} 秒），已自动中止后台任务。请尝试简化任务或检查模型连通性。`,
          });
          return true;
        }
        throw fetchErr;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (abortSignal) {
          abortSignal.removeEventListener('abort', onAbort);
        }
      }

      // 解析并严格区分执行过程遥测与最终回答内容，杜绝任何工具脚本或执行日志泄露
      const rawOutput = harnessResult.output || '处理完成';
      let telemetrySummary = '';
      let cleanAnswer = '';

      // 优先从长度前缀帧 <<<DSH_FINAL_OUTPUT:len={LEN}:{PAYLOAD}>>> 解析最终回复正文
      const finalOutputMarkers = extractDshMarkers(rawOutput, 'FINAL_OUTPUT');
      const firstFinal = finalOutputMarkers[0];
      if (firstFinal && firstFinal.payload) {
        telemetrySummary = rawOutput.slice(0, firstFinal.startIndex).trim();
        cleanAnswer = firstFinal.payload.trim();
      } else if (rawOutput.includes('<<<DSH_FINAL_OUTPUT>>>')) {
        const parts = rawOutput.split('<<<DSH_FINAL_OUTPUT>>>');
        telemetrySummary = (parts[0] || '').trim();
        cleanAnswer = parts.slice(1).join('<<<DSH_FINAL_OUTPUT>>>').trim();
      } else {
        const lines = rawOutput.split('\n');
        const telemetryLines: string[] = [];
        const answerLines: string[] = [];
        let isAnswer = false;

        for (const line of lines) {
          if (!isAnswer && (line.startsWith('⚡') || line.startsWith('🔍') || line.startsWith('✓') || line.startsWith('---') || !line.trim())) {
            if (line.trim()) {
              telemetryLines.push(line.trim());
            }
          } else {
            isAnswer = true;
            answerLines.push(line);
          }
        }
        telemetrySummary = telemetryLines.join('\n').trim();
        cleanAnswer = answerLines.join('\n').trim() || rawOutput;
      }

      // 解析并提取沙箱外发文件标记（支持长度前缀与内容中包含 >>> 的容错）
      const outboundFiles: Array<{ filePath: string; fileName: string; comment?: string }> = [];
      const extractedOutbounds = extractDshMarkers(rawOutput, 'OUTBOUND_FILE');
      for (const item of extractedOutbounds) {
        const markerContent = item.payload;
        if (!markerContent) continue;
        try {
          const parsed = JSON.parse(markerContent.trim());
          if (parsed && typeof parsed.filePath === 'string') {
            outboundFiles.push({
              filePath: parsed.filePath,
              fileName: parsed.fileName || parsed.filePath.split('/').pop() || 'file',
              comment: parsed.comment,
            });
          }
        } catch {
          // 忽略非法 JSON 标记
        }
      }

      // 解析并提取结构化性能遥测指标（支持长度前缀与内容容错）
      let executionMetrics: Record<string, unknown> | undefined;
      const extractedMetrics = extractDshMarkers(rawOutput, 'METRICS');
      const firstMetric = extractedMetrics[0];
      if (firstMetric && firstMetric.payload) {
        try {
          executionMetrics = JSON.parse(firstMetric.payload.trim());
        } catch {
          // 忽略非法格式指标
        }
      }

      // 解析并处理沙箱创建的个人提醒（<<<DSH_REMINDER_CREATE:...>>>）
      let createdReminders: any[] = [];
      let reminderError: string | undefined;
      let reminderRequestedCount = 0;
      if (this.reminderBridge && (rawOutput.includes('<<<DSH_REMINDER_CREATE:') || rawOutput.includes('<<<DSH_REMINDER_CREATE'))) {
        try {
          const reminderRes = await this.reminderBridge.processSandboxReminders(
            effectiveUserId,
            rawOutput
          );
          createdReminders = reminderRes.created;
          reminderError = reminderRes.error;
          reminderRequestedCount = reminderRes.requestedCount || 0;
        } catch (rErr: any) {
          this.logger.warn(`Failed to process sandbox reminders: ${rErr.message}`);
          reminderError = rErr.message;
        }
      }

      // 二次防御：彻底剔除可能意外残留在正文中的工具调用裸 JSON 与 XML 标签及协议标记
      cleanAnswer = this.stripToolCallArtifacts(cleanAnswer);
      const tagsToStrip = ['DELTA', 'DELTA_RESET', 'OUTBOUND_FILE', 'REMINDER_CREATE', 'METRICS', 'FINAL_OUTPUT'];
      cleanAnswer = stripDshMarkers(cleanAnswer, tagsToStrip).trim();
      telemetrySummary = stripDshMarkers(telemetrySummary, tagsToStrip).trim();

      // 纠正虚假提醒成功文案：严格根据控制面确认落库结果校验
      if (reminderRequestedCount > 0) {
        if (createdReminders.length === 0) {
          // 控制面未确认落库，提醒调度创建失败！
          const failureNotice = `⚠️ 【提醒创建失败】后台调度系统未确认落库（原因: ${reminderError || '提醒时间未指定或已过期，调度服务拒绝落库'}）。该提醒并未实际生效，请提供明确的未来具体时间（如 2026-09-26T10:00:00）或 Cron 表达式后重试。`;
          if (/(?:已成功为您创建|已为您创建|已成功创建|已创建|提醒已成功同步|✓ 已成功|已准备提交)/.test(cleanAnswer)) {
            cleanAnswer = failureNotice;
          } else {
            cleanAnswer = `${failureNotice}\n\n${cleanAnswer}`.trim();
          }
        } else if (createdReminders.length < reminderRequestedCount) {
          const partialNotice = `⚠️ 部分提醒落库失败（成功 ${createdReminders.length}/${reminderRequestedCount} 条，原因: ${reminderError || '部分时间参数未通过校验'}）。\n已生效提醒：\n${createdReminders.map((r, i) => `${i + 1}. 【${r.title}】下次执行: ${r.nextRunAt}`).join('\n')}`;
          cleanAnswer = `${partialNotice}\n\n${cleanAnswer}`.trim();
        } else {
          const confirmationBanner = `✓ [控制面已确认] ${createdReminders.length} 条提醒日程已成功落库并挂载后台调度系统：\n${createdReminders.map((r, i) => `${i + 1}. 【${r.title}】下次执行: ${r.nextRunAt} (渠道: ${r.sendWechat ? '微信+站内' : '站内'})`).join('\n')}`;
          if (!cleanAnswer.includes('控制面已确认')) {
            cleanAnswer = `${cleanAnswer}\n\n${confirmationBanner}`.trim();
          }
        }
      }

      // 自动解析沙箱生成/外发的图片与各类交付物文件（Word/Excel/PPT/PDF等），转换为内联 Markdown 或专属下载卡片
      cleanAnswer = this.embedWorkspaceDeliverablesAndImagesInAnswer(
        effectiveUserId,
        cleanAnswer,
        outboundFiles,
        sessionAttachedFiles,
        turnStartTime
      );

      if (!cleanAnswer) {
        cleanAnswer =
          '⚠️ 沙箱已完成执行，但未能生成有效的回复文本（可能上游推理模型网络超时或服务异常中断）。建议重新发送或切换更稳定的模型重试。';
      }

      if (!telemetrySummary) {
        telemetrySummary = `⚡ 个人安全沙箱已就绪: ${harnessResult.containerName}\n运行引擎: DeepSeek Harness v1.3 (耗时: ${(harnessResult.durationMs / 1000).toFixed(1)}s)`;
      }

      // 发送背景执行进度与工具调用信息
      emit({
        type: StreamEventType.OBSERVATION,
        content: telemetrySummary,
      });

      emit({
        type: StreamEventType.RESULT,
        content: cleanAnswer,
        data: {
          mode: 'chat',
          sandbox: {
            containerName: harnessResult.containerName,
            harness: 'deepseek-harness',
            executed: true,
            durationMs: harnessResult.durationMs,
            exitCode: harnessResult.exitCode,
            metrics: executionMetrics,
          },
          outboundFiles: outboundFiles.length > 0 ? outboundFiles : undefined,
          reminders: createdReminders.length > 0 ? createdReminders : undefined,
        },
      });

      // 持久化到会话历史（保持原始清晰的用户提问文本，严禁保存序列化的 JSON 数组）
      const session = await this.chatConversationService.persistConversation({
        sessionId,
        userContent: body.message,
        assistantContent: cleanAnswer,
        rawAssistantContent: rawOutput,
        modelId: effectiveModel || body.modelId || 'default',
        thinkingEnabled: Boolean(body.config?.thinking),
        ownerUserId: effectiveUserId,
        clientMessageId: body.clientMessageId,
        clientAssistantMessageId: body.clientAssistantMessageId,
        files: body.files,
      });

      emit(this.chatConversationService.buildSessionPatchEvent(sessionId, session));
      return true;
    } catch (err: any) {
      this.logger.warn(
        `Failed to dispatch to user sandbox (${err.message}).`
      );
      if (isPersonalSlashCommand(body.message) || body.message.trim().startsWith('/')) {
        emit({
          type: StreamEventType.ERROR,
          content: `⚠️ 沙箱任务执行异常 (${err.message})，未能完成指令执行。请重试或检查模型服务连接。`,
        });
        return true;
      }
      if (
        err.message?.includes('正在执行其他任务') ||
        err.message?.includes('沙箱当前正在执行') ||
        err.status === 409
      ) {
        emit({
          type: StreamEventType.ERROR,
          content: '⚠️ 个人专属安全沙箱当前正在执行其他任务。请稍候片刻等待当前任务完成，或刷新后重试。',
        });
        return true;
      }
      emit({
        type: StreamEventType.OBSERVATION,
        content: `⚠️ 沙箱连接遇到异常 (${err.message})，正在自动无缝切换到云端模型直连模式...`,
      });
      return false;
    }
  }

  private stripToolCallArtifacts(raw: string): string {
    let res = (raw || '')
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
      .replace(/<tool_call>[\s\S]*$/g, '')
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
   * 获取用户沙箱工作区中的文件物理路径
   */
  getWorkspaceFilePath(userId: string, fileName: string): string | null {
    const cleanName = path.basename(fileName);
    const userWorkspaceDir = this.getWorkspaceDir(userId);
    const primaryPath = path.join(userWorkspaceDir, cleanName);
    if (fs.existsSync(primaryPath)) {
      return primaryPath;
    }

    // 检查是否在用户知识库目录下
    const knowledgeCandidates = [
      path.join(userWorkspaceDir, '..', 'knowledge', cleanName),
      path.join(process.cwd(), 'data/users', userId, 'knowledge', cleanName),
      path.join('/workspace/data/users', userId, 'knowledge', cleanName),
    ];
    for (const cand of knowledgeCandidates) {
      if (fs.existsSync(cand)) return cand;
    }

    return null;
  }

  /**
   * 将沙箱工作区生成或提及的图片转换为 Markdown 图片链接，直接呈现在聊天界面
   */
  private embedWorkspaceImagesInAnswer(
    userId: string,
    text: string,
    outboundFiles: Array<{ filePath: string; fileName: string; comment?: string }>
  ): string {
    let result = text;
    const handledFiles = new Set<string>();
    const imageExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

    const getFileUrl = (fileName: string): string | null => {
      try {
        const cleanName = path.basename(fileName);
        const filePath = this.getWorkspaceFilePath(userId, cleanName);
        if (!filePath) return null;
        const ext = path.extname(cleanName).toLowerCase();
        if (!imageExts.has(ext)) return null;
        return `/api/ai/chat/workspace-files/${encodeURIComponent(userId)}/${encodeURIComponent(cleanName)}`;
      } catch (err: any) {
        this.logger.warn(`Failed to resolve workspace image ${fileName}: ${err.message}`);
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
  private embedWorkspaceDeliverablesAndImagesInAnswer(
    userId: string,
    text: string,
    outboundFiles: Array<{ filePath: string; fileName: string; comment?: string }>,
    sessionFiles: string[] = [],
    turnStartTime?: number
  ): string {
    // 1. 先进行图片内联转换（保持既有行为与规范）
    let result = this.embedWorkspaceImagesInAnswer(userId, text, outboundFiles);

    // 2. 文档与交付物扩展名
    const deliverableExts = new Set([
      '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
      '.pdf', '.zip', '.tar', '.gz', '.csv', '.txt'
    ]);

    // 记录用户上传的原始输入附件文件名，严禁将其作为“新生成产物”推荐给用户
    const inputFiles = new Set(
      (sessionFiles || []).map((f) => path.basename(f).trim().toLowerCase())
    );

    const getFileIcon = (ext: string): string => {
      if (ext === '.docx' || ext === '.doc') return '📄';
      if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') return '📊';
      if (ext === '.pptx' || ext === '.ppt') return '📑';
      if (ext === '.pdf') return '📕';
      if (ext === '.zip' || ext === '.tar' || ext === '.gz') return '📦';
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
      /\[(.*?)\]\((?:(?:\/workspace\/)?([a-zA-Z0-9_\-\u4e00-\u9fa5 ]+\.(?:docx?|xlsx?|pptx?|pdf|zip|tar|gz|csv)))\)/gi,
      (match, label, fileName) => {
        const cleanName = path.basename(fileName.trim());
        const filePath = this.getWorkspaceFilePath(userId, cleanName);
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
    const mentionRegex = /(?:《|【|“|"|'|`|\/workspace\/)?([a-zA-Z0-9_\-\u4e00-\u9fa5 ]+\.(?:docx?|xlsx?|pptx?|pdf|zip|tar|gz|csv))(?:》|】|”|"|'|`|\b)?/gi;
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
          const filePath = this.getWorkspaceFilePath(userId, foundName);
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
        : this.getWorkspaceFilePath(userId, item.fileName);
      if (!filePath || !fs.existsSync(filePath)) continue;

      handledFiles.add(item.fileName);
      const ext = path.extname(item.fileName).toLowerCase();
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
}
