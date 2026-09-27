import React from 'react';
import { LoadingOutlined } from '@ant-design/icons';

export interface StreamingActivityCardProps {
  isStreaming: boolean;
  userQuery?: string;
  currentProgressText?: string;
  realContentLength?: number;
  compact?: boolean;
}

const resolveTitle = (query?: string): string => {
  const q = (query || '').toLowerCase();
  if (/(?:html|网页|单页|报告|看板|大屏|原型|演示文稿|ppt|slide|五子棋|游戏)/i.test(q)) {
    return '正在构建交付物';
  }
  if (/(?:word|docx|审阅|审查|批注|合同|留痕)/i.test(q)) {
    return '正在处理文档';
  }
  if (/(?:excel|xlsx|表格|表单|算式|报表)/i.test(q)) {
    return '正在生成数据表格';
  }
  return 'AI 正在执行任务';
};

export const StreamingActivityCard: React.FC<StreamingActivityCardProps> = ({
  isStreaming,
  userQuery,
  currentProgressText,
  realContentLength = 0,
  compact = false,
}) => {
  if (!isStreaming) {
    return null;
  }

  const title = resolveTitle(userQuery);

  const isRunningTool = Boolean(
    currentProgressText &&
    (currentProgressText.includes('bash') ||
     currentProgressText.includes('工具') ||
     currentProgressText.includes('✓') ||
     currentProgressText.includes('⚡') ||
     currentProgressText.includes('调用') ||
     currentProgressText.includes('检索') ||
     currentProgressText.includes('执行'))
  );

  const cleanProgressText =
    currentProgressText &&
    !currentProgressText.includes('正在连接个人安全沙箱') &&
    !currentProgressText.includes('DeepSeek Harness') &&
    !currentProgressText.includes('AI 正在分析需求')
      ? currentProgressText
      : undefined;

  // 严格采用真实字符增量，杜绝跑表与虚构 KB 数值
  const hasRealLength = typeof realContentLength === 'number' && realContentLength > 0;
  const displayProgress = hasRealLength
    ? `已生成 ${realContentLength} 字`
    : (isRunningTool ? '执行中' : '处理中');

  if (compact) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          color: '#1677ff',
          background: 'rgba(22, 119, 255, 0.08)',
          padding: '2px 8px',
          borderRadius: '12px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontWeight: 500,
        }}
      >
        <LoadingOutlined spin style={{ fontSize: '11px' }} />
        <span>{displayProgress}</span>
      </span>
    );
  }

  return (
    <div
      style={{
        margin: '8px 0',
        padding: cleanProgressText ? '12px 16px' : '10px 14px',
        borderRadius: '10px',
        background: 'linear-gradient(135deg, rgba(22, 119, 255, 0.04) 0%, rgba(22, 119, 255, 0.08) 100%)',
        border: '1px solid rgba(22, 119, 255, 0.22)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: cleanProgressText ? '8px' : '6px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 顶部行：真实标题、加载状态与真实字符变化指示 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LoadingOutlined spin style={{ color: '#1677ff', fontSize: '14px' }} />
          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary, #1e293b)' }}>
            {title}
          </span>
        </div>

        <span
          style={{
            fontSize: '11px',
            fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
            padding: '2px 8px',
            borderRadius: '6px',
            background: 'rgba(22, 119, 255, 0.12)',
            color: '#1677ff',
            fontWeight: 600,
            letterSpacing: '0.2px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {displayProgress}
        </span>
      </div>

      {/* 仅在有具体的工具/命令执行事件时展示，去除无意义冗余占位文案 */}
      {cleanProgressText ? (
        <div
          style={{
            fontSize: '11px',
            color: '#1677ff',
            background: 'rgba(22, 119, 255, 0.06)',
            padding: '3px 8px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            width: 'fit-content',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span>{cleanProgressText}</span>
        </div>
      ) : null}

      {/* 底部微脉冲光流条 (连续动态光流反馈链路活跃状态) */}
      <div
        style={{
          height: '2px',
          width: '100%',
          background: 'rgba(22, 119, 255, 0.15)',
          borderRadius: '2px',
          overflow: 'hidden',
          position: 'relative',
          marginTop: '2px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: '40%',
            background: 'linear-gradient(90deg, transparent, #1677ff, transparent)',
            animation: 'streaming-shimmer 1.8s infinite ease-in-out',
          }}
        />
        <style>{`
          @keyframes streaming-shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
          }
        `}</style>
      </div>
    </div>
  );
};

export default StreamingActivityCard;
