import { apiClient } from "./index";
import { TodoPriority, TodoSourceType, WorkbenchTodoItem } from "./workbenchTodo";

export type InboxItemStatus =
  | "unprocessed"
  | "clarified"
  | "converted"
  | "archived"
  | "discarded";

export interface UnifiedInboxContent {
  title: string;
  rawContent: string;
  summary?: string;
  source: {
    type: TodoSourceType;
    refId?: string;
    title?: string;
    sender?: string;
    senderType?: "user" | "assistant" | "system" | "external";
    timestamp?: string;
  };
  extra?: Record<string, any>;
}

export interface InboxActionItemRecommendation {
  title: string;
  description?: string;
  priority?: TodoPriority;
  dueDate?: string;
  suggestedWorkflowId?: string;
  suggestedWorkflowName?: string;
}

export interface InboxAiClarification {
  isActionable: boolean;
  confidence: number;
  needsRefinement: boolean;
  refinementNotes?: string;
  actionItem?: InboxActionItemRecommendation;
  suggestedCategory?: "task" | "project" | "reference" | "someday" | "trash";
  rawModelOutput?: string;
}

export interface WorkbenchInboxItem {
  id: string;
  userId: string;
  title: string;
  rawContent: string;
  sourceType: TodoSourceType;
  sourceRefId?: string | null;
  sourceTitle?: string | null;
  sourceSender?: string | null;
  status: InboxItemStatus;
  confidence: number;
  aiClarification?: InboxAiClarification | null;
  convertedTodoId?: string | null;
  unifiedPayload?: UnifiedInboxContent | null;
  createdAt: string;
  updatedAt: string;
}

export interface IngestInboxItemPayload {
  title?: string;
  rawContent: string;
  sourceType?: TodoSourceType;
  sourceRefId?: string;
  sourceTitle?: string;
  sourceSender?: string;
  extra?: Record<string, any>;
}

export interface ConvertInboxToTodoPayload {
  title?: string;
  description?: string;
  priority?: TodoPriority;
  dueDate?: string;
  boundWorkflowId?: string;
  overrideContext?: Record<string, any>;
}

export interface QueryWorkbenchInboxParams {
  status?: InboxItemStatus;
  sourceType?: TodoSourceType;
  minConfidence?: number;
  maxConfidence?: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface WorkbenchInboxListResponse {
  items: WorkbenchInboxItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ConvertInboxResult {
  todo: WorkbenchTodoItem;
  inboxItem: WorkbenchInboxItem;
}

export const workbenchInboxApi = {
  ingest: async (payload: IngestInboxItemPayload): Promise<WorkbenchInboxItem> => {
    return await apiClient.post("/workbench-inbox", payload);
  },

  list: async (params?: QueryWorkbenchInboxParams): Promise<WorkbenchInboxListResponse> => {
    const query = new URLSearchParams();
    if (params) {
      if (params.status) query.append("status", params.status);
      if (params.sourceType) query.append("sourceType", params.sourceType);
      if (params.minConfidence !== undefined) query.append("minConfidence", String(params.minConfidence));
      if (params.maxConfidence !== undefined) query.append("maxConfidence", String(params.maxConfidence));
      if (params.keyword) query.append("keyword", params.keyword);
      if (params.page) query.append("page", String(params.page));
      if (params.pageSize) query.append("pageSize", String(params.pageSize));
    }
    const qStr = query.toString();
    return await apiClient.get(`/workbench-inbox${qStr ? `?${qStr}` : ""}`);
  },

  getById: async (id: string): Promise<WorkbenchInboxItem> => {
    return await apiClient.get(`/workbench-inbox/${id}`);
  },

  clarify: async (id: string): Promise<WorkbenchInboxItem> => {
    return await apiClient.post(`/workbench-inbox/${id}/clarify`);
  },

  convertToTodo: async (
    id: string,
    payload: ConvertInboxToTodoPayload = {}
  ): Promise<ConvertInboxResult> => {
    return await apiClient.post(`/workbench-inbox/${id}/convert`, payload);
  },

  updateStatus: async (
    id: string,
    status: InboxItemStatus
  ): Promise<WorkbenchInboxItem> => {
    return await apiClient.put(`/workbench-inbox/${id}/status`, { status });
  },

  delete: async (id: string): Promise<{ success: boolean; id: string }> => {
    return await apiClient.delete(`/workbench-inbox/${id}`);
  },
};
