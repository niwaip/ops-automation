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
  LoadingOutlined,
} from '@ant-design/icons';

interface HtmlPreviewBlockProps {
  code: string;
  className?: string;
  defaultTitle?: string;
  defaultExpanded?: boolean;
  isStreaming?: boolean;
}

export const HtmlPreviewBlock: React.FC<HtmlPreviewBlockProps> = React.memo(function HtmlPreviewBlock({
  code,
  className,
  defaultTitle = 'HTML 演示文稿 / 原型',
  defaultExpanded,
  isStreaming = false,
}) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [isFullscreenModal, setIsFullscreenModal] = useState<boolean>(false);

  const isPresentation =
    code.includes('guizang') ||
    code.includes('slide') ||
    code.includes('presentation') ||
    code.includes('deck') ||
    code.includes('swiper') ||
    code.includes('html报告') ||
    code.includes('阶段性报告') ||
    code.includes('项目报告') ||
    code.includes('进度报告') ||
    code.includes('演示文稿');

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

  const isInteractiveApp =
    !isPresentation &&
    !isContractReview &&
    !isContractCompare &&
    (code.includes('<canvas') ||
      code.includes('五子棋') ||
      code.includes('gomoku') ||
      code.includes('坦克大战') ||
      code.includes('tank') ||
      code.includes('贪吃蛇') ||
      code.includes('snake') ||
      code.includes('2048') ||
      code.includes('game-container') ||
      code.includes('audioCtx') ||
      code.includes('AudioContext') ||
      code.includes('dashboard'));

  // Reports can execute scripts and load large assets. Mount only on demand.
  // Games & interactive apps are auto-expanded by default so users can play immediately.
  const [isExpanded, setIsExpanded] = useState<boolean>(
    defaultExpanded !== undefined ? defaultExpanded : Boolean(isInteractiveApp)
  );

  // Never mount iframe or expand content while streaming to prevent executing partial code
  const effectiveExpanded = !isStreaming && isExpanded;

  // 语法自愈与截断修复：防止未闭合 <style>/<script> 或缺失 <body> 导致浏览器 iframe 呈现 100% 纯白屏
  const { repairedHtml, isTruncated } = React.useMemo(() => {
    if (!code || typeof code !== 'string') {
      return { repairedHtml: '', isTruncated: false };
    }

    let repaired = code.trim();
    let truncated = false;

    // 1. 检查 <style> 是否未闭合
    const styleOpenMatches = repaired.match(/<style(?:\s+[^>]*)?>/gi) || [];
    const styleCloseMatches = repaired.match(/<\/style>/gi) || [];
    if (styleOpenMatches.length > styleCloseMatches.length) {
      repaired += '\n</style>\n';
      truncated = true;
    }

    // 2. 检查 <script> 是否未闭合
    const scriptOpenMatches = repaired.match(/<script(?:\s+[^>]*)?>/gi) || [];
    const scriptCloseMatches = repaired.match(/<\/script>/gi) || [];
    if (scriptOpenMatches.length > scriptCloseMatches.length) {
      repaired += '\n</script>\n';
      truncated = true;
    }

    // 3. 检查 <head> 是否未闭合
    const headOpenMatches = repaired.match(/<head(?:\s+[^>]*)?>/gi) || [];
    const headCloseMatches = repaired.match(/<\/head>/gi) || [];
    if (headOpenMatches.length > headCloseMatches.length) {
      repaired += '\n</head>\n';
    }

    // 4. 检查 <body> 是否存在或未闭合
    const hasBodyOpen = /<body(?:\s+[^>]*)?>/i.test(repaired);
    const hasBodyClose = /<\/body>/i.test(repaired);

    if (!hasBodyOpen) {
      // 严重截断：在 head/style 阶段即中断，完全未生成 body，导致浏览器呈现 100% 纯白屏！
      // 注入友好的深色自适应提示卡片，保留已加载字体与样式，并给出恢复指引
      truncated = true;
      const fallbackBody = `
<body style="margin: 0; padding: 24px; background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 85vh; box-sizing: border-box;">
  <div style="max-width: 620px; width: 100%; background: rgba(30, 41, 59, 0.95); border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 14px; padding: 32px; box-shadow: 0 16px 36px rgba(0,0,0,0.4); text-align: center; box-sizing: border-box;">
    <div style="font-size: 36px; margin-bottom: 12px; line-height: 1;">⚠️</div>
    <h3 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 600; color: #f8fafc;">页面内容未完全生成（输出中断）</h3>
    <p style="margin: 0 0 18px 0; font-size: 13px; line-height: 1.6; color: #94a3b8;">
      该 HTML 文件在生成样式定义阶段意外中断，未包含正文（Body）内容，因此无法正常渲染排版页面。
    </p>
    <div style="background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(51, 65, 85, 0.6); padding: 12px 16px; border-radius: 8px; font-size: 12px; color: #cbd5e1; text-align: left; margin-bottom: 16px; line-height: 1.6;">
      💡 <b>恢复建议：</b> 您可以在聊天框发送 <code>“继续输出”</code> 或 <code>“重新生成并保存为完整文件”</code>，AI 将自动修复并补齐完整报告。
    </div>
    <div style="font-size: 11px; color: #64748b;">
      已自动对未闭合的代码结构进行安全自愈，点击右上角“查看源码”可检查已生成的 CSS 样式定义。
    </div>
  </div>
</body>
</html>`;
      repaired += fallbackBody;
    } else if (!hasBodyClose) {
      truncated = true;
      const partialNotice = `
<div style="margin: 28px auto; max-width: 600px; padding: 12px 18px; background: rgba(234, 179, 8, 0.12); border: 1px dashed rgba(234, 179, 8, 0.45); border-radius: 8px; font-size: 12px; color: #eab308; text-align: center;">
  ⚠️ 提示：页面内容输出在此处意外中断，上方为已生成部分。可在对话中发送“继续”补全剩余内容。
</div>
</body>
</html>`;
      repaired += partialNotice;
    } else if (!/<\/html>/i.test(repaired)) {
      truncated = true;
      repaired += '\n</html>';
    }

    return { repairedHtml: repaired, isTruncated: truncated };
  }, [code]);

  // 从 HTML 代码中提取 title 标签内容
  const extractedTitle = React.useMemo(() => {
    const match = code.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : null;
  }, [code]);

  const displayTitle = isContractReview
    ? (extractedTitle ? `⚖️ ${extractedTitle}` : '⚖️ 合同文档智能审查与合规诊断报告')
    : isContractCompare
      ? (extractedTitle ? `⚖️ ${extractedTitle}` : '⚖️ 合同文档智能比对与红线审查报告')
      : isPresentation
        ? (extractedTitle ? `🎨 ${extractedTitle}` : '🎨 交互式 HTML 演示文稿 (Presentation)')
        : isInteractiveApp
          ? (extractedTitle ? `🎮 ${extractedTitle}` : '🎮 交互式 Web 原型 / 应用')
          : (extractedTitle ? `🎨 ${extractedTitle}` : `🎨 ${defaultTitle}`);

  const defaultFileName = isContractReview
    ? 'contract_review_report.html'
    : isContractCompare
      ? 'contract_diff_report.html'
      : isPresentation
        ? 'presentation.html'
        : (code.includes('五子棋') || code.includes('gomoku'))
          ? 'gomoku.html'
          : 'index.html';

  const approxSize = `${(code.length / 1024).toFixed(1)} KB`;

  const readyTipText = isTruncated
    ? '⚠️ HTML 产物在生成过程中未完全闭合（点击展开查看已生成部分与恢复指引）'
    : isPresentation
      ? '💡 演示文稿已就绪：支持键盘翻页 (← → / 空格)、全屏演播（点击展开预览）'
      : isContractCompare
        ? '💡 比对报告已就绪：支持左右双栏对齐、字符级红线与高风险筛选（点击展开预览）'
        : isContractReview
          ? '💡 审查报告已就绪：支持审查意见高亮、风险分级与诊断分析（点击展开预览）'
          : isInteractiveApp
            ? '💡 交互应用已就绪：支持在线操作、全屏沉浸与本地导出（点击展开预览）'
            : `💡 ${defaultTitle}已就绪（点击展开在线预览）`;

  const generatingTipText = isPresentation
    ? '⚡ 演示文稿生成中：AI 正在编写交互式页面结构与幻灯片样式...'
    : isContractCompare
      ? '⚡ 比对报告生成中：AI 正在提取条款并计算字符级红线差异...'
      : isContractReview
        ? '⚡ 审查报告生成中：AI 正在分析合同条款并生成合规诊断意见...'
        : '⚡ 产物生成中：AI 正在编写页面代码与样式，生成完毕后即可预览与下载...';

  const tipText = isStreaming ? generatingTipText : readyTipText;

  // Ref-based srcdoc management ensures ZERO iframe reloads/flickering on parent keystrokes
  // and avoids dangerous Blob URL revocation bugs and Chrome top-level blob navigation restrictions.
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastRenderedCodeRef = useRef<string>('');

  useEffect(() => {
    if (effectiveExpanded && activeTab === 'preview' && iframeRef.current) {
      if (lastRenderedCodeRef.current !== repairedHtml || !iframeRef.current.srcdoc) {
        lastRenderedCodeRef.current = repairedHtml;
        iframeRef.current.srcdoc = repairedHtml;
      }
    }
  }, [repairedHtml, effectiveExpanded, activeTab]);

  // Open full HTML document in new tab reliably using document.write instead of ephemeral Blob URLs
  const handleOpenNewWindow = useCallback(() => {
    try {
      const newWin = window.open('', '_blank');
      if (newWin) {
        newWin.document.open();
        newWin.document.write(repairedHtml);
        newWin.document.close();
      } else {
        setIsFullscreenModal(true);
      }
    } catch (err) {
      console.error('Failed to open window, opening modal instead:', err);
      setIsFullscreenModal(true);
    }
  }, [repairedHtml]);

  const handleDownload = useCallback(() => {
    try {
      const blob = new Blob([repairedHtml], { type: 'text/html;charset=utf-8' });
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
  }, [repairedHtml, defaultFileName]);

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
          borderBottom: effectiveExpanded ? '1px solid rgba(140, 140, 140, 0.15)' : 'none',
          flexWrap: 'wrap',
          gap: '8px',
          cursor: isStreaming ? 'default' : 'pointer',
        }}
        onClick={() => {
          if (!isStreaming) {
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isStreaming ? (
            <LoadingOutlined spin style={{ color: '#1677ff', fontSize: '15px' }} />
          ) : isContractCompare ? (
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
                  background: isStreaming ? 'rgba(22, 119, 255, 0.08)' : 'rgba(22, 119, 255, 0.1)',
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
              {isTruncated && !isStreaming && (
                <span
                  style={{
                    fontSize: '11px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'rgba(250, 173, 20, 0.12)',
                    color: '#d48806',
                    fontWeight: 500,
                    border: '1px solid rgba(250, 173, 20, 0.3)',
                  }}
                >
                  ⚠️ 生成未闭合
                </span>
              )}
            </div>
            {!effectiveExpanded && (
              <div
                style={{
                  fontSize: '11px',
                  color: isStreaming ? '#1677ff' : '#64748b',
                  marginTop: '2px',
                }}
              >
                {tipText}
              </div>
            )}
          </div>
        </div>

        {isStreaming ? (
          <Space size="small" onClick={(e) => e.stopPropagation()}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#1677ff',
                background: 'rgba(22, 119, 255, 0.08)',
                padding: '3px 10px',
                borderRadius: '12px',
                fontWeight: 500,
              }}
            >
              <LoadingOutlined spin /> 生成中...
            </span>
          </Space>
        ) : (
          <Space size="small" onClick={(e) => e.stopPropagation()}>
            <Button
              size="small"
              type={effectiveExpanded ? 'default' : 'primary'}
              icon={effectiveExpanded ? <UpOutlined /> : <EyeOutlined />}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {effectiveExpanded ? '收起预览' : '展开在线预览'}
            </Button>

            {effectiveExpanded && (
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
        )}
      </div>

      {/* Body content (collapsible) */}
      {effectiveExpanded && (activeTab === 'preview' ? (
        <div>
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            allowFullScreen
            style={{
              width: '100%',
              height: isContractCompare || isContractReview ? '580px' : '480px',
              border: 'none',
              display: 'block',
              backgroundColor: isContractCompare || isContractReview ? '#f8fafc' : '#0f172a',
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
            ) : isContractReview ? (
              <span>💡 提示：支持审查意见高亮过滤、风险等级筛选、审查工作底稿展开与条款快速定位。</span>
            ) : isPresentation ? (
              <span>💡 提示：点击画面可直接交互，支持键盘左右键 / 空格翻页、ESC 查看索引。</span>
            ) : (
              <span>💡 提示：支持在线交互操作与离线独立运行。</span>
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
          srcDoc={repairedHtml}
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
