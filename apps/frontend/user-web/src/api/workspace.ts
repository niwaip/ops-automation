import { apiClient } from './index';
import { authStore } from '../adapters/auth/authStore';

export interface WorkspaceSummary {
  id: string;
  name: string;
  type: 'personal' | 'department' | 'company';
  ownerUserId?: string | null;
  departmentId?: string | null;
  quotaBytes: string;
  usedBytes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MyWorkspacesResponse {
  personal: WorkspaceSummary;
  company: WorkspaceSummary;
  department: WorkspaceSummary | null;
}

export interface WorkspaceFileDigest {
  summary: string;
  keyTopics: string[];
  headings: string[];
  charCount: number;
  wordCount: number;
  readingTimeMinutes: number;
  extractedAt: string;
  hasExtractedText: boolean;
}

export interface WorkspaceNode {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  type: 'file' | 'folder';
  fileSize: string;
  mimeType: string | null;
  storagePath?: string | null;
  digest?: WorkspaceFileDigest | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  workspaceType?: 'personal' | 'department' | 'company';
  workspaceName?: string;
}

export interface ContentMatchSnippet {
  line: number;
  snippet: string;
}

export interface ContentSearchResult extends WorkspaceNode {
  matches: ContentMatchSnippet[];
}

export interface FilePreviewResponse {
  content: string;
  mimeType: string;
  fileName: string;
  isText: boolean;
}

export interface SaveTextNoteDto {
  title: string;
  content: string;
  tags?: string[];
  type?: string;
  userQuery?: string;
  sessionId?: string;
  messageId?: string;
  executionId?: string;
  skillUsed?: string;
  aiModel?: string;
  rawResultData?: any;
  folderPath?: string;
  workspaceId?: string;
}

export const workspaceApi = {
  getMyWorkspaces: async (): Promise<MyWorkspacesResponse> => {
    return await apiClient.get('/workspaces/my');
  },

  saveTextNote: async (dto: SaveTextNoteDto): Promise<WorkspaceNode> => {
    return await apiClient.post('/workspaces/my/notes', dto);
  },

  getNodes: async (workspaceId: string, parentId?: string | null): Promise<WorkspaceNode[]> => {
    const params = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
    return await apiClient.get(`/workspaces/${workspaceId}/nodes${params}`);
  },

  createFolder: async (
    workspaceId: string,
    name: string,
    parentId?: string | null
  ): Promise<WorkspaceNode> => {
    return await apiClient.post(`/workspaces/${workspaceId}/folder`, {
      name,
      parentId: parentId || null,
    });
  },

  uploadFile: async (
    workspaceId: string,
    file: File,
    parentId?: string | null
  ): Promise<WorkspaceNode> => {
    const formData = new FormData();
    formData.append('file', file);
    if (parentId) {
      formData.append('parentId', parentId);
    }
    const token = (await apiClient.ensureFreshAccessToken()) || authStore.getState().accessToken;
    const response = await fetch(`/api/workspaces/${workspaceId}/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: '上传失败' }));
      throw new Error(err.message || `上传失败 (HTTP ${response.status})`);
    }

    return await response.json();
  },

  deleteNode: async (
    workspaceId: string,
    nodeId: string
  ): Promise<{ success: boolean; deletedCount: number }> => {
    return await apiClient.delete(`/workspaces/${workspaceId}/nodes/${nodeId}`);
  },

  downloadFile: async (workspaceId: string, nodeId: string, fileName: string): Promise<void> => {
    const token = (await apiClient.ensureFreshAccessToken()) || authStore.getState().accessToken;
    const res = await fetch(`/api/workspaces/${workspaceId}/nodes/${nodeId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      throw new Error(`下载失败: ${res.statusText}`);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  searchFiles: async (query?: string): Promise<WorkspaceNode[]> => {
    const params = query ? `?q=${encodeURIComponent(query)}` : '';
    return await apiClient.get(`/workspaces/search${params}`);
  },

  searchContent: async (query: string, workspaceId?: string): Promise<ContentSearchResult[]> => {
    let url = `/workspaces/search-content?q=${encodeURIComponent(query)}`;
    if (workspaceId) {
      url += `&workspaceId=${encodeURIComponent(workspaceId)}`;
    }
    return await apiClient.get(url);
  },

  previewFileContent: async (workspaceId: string, nodeId: string): Promise<FilePreviewResponse> => {
    return await apiClient.get(`/workspaces/${workspaceId}/nodes/${nodeId}/preview`);
  },

  regenerateDigest: async (
    workspaceId: string,
    nodeId: string
  ): Promise<{ success: boolean; digest: WorkspaceFileDigest }> => {
    return await apiClient.post(`/workspaces/${workspaceId}/nodes/${nodeId}/digest`);
  },

  getFileBlob: async (workspaceId: string, nodeId: string): Promise<Blob> => {
    const res = await apiClient.get(`/workspaces/${workspaceId}/nodes/${nodeId}/download`, {
      responseType: 'blob',
    });
    return res as unknown as Blob;
  },
};
