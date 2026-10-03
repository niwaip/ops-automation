import React from 'react';
import { Space } from 'antd';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import type { ExecutionDto } from '@/api/execution';
import ExecutionPayloadContent from '@/features/executions/shared/components/ExecutionPayloadContent';
import ExecutionNonBrowserResultCard from '@/features/executions/shared/components/ExecutionNonBrowserResultCard';

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
    <ExecutionDetailSectionCard title="输入与执行成果">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text-primary)' }}>
            📌 任务输入要件
          </div>
          <div>
            <ExecutionPayloadContent value={executionInput} emptyText="该执行暂无输入内容。" />
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text-primary)' }}>
            🎯 执行成果与交付物
          </div>
          <div>
            <ExecutionNonBrowserResultCard
              executionInput={executionInput}
              normalizedResult={executionNormalizedResult}
              primaryResultText={primaryResultText}
              effectiveResultJson={effectiveResultJson}
              labels={{
                title: '执行成果',
                input: '任务输入',
                result: '执行成果',
                resultArtifacts: '交付成果文件',
                sourceLinks: '来源链接',
                temporalExecutionLink: '打开 Temporal 执行链路',
                noInput: '暂无输入内容',
                noStructuredResult: '暂无结构化结果',
                noResultOutput: '暂无执行结果输出',
              }}
            />
          </div>
        </div>
      </Space>
    </ExecutionDetailSectionCard>
  );
};

export default ExecutionInputOutputCard;
