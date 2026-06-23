import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input, List, Modal, Radio, Space, Typography, message } from 'antd';
import { useMutation } from 'react-query';
import {
  branchAnalysisApi,
  type BranchStepSpec,
} from '@/features/recorder/lib/branch-analysis.api';

const { Text, Paragraph } = Typography;

interface BranchGateModalProps {
  open: boolean;
  runtimeSessionId?: string;
  onCancel: () => void;
  onConfirm: (spec: BranchStepSpec) => void;
}

const BranchGateModal: React.FC<BranchGateModalProps> = ({
  open,
  runtimeSessionId,
  onCancel,
  onConfirm,
}) => {
  const [userIntent, setUserIntent] = useState('');
  const [onMismatch, setOnMismatch] = useState<'takeover' | 'stop' | 'continue'>('takeover');
  const [generatedSpec, setGeneratedSpec] = useState<BranchStepSpec | null>(null);
  const [analysisSource, setAnalysisSource] = useState<'llm' | 'fallback'>();
  const [pageSummary, setPageSummary] = useState<string>('');
  const previewItems: Array<{ label: string; value: string }> = generatedSpec
    ? [
        { label: '读取选择器', value: generatedSpec.readSelectors.join(' | ') || 'body' },
        { label: '读取方式', value: generatedSpec.readMethod },
        { label: '变量名', value: generatedSpec.outputVar },
        { label: '命中后', value: generatedSpec.onMatch },
        { label: '未命中后', value: generatedSpec.onMismatch },
        { label: '接管原因', value: generatedSpec.takeoverReason },
      ]
    : [];

  useEffect(() => {
    if (!open) {
      setUserIntent('');
      setOnMismatch('takeover');
      setGeneratedSpec(null);
      setAnalysisSource(undefined);
      setPageSummary('');
    }
  }, [open]);

  const analyzeMutation = useMutation(branchAnalysisApi.analyze, {
    onSuccess: (data) => {
      setGeneratedSpec(data.branchStepSpec);
      setAnalysisSource(data.analysisSource);
      setPageSummary(
        [data.pageContext?.pageTitle, data.pageContext?.pageUrl].filter(Boolean).join(' | ')
      );
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : '条件分析失败';
      void message.error(errorMessage);
    },
  });

  const confirmDisabled = !generatedSpec;
  const analyzeDisabled = !runtimeSessionId || !userIntent.trim();
  const mismatchOptions = useMemo(
    () => [
      { label: '人工接管', value: 'takeover' as const },
      { label: '停止执行', value: 'stop' as const },
      { label: '继续执行', value: 'continue' as const },
    ],
    []
  );

  const handleAnalyze = () => {
    if (!runtimeSessionId) {
      void message.warning('当前没有可用的浏览器会话，请先启动录制或执行页面操作');
      return;
    }
    if (!userIntent.trim()) {
      void message.warning('请先描述要判断的条件');
      return;
    }
    analyzeMutation.mutate({
      runtimeSessionId,
      userIntent: userIntent.trim(),
      onMismatch,
    });
  };

  return (
    <Modal
      title="插入条件分歧"
      open={open}
      onCancel={onCancel}
      width={720}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button
          key="confirm"
          type="primary"
          disabled={confirmDisabled}
          onClick={() => {
            if (generatedSpec) {
              onConfirm(generatedSpec);
            }
          }}
        >
          插入步骤
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {!runtimeSessionId ? (
          <Alert
            type="warning"
            showIcon
            message="当前没有活跃浏览器会话"
            description="先执行一次页面操作或打开录制会话，再生成条件分歧。"
          />
        ) : null}
        <div>
          <Text strong>判断意图</Text>
          <Input.TextArea
            value={userIntent}
            onChange={(event) => setUserIntent(event.target.value)}
            placeholder="例如：如果页面出现“验证码错误”就转人工，否则继续下一步"
            autoSize={{ minRows: 3, maxRows: 6 }}
            style={{ marginTop: 8 }}
          />
        </div>
        <div>
          <Text strong>条件不满足时</Text>
          <div style={{ marginTop: 8 }}>
            <Radio.Group
              value={onMismatch}
              onChange={(event) => setOnMismatch(event.target.value)}
              options={mismatchOptions}
              optionType="button"
              buttonStyle="solid"
            />
          </div>
        </div>
        <Button
          type="primary"
          onClick={handleAnalyze}
          loading={analyzeMutation.isLoading}
          disabled={analyzeDisabled}
        >
          AI 生成条件步骤
        </Button>
        {generatedSpec ? (
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            <Alert
              type={analysisSource === 'fallback' ? 'warning' : 'info'}
              showIcon
              message={analysisSource === 'fallback' ? '使用回退规则生成' : '使用模型生成'}
              description={pageSummary || '已根据当前页面生成条件分歧步骤'}
            />
            <div>
              <Text strong>生成结果预览</Text>
              <List<{ label: string; value: string }>
                size="small"
                bordered
                style={{ marginTop: 8 }}
                dataSource={previewItems}
                renderItem={(item) => (
                  <List.Item>
                    <Text style={{ minWidth: 92 }}>{item.label}</Text>
                    <Text code>{item.value}</Text>
                  </List.Item>
                )}
              />
            </div>
            <div>
              <Text strong>描述</Text>
              <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                {generatedSpec.description}
              </Paragraph>
            </div>
            <div>
              <Text strong>条件函数</Text>
              <pre
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  padding: 12,
                  borderRadius: 8,
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontSize: 12,
                  overflowX: 'auto',
                }}
              >
                {generatedSpec.conditionFn}
              </pre>
            </div>
          </Space>
        ) : null}
      </Space>
    </Modal>
  );
};

export default BranchGateModal;
