import React from "react";
import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  Empty,
  Modal,
  Progress,
  Space,
  Steps,
  Tag,
  Typography,
} from "antd";
import { CheckCircleOutlined, ThunderboltOutlined } from "@ant-design/icons";
import {
  EXECUTION_FLOW_CATEGORIES,
  ExecutionFlowStep,
  ExecutionFlowTemplateDTO,
} from "@/api/flows";
import { renderStepTypeBadge } from "./flowHelpers";

const { Text } = Typography;
const { Panel } = Collapse;

interface FlowDetailModalProps {
  open: boolean;
  selectedTemplate: ExecutionFlowTemplateDTO | null;
  onClose: () => void;
  onOpenValidate?: (template: ExecutionFlowTemplateDTO) => void;
}

export const FlowDetailModal: React.FC<FlowDetailModalProps> = ({
  open,
  selectedTemplate,
  onClose,
  onOpenValidate,
}) => {
  return (
    <Modal
      title={`工作流组合详情 - ${selectedTemplate?.name}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
    >
      {selectedTemplate && (
        <Collapse defaultActiveKey={["basic", "steps", "validation"]}>
          <Panel header="基本信息" key="basic">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="组合ID">{selectedTemplate.id}</Descriptions.Item>
              <Descriptions.Item label="分类">
                <Tag color={EXECUTION_FLOW_CATEGORIES[selectedTemplate.category]?.color}>
                  {EXECUTION_FLOW_CATEGORIES[selectedTemplate.category]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>
                {selectedTemplate.description}
              </Descriptions.Item>
              <Descriptions.Item label="使用次数">
                {selectedTemplate.usageCount}
              </Descriptions.Item>
              <Descriptions.Item label="公开状态">
                {selectedTemplate.isPublic ? "公开" : "私有"}
              </Descriptions.Item>
            </Descriptions>
          </Panel>

          <Panel header="执行步骤" key="steps">
            <Steps
              current={-1}
              direction="vertical"
              items={
                selectedTemplate.steps?.map((step: ExecutionFlowStep, idx: number) => ({
                  title: step.name,
                  description: (
                    <Space direction="vertical" size="small">
                      {renderStepTypeBadge(step.type)}
                      {step.type === "text" && <Text>{step.content}</Text>}
                      {step.type === "script" && (
                        <Text code>
                          {step.script?.language}: {step.script?.code?.slice(0, 50)}...
                        </Text>
                      )}
                      {step.type === "tool" && <Text>工具: {step.tool?.name}</Text>}
                      {step.type === "api" && (
                        <Text>
                          API: {step.api?.method} {step.api?.endpoint}
                        </Text>
                      )}
                      {step.expectedOutput && (
                        <Text type="secondary">预期输出: {step.expectedOutput}</Text>
                      )}
                    </Space>
                  ),
                  status: "wait",
                  icon: idx === 0 ? <ThunderboltOutlined /> : undefined,
                })) || []
              }
            />
          </Panel>

          <Panel header="验证结果" key="validation">
            {selectedTemplate.validation ? (
              <Space direction="vertical" style={{ width: "100%" }}>
                <Progress
                  percent={selectedTemplate.validation.score || 0}
                  status={selectedTemplate.validation.isValid ? "success" : "exception"}
                  format={(percent) => `${percent}分`}
                />
                {selectedTemplate.validation.warnings &&
                  selectedTemplate.validation.warnings.length > 0 && (
                    <Alert
                      type="warning"
                      message="警告"
                      description={
                        <ul>
                          {selectedTemplate.validation.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      }
                    />
                  )}
                {selectedTemplate.validation.suggestions?.length > 0 && (
                  <Alert
                    type="info"
                    message="优化建议"
                    description={
                      <ul>
                        {selectedTemplate.validation.suggestions.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    }
                  />
                )}
                {selectedTemplate.validation.details?.aiCritique && (
                  <Alert
                    type="info"
                    message="AI 审计详情"
                    description={selectedTemplate.validation.details.aiCritique}
                  />
                )}
                {selectedTemplate.validation.details?.autoAdjustment && onOpenValidate && (
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => {
                      onClose();
                      onOpenValidate(selectedTemplate);
                    }}
                  >
                    查看并应用AI优化建议
                  </Button>
                )}
                <Text type="secondary">
                  验证时间: {new Date(selectedTemplate.validation.validatedAt).toLocaleString()}
                </Text>
              </Space>
            ) : (
              <Empty description="尚未验证" />
            )}
          </Panel>
        </Collapse>
      )}
    </Modal>
  );
};
