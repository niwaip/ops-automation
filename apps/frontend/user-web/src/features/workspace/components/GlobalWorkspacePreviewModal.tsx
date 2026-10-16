import React, { useEffect, useState, useCallback } from 'react';
import { message as antdMessage } from 'antd';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import {
  workspaceApi,
  type FilePreviewResponse,
  type WorkspaceNode,
} from '../../../api/workspace';

export interface OpenWorkspacePreviewEventDetail {
  fileId: string;
  workspaceId?: string;
  fileName?: string;
}

export const OPEN_WORKSPACE_PREVIEW_EVENT = 'open-workspace-preview';

export function openWorkspaceDocumentPreview(detail: OpenWorkspacePreviewEventDetail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_PREVIEW_EVENT, { detail }));
  }
}

export const GlobalWorkspacePreviewModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [node, setNode] = useState<WorkspaceNode | null>(null);
  const [previewData, setPreviewData] = useState<FilePreviewResponse | null>(null);

  const handleOpen = useCallback(async (detail: OpenWorkspacePreviewEventDetail) => {
    const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    let targetFileId = (detail.fileId || '').trim();
    let wsId = detail.workspaceId?.trim();

    if (!UUID_REGEX.test(wsId || '')) {
      wsId = undefined;
    }

    // 若 fileId 缺失或为非有效 UUID（例如模型输出占位符），尝试通过文件名反向查找实际节点
    if (!UUID_REGEX.test(targetFileId)) {
      if (detail.fileName && detail.fileName !== '文档预览') {
        try {
          const candidates = await workspaceApi.searchFiles(detail.fileName);
          const matched = candidates.find((c) => c.name === detail.fileName) || candidates[0];
          if (matched && UUID_REGEX.test(matched.id)) {
            targetFileId = matched.id;
            if (!wsId && matched.workspaceId && UUID_REGEX.test(matched.workspaceId)) {
              wsId = matched.workspaceId;
            }
          }
        } catch {
          // ignore lookup error
        }
      }
    }

    if (!UUID_REGEX.test(targetFileId)) {
      void antdMessage.warning('未能识别有效的文件标识，无法加载文档预览');
      return;
    }

    setIsOpen(true);
    setIsLoading(true);
    setNode({
      id: targetFileId,
      workspaceId: wsId || '',
      name: detail.fileName || '文档预览',
      type: 'file',
      mimeType: null,
      parentId: null,
      fileSize: '0',
      createdBy: '',
      createdAt: '',
      updatedAt: '',
    });
    setPreviewData(null);

    try {
      if (!wsId) {
        const myWs = await workspaceApi.getMyWorkspaces();
        wsId = myWs.personal?.id || myWs.company?.id;
      }
      if (!wsId || !UUID_REGEX.test(wsId)) {
        throw new Error('未找到对应的工作空间');
      }

      const res = await workspaceApi.previewFileContent(wsId, targetFileId);
      setPreviewData(res);
      setNode({
        id: targetFileId,
        workspaceId: wsId,
        name: res.fileName || detail.fileName || '文档预览',
        type: 'file',
        mimeType: res.mimeType,
        parentId: null,
        fileSize: '0',
        createdBy: '',
        createdAt: '',
        updatedAt: '',
      });
    } catch (err: any) {
      void antdMessage.error(err?.message || '加载文档预览失败');
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<OpenWorkspacePreviewEventDetail>;
      if (customEvent.detail) {
        void handleOpen(customEvent.detail);
      }
    };

    window.addEventListener(OPEN_WORKSPACE_PREVIEW_EVENT, listener);
    return () => {
      window.removeEventListener(OPEN_WORKSPACE_PREVIEW_EVENT, listener);
    };
  }, [handleOpen]);

  const handleDownload = useCallback(async (targetNode: WorkspaceNode) => {
    if (!targetNode.workspaceId || !targetNode.id) return;
    try {
      void antdMessage.loading({ content: `正在准备下载 "${targetNode.name}"...`, key: 'global-dl' });
      await workspaceApi.downloadFile(targetNode.workspaceId, targetNode.id, targetNode.name);
      void antdMessage.success({ content: `已开始下载 "${targetNode.name}"`, key: 'global-dl' });
    } catch (err: unknown) {
      void antdMessage.error({
        content: err instanceof Error ? err.message : '下载失败',
        key: 'global-dl',
      });
    }
  }, []);

  return (
    <DocumentPreviewModal
      open={isOpen}
      loading={isLoading}
      node={node}
      previewData={previewData}
      onClose={() => setIsOpen(false)}
      onDownload={handleDownload}
    />
  );
};
