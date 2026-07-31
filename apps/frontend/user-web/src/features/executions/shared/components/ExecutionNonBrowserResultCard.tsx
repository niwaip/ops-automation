import React from 'react';
import { Space, Typography } from 'antd';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import ExecutionLinkButton from '@/features/executions/shared/components/ExecutionLinkButton';
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
  artifacts: ResultArtifact[];
  temporalLink?: string;
}

interface ExecutionNonBrowserResultCardLabels {
  title: string;
  input: string;
  result: string;
  resultArtifacts: string;
  sourceLinks: string;
  temporalExecutionLink: string;
  noInput: string;
  noStructuredResult: string;
  noResultOutput: string;
}

interface ExecutionNonBrowserResultCardProps {
  executionInput?: unknown;
  normalizedResult?: ExecutionNormalizedResultView;
  primaryResultText?: string;
  shouldRenderPrimaryAsMarkdown?: boolean;
  shouldShowStructuredResult?: boolean;
  resultPreviewValue?: unknown;
  effectiveResultJson?: unknown;
  labels: ExecutionNonBrowserResultCardLabels;
}

const ExecutionNonBrowserResultCard: React.FC<ExecutionNonBrowserResultCardProps> = ({
  executionInput,
  normalizedResult,
  primaryResultText,
  shouldRenderPrimaryAsMarkdown,
  shouldShowStructuredResult,
  resultPreviewValue,
  effectiveResultJson,
  labels,
}) => {
  const deliverableArtifacts = selectExecutionDeliverableArtifacts(
    normalizedResult?.artifacts || []
  );
  const referenceArtifacts = selectExecutionReferenceArtifacts(normalizedResult?.artifacts || []);

  return (
    <ExecutionDetailSectionCard title={labels.title} style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <Text strong>{`${labels.input}:`}</Text>
        <div style={{ marginTop: 8 }}>
          <ExecutionPayloadContent value={executionInput} emptyText={labels.noInput} />
        </div>
      </div>
      <div>
        <Text strong>{`${labels.result}:`}</Text>
        <div style={{ marginTop: 8 }}>
          {normalizedResult?.hasBusinessResult ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {normalizedResult.title ? (
                <ExecutionResultHeader
                  title={normalizedResult.title}
                  typeLabel={normalizedResult.resultType}
                />
              ) : null}
              {primaryResultText ? (
                <ExecutionPayloadContent
                  value={primaryResultText}
                  emptyText={labels.noResultOutput}
                  treatSingleResultFieldAsMarkdown={shouldRenderPrimaryAsMarkdown}
                />
              ) : null}
              {deliverableArtifacts.length > 0 ? (
                <div>
                  <Text strong>{`${labels.resultArtifacts}:`}</Text>
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
                          {artifact.label || artifact.name || `${labels.result} ${index + 1}`}
                        </ExecutionLinkButton>
                      );
                    })}
                  </Space>
                </div>
              ) : null}
              {referenceArtifacts.length > 0 ? (
                <div>
                  <Text strong>{`${labels.sourceLinks}:`}</Text>
                  <Space wrap style={{ marginLeft: 8 }}>
                    {referenceArtifacts.map((artifact, index) => {
                      const href = replaceLocalhostWithCurrentHost(artifact.url);
                      if (!href) {
                        return null;
                      }
                      return (
                        <ExecutionLinkButton key={`${href}-${index}`} href={href}>
                          {artifact.label || artifact.name || `${labels.sourceLinks} ${index + 1}`}
                        </ExecutionLinkButton>
                      );
                    })}
                  </Space>
                </div>
              ) : null}
              {normalizedResult.temporalLink ? (() => {
                const temporalHref = replaceLocalhostWithCurrentHost(normalizedResult.temporalLink);
                return temporalHref ? (
                  <ExecutionLinkButton href={temporalHref} fitContent>
                    {labels.temporalExecutionLink}
                  </ExecutionLinkButton>
                ) : null;
              })() : null}
              {shouldShowStructuredResult ? (
                <ExecutionPayloadContent
                  value={resultPreviewValue}
                  emptyText={labels.noStructuredResult}
                />
              ) : null}
            </Space>
          ) : (
            <ExecutionPayloadContent
              value={effectiveResultJson}
              emptyText={labels.noResultOutput}
              treatSingleResultFieldAsMarkdown
            />
          )}
        </div>
      </div>
    </ExecutionDetailSectionCard>
  );
};

export default ExecutionNonBrowserResultCard;
