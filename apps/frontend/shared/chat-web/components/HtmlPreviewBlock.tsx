import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button, Segmented, Tooltip, Space, Modal } from 'antd';
import {
  DesktopOutlined,
  CodeOutlined,
  FullscreenOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  UpOutlined,
  FileTextOutlined,
  ExportOutlined,
} from '@ant-design/icons';

interface HtmlPreviewBlockProps {
  code: string;
  className?: string;
  defaultTitle?: string;
  defaultExpanded?: boolean;
}

export const HtmlPreviewBlock: React.FC<HtmlPreviewBlockProps> = React.memo(function HtmlPreviewBlock({
  code,
  className,
  defaultTitle = 'HTML 演示文稿 / 原型',
  defaultExpanded,
}) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [isFullscreenModal, setIsFullscreenModal] = useState<boolean>(false);

  const isPresentation =
    code.includes('guizang') ||
    code.includes('slide') ||
    code.includes('presentation') ||
    code.includes('deck') ||
    code.includes('swiper');

  const isContractReview =
    code.includes('合同智能审查') ||
    code.includes('合同合规审查') ||
    code.includes('法务审查工作底稿') ||
    code.includes('审查工作台') ||
    code.includes('合同智能审查与合规诊断');

  const isContractCompare =
    code.includes('合同文档智能比对') ||
    code.includes('diff-ins') ||
    code.includes('diff-del') ||
    code.includes('基准合同 (A)');

  // Default HTML preview to expanded state in chat
  const [isExpanded, setIsExpanded] = useState<boolean>(
    defaultExpanded !== undefined ? defaultExpanded : true
  );

  const displayTitle = isContractReview
    ? '⚖️ 合同文档智能审查与合规诊断报告'
    : isContractCompare
      ? '⚖️ 合同文档智能比对与红线审查报告'
      : isPresentation
        ? '🎨 交互式 HTML 演示文稿 (Presentation)'
        : `🎨 ${defaultTitle}`;

  const defaultFileName = isContractReview
    ? 'contract_review_report.html'
    : isContractCompare
      ? 'contract_diff_report.html'
      : isPresentation
        ? 'presentation.html'
        : 'index.html';

  const approxSize = `${(code.length / 1024).toFixed(1)} KB`;

  // Ref-based srcdoc management ensures ZERO iframe reloads/flickering on parent keystrokes
  // and avoids dangerous Blob URL revocation bugs and Chrome top-level blob navigation restrictions.
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastRenderedCodeRef = useRef<string>('');

  useEffect(() => {
    if (isExpanded && activeTab === 'preview' && iframeRef.current) {
      if (lastRenderedCodeRef.current !== code || !iframeRef.current.srcdoc) {
        lastRenderedCodeRef.current = code;
        iframeRef.current.srcdoc = code;
      }
    }
  }, [code, isExpanded, activeTab]);

  // Open full HTML document in new tab reliably using document.write instead of ephemeral Blob URLs
  const handleOpenNewWindow = useCallback(() => {
    try {
      const newWin = window.open('', '_blank');
      if (newWin) {
        newWin.document.open();
        newWin.document.write(code);
        newWin.document.close();
      } else {
        setIsFullscreenModal(true);
      }
    } catch (err) {
      console.error('Failed to open window, opening modal instead:', err);
      setIsFullscreenModal(true);
    }
  }, [code]);

  const handleDownload = useCallback(() => {
    try {
      const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }, 60000);
    } catch (err) {
      console.error('Failed to download html:', err);
    }
  }, [code, defaultFileName]);

  return (
    <div
      style={{
        margin: '12px 0',
        borderRadius: '10px',
        border: '1px solid rgba(140, 140, 140, 0.25)',
        background: 'rgba(255, 255, 255, 0.03)',
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Header bar / Standard Artifact Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '9px 12px',
          background: 'rgba(0, 0, 0, 0.03)',
          borderBottom: isExpanded ? '1px solid rgba(140, 140, 140, 0.15)' : 'none',
          flexWrap: 'wrap',
          gap: '8px',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isContractCompare ? (
            <FileTextOutlined style={{ color: '#1677ff', fontSize: '15px' }} />
          ) : (
            <PlayCircleOutlined style={{ color: '#1677ff', fontSize: '15px' }} />
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px' }}>
              <span>{displayTitle}</span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: 'rgba(22, 119, 255, 0.1)',
                  color: '#1677ff',
                  fontWeight: 500,
                }}
              >
                {defaultFileName}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'rgba(0, 0, 0, 0.04)',
                  color: '#64748b',
                }}
              >
                {approxSize}
              </span>
            </div>
            {!isExpanded && (
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                💡 产物已就绪：支持左右双栏对齐、字符级红线、大纲跳转与高风险筛选（点击展开预览）
              </div>
            )}
          </div>
        </div>

        <Space size="small" onClick={(e) => e.stopPropagation()}>
          <Button
            size="small"
            type={isExpanded ? 'default' : 'primary'}
            icon={isExpanded ? <UpOutlined /> : <EyeOutlined />}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? '收起预览' : '展开在线预览'}
          </Button>

          {isExpanded && (
            <Segmented
              size="small"
              value={activeTab}
              onChange={(val) => setActiveTab(val as 'preview' | 'code')}
              options={[
                { label: '在线演示', value: 'preview', icon: <DesktopOutlined /> },
                { label: '查看源码', value: 'code', icon: <CodeOutlined /> },
              ]}
            />
          )}

          <Tooltip title="在当前页面全屏沉浸式预览">
            <Button size="small" icon={<FullscreenOutlined />} onClick={() => setIsFullscreenModal(true)}>
              全屏
            </Button>
          </Tooltip>

          <Tooltip title="在新标签页独立大窗口打开">
            <Button size="small" icon={<ExportOutlined />} onClick={handleOpenNewWindow}>
              新窗口
            </Button>
          </Tooltip>

          <Tooltip title="下载 HTML 文件至本地">
            <Button size="small" type="primary" ghost icon={<DownloadOutlined />} onClick={handleDownload}>
              下载
            </Button>
          </Tooltip>
        </Space>
      </div>

      {/* Body content (collapsible) */}
      {isExpanded && (activeTab === 'preview' ? (
        <div>
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            allowFullScreen
            style={{
              width: '100%',
              height: isContractCompare ? '580px' : '480px',
              border: 'none',
              display: 'block',
              backgroundColor: isContractCompare ? '#f8fafc' : '#0f172a',
            }}
            title={displayTitle}
          />
          <div
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              color: 'rgba(140, 140, 140, 0.9)',
              background: 'rgba(0, 0, 0, 0.02)',
              borderTop: '1px solid rgba(140, 140, 140, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            {isContractCompare ? (
              <span>💡 提示：支持左右双栏平滑滚动联动、章节大纲快速跳转、仅看变更与高风险过滤。</span>
            ) : (
              <span>💡 提示：点击画面可直接交互，支持键盘左右键 / 空格翻页、ESC 查看索引。</span>
            )}
            <span>单文件离线 HTML</span>
          </div>
        </div>
      ) : (
        <pre
          className={className || 'code-block language-html'}
          style={{
            margin: 0,
            maxHeight: '460px',
            overflow: 'auto',
            padding: '12px',
            fontSize: '12px',
          }}
        >
          <code>{code}</code>
        </pre>
      ))}

      {/* In-page Fullscreen Modal */}
      <Modal
        open={isFullscreenModal}
        onCancel={() => setIsFullscreenModal(false)}
        footer={null}
        width="96vw"
        style={{ top: '2vh', paddingBottom: 0 }}
        styles={{
          body: { padding: 0, height: '90vh', overflow: 'hidden' },
        }}
        destroyOnClose
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '24px' }}>
            <span>{displayTitle} - 全屏预览</span>
            <Space size="small">
              <Button size="small" icon={<ExportOutlined />} onClick={handleOpenNewWindow}>
                新标签页打开
              </Button>
              <Button size="small" icon={<DownloadOutlined />} onClick={handleDownload}>
                下载 HTML
              </Button>
            </Space>
          </div>
        }
      >
        <iframe
          srcDoc={code}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          allowFullScreen
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
          title={`${displayTitle} - 全屏`}
        />
      </Modal>
    </div>
  );
});

export default HtmlPreviewBlock;
