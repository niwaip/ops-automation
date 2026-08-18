import React from 'react';
import { Space, Typography } from 'antd';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import type { ExecutionDto } from '@/api/execution';
import ExecutionPayloadContent from '@/features/executions/shared/components/ExecutionPayloadContent';
import ExecutionNonBrowserResultCard from '@/features/executions/shared/components/ExecutionNonBrowserResultCard';

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

  const primaryResultText =
    executionNormalizedResult?.summary || executionNormalizedResult?.body;

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
            <ExecutionNonBrowserResultCard
              executionInput={executionInput}
              normalizedResult={executionNormalizedResult}
              primaryResultText={primaryResultText}
              effectiveResultJson={effectiveResultJson}
              labels={{
                title: '结果',
                input: '输入',
                result: '结果',
                resultArtifacts: '结果文件',
                sourceLinks: '来源链接',
                temporalExecutionLink: '打开 Temporal 执行链路',
                noInput: '暂无输入内容',
                noStructuredResult: '暂无结构化结果',
                noResultOutput: '暂无结果输出',
              }}
            />
          </div>
        </div>
      </Space>
    </ExecutionDetailSectionCard>
  );
};

export default ExecutionInputOutputCard;
