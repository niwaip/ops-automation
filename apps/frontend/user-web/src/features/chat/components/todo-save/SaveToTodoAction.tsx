import { useState } from "react";
import {
  CheckCircleOutlined,
  InboxOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { App, Button, Space, Tooltip } from "antd";
import { useMutation, useQueryClient } from "react-query";
import { useNavigate } from "react-router-dom";
import type { ChatMessage } from "@ops/user-core";
import { workbenchInboxApi } from "../../../../api/workbenchInbox";
import { parseMessageContent } from "../../lib/messageContent";

interface SaveToTodoActionProps {
  message: ChatMessage;
  userQuery?: string;
}

/**
 * GTD 收件箱一键快速收集组件 (Quick Capture to Inbox)
 * 严格保持仅图标设计，点击直接将对话内容归一化收集至收件箱，避免白屏与操作负担
 */
export function SaveToTodoAction({ message, userQuery }: SaveToTodoActionProps) {
  const { message: toast } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [savedInboxId, setSavedInboxId] = useState<string | null>(null);

  const parsedContent = parseMessageContent(message.content);
  const plainContent = (
    message.role === "assistant" ? parsedContent.answer : message.content
  ).trim();

  const ingestMutation = useMutation(
    async () => {
      const summaryText = message.metadata?.finalSummary?.trim() || plainContent;
      return await workbenchInboxApi.ingest({
        rawContent: summaryText,
        title: userQuery ? `关于「${userQuery.slice(0, 24)}」的需求` : undefined,
        sourceType: "chat",
        sourceRefId: message.id,
        sourceTitle: userQuery ? `对话: ${userQuery.slice(0, 20)}` : "智能协同",
        sourceSender: message.role === "assistant" ? "AI 助手" : "用户",
        extra: {
          sessionId: message.sessionId,
          messageRole: message.role,
          userQuery: userQuery?.trim(),
        },
      });
    },
    {
      onSuccess: (item) => {
        setSavedInboxId(item.id);
        void queryClient.invalidateQueries(["workbench-inbox"]);
        void queryClient.invalidateQueries(["workbench-inbox-summary"]);
        toast.success({
          content: (
            <Space>
              <span>已收集到 GTD 收件箱</span>
              <Button
                type="link"
                size="small"
                onClick={() => navigate("/dashboard")}
                style={{ padding: 0 }}
              >
                前往工作台
              </Button>
            </Space>
          ),
          duration: 3.5,
        });
      },
      onError: (err: any) => {
        toast.error(`收集到收件箱失败: ${err?.message || "网络请求异常"}`);
      },
    }
  );

  const handleClick = () => {
    if (savedInboxId) {
      navigate("/dashboard");
      return;
    }
    ingestMutation.mutate();
  };

  if (savedInboxId) {
    return (
      <Tooltip title="已收集到 GTD 收件箱，点击前往工作台">
        <Button
          type="text"
          size="small"
          icon={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
          onClick={handleClick}
          className="chat-action-btn chat-action-btn-icon"
          aria-label="已收集到 GTD 收件箱"
        />
      </Tooltip>
    );
  }

  if (ingestMutation.isLoading) {
    return (
      <Tooltip title="正在收集到 GTD 收件箱...">
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

  return (
    <Tooltip title="收集到 GTD 收件箱 (可后续 AI 智能整理/转待办)">
      <Button
        type="text"
        size="small"
        icon={<InboxOutlined style={{ fontSize: 14 }} />}
        onClick={handleClick}
        className="chat-action-btn chat-action-btn-icon"
        aria-label="收集到 GTD 收件箱"
      />
    </Tooltip>
  );
}
