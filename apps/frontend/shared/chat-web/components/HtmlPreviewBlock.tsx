import React, { useState, useCallback } from 'react';
import { Button, Segmented, Tooltip, Space } from 'antd';
import {
  DesktopOutlined,
  CodeOutlined,
  FullscreenOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';

interface HtmlPreviewBlockProps {
  code: string;
  className?: string;
  defaultTitle?: string;
}

export const HtmlPreviewBlock: React.FC<HtmlPreviewBlockProps> = ({
  code,
  className,
  defaultTitle = 'HTML 演示文稿 / 原型',
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');

  const isPresentation =
    code.includes('guizang') ||
    code.includes('slide') ||
    code.includes('presentation') ||
    code.includes('deck') ||
    code.includes('swiper');

  const displayTitle = isPresentation ? '🎨 交互式 HTML 演示文稿 (Presentation)' : `🎨 ${defaultTitle}`;
  const defaultFileName = isPresentation ? 'presentation.html' : 'index.html';

  const handleFullscreen = useCallback(() => {
    try {
      const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const newWin = window.open(url, '_blank');
      if (!newWin) {
        window.location.href = url;
      }
    } catch {
      // fallback
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
      URL.revokeObjectURL(url);
    } catch {
      // fallback
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
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          background: 'rgba(0, 0, 0, 0.04)',
          borderBottom: '1px solid rgba(140, 140, 140, 0.15)',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px' }}>
          <PlayCircleOutlined style={{ color: '#1677ff' }} />
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
        </div>

        <Space size="small">
          <Segmented
            size="small"
            value={activeTab}
            onChange={(val) => setActiveTab(val as 'preview' | 'code')}
            options={[
              { label: '在线演示', value: 'preview', icon: <DesktopOutlined /> },
              { label: '查看源码', value: 'code', icon: <CodeOutlined /> },
            ]}
          />

          <Tooltip title="在独立大窗口全屏演示">
            <Button size="small" icon={<FullscreenOutlined />} onClick={handleFullscreen}>
              全屏演示
            </Button>
          </Tooltip>

          <Tooltip title="下载 HTML 文件至本地">
            <Button size="small" type="primary" ghost icon={<DownloadOutlined />} onClick={handleDownload}>
              下载
            </Button>
          </Tooltip>
        </Space>
      </div>

      {/* Body content */}
      {activeTab === 'preview' ? (
        <div>
          <iframe
            srcDoc={code}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            style={{
              width: '100%',
              height: '460px',
              border: 'none',
              display: 'block',
              backgroundColor: '#0f172a',
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
            <span>💡 提示：点击画面可直接交互，支持键盘左右键 / 空格翻页、ESC 查看索引。</span>
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
      )}
    </div>
  );
};

export default HtmlPreviewBlock;
