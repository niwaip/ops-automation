import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { StreamEventType } from '../react-engine/interfaces';
import type { ChatRequestDTO, ChatUploadedFileDTO } from './chat.dto';
import { ChatConversationService } from './chat-conversation.service';
import { ChatMediaService } from './chat-media.service';
import { isWorkSlashCommand } from './chat-slash-command.util';

@Injectable()
export class UserSandboxDispatcherService {
  private readonly logger = new Logger(UserSandboxDispatcherService.name);
  private readonly sessionBrokerUrl: string;

  constructor(
    private readonly chatConversationService: ChatConversationService,
    private readonly chatMediaService: ChatMediaService
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
    const target = candidateRoots[0];
    try {
      fs.mkdirSync(target, { recursive: true });
    } catch {
      // ignore
    }
    return target;
  }

  private syncFilesToSandboxWorkspace(userId: string, files?: ChatUploadedFileDTO[]): void {
    if (!files || files.length === 0) return;
    try {
      const userWorkspaceDir = this.getWorkspaceDir(userId);
      for (const file of files) {
        const destPath = path.join(userWorkspaceDir, file.fileName);
        if (file.filePath && fs.existsSync(file.filePath)) {
          fs.copyFileSync(file.filePath, destPath);
          try { fs.chmodSync(destPath, 0o666); } catch {}

          // 如果存在提取的文本文件，也一并同步为 .txt 与 .extracted.txt
          const extractedSrc = `${file.filePath}.extracted.txt`;
          if (fs.existsSync(extractedSrc)) {
            const destTxt = path.join(userWorkspaceDir, `${file.fileName}.txt`);
            fs.copyFileSync(extractedSrc, destTxt);
            try { fs.chmodSync(destTxt, 0o666); } catch {}
          }
        } else if (file.content) {
          fs.writeFileSync(destPath, Buffer.from(file.content, 'base64'));
          try { fs.chmodSync(destPath, 0o666); } catch {}

          if (file.extractedText) {
            const destTxt = path.join(userWorkspaceDir, `${file.fileName}.txt`);
            fs.writeFileSync(destTxt, file.extractedText, 'utf-8');
            try { fs.chmodSync(destTxt, 0o666); } catch {}
          }
        }
        this.logger.log(`Synced attached file [${file.fileName}] to user sandbox workspace: ${destPath}`);
      }
    } catch (e: any) {
      this.logger.warn(`Failed to sync attached files to sandbox workspace: ${e.message}`);
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
    emit: (event: Record<string, unknown>) => void,
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
      // 1. 同步附加文件到沙箱工作区，确保 dsh 和用户脚本能直接访问
      this.syncFilesToSandboxWorkspace(effectiveUserId, body.files);

      // 2. 构造面向沙箱的高保真 Prompt（附带文件位置与文本预览）
      let promptForSandbox = body.message;
      if (body.files && body.files.length > 0) {
        const fileList = body.files.map((f) => f.fileName).join(', ');
        promptForSandbox =
          `用户附加了文件：${fileList}。\n` +
          `文件已放入当前沙箱 /workspace/ 目录下（包含原始文件及同名 .txt 提取文本，可直接使用 shell/cat/python 等命令操作与分析）。\n\n`;
        for (const f of body.files) {
          if (f.extractedText) {
            const preview = f.extractedText.slice(0, 4000);
            promptForSandbox += `【文件 ${f.fileName} 提取文本预览】：\n${preview}\n\n`;
          }
        }
        promptForSandbox += `用户指令：${body.message}`;
      }

      // 获取当前会话上下文历史（保留最近 8 条历史记录，确保多轮对话上下文连续）
      let recentHistory: Array<{ role: string; content: string }> = [];
      try {
        const historyItems = await this.chatConversationService.getChatHistory(
          sessionId,
          effectiveUserId
        );
        recentHistory = (historyItems || [])
          .slice(-8)
          .filter((item) => item.role === 'user' || item.role === 'assistant')
          .map((item) => ({
            role: item.role,
            content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content),
          }));
      } catch (histErr: any) {
        this.logger.warn(`Failed to retrieve chat history for session [${sessionId}]: ${histErr.message}`);
      }

      // 立即向前端发送沙箱连接状态，消除白屏与挂起感
      emit({
        type: StreamEventType.OBSERVATION,
        content: `⚡ 正在连接个人安全沙箱 [${effectiveUserId}]，启动 DeepSeek Harness 智能引擎...`,
      });

      // 启动心跳进度指示器，让前台实时感知沙箱运行阶段
      let progressTick = 0;
      const progressStages = [
        '🔍 沙箱正在检索外部实时数据与知识库上下文关联...',
        '⚡ 正在执行多轮 ReAct 推理与自主工具调用...',
        '✓ 正在整合工具返回数据，编写条理化的最终分析解答...',
      ];
      const heartbeatTimer = setInterval(() => {
        const msg = progressStages[progressTick] || '⏳ 正在进行深度推理与数据综合计算...';
        progressTick += 1;
        emit({
          type: StreamEventType.OBSERVATION,
          content: msg,
        });
      }, 3000);

      // 尝试向 Session Broker 发起 run-harness 请求
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

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
      };

      try {
        const res = await fetch(`${this.sessionBrokerUrl}/user-sandboxes/run-harness`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: effectiveUserId,
            prompt: promptForSandbox,
            sessionId,
            history: recentHistory,
            webSearch: Boolean(body.config?.webSearch),
            model: body.modelId || 'deepseek-chat',
            timeoutMs: 300000,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorText = await res.text();
          this.logger.warn(
            `Session broker user sandbox returned ${res.status}: ${errorText}`
          );
          emit({
            type: StreamEventType.OBSERVATION,
            content: `⚠️ 沙箱执行返回异常 (${res.status})，正在自动无缝切换到云端模型直连模式...`,
          });
          return false;
        }

        harnessResult = await res.json();
      } catch (fetchErr: any) {
        if (controller.signal.aborted || abortSignal?.aborted) {
          this.logger.log(`Run harness aborted for user [${effectiveUserId}]`);
          return true;
        }
        throw fetchErr;
      } finally {
        clearInterval(heartbeatTimer);
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
        telemetrySummary = parts[0].trim();
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

      // 二次防御：彻底剔除可能意外残留在正文中的工具调用裸 JSON 与 XML 标签
      cleanAnswer = cleanAnswer
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
        .replace(/<tool_call>[\s\S]*$/g, '')
        .replace(/<｜DSML｜[\s\S]*?<\/｜DSML｜[^>]*>/g, '')
        .replace(/<｜DSML｜[\s\S]*$/g, '')
        .replace(/(?:```(?:json)?\s*)?\{\s*"(?:name|tool|action)"\s*:\s*"[^"]+"\s*,\s*"(?:arguments|parameters|params|action_input)"\s*:\s*\{[\s\S]*?\}\s*\}(?:\s*```)?/g, '')
        .trim();

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
          },
        },
      });

      // 持久化到会话历史（保持原始清晰的用户提问文本，严禁保存序列化的 JSON 数组）
      const session = await this.chatConversationService.persistConversation({
        sessionId,
        userContent: body.message,
        assistantContent: cleanAnswer,
        rawAssistantContent: rawOutput,
        modelId: body.modelId || 'deepseek-chat',
        thinkingEnabled: Boolean(body.config?.thinking),
        ownerUserId: effectiveUserId,
        clientMessageId: body.clientMessageId,
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
}
