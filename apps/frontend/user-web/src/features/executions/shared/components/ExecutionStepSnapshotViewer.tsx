import React, { useState } from 'react';
import { Button, Modal, Tabs, Tag, Typography, Space, Tooltip, message } from 'antd';
import { CodeOutlined, EyeOutlined, CopyOutlined, CheckCircleOutlined } from '@ant-design/icons';
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
  const [copied, setCopied] = useState(false);

  const rawHtml = extractStepHtml(step);
  const readValue = extractStepReadValue(step);

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

  if (!rawHtml && !readValue) {
    return null;
  }

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
