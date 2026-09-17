import {
  CheckCircleFilled,
  DownloadOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  InfoCircleOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Button, Space, Tag, Upload, message } from 'antd';
import { useState } from 'react';
import {
  workbenchCoordinationApi,
  type CoordinationAttachment,
} from '../../../api/workbenchCoordination';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';

interface CoordinationFileReplacerProps {
  originalAttachments: CoordinationAttachment[];
  replacementFile: CoordinationAttachment | null;
  onReplacementChange: (file: CoordinationAttachment | null) => void;
  disabled?: boolean;
}

export function CoordinationFileReplacer({
  originalAttachments,
  replacementFile,
  onReplacementChange,
  disabled = false,
}: CoordinationFileReplacerProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleCustomUpload = async (file: File) => {
    try {
      setIsUploading(true);
      const uploaded = await workbenchCoordinationApi.uploadAttachment(file);
      onReplacementChange(uploaded);
      message.success(`已成功上传修订版文件「${file.name}」，已替换原生成文档！`);
    } catch (err: any) {
      message.error(err.message || '上传替换文件失败，请重试');
    } finally {
      setIsUploading(false);
    }
  };

  // 严格过滤掉无名称也无下载地址的幽灵空附件
  const validAttachments = (originalAttachments || []).filter(
    (att) => Boolean(att && (att.url?.trim() || att.name?.trim()))
  );

  return (
    <div style={{ marginBottom: 16 }}>
      {/* 标题栏 */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Space size={6}>
          <FileWordOutlined style={{ color: '#1677ff' }} />
          <span>协同流转成果文档</span>
        </Space>
        {validAttachments.length > 0 && !replacementFile ? (
          <Tag color="blue" bordered={false} style={{ fontSize: 11, margin: 0 }}>
            {validAttachments.length} 个成果文件
          </Tag>
        ) : null}
      </div>

      {/* 1. 原生成文档列表 */}
      {validAttachments.length > 0 ? (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {validAttachments.map((att, idx) => {
            const resolvedUrl = replaceLocalhostWithCurrentHost(att.url);
            const isWord = att.name?.endsWith('.docx') || att.name?.endsWith('.doc');
            const isPdf = att.name?.endsWith('.pdf');
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: replacementFile
                    ? 'var(--bg-secondary, rgba(148, 163, 184, 0.04))'
                    : 'rgba(22, 119, 255, 0.04)',
                  border: replacementFile
                    ? '1px dashed var(--border-color, rgba(148, 163, 184, 0.25))'
                    : '1px solid rgba(22, 119, 255, 0.18)',
                  borderRadius: 8,
                  opacity: replacementFile ? 0.65 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                <Space size={10} align="center" style={{ flex: 1, minWidth: 0 }}>
                  {isWord ? (
                    <FileWordOutlined style={{ color: '#1677ff', fontSize: 20 }} />
                  ) : isPdf ? (
                    <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
                  ) : (
                    <PaperClipOutlined style={{ color: '#1677ff', fontSize: 18 }} />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: replacementFile
                            ? 'var(--text-secondary)'
                            : 'var(--text-primary)',
                          textDecoration: replacementFile ? 'line-through' : 'none',
                          wordBreak: 'break-all',
                        }}
                      >
                        {att.name || '系统生成文档.docx'}
                      </span>
                      {replacementFile ? (
                        <Tag color="default" style={{ margin: 0, fontSize: 11 }}>
                          已由修订版替换
                        </Tag>
                      ) : (
                        <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
                          系统生成初稿
                        </Tag>
                      )}
                    </div>
                    {att.size ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-tertiary)',
                          marginTop: 2,
                        }}
                      >
                        {(att.size / 1024).toFixed(1)} KB
                      </div>
                    ) : null}
                  </div>
                </Space>
                <Space size={8}>
                  {resolvedUrl ? (
                    <Button
                      type="default"
                      size="small"
                      icon={<DownloadOutlined />}
                      href={resolvedUrl}
                      target="_blank"
                      download={att.name}
                      style={{
                        borderRadius: 6,
                        height: 28,
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      下载查验
                    </Button>
                  ) : (
                    <Tag color="default">无下载链接</Tag>
                  )}
                  {!replacementFile && !disabled ? (
                    <Upload
                      showUploadList={false}
                      beforeUpload={(file) => {
                        handleCustomUpload(file);
                        return false;
                      }}
                      accept=".docx,.doc,.pdf"
                      disabled={disabled || isUploading}
                    >
                      <Button
                        type="primary"
                        ghost
                        size="small"
                        icon={<UploadOutlined />}
                        loading={isUploading}
                        style={{
                          borderRadius: 6,
                          height: 28,
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        替换此文档
                      </Button>
                    </Upload>
                  ) : null}
                </Space>
              </div>
            );
          })}
        </Space>
      ) : !replacementFile ? (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 8,
            border: '1px dashed var(--border-color, #d9d9d9)',
            background: 'var(--bg-secondary, rgba(148, 163, 184, 0.04))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            当前暂未关联生成文档，您可上传交付成果文件：
          </span>
          <Upload
            showUploadList={false}
            beforeUpload={(file) => {
              handleCustomUpload(file);
              return false;
            }}
            accept=".docx,.doc,.pdf"
            disabled={disabled || isUploading}
          >
            <Button
              size="small"
              type="primary"
              ghost
              icon={<UploadOutlined />}
              loading={isUploading}
              style={{ borderRadius: 6, height: 28, fontSize: 12 }}
            >
              上传交付文档
            </Button>
          </Upload>
        </div>
      ) : null}

      {/* 2. 替换文件展示 */}
      {replacementFile ? (
        <div
          style={{
            marginTop: 10,
            padding: '12px 14px',
            borderRadius: 8,
            background: 'rgba(16, 185, 129, 0.05)',
            border: '1px solid rgba(16, 185, 129, 0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Space size={10} align="center" style={{ flex: 1, minWidth: 0 }}>
            <CheckCircleFilled style={{ color: '#10b981', fontSize: 20 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    wordBreak: 'break-all',
                  }}
                >
                  {replacementFile.name}
                </span>
                <Tag color="success" style={{ margin: 0, fontSize: 11 }}>
                  最新修订版（将提交流转）
                </Tag>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  marginTop: 2,
                }}
              >
                {replacementFile.size
                  ? `${(replacementFile.size / 1024).toFixed(1)} KB · `
                  : ''}
                已替换原生成初稿，流转至下一节点将以此版本为准
              </div>
            </div>
          </Space>
          <Space size={8}>
            {replacementFile.url ? (
              <Button
                size="small"
                type="primary"
                ghost
                icon={<DownloadOutlined />}
                href={replaceLocalhostWithCurrentHost(replacementFile.url)}
                target="_blank"
                download={replacementFile.name}
                style={{ borderRadius: 6, height: 28, fontSize: 12 }}
              >
                下载核对
              </Button>
            ) : null}
            <Button
              size="small"
              type="link"
              danger
              icon={<ReloadOutlined />}
              onClick={() => onReplacementChange(null)}
              disabled={disabled}
              style={{ fontSize: 12 }}
            >
              撤销替换
            </Button>
          </Space>
        </div>
      ) : validAttachments.length > 0 ? (
        /* 3. 未上传替换文件时的温和提示 */
        <div
          style={{
            marginTop: 10,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(22, 119, 255, 0.04)',
            border: '1px solid rgba(22, 119, 255, 0.14)',
            fontSize: 12,
            color: 'var(--text-secondary, #475569)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            lineHeight: 1.5,
          }}
        >
          <InfoCircleOutlined style={{ color: '#1677ff', fontSize: 14, flexShrink: 0 }} />
          <span>
            <strong style={{ color: 'var(--text-primary, #1e293b)' }}>修改原稿建议</strong>：您可点击「下载查验」在本地编辑，调整完毕后点击「替换此文档」上传修改版，流转将自动同步最新成果。
          </span>
        </div>
      ) : null}
    </div>
  );
}
