import { useState, useMemo } from 'react';
import {
  BookOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { App, Button, Tooltip } from 'antd';
import { useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import type { ChatMessage } from '@ops/user-core';
import { workspaceApi, type SaveTextNoteDto } from '../../../../api/workspace';
import { parseMessageContent } from '../../lib/messageContent';
import { resolveMessageExecutionId } from '../../lib/taskStatus';

interface SaveToWorkspaceActionProps {
  message: ChatMessage;
  userQuery?: string;
}

export function SaveToWorkspaceAction({ message, userQuery }: SaveToWorkspaceActionProps) {
  const { message: toast } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [savedNodeId, setSavedNodeId] = useState<string | null>(null);

  const executionId = resolveMessageExecutionId(message);
  const parsedContent = parseMessageContent(message.content);
  const plainContent = (message.role === 'assistant' ? parsedContent.answer : message.content).trim();

  // 提取原始结构化结果或原始数据（严格过滤底层系统监控/运行耗时等纯 APM 遥测垃圾数据）
  const rawResult = useMemo(() => {
    const candidate =
      message.metadata?.normalizedResult?.structuredData ??
      message.metadata?.finalResultData ??
      message.metadata?.finalResult;

    if (!candidate || typeof candidate !== 'object') return undefined;

    // 若对象仅包含 internal 遥测属性，则不当作业务佐证数据
    const keys = Object.keys(candidate);
    const isPureTelemetry = keys.every((k) =>
      ['mode', 'usage', 'sandbox', 'answerStatus', 'traceId', 'metrics'].includes(k)
    );
    return isPureTelemetry ? undefined : candidate;
  }, [message.metadata]);

  // 智能提取基础标题
  const defaultTitle = useMemo(() => {
    if (message.metadata?.resultTitle?.trim()) {
      return message.metadata.resultTitle.trim();
    }
    if (userQuery?.trim()) {
      const q = userQuery.trim().replace(/[？?。！!]$/, '');
      return q.length > 25 ? `${q.slice(0, 25)}...的总结` : `${q} 总结`;
    }
    if (message.metadata?.finalSummary?.trim()) {
      const firstLine = message.metadata.finalSummary.trim().split('\n')[0].replace(/^[#\-*>\s]+/, '');
      return firstLine.length > 30 ? `${firstLine.slice(0, 30)}...` : firstLine;
    }
    const date = new Date().toISOString().slice(0, 10);
    return `AI对话知识沉淀_${date}`;
  }, [message.metadata?.resultTitle, message.metadata?.finalSummary, userQuery]);

  // 智能内容感知初始标签提取（坚决剔除“AI沉淀/知识候选/问答沉淀”等无意义纯占位词，即时提取真实专有名词与技术类型）
  const defaultTags = useMemo(() => {
    const tagsSet = new Set<string>();
    const textToAnalyze = `${userQuery || ''} ${defaultTitle || ''} ${plainContent.slice(0, 400)}`;

    // 1. 提取英文专有名词与技术实体 (如 DeepSeek, Harness, DSH, Docker, API, Python, Node, Web)
    const engEntities = textToAnalyze.match(/\b[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*\b/g) || [];
    for (const ent of engEntities) {
      if (
        ent.length >= 2 &&
        !/^(the|and|for|with|this|that|from|into|view|show|get|post|have|will|can|not)$/i.test(ent)
      ) {
        if (/^[A-Z]/.test(ent) || ent.length >= 4) {
          tagsSet.add(ent);
        }
      }
      if (tagsSet.size >= 3) break;
    }

    // 2. 提取中文核心业务关键词与动作分类
    const KEYWORD_PATTERNS = [
      { pattern: /(?:安装|部署|配置|环境|初始化)/, tag: '安装配置' },
      { pattern: /(?:调研|方案|剖析|选型|对比)/, tag: '技术调研' },
      { pattern: /(?:排错|报错|故障|修复|诊断)/, tag: '运维排错' },
      { pattern: /(?:接口|API|SDK|联调|协议)/, tag: '接口集成' },
      { pattern: /(?:性能|时延|压测|优化|基准)/, tag: '性能优化' },
      { pattern: /(?:数据|报表|指标|统计|分析)/, tag: '数据分析' },
      { pattern: /(?:规范|指南|文档|手册|教程)/, tag: '使用指南' },
    ];
    for (const kp of KEYWORD_PATTERNS) {
      if (kp.pattern.test(textToAnalyze)) {
        tagsSet.add(kp.tag);
      }
      if (tagsSet.size >= 4) break;
    }

    // 3. 关联使用的特定技能
    if (message.metadata?.skillUsed) {
      tagsSet.add(message.metadata.skillUsed);
    }

    if (tagsSet.size === 0) {
      tagsSet.add(message.metadata?.mode === 'task' ? '任务交付' : '技术笔记');
    }

    return Array.from(tagsSet).slice(0, 5);
  }, [userQuery, defaultTitle, plainContent, message.metadata?.mode, message.metadata?.skillUsed]);

  // 默认归档目录（工作模式保存到任务成果，个人模式保存到沙盒保存内容）
  const isTaskMode = message.metadata?.mode === 'task' || Boolean(executionId);
  const defaultFolderPath = useMemo(() => {
    return isTaskMode ? '工作任务成果 (tasks)' : '沙盒保存内容 (saved)';
  }, [isTaskMode]);

  // 一键异步保存 Mutation，无需用户干预
  const saveMutation = useMutation(
    async () => {
      let summaryText = message.metadata?.finalSummary?.trim() || plainContent;
      if (plainContent.includes('![') && !summaryText.includes('![')) {
        const imgMatches = plainContent.match(/!\[.*?\]\(.*?\)/g);
        if (imgMatches && imgMatches.length > 0) {
          summaryText = `${summaryText}\n\n${imgMatches.join('\n\n')}`;
        }
      }
      if (plainContent.includes('```html') && !summaryText.includes('```html')) {
        const htmlMatch = plainContent.match(/```html[\s\S]*?```/);
        if (htmlMatch) {
          summaryText = `${summaryText}\n\n${htmlMatch[0]}`;
        }
      }
      const dto: SaveTextNoteDto = {
        title: defaultTitle,
        content: summaryText,
        tags: defaultTags,
        folderPath: defaultFolderPath,
        type: message.metadata?.mode === 'task' ? 'task_result' : 'qa_note',
        userQuery: userQuery?.trim(),
        sessionId: message.sessionId,
        messageId: message.id,
        executionId: executionId || undefined,
        skillUsed: message.metadata?.skillUsed,
        aiModel: (message.metadata as any)?.aiModel || (message.metadata as any)?.modelId,
        rawResultData: rawResult || (plainContent !== summaryText ? { fullContent: plainContent } : undefined),
      };
      return await workspaceApi.saveTextNote(dto);
    },
    {
      onSuccess: (savedNode) => {
        setSavedNodeId(savedNode.id);
        void queryClient.invalidateQueries('my-workspaces');
        void queryClient.invalidateQueries('workspace-nodes');

        const targetDesc = isTaskMode
          ? '工作任务成果已创建专属文件夹并归档！'
          : '已在个人空间「沙盒保存内容」下创建专属文件夹！';

        void toast.success(
          <span>
            {targetDesc} AI 正在后台自动提炼总结并归集所有生成资产。
            <Button
              type="link"
              size="small"
              style={{ padding: 0, marginLeft: 8 }}
              onClick={() => navigate('/workspaces')}
            >
              前往资料空间查看
            </Button>
          </span>,
          5
        );
      },
      onError: (err: any) => {
        void toast.error(err.message || '保存至资料空间失败');
      },
    }
  );

  // 已保存状态
  if (savedNodeId) {
    return (
      <Tooltip title="已归档为专属文件夹（AI 后台智能提炼与资产归集中，点击前往资料空间查看）">
        <Button
          type="text"
          size="small"
          icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          onClick={() => navigate('/workspaces')}
          className="chat-action-btn chat-action-btn-icon"
          aria-label="已保存至资料空间"
        />
      </Tooltip>
    );
  }

  // 保存中状态
  if (saveMutation.isLoading) {
    return (
      <Tooltip title="正在保存并启动 AI 后台提炼...">
        <Button
          type="text"
          size="small"
          icon={<LoadingOutlined spin />}
          className="chat-action-btn chat-action-btn-icon"
          aria-label="正在保存至资料空间"
          disabled
        />
      </Tooltip>
    );
  }

  // 默认可点击状态：一键保存
  return (
    <Tooltip title="一键保存到资料空间（AI 自动提炼归档）">
      <Button
        type="text"
        size="small"
        icon={<BookOutlined />}
        disabled={saveMutation.isLoading || Boolean(savedNodeId)}
        onClick={() => {
          if (!saveMutation.isLoading && !savedNodeId) {
            saveMutation.mutate();
          }
        }}
        className="chat-action-btn chat-action-btn-icon"
        aria-label="保存到资料空间"
      />
    </Tooltip>
  );
}
