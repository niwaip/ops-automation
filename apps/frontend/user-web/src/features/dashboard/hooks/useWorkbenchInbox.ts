import { useCallback, useMemo, useState } from "react";
import type { MessageInstance } from "antd/es/message/interface";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  workbenchInboxApi,
  type ConvertInboxToTodoPayload,
  type InboxItemStatus,
  type WorkbenchInboxItem,
} from "../../../api/workbenchInbox";

interface UseWorkbenchInboxOptions {
  message: MessageInstance;
  onTodoCreated?: () => void;
}

export function useWorkbenchInbox({ message, onTodoCreated }: UseWorkbenchInboxOptions) {
  const queryClient = useQueryClient();
  const [inboxDraft, setInboxDraft] = useState("");
  const [inboxFilter, setInboxFilter] = useState<"all" | "unprocessed" | "clarified" | "converted">("all");
  const [clarifyingIds, setClarifyingIds] = useState<Record<string, boolean>>({});

  const queryParams = useMemo(() => {
    if (inboxFilter === "all") return {};
    return { status: inboxFilter as InboxItemStatus };
  }, [inboxFilter]);

  // 获取收件箱列表
  const { data: inboxData, isLoading } = useQuery(
    ["workbench-inbox", queryParams],
    () => workbenchInboxApi.list(queryParams),
    {
      staleTime: 10000,
      refetchInterval: 30000,
    }
  );

  const inboxItems = useMemo(() => inboxData?.items ?? [], [inboxData]);

  // 获取收件箱概览
  const { data: allInboxData } = useQuery(
    ["workbench-inbox-summary"],
    () => workbenchInboxApi.list({ pageSize: 100 }),
    {
      staleTime: 15000,
    }
  );

  const inboxSummary = useMemo(() => {
    const items = allInboxData?.items ?? inboxItems;
    return {
      total: items.length,
      unprocessed: items.filter((i) => i.status === "unprocessed").length,
      clarified: items.filter((i) => i.status === "clarified").length,
      converted: items.filter((i) => i.status === "converted").length,
      archived: items.filter((i) => i.status === "archived").length,
    };
  }, [allInboxData, inboxItems]);

  // 快速摄入到收件箱
  const ingestMutation = useMutation(
    async (text: string) => {
      return await workbenchInboxApi.ingest({
        rawContent: text.trim(),
        sourceType: "manual",
      });
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(["workbench-inbox"]);
        void queryClient.invalidateQueries(["workbench-inbox-summary"]);
        void message.success("已收集至 GTD 收件箱");
        setInboxDraft("");
      },
      onError: (err: any) => {
        void message.error(`收集失败: ${err?.message || "未知错误"}`);
      },
    }
  );

  const handleQuickIngest = useCallback(() => {
    if (!inboxDraft.trim()) return;
    ingestMutation.mutate(inboxDraft);
  }, [ingestMutation, inboxDraft]);

  // AI 智能整理厘清
  const handleClarifyItem = useCallback(
    async (item: WorkbenchInboxItem) => {
      setClarifyingIds((prev) => ({ ...prev, [item.id]: true }));
      try {
        await workbenchInboxApi.clarify(item.id);
        void queryClient.invalidateQueries(["workbench-inbox"]);
        void queryClient.invalidateQueries(["workbench-inbox-summary"]);
        void message.success("AI 智能整理完成！已提取关键行动要素与推荐建议");
      } catch (err: any) {
        void message.error(`AI 整理失败: ${err?.message || "大模型调度异常"}`);
      } finally {
        setClarifyingIds((prev) => ({ ...prev, [item.id]: false }));
      }
    },
    [message, queryClient]
  );

  // 转为正式待办任务
  const convertMutation = useMutation(
    async ({ id, payload }: { id: string; payload?: ConvertInboxToTodoPayload }) => {
      return await workbenchInboxApi.convertToTodo(id, payload);
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(["workbench-inbox"]);
        void queryClient.invalidateQueries(["workbench-inbox-summary"]);
        void queryClient.invalidateQueries(["workbench-todos"]);
        void queryClient.invalidateQueries(["workbench-todos-summary"]);
        void message.success("已成功转为待办任务！");
        if (onTodoCreated) {
          onTodoCreated();
        }
      },
      onError: (err: any) => {
        void message.error(`转为待办失败: ${err?.message || "未知错误"}`);
      },
    }
  );

  const handleConvertToTodo = useCallback(
    (id: string, payload?: ConvertInboxToTodoPayload) => {
      convertMutation.mutate({ id, payload });
    },
    [convertMutation]
  );

  // 更新条目状态（归档）
  const updateStatusMutation = useMutation(
    async ({ id, status }: { id: string; status: InboxItemStatus }) => {
      return await workbenchInboxApi.updateStatus(id, status);
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(["workbench-inbox"]);
        void queryClient.invalidateQueries(["workbench-inbox-summary"]);
        void message.success("条目状态已更新");
      },
      onError: (err: any) => {
        void message.error(`更新失败: ${err?.message || "未知错误"}`);
      },
    }
  );

  const handleArchiveItem = useCallback(
    (id: string) => {
      updateStatusMutation.mutate({ id, status: "archived" });
    },
    [updateStatusMutation]
  );

  // 删除收件箱条目
  const deleteMutation = useMutation(
    async (id: string) => {
      return await workbenchInboxApi.delete(id);
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(["workbench-inbox"]);
        void queryClient.invalidateQueries(["workbench-inbox-summary"]);
        void message.success("已删除收件箱条目");
      },
      onError: (err: any) => {
        void message.error(`删除失败: ${err?.message || "未知错误"}`);
      },
    }
  );

  const handleDeleteItem = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation]
  );

  return {
    inboxDraft,
    setInboxDraft,
    inboxFilter,
    setInboxFilter,
    inboxItems,
    inboxSummary,
    isLoading: isLoading || ingestMutation.isLoading || convertMutation.isLoading,
    clarifyingIds,
    handleQuickIngest,
    handleClarifyItem,
    handleConvertToTodo,
    handleArchiveItem,
    handleDeleteItem,
  };
}
