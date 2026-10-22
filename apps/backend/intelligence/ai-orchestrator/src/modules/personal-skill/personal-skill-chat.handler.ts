import { StreamEventType } from '../react-engine/interfaces';
import type { ChatRequestDTO } from '../chat/chat.dto';
import type { ChatConversationService } from '../chat/chat-conversation.service';
import type { PersonalSkillCaptureService } from './personal-skill-capture.service';
import type { SkillCaptureStatusDto } from './personal-skill.dto';
import { parseSavePersonalSkillIntent } from './personal-skill-intent.util';

interface SaveSkillChatContext {
  body: ChatRequestDTO;
  userId: string;
  emit: (event: any) => void;
  conversation: ChatConversationService;
  capture?: PersonalSkillCaptureService;
  waitMs?: number;
}

/** A recognized save request stays in the capture flow, including pending and error outcomes. */
export async function handleSavePersonalSkillChat(ctx: SaveSkillChatContext): Promise<boolean> {
  const intent = parseSavePersonalSkillIntent(ctx.body.message);
  if (!intent.isMatch) return false;

  const displayName = intent.displayName || '我的个人技能';
  const sessionId = ctx.body.sessionId || 'default';
  let content: string;
  let status: SkillCaptureStatusDto | undefined;
  let failed = false;
  ctx.emit({ type: StreamEventType.THOUGHT, content: `正在提炼个人技能「${displayName}」...` });

  try {
    if (!ctx.capture) throw new Error('个人技能保存服务暂不可用，请稍后重试');
    const capture = await ctx.capture.createCapture(ctx.userId, {
      sourceRef: { kind: 'sandbox_turn', sessionId },
      displayName,
      modelId: ctx.body.modelId,
      idempotencyKey: ctx.body.clientMessageId
        ? `chat:${sessionId}:${ctx.body.clientMessageId}` : undefined,
    });
    const deadline = Date.now() + (ctx.waitMs ?? 45000);
    status = ctx.capture.getCaptureStatus(ctx.userId, capture.captureId);
    while (!['ready', 'failed', 'needs_input'].includes(status.status) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(100, Math.max(0, deadline - Date.now()))));
      status = ctx.capture.getCaptureStatus(ctx.userId, capture.captureId);
    }
    if (status.status === 'ready') {
      if (!status.skillId || !status.slug || !status.version) {
        throw new Error('技能安装回执不完整，无法确认保存成功');
      }
      content = `已保存个人技能「${displayName}」v${status.version}，仅你可见。\n\n` +
        (status.executionMode === 'verified_workflow' ? '关键核算规则与执行流程已保存，并通过来源附件的重放验证。\n\n' : '') +
        `• **技能目录**：\`/knowledge/skills/${status.slug}\`\n` +
        `• **复用方式**：下次上传新附件后，可以说“用${displayName}处理这份附件”。`;
    } else if (status.status === 'needs_input') {
      content = `保存个人技能「${displayName}」前需要确认：\n\n` +
        (status.questions || []).map((q, i) => `${i + 1}. ${q}`).join('\n') + '\n\n当前尚未安装技能。';
    } else if (status.status === 'failed') {
      failed = true;
      content = `保存个人技能「${displayName}」失败：${status.error || '请稍后重试'}`;
    } else {
      content = `个人技能「${displayName}」正在生成，尚未保存完成。完成后可在“我的技能”中查看。`;
    }
  } catch (err: any) {
    failed = true;
    content = `保存个人技能「${displayName}」失败：${err?.message || '请稍后重试'}`;
  }

  const data = { personalSkillCapture: status, statusUrl: status
    ? `/api/ai/personal-skills/captures/${encodeURIComponent(status.captureId)}` : undefined };
  ctx.emit({ type: failed ? StreamEventType.ERROR : StreamEventType.OBSERVATION, content, data });
  try {
    const session = await ctx.conversation.persistConversation({
      sessionId, userContent: ctx.body.message, assistantContent: content,
      rawAssistantContent: content, modelId: ctx.body.modelId || 'default',
      thinkingEnabled: false, ownerUserId: ctx.userId,
      clientMessageId: ctx.body.clientMessageId,
      clientAssistantMessageId: ctx.body.clientAssistantMessageId,
    });
    if (session) ctx.emit(ctx.conversation.buildSessionPatchEvent(sessionId, session));
  } catch {
    // Persistence failure must never execute a second, unrelated sandbox task.
    ctx.emit({ type: StreamEventType.ERROR,
      content: '技能处理状态未能同步到聊天记录，请在“我的技能”中核对保存结果。', data });
  }
  return true;
}
