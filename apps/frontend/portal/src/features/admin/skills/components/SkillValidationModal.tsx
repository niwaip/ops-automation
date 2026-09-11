import React from 'react';
import {
  Modal,
  Button,
  Space,
  Typography,
  Steps,
  Progress,
  Card,
  Descriptions,
  Tag,
  Divider,
} from 'antd';
import {
  RocketOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { SkillConfigDTO, SkillValidationResult } from '@/api/skill';
import { VALIDATION_PHASES, ValidationProgressMeta } from '../utils/skillHelpers';

const { Text } = Typography;

interface SkillValidationModalProps {
  open: boolean;
  selectedSkill: SkillConfigDTO | null;
  validatingSkillId: string | null;
  validationResult: SkillValidationResult | null;
  validationLogs: string[];
  validationStage: string;
  validationProgressMeta: ValidationProgressMeta;
  validationAnimatedDots: string;
  onClose: () => void;
  onApplySuggestion: () => void;
  applyLoading?: boolean;
}

export const SkillValidationModal: React.FC<SkillValidationModalProps> = ({
  open,
  selectedSkill,
  validatingSkillId,
  validationResult,
  validationLogs,
  validationStage,
  validationProgressMeta,
  validationAnimatedDots,
  onClose,
  onApplySuggestion,
  applyLoading = false,
}) => {
  if (!selectedSkill && !validatingSkillId) return null;

  return (
    <Modal
      title={`验证结果 - ${selectedSkill?.name || ''}`}
      open={open}
      onCancel={onClose}
      footer={[
        validationResult?.details?.skillSimulation?.generatedSkill && (
          <Button
            key="apply-suggestion"
            type="primary"
            onClick={onApplySuggestion}
            loading={applyLoading}
          >
            应用建议
          </Button>
        ),
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]}
      width={700}
    >
      {validatingSkillId && !validationResult && (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Space direction="vertical" size="large">
            <RocketOutlined
              spin
              style={{ fontSize: 48, color: 'var(--primary-color)' }}
            />
            <Text strong style={{ fontSize: 16 }}>
              正在验证{validationAnimatedDots}
            </Text>
            <Text type="secondary">当前阶段：{validationStage}</Text>
            <div style={{ width: 520, maxWidth: '100%' }}>
              <Steps
                size="small"
                current={validationProgressMeta.current}
                items={VALIDATION_PHASES.map((title, index) => ({
                  title,
                  status:
                    index < validationProgressMeta.current
                      ? 'finish'
                      : index === validationProgressMeta.current
                        ? 'process'
                        : 'wait',
                }))}
              />
              <Progress
                percent={validationProgressMeta.percent}
                status={validationProgressMeta.status}
                showInfo={false}
                strokeColor="var(--primary-color)"
                style={{ marginTop: 16, marginBottom: 8 }}
              />
              <Text type="secondary">
                正在执行真实代码验证与 AI 审计，日志会持续刷新
              </Text>
            </div>
            <Text type="secondary">
              AI正在分析 Skill 配置并执行真实模拟，可能需要 1-3 分钟
            </Text>
          </Space>
        </div>
      )}

      {validationLogs.length > 0 && (
        <Card
          size="small"
          title={
            validatingSkillId ? `实时日志 - ${validationStage}` : '执行日志'
          }
          style={{ marginBottom: validationResult ? 16 : 0 }}
        >
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 240,
              overflow: 'auto',
            }}
          >
            {validationLogs.join('\n')}
          </pre>
        </Card>
      )}

      {/* Results */}
      {validationResult && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* Overall Result */}
          <Card>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space>
                {validationResult.isValid ? (
                  <CheckCircleOutlined
                    style={{ fontSize: 32, color: 'var(--success-color)' }}
                  />
                ) : (
                  <ExclamationCircleOutlined
                    style={{ fontSize: 32, color: 'var(--error-color)' }}
                  />
                )}
                <Text strong style={{ fontSize: 18 }}>
                  {validationResult.isValid ? '验证通过' : '验证失败'}
                </Text>
              </Space>
              <Tag color={validationResult.isValid ? 'success' : 'error'}>
                得分: {validationResult.score}/100
              </Tag>
            </Space>
          </Card>

          {/* Config Analysis */}
          {validationResult.details?.configAnalysis && (
            <Card title="配置分析" size="small">
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="触发关键词">
                  <Tag
                    color={
                      validationResult.details.configAnalysis.hasTriggerKeywords
                        ? 'success'
                        : 'error'
                    }
                  >
                    {validationResult.details.configAnalysis.hasTriggerKeywords
                      ? '已配置'
                      : '缺失'}
                  </Tag>
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    质量:{' '}
                    {validationResult.details.configAnalysis.triggerKeywordQuality}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="参数Schema">
                  <Tag
                    color={
                      validationResult.details.configAnalysis.hasParamsSchema
                        ? 'success'
                        : 'error'
                    }
                  >
                    {validationResult.details.configAnalysis.hasParamsSchema
                      ? '已配置'
                      : '缺失'}
                  </Tag>
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    完整度:{' '}
                    {
                      validationResult.details.configAnalysis
                        .paramsSchemaCompleteness
                    }
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="文档模板">
                  <Tag
                    color={
                      validationResult.details.configAnalysis.hasTemplate
                        ? 'success'
                        : 'warning'
                    }
                  >
                    {validationResult.details.configAnalysis.hasTemplate
                      ? '已配置'
                      : '未配置'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="流程模板">
                  <Tag
                    color={
                      validationResult.details.configAnalysis.hasFlowTemplate
                        ? 'success'
                        : 'warning'
                    }
                  >
                    {validationResult.details.configAnalysis.hasFlowTemplate
                      ? '已关联'
                      : '未关联'}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}

          {/* Skill Simulation */}
          {validationResult.details?.skillSimulation && (
            <Card title="整体技能模拟验证" size="small">
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="模拟请求">
                    {validationResult.details.skillSimulation.simulatedRequest}
                  </Descriptions.Item>
                  <Descriptions.Item label="验证得分">
                    <Tag
                      color={
                        validationResult.details.skillSimulation.validationScore >=
                        80
                          ? 'success'
                          : validationResult.details.skillSimulation
                                .validationScore >= 60
                            ? 'warning'
                            : 'error'
                      }
                    >
                      {
                        validationResult.details.skillSimulation.validationScore
                      }%
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="模拟结果">
                    <Tag
                      color={
                        validationResult.details.skillSimulation.success
                          ? 'success'
                          : 'error'
                      }
                    >
                      {validationResult.details.skillSimulation.success
                        ? '通过'
                        : '失败'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="ReAct迭代">
                    {validationResult.details.skillSimulation.iterations ?? 0}
                  </Descriptions.Item>
                  <Descriptions.Item label="总结" span={2}>
                    {validationResult.details.skillSimulation.summary}
                  </Descriptions.Item>
                </Descriptions>

                {validationResult.details.skillSimulation.log &&
                  validationResult.details.skillSimulation.log.length > 0 && (
                    <>
                      <Divider style={{ margin: '8px 0' }} />
                      <Text strong>ReAct 执行日志</Text>
                      <Card size="small">
                        <pre
                          style={{
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: 240,
                            overflow: 'auto',
                          }}
                        >
                          {validationResult.details.skillSimulation.log.join(
                            '\n'
                          )}
                        </pre>
                      </Card>
                    </>
                  )}

                {validationResult.details.skillSimulation.generatedSkill && (
                  <>
                    <Divider style={{ margin: '8px 0' }} />
                    <Text strong>标准 Skill 预览</Text>
                    <Card size="small">
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {JSON.stringify(
                          validationResult.details.skillSimulation
                            .generatedSkill,
                          null,
                          2
                        )}
                      </pre>
                    </Card>
                  </>
                )}
              </Space>
            </Card>
          )}

          {/* Warnings and Suggestions */}
          {validationResult.warnings.length > 0 && (
            <Card title="警告" size="small">
              <Space direction="vertical" size="small">
                {validationResult.warnings.map((w, idx) => (
                  <Text key={idx} type="warning">
                    ⚠️ {w}
                  </Text>
                ))}
              </Space>
            </Card>
          )}
          {validationResult.suggestions.length > 0 && (
            <Card title="建议" size="small">
              <Space direction="vertical" size="small">
                {validationResult.suggestions.map((s, idx) => (
                  <Text key={idx} type="secondary">
                    💡 {s}
                  </Text>
                ))}
              </Space>
            </Card>
          )}
        </Space>
      )}
    </Modal>
  );
};
