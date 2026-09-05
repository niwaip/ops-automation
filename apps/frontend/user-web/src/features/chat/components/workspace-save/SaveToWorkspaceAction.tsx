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

  // 提取原始结构化结果或原始数据
  const rawResult = useMemo(() => {
    return (
      message.metadata?.normalizedResult?.structuredData ??
      message.metadata?.finalResultData ??
      message.metadata?.finalResult
    );
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

  // 默认标签
  const defaultTags = useMemo(() => {
    const tags = ['AI沉淀', '知识候选'];
    if (message.metadata?.mode === 'task') {
      tags.push('任务结果');
    } else {
      tags.push('问答沉淀');
    }
    if (message.metadata?.skillUsed) {
      tags.push(message.metadata.skillUsed);
    }
    return tags;
  }, [message.metadata?.mode, message.metadata?.skillUsed]);

  // 默认归档目录（AI知识候选/YYYY-MM）
  const defaultFolderPath = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `AI知识候选/${ym}`;
  }, []);

  // 一键异步保存 Mutation，无需用户干预
  const saveMutation = useMutation(
    async () => {
      const summaryText = message.metadata?.finalSummary?.trim() || plainContent;
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
        rawResultData: rawResult,
      };
      return await workspaceApi.saveTextNote(dto);
    },
    {
      onSuccess: (savedNode) => {
        setSavedNodeId(savedNode.id);
        void queryClient.invalidateQueries('my-workspaces');
        void queryClient.invalidateQueries('workspace-nodes');

        void toast.success(
          <span>
            文档已保存至个人空间！AI 正在后台自动提炼与归档。
            <Button
              type="link"
              size="small"
              style={{ padding: 0, marginLeft: 8 }}
              onClick={() => navigate('/workspaces')}
            >
              前往文件空间查看
            </Button>
          </span>,
          5
        );
      },
      onError: (err: any) => {
        void toast.error(err.message || '保存至个人空间失败');
      },
    }
  );

  // 已保存状态
  if (savedNodeId) {
    return (
      <Tooltip title="已保存至个人空间（AI 后台提炼中，点击前往空间查看）">
        <Button
          type="text"
          size="small"
          icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          onClick={() => navigate('/workspaces')}
          className="chat-action-btn chat-action-btn-icon"
          aria-label="已保存至个人空间"
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
          disabled
        />
      </Tooltip>
    );
  }

  // 默认可点击状态：一键保存
  return (
    <Tooltip title="一键保存到个人空间（LLM 自动提炼归档）">
      <Button
        type="text"
        size="small"
        icon={<BookOutlined />}
        onClick={() => saveMutation.mutate()}
        className="chat-action-btn chat-action-btn-icon"
        aria-label="保存到个人空间"
      />
    </Tooltip>
  );
}
