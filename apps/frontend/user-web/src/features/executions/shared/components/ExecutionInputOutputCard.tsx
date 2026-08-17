import React from 'react';
import { Space, Typography } from 'antd';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import ExecutionLinkButton from '@/features/executions/shared/components/ExecutionLinkButton';
import type { ExecutionDto } from '@/api/execution';
import ExecutionPayloadContent from '@/features/executions/shared/components/ExecutionPayloadContent';
import ExecutionResultHeader from '@/features/executions/shared/components/ExecutionResultHeader';
import {
  selectExecutionDeliverableArtifacts,
  selectExecutionReferenceArtifacts,
} from '@ops/user-core';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';

const { Text } = Typography;

interface ResultArtifact {
  type?: string;
  artifactType?: string;
  label?: string;
  name?: string;
  downloadUrl?: string;
  url?: string;
  path?: string;
  mimeType?: string;
}

interface ExecutionNormalizedResultView {
  hasBusinessResult?: boolean;
  title?: string;
  resultType?: string;
  summary?: string;
  body?: string;
  artifacts: ResultArtifact[];
  temporalLink?: string;
  structuredData?: unknown;
  envelope?: unknown;
}

interface ExecutionInputOutputCardProps {
  execution?: ExecutionDto;
  executionInput?: unknown;
  executionNormalizedResult?: ExecutionNormalizedResultView;
  effectiveResultJson?: unknown;
}

const ExecutionInputOutputCard: React.FC<ExecutionInputOutputCardProps> = ({
  execution,
  executionInput,
  executionNormalizedResult,
  effectiveResultJson,
}) => {
  if (!execution) {
    return null;
  }

  const deliverableArtifacts = selectExecutionDeliverableArtifacts(
    executionNormalizedResult?.artifacts || []
  );
  const referenceArtifacts = selectExecutionReferenceArtifacts(
    executionNormalizedResult?.artifacts || []
  );

  return (
    <ExecutionDetailSectionCard title="输入与输出">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Text strong>输入：</Text>
          <div style={{ marginTop: 8 }}>
            <ExecutionPayloadContent value={executionInput} emptyText="该执行暂无输入内容。" />
          </div>
        </div>
        <div>
          <Text strong>结果：</Text>
          <div style={{ marginTop: 8 }}>
            {executionNormalizedResult?.hasBusinessResult ? (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {executionNormalizedResult.title ? (
                  <ExecutionResultHeader
                    title={executionNormalizedResult.title}
                    typeLabel={executionNormalizedResult.resultType}
                  />
                ) : null}
                {executionNormalizedResult.summary || executionNormalizedResult.body ? (
                  <ExecutionPayloadContent
                    value={executionNormalizedResult.summary || executionNormalizedResult.body}
                  />
                ) : null}
                {deliverableArtifacts.length > 0 ? (
                  <div>
                    <Text strong>结果文件：</Text>
                    <Space wrap style={{ marginLeft: 8 }}>
                      {deliverableArtifacts.map((artifact, index) => {
                        const href = replaceLocalhostWithCurrentHost(
                          artifact.downloadUrl || artifact.url
                        );
                        if (!href) {
                          return null;
                        }

                        return (
                          <ExecutionLinkButton key={`${href}-${index}`} href={href}>
                            {artifact.label || artifact.name || `结果文件 ${index + 1}`}
                          </ExecutionLinkButton>
                        );
                      })}
                    </Space>
                  </div>
                ) : null}
                {referenceArtifacts.length > 0 ? (
                  <div>
                    <Text strong>来源链接：</Text>
                    <Space wrap style={{ marginLeft: 8 }}>
                      {referenceArtifacts.map((artifact, index) => {
                        const href = replaceLocalhostWithCurrentHost(artifact.url);
                        if (!href) {
                          return null;
                        }

                        return (
                          <ExecutionLinkButton key={`${href}-${index}`} href={href}>
                            {artifact.label || artifact.name || `来源 ${index + 1}`}
                          </ExecutionLinkButton>
                        );
                      })}
                    </Space>
                  </div>
                ) : null}
                {executionNormalizedResult.temporalLink ? (() => {
                  const temporalHref = replaceLocalhostWithCurrentHost(
                    executionNormalizedResult.temporalLink
                  );
                  return temporalHref ? (
                    <ExecutionLinkButton href={temporalHref} fitContent>
                      打开 Temporal 执行链路
                    </ExecutionLinkButton>
                  ) : null;
                })() : null}
                <ExecutionPayloadContent
                  value={
                    executionNormalizedResult.structuredData ?? executionNormalizedResult.envelope
                  }
                  emptyText="该执行暂无结构化结果。"
                />
              </Space>
            ) : (
              <ExecutionPayloadContent
                value={effectiveResultJson}
                emptyText="该执行暂无结果输出。"
                treatSingleResultFieldAsMarkdown
              />
            )}
          </div>
        </div>
      </Space>
    </ExecutionDetailSectionCard>
  );
};

export default ExecutionInputOutputCard;
