import React from 'react';
import { CloseCircleFilled, FolderOutlined, PaperClipOutlined } from '@ant-design/icons';
import { Image, Tag, Tooltip } from 'antd';
import type { UploadedFileDescriptor } from '@ops/user-core';
import { isImageFile, resolveChatFilePreviewUrl } from '../lib/chatComposerMedia';
import styles from '../pages/ChatPage.module.css';

export interface UserChatUploadedFilesBarProps {
  uploadedFiles: UploadedFileDescriptor[];
  onRemoveFile: (fileId?: string, fileName?: string) => void;
}

export const UserChatUploadedFilesBar: React.FC<UserChatUploadedFilesBarProps> = ({
  uploadedFiles,
  onRemoveFile,
}) => {
  if (uploadedFiles.length === 0) return null;

  return (
    <div className={styles['user-chat-input-attachments-bar']}>
      {uploadedFiles.map((file, idx) => {
        const key = file.fileId || `${file.fileName}-${idx}`;
        const isImg = isImageFile(file.fileName, file.mimeType);
        const previewUrl = isImg ? resolveChatFilePreviewUrl(file) : undefined;

        if (isImg && previewUrl) {
          return (
            <Tooltip
              key={key}
              title={`${file.fileName}${file.size ? ` (${Math.round(file.size / 1024)} KB)` : ''} · 点击放大预览`}
            >
              <div className={styles['user-chat-input-image-thumb-card']}>
                <Image
                  src={previewUrl}
                  alt={file.fileName}
                  preview={{
                    mask: null,
                  }}
                />
                <span
                  className={styles['user-chat-input-thumb-remove']}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(file.fileId, file.fileName);
                  }}
                  title="移除图片"
                >
                  <CloseCircleFilled />
                </span>
              </div>
            </Tooltip>
          );
        }

        return (
          <Tag
            key={key}
            closable
            onClose={() => onRemoveFile(file.fileId, file.fileName)}
            icon={file.source === 'workspace' ? <FolderOutlined /> : <PaperClipOutlined />}
            className={styles['user-chat-input-file-tag']}
          >
            {file.source === 'workspace' && (
              <span style={{ color: 'var(--primary-color)', marginRight: 4, fontWeight: 600 }}>
                [{file.workspaceType === 'personal' ? '我的' : file.workspaceType === 'department' ? '部门' : '公共'}]
              </span>
            )}
            {file.fileName}
          </Tag>
        );
      })}
    </div>
  );
};
