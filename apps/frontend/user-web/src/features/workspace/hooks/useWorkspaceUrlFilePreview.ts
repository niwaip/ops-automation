import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { message as antdMessage } from 'antd';
import {
  workspaceApi,
  type FilePreviewResponse,
  type MyWorkspacesResponse,
  type WorkspaceNode,
} from '../../../api/workspace';

interface UseWorkspaceUrlFilePreviewOptions {
  workspacesData: MyWorkspacesResponse | undefined;
  activeTab: 'personal' | 'department' | 'company';
  setActiveTab: (tab: 'personal' | 'department' | 'company') => void;
  setPreviewNode: (node: WorkspaceNode | null) => void;
  setPreviewData: (data: FilePreviewResponse | null) => void;
  setIsPreviewOpen: (open: boolean) => void;
  setIsPreviewLoading: (loading: boolean) => void;
}

export function useWorkspaceUrlFilePreview({
  workspacesData,
  activeTab,
  setActiveTab,
  setPreviewNode,
  setPreviewData,
  setIsPreviewOpen,
  setIsPreviewLoading,
}: UseWorkspaceUrlFilePreviewOptions) {
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const urlFileId = searchParams.get('fileId');
  const urlWorkspaceId = searchParams.get('workspaceId');

  const handledFileIdRef = useRef<string | null>(null);

  // Sync tab from URL if present
  useEffect(() => {
    if (urlTab === 'personal' || urlTab === 'department' || urlTab === 'company') {
      setActiveTab(urlTab);
    }
  }, [urlTab, setActiveTab]);

  // Deep-link: automatically preview file specified by ?fileId=...
  useEffect(() => {
    if (!urlFileId) return;
    if (handledFileIdRef.current === urlFileId) return;

    const targetWsId =
      urlWorkspaceId ||
      (activeTab === 'company'
        ? workspacesData?.company?.id
        : activeTab === 'department'
        ? workspacesData?.department?.id
        : workspacesData?.personal?.id);

    if (!targetWsId) return;

    handledFileIdRef.current = urlFileId;

    void (async () => {
      setIsPreviewOpen(true);
      setIsPreviewLoading(true);
      try {
        const res = await workspaceApi.previewFileContent(targetWsId, urlFileId);
        setPreviewData(res);
        setPreviewNode({
          id: urlFileId,
          workspaceId: targetWsId,
          name: res.fileName,
          type: 'file',
          mimeType: res.mimeType,
          parentId: null,
          fileSize: '0',
          createdBy: '',
          createdAt: '',
          updatedAt: '',
        });
      } catch (err: any) {
        void antdMessage.error(err?.message || '加载预览失败');
        setPreviewData(null);
        setIsPreviewOpen(false);
      } finally {
        setIsPreviewLoading(false);
      }
    })();
  }, [
    urlFileId,
    urlWorkspaceId,
    activeTab,
    workspacesData,
    setIsPreviewOpen,
    setIsPreviewLoading,
    setPreviewData,
    setPreviewNode,
  ]);
}
