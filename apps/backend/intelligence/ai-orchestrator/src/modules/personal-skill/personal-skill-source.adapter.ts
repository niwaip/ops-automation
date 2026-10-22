import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as path from 'path';
import { ChatConversationService } from '../chat/chat-conversation.service';
import { SessionService } from '../redis/session.service';
import type {
  PersonalSkillSourceRef,
  SkillSource,
  SkillSourceCorrection,
  SkillSourceFile,
  SkillSourceInput,
  SkillSourceOutput,
  SkillSourceStep,
} from './personal-skill.types';

@Injectable()
export class PersonalSkillSourceAdapter {
  private readonly logger = new Logger(PersonalSkillSourceAdapter.name);

  constructor(
    @Optional() private readonly chatConversationService?: ChatConversationService,
    @Optional() private readonly sessionService?: SessionService
  ) {}

  /**
   * 将用户的来源引用转换为统一的内部可复用契约 SkillSource
   */
  async extractSource(userId: string, sourceRef: PersonalSkillSourceRef): Promise<SkillSource> {
    const sessionId = sourceRef.sessionId || 'default';
    let history: any[] = [];
    let found = false;

    if (this.chatConversationService) {
      try {
        history = await this.chatConversationService.getChatHistory(sessionId, userId);
        if (history && history.length > 0) {
          found = true;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to fetch history from ChatConversationService: ${err.message}`);
      }
    }

    if (!found && this.sessionService) {
      const sessionData = await this.sessionService.getChatSession(sessionId);
      if (sessionData) {
        const owner = sessionData.session?.ownerUserId;
        if (!owner || owner !== userId) {
          throw new ForbiddenException(
            `Access denied to session [${sessionId}] not owned by user [${userId}]`
          );
        }
        if (sessionData.history && sessionData.history.length > 0) {
          history = sessionData.history;
          found = true;
        }
      }
    }

    if (!found || history.length === 0) {
      throw new NotFoundException(
        `No chat history found for user [${userId}] session [${sessionId}]`
      );
    }

    // 1. 定位目标消息对（用户提示与助手回复）
    let targetIndex = -1;
    if (sourceRef.messageId) {
      targetIndex = history.findIndex(
        (m: any) => m.id === sourceRef.messageId || m.messageId === sourceRef.messageId
      );
      // 如果历史消息具备 ID 体系但未找到明确指定的 messageId，则抛出异常，防止静默选错任务 (B07)
      const hasIndexedMessages = history.some((m: any) => m.id || m.messageId);
      if (hasIndexedMessages && targetIndex === -1) {
        throw new NotFoundException(
          `Specified message [${sourceRef.messageId}] not found in session [${sessionId}]`
        );
      }
    }

    if (targetIndex === -1) {
      // 倒序寻找最近的一个由助手回复且非报错的轮次
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i]?.role === 'assistant' && (history[i]?.content || '').trim()) {
          targetIndex = i;
          break;
        }
      }
    }

    if (targetIndex === -1) {
      throw new NotFoundException(`No valid assistant turns found in session [${sessionId}]`);
    }

    const assistantMsg = history[targetIndex];
    let userMsg = history[targetIndex - 1]?.role === 'user' ? history[targetIndex - 1] : undefined;

    // 如果指定的是 user 消息，则反转查找
    if (assistantMsg?.role === 'user') {
      userMsg = assistantMsg;
    }

    const userPrompt = (userMsg?.content || '').trim();
    const assistantContent = (assistantMsg?.content || '').trim();

    // 2. 提取会话中的负向约束与多轮纠偏历史 (Negative Constraints)
    const corrections: SkillSourceCorrection[] = [];
    const correctionKeywords = ['不对', '不要', '不包含', '纠正', '改一下', '重新', '排除', '注意', '换成'];
    for (let i = 0; i < targetIndex; i++) {
      const msg = history[i];
      if (msg?.role === 'user') {
        const text = (msg.content || '').trim();
        if (correctionKeywords.some((kw) => text.includes(kw))) {
          corrections.push({
            userCorrection: text,
            adjustment: '按用户纠偏指令应用规则约束',
          });
        }
      }
    }

    // 3. 从助手回复中提取 Python 脚本
    const scriptCode = this.extractPythonCode(assistantContent);

    // 4. 分析输入文件要求 (支持 files 顶层字段与 metadata.files 真实结构)
    const inputs: SkillSourceInput[] = [];
    const reusableFiles: SkillSourceFile[] = [];
    const rawFiles: any[] = [];

    for (const msg of history) {
      if (Array.isArray(msg?.metadata?.files)) {
        rawFiles.push(...msg.metadata.files);
      }
      if (Array.isArray(msg?.files)) {
        rawFiles.push(...msg.files);
      }
    }

    const seenFileNames = new Set<string>();
    for (const f of rawFiles) {
      const fn = typeof f === 'string' ? path.basename(f) : f?.fileName || f?.name;
      if (!fn || seenFileNames.has(fn.toLowerCase())) continue;
      seenFileNames.add(fn.toLowerCase());

      const ext = path.extname(fn).toLowerCase();
      inputs.push({
        name: fn,
        type: ext ? ext.replace('.', '') : 'file',
        description: `来源附件 [${fn}] 对应的同构输入`,
        required: true,
      });
      reusableFiles.push({
        name: fn,
        path: typeof f === 'object' ? f?.filePath || f?.path : undefined,
        role: fn.includes('模板') || fn.includes('template') ? 'template' : 'data',
      });
    }

    // 5. 分析输出约定
    const outputContract: SkillSourceOutput[] = [];
    const detectedExts = this.detectOutputFormats(assistantContent);
    for (const ext of detectedExts) {
      outputContract.push({
        filenamePattern: `*${ext}`,
        type: ext.replace('.', ''),
        description: `自动生成的交付文件 (${ext})`,
      });
    }

    // 6. 提炼目标与确认指令
    const objective = this.extractObjective(userPrompt, assistantContent);
    const confirmedInstructions = this.extractConfirmedInstructions(userPrompt);

    const reusableSteps: SkillSourceStep[] = [];
    if (scriptCode) {
      reusableSteps.push({
        description: '执行参数化处理脚本完成数据计算或文档生成',
        tool: 'python',
        code: scriptCode,
      });
    } else {
      reusableSteps.push({
        description: '依据业务规则提示词在沙箱中自主理解并执行处理',
      });
    }

    return {
      source: sourceRef,
      objective,
      confirmedInstructions,
      corrections,
      inputs,
      reusableSteps,
      reusableFiles,
      outputContract,
      scriptCode,
    };
  }

  private extractPythonCode(content: string): string | undefined {
    const codeBlockRegex = /```(?:python|py)\s*([\s\S]*?)```/gi;
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const code = (match[1] || '').trim();
      if (code && (code.includes('pandas') || code.includes('openpyxl') || code.includes('import ') || code.includes('def '))) {
        matches.push(code);
      }
    }
    // 返回最长或最后一个完整的 Python 脚本
    return matches.length > 0 ? matches[matches.length - 1] : undefined;
  }

  private detectOutputFormats(content: string): string[] {
    const exts = new Set<string>();
    const patterns = [
      { regex: /\.xlsx\b/i, ext: '.xlsx' },
      { regex: /\.pdf\b/i, ext: '.pdf' },
      { regex: /\.docx\b/i, ext: '.docx' },
      { regex: /\.pptx\b/i, ext: '.pptx' },
      { regex: /\.csv\b/i, ext: '.csv' },
      { regex: /\.md\b/i, ext: '.md' },
      { regex: /\.html\b/i, ext: '.html' },
    ];
    for (const p of patterns) {
      if (p.regex.test(content)) {
        exts.add(p.ext);
      }
    }
    return Array.from(exts);
  }

  private extractObjective(userPrompt: string, assistantContent: string): string {
    if (userPrompt) {
      const clean = userPrompt.replace(/^([请帮我把]|将|对)+/, '').slice(0, 80);
      return clean.trim();
    }
    return '通用沙箱自动化处理与统计';
  }

  private extractConfirmedInstructions(userPrompt: string): string[] {
    if (!userPrompt) return ['按已确认的业务逻辑进行数据处理与计算'];
    const parts = userPrompt
      .split(/[，。；;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 3 && !s.startsWith('结果正确') && !s.startsWith('保存为'));
    return parts.length > 0 ? parts : [userPrompt];
  }

  private buildFallbackSource(sourceRef: PersonalSkillSourceRef): SkillSource {
    return {
      source: sourceRef,
      objective: '从已确认会话中提炼的个人技能',
      confirmedInstructions: ['按照之前确认的操作规范和计算规则处理输入文件'],
      corrections: [],
      inputs: [{ name: 'input_file', type: 'file', description: '待处理的业务附件', required: true }],
      reusableSteps: [{ description: '根据提示词规则与逻辑进行沙箱执行' }],
      reusableFiles: [],
      outputContract: [{ type: 'xlsx', description: '处理完成后的结果文件' }],
    };
  }
}
