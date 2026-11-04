import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Segmented, Tooltip, Space, Modal } from 'antd';
import {
  FullscreenOutlined,
  CopyOutlined,
  CheckOutlined,
  DownloadOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import mermaid from 'mermaid';

interface MermaidBlockProps {
  code: string;
  className?: string;
  isStreaming?: boolean;
}

let isMermaidInitialized = false;

const initMermaidOnce = () => {
  if (typeof window === 'undefined' || isMermaidInitialized) return;
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'default',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      flowchart: {
        htmlLabels: true,
        curve: 'linear',
      },
    });
    isMermaidInitialized = true;
  } catch (err) {
    console.error('Failed to initialize mermaid:', err);
  }
};

/**
 * 自动纠正常见 Mermaid 容错语法（如未加引号的包含括号/特殊字符的节点标签）
 */
export const sanitizeMermaidCode = (rawCode: string): string => {
  if (!rawCode) return '';
  let code = rawCode.trim();

  // 1. 去除包裹的 markdown 标记
  code = code.replace(/^```(?:mermaid|graph|flowchart)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  // 2. 自动修正包含圆括号但未加引号的节点名称：Chart[前端图表渲染 (ECharts/Vue)] -> Chart["前端图表渲染 (ECharts/Vue)"]
  code = code.replace(
    /(\b[a-zA-Z0-9_\-]+)\s*\[([^"\]\n]*\([^"\]\n]*\)[^"\]\n]*)\]/g,
    (_m, id, label) => `${id}["${label.trim()}"]`
  );

  return code;
};

export const MermaidBlock: React.FC<MermaidBlockProps> = React.memo(function MermaidBlock({
  code = '',
  className,
  isStreaming = false,
}) {
  const [activeTab, setActiveTab] = useState<'diagram' | 'code'>('diagram');
  const [svgContent, setSvgContent] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isFullscreenModal, setIsFullscreenModal] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const uniqueIdRef = useRef<string>(`mermaid-${Math.random().toString(36).slice(2, 9)}`);

  const sanitizedCode = React.useMemo(() => sanitizeMermaidCode(code), [code]);

  useEffect(() => {
    initMermaidOnce();
  }, []);

  useEffect(() => {
    // 流式输出中若语法未闭合，暂不强行渲染以防语法报错闪烁
    if (isStreaming) {
      return;
    }

    if (!sanitizedCode) {
      setSvgContent('');
      setRenderError(null);
      return;
    }

    let isSubscribed = true;
    const renderId = `${uniqueIdRef.current}-${Date.now()}`;

    const renderDiagram = async () => {
      try {
        const { svg } = await mermaid.render(renderId, sanitizedCode);
        if (isSubscribed) {
          setSvgContent(svg);
          setRenderError(null);
        }
      } catch (err: any) {
        console.warn('Mermaid rendering error:', err?.message || err);
        // 清理 mermaid 失败遗留在 DOM 中的临时容器节点
        if (typeof document !== 'undefined') {
          const el = document.getElementById(renderId);
          if (el) el.remove();
          const dEl = document.getElementById(`d${renderId}`);
          if (dEl) dEl.remove();
        }
        if (isSubscribed) {
          setRenderError(err?.message || '图表语法解析失败');
        }
      }
    };

    renderDiagram();

    return () => {
      isSubscribed = false;
    };
  }, [sanitizedCode, isStreaming]);

  const handleCopyCode = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      });
    }
  }, [code]);

  const handleDownloadSvg = useCallback(() => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `architecture-diagram-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [svgContent]);

  return (
    <div
      className={['mermaid-block-container', className].filter(Boolean).join(' ')}
      style={{
        margin: '16px 0',
        borderRadius: '10px',
        border: '1px solid var(--border-color, #e2e8f0)',
        background: 'var(--bg-card, #ffffff)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden',
      }}
    >
      {/* 顶部工具栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'var(--bg-secondary, #f8fafc)',
          borderBottom: '1px solid var(--border-color, #e2e8f0)',
          fontSize: '13px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary, #1e293b)', fontWeight: 500 }}>
          <ApartmentOutlined style={{ color: 'var(--primary-color, #2563eb)' }} />
          <span>架构与流程图 (Mermaid)</span>
          {isStreaming && (
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'normal' }}>
              （生成中...）
            </span>
          )}
          {renderError && (
            <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 'normal' }}>
              （已回退源码）
            </span>
          )}
        </div>

        <Space size="small">
          <Segmented
            size="small"
            value={renderError ? 'code' : activeTab}
            onChange={(val) => setActiveTab(val as 'diagram' | 'code')}
            options={[
              { label: '图表', value: 'diagram', disabled: Boolean(renderError) },
              { label: '源码', value: 'code' },
            ]}
          />

          <Tooltip title={isCopied ? '已复制' : '复制图表源码'}>
            <Button
              size="small"
              type="text"
              icon={isCopied ? <CheckOutlined style={{ color: '#10b981' }} /> : <CopyOutlined />}
              onClick={handleCopyCode}
            />
          </Tooltip>

          {svgContent && !renderError && (
            <Tooltip title="下载矢量图 (SVG)">
              <Button
                size="small"
                type="text"
                icon={<DownloadOutlined />}
                onClick={handleDownloadSvg}
              />
            </Tooltip>
          )}

          {svgContent && !renderError && (
            <Tooltip title="全屏查看图表">
              <Button
                size="small"
                type="text"
                icon={<FullscreenOutlined />}
                onClick={() => setIsFullscreenModal(true)}
              />
            </Tooltip>
          )}
        </Space>
      </div>

      {/* 主展示区 */}
      <div style={{ position: 'relative', width: '100%', minHeight: '120px' }}>
        {activeTab === 'diagram' && !renderError ? (
          <div
            ref={containerRef}
            style={{
              padding: '24px 16px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              overflowX: 'auto',
              background: '#ffffff',
            }}
          >
            {svgContent ? (
              <div
                dangerouslySetInnerHTML={{ __html: svgContent }}
                style={{
                  maxWidth: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              />
            ) : (
              <div style={{ color: '#94a3b8', fontSize: '13px', padding: '24px 0' }}>
                {isStreaming ? '正在解析图表结构...' : '暂无图表内容'}
              </div>
            )}
          </div>
        ) : (
          <pre
            style={{
              margin: 0,
              padding: '12px 16px',
              background: '#0f172a',
              color: '#f8fafc',
              fontSize: '12.5px',
              fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              lineHeight: 1.6,
              overflowX: 'auto',
            }}
          >
            <code>{code}</code>
          </pre>
        )}
      </div>

      {/* 全屏放大 Modal */}
      <Modal
        open={isFullscreenModal}
        onCancel={() => setIsFullscreenModal(false)}
        footer={null}
        width="94vw"
        style={{ top: '3vh' }}
        styles={{
          body: {
            padding: '24px',
            maxHeight: '88vh',
            overflow: 'auto',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            background: '#ffffff',
          },
        }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '24px' }}>
            <span>架构与流程图全屏预览</span>
            <Space size="small">
              <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadSvg}>
                下载 SVG
              </Button>
              <Button size="small" icon={<CopyOutlined />} onClick={handleCopyCode}>
                复制源码
              </Button>
            </Space>
          </div>
        }
      >
        <div
          dangerouslySetInnerHTML={{ __html: svgContent }}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
          }}
        />
      </Modal>
    </div>
  );
});

export default MermaidBlock;
