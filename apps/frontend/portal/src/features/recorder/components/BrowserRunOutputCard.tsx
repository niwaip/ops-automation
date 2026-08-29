import React from 'react';
import { Card, Descriptions, Empty, Space, Tag, Typography } from 'antd';

const { Link, Text } = Typography;

type BrowserArtifact = {
  id?: string;
  type?: string;
  name?: string;
  url?: string;
  mimeType?: string;
};

type BrowserPage = {
  pageId?: string;
  stepId?: string;
  url?: string;
  title?: string;
  captureReason?: string;
};

type BrowserWarning = { code?: string; message?: string };

type BrowserRunOutput = {
  schemaVersion?: string;
  run?: { status?: string; finalPageId?: string; contractDigest?: string };
  summary?: { totalSteps?: number; completedSteps?: number; recoveredSteps?: number; failedSteps?: number };
  pages?: BrowserPage[];
  artifacts?: BrowserArtifact[];
  warnings?: BrowserWarning[];
};

export function getBrowserRunOutput(value: unknown): BrowserRunOutput | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const candidate = record.browserRunOutput || value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;
  const output = candidate as BrowserRunOutput;
  return output.schemaVersion === 'browser-run-output/v2' ? output : undefined;
}

export const BrowserRunOutputCard: React.FC<{ value?: unknown }> = ({ value }) => {
  const output = getBrowserRunOutput(value);
  if (!output) return null;
  const pages = Array.isArray(output.pages) ? output.pages : [];
  const artifacts = Array.isArray(output.artifacts) ? output.artifacts : [];
  const warnings = Array.isArray(output.warnings) ? output.warnings : [];

  return (
    <Card size="small" title="浏览器执行结果（V2）">
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="运行状态">{output.run?.status || '-'}</Descriptions.Item>
          <Descriptions.Item label="最终页面 ID">{output.run?.finalPageId || '-'}</Descriptions.Item>
          <Descriptions.Item label="契约摘要">{output.run?.contractDigest || '-'}</Descriptions.Item>
          <Descriptions.Item label="步骤统计">
            {`总计 ${output.summary?.totalSteps ?? 0} / 完成 ${output.summary?.completedSteps ?? 0} / 恢复 ${output.summary?.recoveredSteps ?? 0} / 失败 ${output.summary?.failedSteps ?? 0}`}
          </Descriptions.Item>
        </Descriptions>

        <Card size="small" type="inner" title={`页面 (${pages.length})`}>
          {pages.length ? (
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {pages.map((page, index) => (
                <div key={page.pageId || index}>
                  <Tag>{page.captureReason || 'captured'}</Tag>
                  <Text strong>{page.title || page.pageId || '未命名页面'}</Text>
                  {page.url ? <Text type="secondary"> · {page.url}</Text> : null}
                </div>
              ))}
            </Space>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无页面采集" />
          )}
        </Card>

        <Card size="small" type="inner" title={`产物 (${artifacts.length})`}>
          {artifacts.length ? (
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {artifacts.map((artifact, index) => (
                <div key={artifact.id || index}>
                  <Tag>{artifact.type || 'artifact'}</Tag>
                  {artifact.url ? (
                    <Link href={artifact.url} target="_blank" rel="noreferrer">
                      {artifact.name || artifact.id || artifact.url}
                    </Link>
                  ) : (
                    <Text>{artifact.name || artifact.id || '未命名产物'}</Text>
                  )}
                  {artifact.mimeType ? <Text type="secondary"> · {artifact.mimeType}</Text> : null}
                </div>
              ))}
            </Space>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无产物" />
          )}
        </Card>

        {warnings.length ? (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {warnings.map((warning, index) => (
              <Text key={`${warning.code}-${index}`} type="warning">
                {warning.code || 'WARNING'}: {warning.message || '-'}
              </Text>
            ))}
          </Space>
        ) : null}
      </Space>
    </Card>
  );
};
