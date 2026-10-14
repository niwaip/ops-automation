import React, { useState } from 'react';
import { Button, Modal, Tabs, Tag, Typography, Space, Tooltip, message } from 'antd';
import {
  CodeOutlined,
  EyeOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { ExecutionPhaseStepDto } from '@/api/execution';

const { Text } = Typography;

interface ExecutionStepSnapshotViewerProps {
  step: ExecutionPhaseStepDto;
}

const extractStepHtml = (step: ExecutionPhaseStepDto): string | undefined => {
  const output =
    step.output && typeof step.output === 'object'
      ? (step.output as Record<string, unknown>)
      : undefined;
  if (!output) return undefined;
  if (typeof output.html === 'string' && output.html.trim()) return output.html;
  const data =
    output.data && typeof output.data === 'object'
      ? (output.data as Record<string, unknown>)
      : undefined;
  if (typeof data?.html === 'string' && data.html.trim()) return data.html;
  return undefined;
};

const extractStepReadValue = (
  step: ExecutionPhaseStepDto
): { key?: string; value: string } | undefined => {
  const output =
    step.output && typeof step.output === 'object'
      ? (step.output as Record<string, unknown>)
      : undefined;
  if (!output) return undefined;
  const data =
    output.data && typeof output.data === 'object'
      ? (output.data as Record<string, unknown>)
      : undefined;
  if (data?.value !== undefined && data?.value !== null && typeof data.value !== 'object') {
    return {
      key: typeof data.key === 'string' ? data.key : typeof data.selector === 'string' ? data.selector : undefined,
      value: String(data.value),
    };
  }
  if (output.value !== undefined && output.value !== null && typeof output.value !== 'object') {
    return { value: String(output.value) };
  }
  return undefined;
};

const extractStepTextContent = (step: ExecutionPhaseStepDto): string | undefined => {
  const output =
    step.output && typeof step.output === 'object'
      ? (step.output as Record<string, unknown>)
      : undefined;
  if (!output) return undefined;

  const data =
    output.data && typeof output.data === 'object'
      ? (output.data as Record<string, unknown>)
      : undefined;

  const candidates = [
    output.text,
    output.mainContent,
    output.content,
    output.clean_content,
    output.step_2_clean_content,
    output.cleanContent,
    output.pageText,
    output.extractedText,
    output.body,
    data?.text,
    data?.mainContent,
    data?.content,
    data?.clean_content,
    data?.pageText,
    data?.extractedText,
    data?.body,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      return c.trim();
    }
  }

  const resultObj =
    output.result && typeof output.result === 'object'
      ? (output.result as Record<string, unknown>)
      : undefined;
  if (resultObj) {
    const nestedCandidates = [
      resultObj.text,
      resultObj.mainContent,
      resultObj.content,
      resultObj.clean_content,
      resultObj.pageText,
    ];
    for (const c of nestedCandidates) {
      if (typeof c === 'string' && c.trim()) {
        return c.trim();
      }
    }
  }

  return undefined;
};

const formatSize = (chars: number): string => {
  if (chars >= 10000) {
    return `${(chars / 10000).toFixed(1)} 万字`;
  }
  if (chars >= 1000) {
    return `${(chars / 1000).toFixed(1)}k 字`;
  }
  return `${chars} 字`;
};

const ExecutionStepSnapshotViewer: React.FC<ExecutionStepSnapshotViewerProps> = ({ step }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const rawHtml = extractStepHtml(step);
  const readValue = extractStepReadValue(step);
  const textContent = extractStepTextContent(step);

  const isPruned = rawHtml ? rawHtml.startsWith('[pruned:') || rawHtml.includes('chars string]') : false;

  const handleCopy = async () => {
    if (!rawHtml) return;
    try {
      await navigator.clipboard.writeText(rawHtml);
      setCopied(true);
      void message.success('已复制 HTML 源码到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      void message.error('复制失败，请手动选择复制');
    }
  };

  const handleCopyText = async () => {
    if (!textContent) return;
    try {
      await navigator.clipboard.writeText(textContent);
      setCopiedText(true);
      void message.success('已复制提取正文到剪贴板');
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      void message.error('复制失败，请手动选择复制');
    }
  };

  if (!rawHtml && !readValue && !textContent) {
    return null;
  }

  const isTextDistinct = textContent && (!readValue || textContent !== readValue.value);

  return (
    <div style={{ marginTop: 4 }}>
      <Space wrap size={8} align="center">
        {readValue ? (
          <Tag color="blue" style={{ fontSize: 12 }}>
            <Text strong style={{ color: 'inherit' }}>
              {readValue.key ? `${readValue.key}: ` : '读取值: '}
            </Text>
            {readValue.value}
          </Tag>
        ) : null}

        {isTextDistinct ? (
          textContent.length > 80 ? (
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => setTextModalOpen(true)}
              style={{ fontSize: 12 }}
            >
              提取正文与要点 ({formatSize(textContent.length)})
            </Button>
          ) : !readValue ? (
            <Tag color="blue" style={{ fontSize: 12 }}>
              <Text strong style={{ color: 'inherit' }}>提取文本: </Text>
              {textContent}
            </Tag>
          ) : null
        ) : null}

        {rawHtml ? (
          isPruned ? (
            <Tooltip title="接管或故障恢复时，超限历史字符串已转为归档占位符">
              <Tag color="default" style={{ cursor: 'help' }}>
                HTML 快照（已精简归档）
              </Tag>
            </Tooltip>
          ) : (
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setModalOpen(true)}
              style={{ fontSize: 12 }}
            >
              网页快照 / HTML ({formatSize(rawHtml.length)})
            </Button>
          )
        ) : null}
      </Space>

      {isTextDistinct && textContent.length > 80 ? (
        <div
          onClick={() => setTextModalOpen(true)}
          style={{
            marginTop: 8,
            padding: '10px 14px',
            background: 'var(--bg-secondary, rgba(148, 163, 184, 0.06))',
            border: '1px solid var(--border-color, rgba(148, 163, 184, 0.2))',
            borderRadius: 8,
            fontSize: 12.5,
            cursor: 'pointer',
            maxHeight: 88,
            overflow: 'hidden',
            position: 'relative',
            transition: 'border-color 0.2s ease, background 0.2s ease',
          }}
          title="点击查看提取正文全文"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary, #334155)', fontSize: 12 }}>
              📄 页面提取正文预览 ({formatSize(textContent.length)})
            </div>
            <div style={{ fontSize: 11, color: '#1677ff', fontWeight: 500 }}>
              点击查看全文 ↗
            </div>
          </div>
          <Text
            type="secondary"
            style={{
              wordBreak: 'break-all',
              lineHeight: 1.65,
              fontSize: 12,
              color: 'var(--text-secondary, #64748b)',
            }}
          >
            {textContent.replace(/\s+/g, ' ').slice(0, 240)}...
          </Text>
        </div>
      ) : null}

      {isTextDistinct && textContent.length > 80 ? (
        <Modal
          title={
            <Space style={{ width: '100%', justifyContent: 'space-between', paddingRight: 32 }}>
              <span>
                步骤 {step.stepIndex} ({step.action}) 提取正文 ({formatSize(textContent.length)})
              </span>
              <Button
                size="small"
                icon={copiedText ? <CheckCircleOutlined /> : <CopyOutlined />}
                onClick={handleCopyText}
              >
                {copiedText ? '已复制' : '复制正文'}
              </Button>
            </Space>
          }
          open={textModalOpen}
          onCancel={() => setTextModalOpen(false)}
          footer={null}
          width={840}
          destroyOnHidden
        >
          <div
            style={{
              maxHeight: '68vh',
              overflowY: 'auto',
              padding: '18px 22px',
              background: 'var(--bg-card, rgba(0, 0, 0, 0.02))',
              border: '1px solid var(--border-color, rgba(148, 163, 184, 0.18))',
              borderRadius: 8,
              fontSize: 13.5,
              lineHeight: 1.85,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'var(--text-primary, inherit)',
            }}
          >
            {textContent}
          </div>
        </Modal>
      ) : null}

      {rawHtml && !isPruned ? (
        <Modal
          title={
            <Space style={{ width: '100%', justifyContent: 'space-between', paddingRight: 32 }}>
              <span>
                步骤 {step.stepIndex} ({step.action}) 网页快照与源码
              </span>
              <Button
                size="small"
                icon={copied ? <CheckCircleOutlined /> : <CopyOutlined />}
                onClick={handleCopy}
              >
                {copied ? '已复制' : '复制源码'}
              </Button>
            </Space>
          }
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          footer={null}
          width={960}
          destroyOnHidden
        >
          <Tabs
            defaultActiveKey="preview"
            items={[
              {
                key: 'preview',
                label: (
                  <span>
                    <EyeOutlined /> 网页预览
                  </span>
                ),
                children: (
                  <div style={{ width: '100%', height: '68vh', overflow: 'hidden', borderRadius: 6, border: '1px solid #e5e7eb' }}>
                    <iframe
                      title={`Step ${step.stepIndex} Snapshot Preview`}
                      srcDoc={rawHtml}
                      sandbox="allow-same-origin"
                      style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                    />
                  </div>
                ),
              },
              {
                key: 'source',
                label: (
                  <span>
                    <CodeOutlined /> HTML 源码 ({formatSize(rawHtml.length)})
                  </span>
                ),
                children: (
                  <pre
                    style={{
                      maxHeight: '68vh',
                      overflow: 'auto',
                      padding: 12,
                      background: 'var(--bg-secondary, #f8fafc)',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {rawHtml}
                  </pre>
                ),
              },
            ]}
          />
        </Modal>
      ) : null}
    </div>
  );
};

export default ExecutionStepSnapshotViewer;
