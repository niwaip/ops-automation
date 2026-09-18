import {
  CheckCircleFilled,
  DownloadOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  HistoryOutlined,
  LoadingOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  SwapOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Button, Space, Tag, Upload, message } from 'antd';
import { useState } from 'react';
import {
  workbenchCoordinationApi,
  type CoordinationAttachment,
} from '../../../api/workbenchCoordination';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';
import {
  getContractComparisonPair,
  triggerContractComparisonInAi,
  type ContractComparisonPair,
} from '../lib/contractComparisonHelper';
import styles from '../pages/DashboardPage.module.css';

interface CoordinationFileReplacerProps {
  originalAttachments: CoordinationAttachment[];
  replacementFile?: CoordinationAttachment | null;
  onReplacementChange?: (file: CoordinationAttachment | null) => void;
  appendedFiles?: CoordinationAttachment[];
  onAppendedFilesChange?: (files: CoordinationAttachment[]) => void;
  onCompareVersions?: (pair: ContractComparisonPair) => void;
  taskId?: string;
  taskTitle?: string;
  parameters?: Record<string, any>;
  disabled?: boolean;
  isRevisionMode?: boolean;
  isFirstTimeMode?: boolean;
  allowAppend?: boolean;
  isApprovalMode?: boolean;
}

export function CoordinationFileReplacer({
  originalAttachments = [],
  replacementFile = null,
  onReplacementChange,
  appendedFiles,
  onAppendedFilesChange,
  onCompareVersions,
  taskId,
  taskTitle,
  parameters,
  disabled = false,
  isRevisionMode = false,
  isFirstTimeMode = false,
  allowAppend = true,
  isApprovalMode = false,
}: CoordinationFileReplacerProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDropzoneOpen, setIsDropzoneOpen] = useState(
    Boolean(isRevisionMode || (!isFirstTimeMode && !originalAttachments?.length))
  );

  // 严格过滤掉无名称也无下载地址的幽灵空附件
  const validOriginals = (originalAttachments || []).filter(
    (att) => Boolean(att && typeof att === 'object' && !Array.isArray(att) && (att.url?.trim() || att.name?.trim()))
  );

  // 兼顾 appendedFiles 与单文件 replacementFile 的兼容性
  const effectiveAppended: CoordinationAttachment[] =
    appendedFiles !== undefined
      ? appendedFiles
      : replacementFile
      ? [replacementFile]
      : [];

  const canAppend = allowAppend && !isApprovalMode && !disabled;

  // 当处于驳回重修模式或暂无文件时展开上传区；法务审查或审批节点（allowAppend=false / isApprovalMode=true）绝不展示上传框
  const shouldShowDropzone =
    canAppend && (isRevisionMode || isDropzoneOpen || validOriginals.length === 0 || effectiveAppended.length > 0);

  const handleCustomUpload = async (file: File) => {
    try {
      setIsUploading(true);
      const uploaded = await workbenchCoordinationApi.uploadAttachment(file);
      const nextAppended = [...effectiveAppended, uploaded];
      onAppendedFilesChange?.(nextAppended);
      onReplacementChange?.(uploaded);
      message.success(`已成功追加新版本「${file.name}」！`);
    } catch (err: any) {
      message.error(err.message || '上传追加版本文件失败，请重试');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAppended = (indexToRemove: number) => {
    const nextAppended = effectiveAppended.filter((_, idx) => idx !== indexToRemove);
    onAppendedFilesChange?.(nextAppended);
    onReplacementChange?.(nextAppended[nextAppended.length - 1] || null);
    message.info('已移除追加版本');
  };

  const totalVersionCount = validOriginals.length + effectiveAppended.length;

  const comparisonPair = getContractComparisonPair(validOriginals, effectiveAppended, parameters);

  const handleCompareClick = () => {
    if (!comparisonPair) return;
    if (onCompareVersions) {
      onCompareVersions(comparisonPair);
    } else {
      triggerContractComparisonInAi({
        taskId,
        taskTitle,
        baseDoc: comparisonPair.baseDoc,
        latestDoc: comparisonPair.latestDoc,
        parameters,
      });
    }
  };

  return (
    <div style={{ marginBottom: 14 }}>
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
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Space size={6} align="center">
          <HistoryOutlined style={{ color: 'var(--primary-color, #1677ff)' }} />
          <span>📁 协同成果文档与版本履历</span>
          {effectiveAppended.length > 0 ? (
            <Tag color="success" bordered={false} style={{ fontSize: 11, margin: 0, fontWeight: 500 }}>
              已追加最新版本 (共 {totalVersionCount} 个版本)
            </Tag>
          ) : isRevisionMode ? (
            <Tag color="error" bordered={false} style={{ fontSize: 11, margin: 0, fontWeight: 500 }}>
              需上传修订版本
            </Tag>
          ) : isApprovalMode ? (
            <Tag color="blue" bordered={false} style={{ fontSize: 11, margin: 0 }}>
              {validOriginals.length} 个版本材料{validOriginals.length > 1 ? '（含历史版本留存）' : ''}
            </Tag>
          ) : (
            <Tag color="blue" bordered={false} style={{ fontSize: 11, margin: 0 }}>
              {validOriginals.length} 个版本材料
            </Tag>
          )}
        </Space>

        <Space size={8} align="center">
          {comparisonPair ? (
            <Button
              size="small"
              icon={<SwapOutlined style={{ color: '#722ed1' }} />}
              onClick={handleCompareClick}
              style={{
                fontSize: 12,
                color: '#722ed1',
                borderColor: '#722ed1',
                borderRadius: 6,
                fontWeight: 500,
                backgroundColor: 'rgba(114, 46, 209, 0.04)',
              }}
              title="将新旧版本合同载入 AI 窗口进行智能比对与红线审查"
            >
              比较合同 (AI红线审查)
            </Button>
          ) : null}

          {canAppend && validOriginals.length > 0 && !isRevisionMode && !shouldShowDropzone && (
            <Button
              type="link"
              size="small"
              icon={<UploadOutlined />}
              onClick={() => setIsDropzoneOpen(true)}
              style={{ fontSize: 12, padding: 0 }}
            >
              + 本地修订后追加新版本
            </Button>
          )}
        </Space>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* 1. 历史与初始原稿履历列表（按真实版本序列倒序展示：Index 0 为最新版本，后续为历史归档原稿） */}
        {validOriginals.map((att, idx) => {
          const resolvedUrl = replaceLocalhostWithCurrentHost(att.url);
          const isWord = att.name?.endsWith('.docx') || att.name?.endsWith('.doc');
          const isPdf = att.name?.endsWith('.pdf');

          // validOriginals[0] 为最新版本（V_N），后续索引为早先历史版本（V_N-1, V_N-2...）
          const totalOriginals = validOriginals.length;
          const currentVersionNumber = totalOriginals - idx;
          const isSupersededByAppended = effectiveAppended.length > 0;
          const isHistorical = isSupersededByAppended || idx > 0;

          const versionLabel =
            currentVersionNumber === 1
              ? 'V1 · 初始初稿'
              : `V${currentVersionNumber} · 经办人修订版`;

          return (
            <div
              key={`orig_${idx}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                background: isHistorical
                  ? 'var(--bg-secondary, rgba(148, 163, 184, 0.04))'
                  : isRevisionMode
                  ? 'rgba(255, 77, 79, 0.03)'
                  : 'rgba(22, 119, 255, 0.03)',
                border: isHistorical
                  ? '1px solid var(--border-color, rgba(148, 163, 184, 0.18))'
                  : isRevisionMode
                  ? '1px solid rgba(255, 77, 79, 0.3)'
                  : '1px solid rgba(22, 119, 255, 0.25)',
                borderRadius: 7,
                transition: 'all 0.2s ease',
              }}
            >
              <Space size={10} align="center" style={{ flex: 1, minWidth: 0 }}>
                {isWord ? (
                  <FileWordOutlined
                    style={{
                      color: isHistorical ? '#8c8c8c' : isRevisionMode ? '#ff4d4f' : '#1677ff',
                      fontSize: 20,
                    }}
                  />
                ) : isPdf ? (
                  <FilePdfOutlined style={{ color: isHistorical ? '#8c8c8c' : '#ff4d4f', fontSize: 20 }} />
                ) : (
                  <PaperClipOutlined style={{ color: isHistorical ? '#8c8c8c' : '#1677ff', fontSize: 18 }} />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: isHistorical ? 500 : 600,
                        fontSize: 13,
                        color: isHistorical ? 'var(--text-secondary)' : 'var(--text-primary)',
                        wordBreak: 'break-all',
                      }}
                    >
                      {att.name || '系统生成文档.docx'}
                    </span>
                    <Tag
                      color={isHistorical ? 'default' : isRevisionMode ? 'error' : 'blue'}
                      bordered={false}
                      style={{ margin: 0, fontSize: 11, fontWeight: 500 }}
                    >
                      {versionLabel}
                    </Tag>
                    {isHistorical ? (
                      <Tag color="default" bordered={false} style={{ margin: 0, fontSize: 11 }}>
                        历史留存原稿
                      </Tag>
                    ) : isRevisionMode ? (
                      <Tag color="error" bordered={false} style={{ margin: 0, fontSize: 11, fontWeight: 500 }}>
                        原版本已被驳回退回
                      </Tag>
                    ) : isApprovalMode ? (
                      <Tag color="processing" bordered={false} style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>
                        当前送审最新版本
                      </Tag>
                    ) : (
                      <Tag color="processing" bordered={false} style={{ margin: 0, fontSize: 11 }}>
                        当前生效版本
                      </Tag>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color:
                        isRevisionMode && !isHistorical
                          ? '#cf1322'
                          : isHistorical
                          ? 'var(--text-tertiary)'
                          : 'var(--text-secondary)',
                      marginTop: 2,
                    }}
                  >
                    {att.size ? `${(att.size / 1024).toFixed(1)} KB · ` : ''}
                    {isHistorical
                      ? `历史留存版本 (V${currentVersionNumber}) · 供法务与协同成员查验对比留痕，不作为当前送审版本`
                      : isRevisionMode
                      ? `审核人员已提出修改要求 · 请下载查验并在下方上传修订后的最新版本（将追加为 V${totalOriginals + effectiveAppended.length + 1}）`
                      : isApprovalMode
                      ? `经办人最新送审生效文档 · 法务合规审查以此版本为准`
                      : '系统当前生效文档 · 支持下载查验或本地修订'}
                  </div>
                </div>
              </Space>

              <Space size={8}>
                {resolvedUrl ? (
                  <Button
                    type={isHistorical ? 'default' : 'primary'}
                    ghost={!isHistorical}
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
                    {isHistorical ? '下载历史原稿' : '下载查验'}
                  </Button>
                ) : (
                  <Tag color="default">无下载链接</Tag>
                )}
              </Space>
            </div>
          );
        })}

        {/* 2. 追加的最新修订版本列表（履历呈现） */}
        {effectiveAppended.map((appFile, idx) => {
          const resolvedUrl = replaceLocalhostWithCurrentHost(appFile.url);
          const isWord = appFile.name?.endsWith('.docx') || appFile.name?.endsWith('.doc');
          const isPdf = appFile.name?.endsWith('.pdf');
          const isLatest = idx === effectiveAppended.length - 1;
          const versionNumber = validOriginals.length + idx + 1;

          return (
            <div
              key={`app_${idx}`}
              style={{
                padding: '9px 12px',
                borderRadius: 7,
                background: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <Space size={10} align="center" style={{ flex: 1, minWidth: 0 }}>
                {isWord ? (
                  <FileWordOutlined style={{ color: '#10b981', fontSize: 20 }} />
                ) : isPdf ? (
                  <FilePdfOutlined style={{ color: '#10b981', fontSize: 20 }} />
                ) : (
                  <CheckCircleFilled style={{ color: '#10b981', fontSize: 20 }} />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
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
                      {appFile.name}
                    </span>
                    <Tag color="success" bordered={false} style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>
                      V{versionNumber} · 追加修订版
                    </Tag>
                    {isLatest ? (
                      <Tag color="gold" bordered={false} style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>
                        最新版本 · 提交流转
                      </Tag>
                    ) : null}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      marginTop: 2,
                    }}
                  >
                    {appFile.size ? `${(appFile.size / 1024).toFixed(1)} KB · ` : ''}
                    经办人上传追加 · 提交流转时以此最新版本为准
                  </div>
                </div>
              </Space>

              <Space size={8}>
                {resolvedUrl ? (
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<DownloadOutlined />}
                    href={resolvedUrl}
                    target="_blank"
                    download={appFile.name}
                    style={{ borderRadius: 6, height: 28, fontSize: 12 }}
                  >
                    下载核对
                  </Button>
                ) : null}
                {!disabled ? (
                  <Button
                    size="small"
                    type="link"
                    danger
                    icon={<ReloadOutlined />}
                    onClick={() => handleRemoveAppended(idx)}
                    style={{ fontSize: 12, padding: 0 }}
                  >
                    移除
                  </Button>
                ) : null}
              </Space>
            </div>
          );
        })}

        {/* 3. 修订版文件上传控件（紧凑型，带说明） */}
        {!disabled && shouldShowDropzone ? (
          <div className={styles['compact-file-dragger']}>
            <Upload.Dragger
              showUploadList={false}
              beforeUpload={(file) => {
                handleCustomUpload(file);
                return false;
              }}
              accept=".docx,.doc,.pdf"
              disabled={disabled || isUploading}
              style={{
                background: isRevisionMode ? 'rgba(255, 77, 79, 0.03)' : 'var(--bg-secondary, rgba(148, 163, 184, 0.03))',
                border: isRevisionMode ? '1px dashed #ff4d4f' : '1px dashed var(--border-color, rgba(148, 163, 184, 0.35))',
                borderRadius: 6,
                cursor: isUploading ? 'not-allowed' : 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '2px 0' }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: isRevisionMode ? 'rgba(255, 77, 79, 0.1)' : 'rgba(22, 119, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isUploading ? (
                    <LoadingOutlined style={{ fontSize: 14, color: isRevisionMode ? '#ff4d4f' : '#1677ff' }} />
                  ) : (
                    <UploadOutlined style={{ fontSize: 14, color: isRevisionMode ? '#ff4d4f' : '#1677ff' }} />
                  )}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: isRevisionMode ? '#cf1322' : 'var(--text-primary)', lineHeight: 1.3 }}>
                    {isUploading
                      ? '正在上传追加新版本...'
                      : isRevisionMode
                      ? `点击或拖拽上传修订版文档（追加为 V${validOriginals.length + effectiveAppended.length + 1} 覆盖提交流转）`
                      : validOriginals.length > 0 || effectiveAppended.length > 0
                      ? '点击或将本地修订好的文档拖拽至此处，追加为新版本'
                      : '点击或拖拽交付成果文件至此处进行上传'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1, lineHeight: 1.2 }}>
                    {isRevisionMode
                      ? '系统将完整保留被驳回原稿，并自动置顶新版本作为下一轮法务审查基准'
                      : '支持上传 .docx / .pdf 格式修订稿；系统将自动追加为新版本（如 V2），原稿履历完整留痕'}
                  </div>
                </div>
              </div>
            </Upload.Dragger>
            {!isRevisionMode && validOriginals.length > 0 && isDropzoneOpen && (
              <div style={{ textAlign: 'right', marginTop: 4 }}>
                <Button
                  type="link"
                  size="small"
                  onClick={() => setIsDropzoneOpen(false)}
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: 0 }}
                >
                  收起上传框
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
