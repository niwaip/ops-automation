import React, { useMemo, useState } from 'react';
import { useAppStore } from '../../../app/store';
import { getOfficeUploadConfig, isValidOfficeUpload, readFileAsBase64 } from '../../../shared/utils/office-file-upload';

const UPLOAD_RENDER_LOOP_DEBUG_URL = 'http://127.0.0.1:7777/event';

const reportUploadRenderLoop = (
  hypothesisId: 'D' | 'E',
  location: string,
  msg: string,
  data: Record<string, unknown>,
) => {
  void fetch(UPLOAD_RENDER_LOOP_DEBUG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'upload-render-loop',
      runId: 'sample-upload',
      hypothesisId,
      location,
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
};

export interface SampleUploadState {
  uploaded: boolean;
  fileName?: string;
  fileSize?: number;
  fileBase64?: string;
  revision: number;
}

interface SampleDocumentUploadPanelProps {
  currentUploadState: SampleUploadState;
  uploadStatusLabel?: string;
  uploadStatusTone?: 'default' | 'success';
  uploadActionSlot?: React.ReactNode;
  onUploadStateChange?: (state: SampleUploadState) => void;
}

export const SampleDocumentUploadPanel: React.FC<SampleDocumentUploadPanelProps> = ({
  currentUploadState,
  uploadStatusLabel,
  uploadStatusTone = 'default',
  uploadActionSlot,
  onUploadStateChange,
}) => {
  const { officeType } = useAppStore();
  const [isUploading, setIsUploading] = useState(false);

  const uploadConfig = useMemo(
    () => getOfficeUploadConfig(officeType === 'excel' ? 'excel' : officeType === 'ppt' ? 'ppt' : 'word'),
    [officeType]
  );

  const uploadInputId = `${officeType}-sample-upload-input`;
  const displayedUploaded = Boolean(currentUploadState?.uploaded);
  const displayedFileName = String(currentUploadState?.fileName || '').trim();
  const displayedFileSize = currentUploadState?.fileSize;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    reportUploadRenderLoop('D', 'SampleDocumentUploadPanel:handleFileUpload:start', 'upload handler started', {
      fileName: file.name,
      fileSize: file.size,
    });

    setIsUploading(true);

    try {
      if (!isValidOfficeUpload(file, uploadConfig)) {
        onUploadStateChange?.({ uploaded: false, revision: Date.now() });
        return;
      }

      const base64 = await readFileAsBase64(file);
      onUploadStateChange?.({
        uploaded: true,
        fileName: file.name,
        fileSize: file.size,
        fileBase64: base64,
        revision: Date.now(),
      });

      reportUploadRenderLoop('D', 'SampleDocumentUploadPanel:handleFileUpload:success', 'upload handler completed', {
        fileName: file.name,
        fileSize: file.size,
        base64Length: base64.length,
      });
    } catch (error: any) {
      reportUploadRenderLoop('E', 'SampleDocumentUploadPanel:handleFileUpload:error', 'upload handler failed', {
        message: error?.message || 'unknown-error',
      });
      onUploadStateChange?.({ uploaded: false, revision: Date.now() });
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="config-section">
      <div className="template-upload-action-row upload-only">
        <label
          htmlFor={uploadInputId}
          className={`template-upload-trigger ${displayedUploaded ? 'is-uploaded' : ''} ${uploadStatusTone === 'success' ? 'is-success' : ''}`}
        >
          <span className="template-upload-trigger-top">
            <span className="template-upload-trigger-label">
              {isUploading
                ? '上传中...'
                : displayedUploaded
                  ? '重新上传参考示例文件'
                  : '上传参考示例文件'}
            </span>
            {uploadStatusLabel && (
              <span className={`template-upload-trigger-status ${uploadStatusTone === 'success' ? 'is-success' : ''}`}>
                {uploadStatusLabel}
              </span>
            )}
          </span>
          <span className="template-upload-trigger-hint">
            {displayedFileName || '选择与当前模板结构接近的 Word 历史文件'}
          </span>
          {displayedUploaded && typeof displayedFileSize === 'number' && (
            <span className="template-upload-trigger-meta">
              {(displayedFileSize / 1024).toFixed(1)} KB
            </span>
          )}
        </label>
        <input
          id={uploadInputId}
          className="template-upload-input-hidden"
          type="file"
          accept={uploadConfig.accept}
          onChange={handleFileUpload}
        />
        {uploadActionSlot && (
          <div className="template-upload-inline-slot">
            {uploadActionSlot}
          </div>
        )}
      </div>
    </div>
  );
};
