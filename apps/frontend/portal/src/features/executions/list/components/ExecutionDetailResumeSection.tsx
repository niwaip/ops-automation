import React from "react";
import {
  Alert,
  Button,
  Form,
  FormInstance,
  Space,
  Tag,
  Typography,
} from "antd";
import { PlayCircleOutlined, RobotOutlined } from "@ant-design/icons";
import { ExecutionDto, ExecutionStepDto } from "@/api/execution";
import { RECOVERY_COPY } from "@/features/executions/shared/recoveryOptions";
import {
  renderRequiredInputField,
  type RequiredInputField,
} from "@/features/executions/create/inputFields";
import {
  resolveWaitingInputDisplayLabel,
  type WaitingInputDisplayGroup,
} from "@/shared/lib/waitingInputDisplay";
import { UseMutationResult } from "react-query";

const { Text } = Typography;

interface ExecutionDetailResumeSectionProps {
  execution: ExecutionDto;
  waitingInputStep?: ExecutionStepDto;
  requiredInputs: RequiredInputField[];
  requiredInputGroups: WaitingInputDisplayGroup<RequiredInputField>[];
  resumeForm: FormInstance;
  submitInputMutation: UseMutationResult<unknown, Error, { payload: Record<string, unknown> }, unknown>;
  handleResumeExecution: (openInAi: boolean) => Promise<void>;
}

export const ExecutionDetailResumeSection: React.FC<ExecutionDetailResumeSectionProps> = ({
  requiredInputs,
  requiredInputGroups,
  resumeForm,
  submitInputMutation,
  handleResumeExecution,
}) => {
  return (
    <>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message={RECOVERY_COPY.waitingInputTitle}
        description={RECOVERY_COPY.waitingInputDesc}
      />
      <Form form={resumeForm} layout="vertical">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {requiredInputGroups.length > 0
            ? requiredInputGroups.map((group) => (
                <div
                  key={group.label}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid var(--bg-secondary)",
                    background: "var(--bg-card)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <Text
                    strong
                    style={{ display: "block", marginBottom: 12 }}
                  >
                    {group.label}
                  </Text>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {group.items.map((field) => (
                      <div
                        key={field.name}
                        style={{
                          padding: 14,
                          borderRadius: 12,
                          border: "1px solid var(--bg-secondary)",
                          background: "var(--bg-primary)",
                        }}
                      >
                        <Space
                          size={[6, 6]}
                          wrap
                          style={{ marginBottom: 8 }}
                        >
                          <Text strong>
                            {resolveWaitingInputDisplayLabel(field)}
                          </Text>
                          <Tag style={{ marginInlineEnd: 0 }}>
                            {field.type}
                          </Tag>
                          <Tag
                            color={field.required ? "error" : "default"}
                            style={{ marginInlineEnd: 0 }}
                          >
                            {field.required ? "必填" : "可选"}
                          </Tag>
                          {field.needs_confirmation ? (
                            <Tag
                              color="gold"
                              style={{ marginInlineEnd: 0 }}
                            >
                              待确认
                            </Tag>
                          ) : null}
                        </Space>
                        <Text
                          type="secondary"
                          style={{
                            display: "block",
                            fontSize: 12,
                            minHeight: 36,
                            marginBottom: 10,
                          }}
                        >
                          {field.description || `来源: ${field.source}`}
                        </Text>
                        <Form.Item
                          name={field.name}
                          style={{ marginBottom: 8 }}
                          rules={[
                            {
                              required: field.required,
                              message: `请输入 ${resolveWaitingInputDisplayLabel(field)}`,
                            },
                          ]}
                          valuePropName={
                            field.type.toLowerCase() === "boolean"
                              ? "checked"
                              : "value"
                          }
                        >
                          {renderRequiredInputField(field, {
                            treatArrayAsJson: true,
                          })}
                        </Form.Item>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          来源: {field.source}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            : requiredInputs.map((field) => (
                <div
                  key={field.name}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid var(--bg-secondary)",
                    background: "var(--bg-card)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <Space size={[6, 6]} wrap style={{ marginBottom: 8 }}>
                    <Text strong>
                      {resolveWaitingInputDisplayLabel(field)}
                    </Text>
                    <Tag style={{ marginInlineEnd: 0 }}>{field.type}</Tag>
                    <Tag
                      color={field.required ? "error" : "default"}
                      style={{ marginInlineEnd: 0 }}
                    >
                      {field.required ? "必填" : "可选"}
                    </Tag>
                    {field.needs_confirmation ? (
                      <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                        待确认
                      </Tag>
                    ) : null}
                  </Space>
                  <Text
                    type="secondary"
                    style={{
                      display: "block",
                      fontSize: 12,
                      minHeight: 36,
                      marginBottom: 10,
                    }}
                  >
                    {field.description || `来源: ${field.source}`}
                  </Text>
                  <Form.Item
                    name={field.name}
                    style={{ marginBottom: 8 }}
                    rules={[
                      {
                        required: field.required,
                        message: `请输入 ${resolveWaitingInputDisplayLabel(field)}`,
                      },
                    ]}
                    valuePropName={
                      field.type.toLowerCase() === "boolean"
                        ? "checked"
                        : "value"
                    }
                  >
                    {renderRequiredInputField(field, {
                      treatArrayAsJson: true,
                    })}
                  </Form.Item>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    来源: {field.source}
                  </Text>
                </div>
              ))}
        </div>
        <Space wrap>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={submitInputMutation.isLoading}
            onClick={() => void handleResumeExecution(false)}
          >
            {RECOVERY_COPY.waitingInputContinue}
          </Button>
          <Button
            icon={<RobotOutlined />}
            loading={submitInputMutation.isLoading}
            onClick={() => void handleResumeExecution(true)}
          >
            {RECOVERY_COPY.waitingInputToAi}
          </Button>
        </Space>
      </Form>
    </>
  );
};
