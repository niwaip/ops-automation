import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { StreamEventType } from '../react-engine/interfaces';
import type { StreamEvent } from '../react-engine/interfaces';
import type { ChatRequestDTO, ChatUploadedFileDTO } from './chat.dto';
import { ChatConversationService } from './chat-conversation.service';
import { ChatMediaService } from './chat-media.service';
import { ModelService } from '../model/model.service';
import { isWorkSlashCommand } from './chat-slash-command.util';

@Injectable()
export class UserSandboxDispatcherService {
  private readonly logger = new Logger(UserSandboxDispatcherService.name);
  private readonly sessionBrokerUrl: string;

  constructor(
    private readonly chatConversationService: ChatConversationService,
    private readonly chatMediaService: ChatMediaService,
    private readonly modelService: ModelService
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
        for (const file of files) {
          const destPath = path.join(userWorkspaceDir, file.fileName);
          if (file.filePath && fs.existsSync(file.filePath)) {
            fs.copyFileSync(file.filePath, destPath);
            try { fs.chmodSync(destPath, 0o666); } catch { /* best-effort permission setting for container mounts */ }

            // 如果存在提取的文本文件，也一并同步为 .txt 与 .extracted.txt
            const extractedSrc = `${file.filePath}.extracted.txt`;
            if (fs.existsSync(extractedSrc)) {
              const destTxt = path.join(userWorkspaceDir, `${file.fileName}.txt`);
              fs.copyFileSync(extractedSrc, destTxt);
              try { fs.chmodSync(destTxt, 0o666); } catch { /* best-effort permission setting for container mounts */ }
            }
          } else if (file.content) {
            fs.writeFileSync(destPath, Buffer.from(file.content, 'base64'));
            try { fs.chmodSync(destPath, 0o666); } catch { /* best-effort permission setting for container mounts */ }

            if (file.extractedText) {
              const destTxt = path.join(userWorkspaceDir, `${file.fileName}.txt`);
              fs.writeFileSync(destTxt, file.extractedText, 'utf-8');
              try { fs.chmodSync(destTxt, 0o666); } catch { /* best-effort permission setting for container mounts */ }
            }
          }
          this.logger.log(`Synced attached file [${file.fileName}] to user sandbox workspace: ${destPath}`);
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
      const addSessionFile = (name?: string) => {
        if (!name) return;
        const clean = path.basename(name).trim();
        if (clean && !sessionAttachedFiles.includes(clean)) {
          sessionAttachedFiles.push(clean);
        }
      };

      if (body.files && Array.isArray(body.files)) {
        for (const f of body.files) {
          addSessionFile(f.fileName);
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
            .slice(-6)
            .filter((item) => item.role === 'user' || item.role === 'assistant')
            .map((item) => {
              let contentStr = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
              if (contentStr.length > 3000) {
                contentStr = contentStr.slice(0, 3000) + '...[历史内容截断]';
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

      // 3. 构造面向沙箱的高保真 Prompt（明确会话附件清单，严禁无意注入触发词）
      let promptForSandbox = body.message;
      if (sessionAttachedFiles.length > 0) {
        let prefix = `【当前会话有效附件清单】: ${sessionAttachedFiles.join(', ')}\n`;
        if (body.files && body.files.length > 0) {
          for (const f of body.files) {
            if (f.extractedText) {
              const preview = f.extractedText.slice(0, 3000);
              prefix += `【本轮附件 ${f.fileName} 提取文本预览】:\n${preview}\n\n`;
            }
          }
        }
        promptForSandbox = `${prefix}用户指令：${body.message}`;
      }

      // 立即向前端发送沙箱连接状态，消除白屏与挂起感
      emit({
        type: StreamEventType.OBSERVATION,
        content: `⚡ 正在连接个人安全沙箱 [${effectiveUserId}]，启动智能分析与执行引擎...`,
      });

      // 尝试向 Session Broker 发起 run-harness 请求
      const timeoutMs =
        typeof (body.config as any)?.timeoutMs === 'number' && (body.config as any).timeoutMs > 0
          ? (body.config as any).timeoutMs
          : typeof (body as any).timeoutMs === 'number' && (body as any).timeoutMs > 0
            ? (body as any).timeoutMs
            : 300000;
      const controller = new AbortController();
      const timeoutId = setTimeout(async () => {
        this.logger.warn(`Execution timeout (${timeoutMs / 1000}s) reached for user [${effectiveUserId}], stopping sandbox processes...`);
        controller.abort();
        try {
          await this.stopPersonalSandbox(effectiveUserId);
        } catch (e: any) {
          this.logger.warn(`Failed to stop personal sandbox on timeout: ${e.message}`);
        }
      }, timeoutMs);

      const onAbort = () => {
        controller.abort();
        void this.stopPersonalSandbox(effectiveUserId);
      };
      if (abortSignal) {
        if (abortSignal.aborted) {
          onAbort();
          return false;
        }
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      let harnessResult: {
        success: boolean;
        output: string;
        containerName: string;
        durationMs: number;
        exitCode: number;
      } | null = null;

      let effectiveModel = body.modelId;
      if (!effectiveModel || effectiveModel === 'default' || effectiveModel === 'deepseek-chat') {
        const preferred =
          this.modelService.getPreferredDefaultModel({ mode: 'chat' }) ||
          this.modelService.getDefaultModel();
        effectiveModel = preferred?.id || effectiveModel || 'default';
      }
      const modelEntity = await this.modelService.getModel(effectiveModel);
      const modelDisplayName = modelEntity?.name || (effectiveModel !== 'default' ? effectiveModel : undefined);

      try {
        const payload = {
          userId: effectiveUserId,
          prompt: promptForSandbox,
          sessionId,
          files: sessionAttachedFiles,
          history: recentHistory,
          webSearch: Boolean(body.config?.webSearch),
          model: effectiveModel,
          modelDisplayName,
          timeoutMs,
        };

        let res = await fetch(`${this.sessionBrokerUrl}/user-sandboxes/run-harness-stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (res.status === 404) {
          this.logger.log('Streaming endpoint not available, falling back to standard run-harness');
          res = await fetch(`${this.sessionBrokerUrl}/user-sandboxes/run-harness`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

          while (true) {
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
        clearTimeout(timeoutId);
        if (abortSignal) {
          abortSignal.removeEventListener('abort', onAbort);
        }
      }

      // 解析并严格区分执行过程遥测与最终回答内容，杜绝任何工具脚本或执行日志泄露
      const rawOutput = harnessResult.output || '处理完成';
      let telemetrySummary = '';
      let cleanAnswer = '';

      if (rawOutput.includes('<<<DSH_FINAL_OUTPUT>>>')) {
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

      // 解析并提取沙箱外发文件标记（如 <<<DSH_OUTBOUND_FILE:...>>>）
      const outboundFiles: Array<{ filePath: string; fileName: string; comment?: string }> = [];
      const outboundMarkerRegex = /<<<DSH_OUTBOUND_FILE:([\s\S]*?)>>>/g;
      let m: RegExpExecArray | null;
      while ((m = outboundMarkerRegex.exec(rawOutput)) !== null) {
        const markerContent = m[1];
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

      // 解析并提取结构化性能遥测指标（如 <<<DSH_METRICS:...>>>）
      let executionMetrics: Record<string, unknown> | undefined;
      const metricsMatch = rawOutput.match(/<<<DSH_METRICS:([\s\S]*?)>>>/);
      if (metricsMatch && metricsMatch[1]) {
        try {
          executionMetrics = JSON.parse(metricsMatch[1].trim());
        } catch {
          // 忽略非法格式指标
        }
      }

      // 二次防御：彻底剔除可能意外残留在正文中的工具调用裸 JSON 与 XML 标签及外发文件标记
      cleanAnswer = this.stripToolCallArtifacts(cleanAnswer);
      cleanAnswer = cleanAnswer
        .replace(/<<<DSH_DELTA:[\s\S]*?>>>/g, '')
        .replace(/<<<DSH_OUTBOUND_FILE:[\s\S]*?>>>/g, '')
        .replace(/<<<DSH_METRICS:[\s\S]*?>>>/g, '')
        .trim();
      telemetrySummary = telemetrySummary
        .replace(/<<<DSH_DELTA:[\s\S]*?>>>/g, '')
        .replace(/<<<DSH_OUTBOUND_FILE:[\s\S]*?>>>/g, '')
        .replace(/<<<DSH_METRICS:[\s\S]*?>>>/g, '')
        .trim();

      // 自动解析沙箱生成/外发的图片文件，转换为内联 Markdown 图片直接呈现在聊天界面
      cleanAnswer = this.embedWorkspaceImagesInAnswer(effectiveUserId, cleanAnswer, outboundFiles);

      if (!cleanAnswer) {
        cleanAnswer = '已为您完成沙箱智能检索与数据分析，未获取到更多额外内容。';
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
        `Failed to dispatch to user sandbox (${err.message}). Gracefully falling back to direct streamChat.`
      );
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

    // 兜底搜索 candidate user workspaces（如当 userId 为 default 或跨模式时）
    const candidateRoots = [
      '/workspace/data/users',
      path.join(process.cwd(), 'data/users'),
      path.resolve(__dirname, '../../../../../../../data/users'),
    ];
    for (const root of candidateRoots) {
      if (fs.existsSync(root)) {
        try {
          const subdirs = fs.readdirSync(root);
          for (const sub of subdirs) {
            const candidate = path.join(root, sub, 'workspace', cleanName);
            if (fs.existsSync(candidate)) {
              return candidate;
            }
          }
        } catch {
          // ignore
        }
      }
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
}
