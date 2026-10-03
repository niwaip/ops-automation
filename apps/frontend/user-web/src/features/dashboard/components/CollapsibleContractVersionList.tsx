import {
  DownloadOutlined,
  DownOutlined,
  FileWordOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { Button, Tag } from 'antd';
import { useState } from 'react';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';
import type { FormattedContractVersion } from '../lib/contractComparisonHelper';

export interface CollapsibleContractVersionListProps {
  formattedVersions: FormattedContractVersion[];
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 合同多版本折叠收起列表组件
 * - 置顶突出展示当前最新生效/送审版；
 * - 纯 Flexbox 结构保证长文件名在标签与下载按钮之间精准省略号截断，绝对不溢出；
 * - 历史各版本默认收起，提供“查看历史版本 (N)”一键展开/收起。
 */
export function CollapsibleContractVersionList({
  formattedVersions,
  className,
  style,
}: CollapsibleContractVersionListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!formattedVersions || formattedVersions.length === 0) {
    return null;
  }

  const latestVer = formattedVersions[0];
  const historyVers = formattedVersions.slice(1);
  const downloadUrl = latestVer.url ? replaceLocalhostWithCurrentHost(latestVer.url) : undefined;

  return (
    <div
      className={className}
      style={{
        marginTop: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        width: '100%',
        minWidth: 0,
        ...style,
      }}
    >
      {/* 1. 当前最新生效/送审版本（置顶突出展示） */}
      <div
        key={latestVer.name + latestVer.versionNumber}
        style={{
          padding: '6px 10px',
          background: 'rgba(22, 119, 255, 0.08)',
          borderRadius: 6,
          border: '1px solid rgba(22, 119, 255, 0.22)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minWidth: 0,
          overflow: 'hidden',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
            flex: 1,
            overflow: 'hidden',
          }}
        >
          <FileWordOutlined style={{ color: '#1677ff', fontSize: 15, flexShrink: 0 }} />
          <Tag
            color="processing"
            bordered={false}
            style={{
              fontSize: 11,
              lineHeight: '18px',
              padding: '0 5px',
              margin: 0,
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            {latestVer.versionLabel}
          </Tag>
          <span
            style={{
              fontWeight: 600,
              fontSize: 12,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: 1,
            }}
            title={latestVer.name}
          >
            {latestVer.name}
          </span>
        </div>
        {downloadUrl ? (
          <Button
            size="small"
            type="primary"
            icon={<DownloadOutlined />}
            href={downloadUrl}
            target="_blank"
            download={latestVer.name}
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 11, height: 24, padding: '0 8px', flexShrink: 0 }}
          >
            下载
          </Button>
        ) : null}
      </div>

      {/* 2. 历史版本默认折叠收起 */}
      {historyVers.length > 0 ? (
        <div style={{ marginTop: 2, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '2px 2px',
              minWidth: 0,
            }}
          >
            <Button
              type="link"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              style={{ fontSize: 11, padding: 0, color: 'var(--text-secondary)', height: 'auto', flexShrink: 0 }}
              icon={isExpanded ? <UpOutlined style={{ fontSize: 10 }} /> : <DownOutlined style={{ fontSize: 10 }} />}
            >
              {isExpanded ? '收起历史版本' : `查看历史版本 (${historyVers.length})`}
            </Button>
            {!isExpanded ? (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                已留存历史版本原稿
              </span>
            ) : null}
          </div>

          {/* 3. 展开后的历史版本列表 */}
          {isExpanded ? (
            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
              {historyVers.map((ver) => {
                const historyDownloadUrl = ver.url ? replaceLocalhostWithCurrentHost(ver.url) : undefined;
                return (
                  <div
                    key={ver.name + ver.versionNumber}
                    style={{
                      padding: '5px 8px',
                      background: 'var(--bg-secondary, rgba(148, 163, 184, 0.05))',
                      borderRadius: 6,
                      border: '1px solid var(--border-color, rgba(148, 163, 184, 0.16))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      minWidth: 0,
                      overflow: 'hidden',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        minWidth: 0,
                        flex: 1,
                        overflow: 'hidden',
                      }}
                    >
                      <FileWordOutlined style={{ color: '#8c8c8c', fontSize: 14, flexShrink: 0 }} />
                      <Tag
                        color="default"
                        bordered={false}
                        style={{ fontSize: 11, lineHeight: '18px', padding: '0 5px', margin: 0, flexShrink: 0 }}
                      >
                        {ver.versionLabel}
                      </Tag>
                      <span
                        style={{
                          fontWeight: 400,
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                          flex: 1,
                        }}
                        title={ver.name}
                      >
                        {ver.name}
                      </span>
                    </div>
                    {historyDownloadUrl ? (
                      <Button
                        size="small"
                        type="default"
                        icon={<DownloadOutlined style={{ fontSize: 11 }} />}
                        href={historyDownloadUrl}
                        target="_blank"
                        download={ver.name}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 11, height: 22, padding: '0 6px', flexShrink: 0 }}
                      >
                        下载
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
