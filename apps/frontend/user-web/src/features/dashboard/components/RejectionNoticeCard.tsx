import React, { useState } from 'react';
import { FormOutlined, FileWordOutlined } from '@ant-design/icons';
import { Space, Tag } from 'antd';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';
import { deduplicateRejectionText } from '../lib/coordinationNodeClassifier';

interface RejectionNoticeCardProps {
  reason?: string;
  attachments?: Array<{ name: string; url?: string; size?: number }>;
  style?: React.CSSProperties;
}

export function RejectionNoticeCard({ reason, attachments = [], style }: RejectionNoticeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const cleanReason = deduplicateRejectionText(reason);
  if (!cleanReason) return null;

  const annotatedDoc =
    attachments.find((a) => a.name?.includes('批注')) ||
    attachments.find((a) => a.name?.endsWith('.docx'));

  const isLong = cleanReason.length > 180 || (cleanReason.match(/\n/g) || []).length > 3;

  return (
    <div
      style={{
        margin: '6px 0 10px 0',
        padding: '10px 14px',
        borderRadius: 8,
        background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.06) 0%, rgba(180, 83, 9, 0.02) 100%)',
        border: '1px solid rgba(217, 119, 6, 0.22)',
        borderLeft: '3px solid #d97706',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
        <Space size={6}>
          <FormOutlined style={{ color: '#d97706', fontSize: 14 }} />
          <span style={{ color: 'var(--text-amber, #d97706)', fontWeight: 600, fontSize: 13 }}>
            审查批注与修改建议
          </span>
        </Space>
        {annotatedDoc?.url ? (
          <Tag
            color="blue"
            bordered={false}
            style={{
              cursor: 'pointer',
              margin: 0,
              fontSize: 11,
              borderRadius: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 500,
            }}
            icon={<FileWordOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              window.open(replaceLocalhostWithCurrentHost(annotatedDoc.url!), '_blank');
            }}
          >
            下载批注版 Word (.docx)
          </Tag>
        ) : null}
      </div>
      <div
        style={{
          color: 'var(--text-primary)',
          fontSize: 12.5,
          lineHeight: 1.65,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: isExpanded ? 'none' : '135px',
          overflow: 'hidden',
          opacity: 0.95,
        }}
      >
        {cleanReason}
      </div>
      {isLong ? (
        <div style={{ marginTop: 4, textAlign: 'right' }}>
          <a
            style={{ fontSize: 12, color: '#d97706', cursor: 'pointer', fontWeight: 500 }}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
          >
            {isExpanded ? '收起完整意见' : '展开完整意见...'}
          </a>
        </div>
      ) : null}
    </div>
  );
}
