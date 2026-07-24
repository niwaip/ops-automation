import React from 'react';
import { Form, Select, Alert, Input } from 'antd';
import type {
  StructuredTransformStepConfig,
  StructuredTransformContentType,
  StructuredTransformOutputMode,
} from '../utils/workflowEditHelpers';

export interface WorkflowStructuredTransformStepConfigPanelProps {
  selectedStepIndexForConfig: number | null;
  selectedStepActivity?: any;
  selectedStep?: any;
  selectedStepStructuredTransformConfig: StructuredTransformStepConfig;
  updateStepStructuredTransformConfig: (
    stepIndex: number,
    patch: Partial<StructuredTransformStepConfig>
  ) => void;
  renderTipLabel: (title: string, tooltip: string) => React.ReactNode;
  TWO_COLUMN_GRID_STYLE: React.CSSProperties;
}

export const WorkflowStructuredTransformStepConfigPanel: React.FC<
  WorkflowStructuredTransformStepConfigPanelProps
> = ({
  selectedStepIndexForConfig,
  selectedStepActivity,
  selectedStep,
  selectedStepStructuredTransformConfig,
  updateStepStructuredTransformConfig,
  renderTipLabel,
  TWO_COLUMN_GRID_STYLE,
}) => {
  if (selectedStepIndexForConfig === null) return null;

  const isAiStructuredTransform =
    selectedStepActivity?.fn === 'aiStructuredTransform' ||
    selectedStep?.activityRef === 'builtin:aiStructuredTransform' ||
    selectedStep?.activityName === 'aiStructuredTransform';

  return (
    <>
      <div
        style={{
          ...TWO_COLUMN_GRID_STYLE,
          gridTemplateColumns: '140px minmax(0, 1fr)',
        }}
      >
        <Form.Item
          label={renderTipLabel(
            '输入内容类型',
            '指定输入内容主要是什么类型，帮助结构化转换器理解内容。'
          )}
          style={{ marginBottom: 10 }}
        >
          <Select
            size="middle"
            value={selectedStepStructuredTransformConfig.contentType || 'text'}
            onChange={(value) =>
              updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
                contentType: value as StructuredTransformContentType,
              })
            }
            options={[
              { label: '纯文本', value: 'text' },
              { label: 'HTML', value: 'html' },
              { label: 'JSON', value: 'json' },
            ]}
          />
        </Form.Item>
        <Form.Item
          label={renderTipLabel(
            '输出模式',
            '控制结构化转换结果最终返回 JSON 还是纯文本。'
          )}
          style={{ marginBottom: 10 }}
        >
          <Select
            size="middle"
            value={selectedStepStructuredTransformConfig.outputMode || 'json'}
            onChange={(value) =>
              updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
                outputMode: value as StructuredTransformOutputMode,
              })
            }
            options={[
              { label: 'JSON', value: 'json' },
              { label: '文本', value: 'text' },
            ]}
          />
        </Form.Item>
      </div>

      <Alert
        type={isAiStructuredTransform ? 'warning' : 'info'}
        showIcon
        style={{ marginBottom: 10 }}
        message={
          isAiStructuredTransform
            ? '当前为 AI 结构化转换：适合归纳、摘要、模糊理解。'
            : '当前为固定规则结构化转换：默认优先使用字段映射和文本模版，不调用 AI。'
        }
      />

      <Form.Item
        label={renderTipLabel(
          '内容模版',
          '输入待处理内容，可填固定文本或 {html}/{payload} 这类占位符。'
        )}
        style={{ marginBottom: 10 }}
      >
        <Input.TextArea
          rows={5}
          value={selectedStepStructuredTransformConfig.contentTemplate || ''}
          onChange={(e) =>
            updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
              contentTemplate: e.target.value,
            })
          }
          placeholder="例如：{html}"
        />
      </Form.Item>

      <Form.Item
        label={renderTipLabel(
          '处理规则',
          isAiStructuredTransform
            ? 'AI 转换时必须提供清晰规则，说明如何提取、清洗、映射字段，以及如何组织返回结果。'
            : '固定规则模式下该字段可作为备注说明，真正执行优先依赖字段映射和文本模版。'
        )}
        style={{ marginBottom: 10 }}
      >
        <Input.TextArea
          rows={4}
          value={selectedStepStructuredTransformConfig.instructionTemplate || ''}
          onChange={(e) =>
            updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
              instructionTemplate: e.target.value,
            })
          }
          placeholder="例如：从 html 中提取最新新闻列表，包含 title/url/publishTime"
        />
      </Form.Item>
    </>
  );
};
