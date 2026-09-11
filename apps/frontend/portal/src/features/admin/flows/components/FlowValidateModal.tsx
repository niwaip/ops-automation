import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Collapse,
  Input,
  Modal,
  Progress,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useMutation, useQueryClient } from "react-query";
import {
  ExecutionFlowTemplateDTO,
  ValidationResult,
  executionFlowApi,
} from "@/api/flows";
import {
  ValidationStage,
  buildDefaultTestUserInput,
  extractErrorMessage,
  extractValidationErrorDetail,
} from "./flowHelpers";

const { Text } = Typography;
const { TextArea } = Input;
const { Panel } = Collapse;

interface FlowValidateModalProps {
  open: boolean;
  selectedTemplate: ExecutionFlowTemplateDTO | null;
  onClose: () => void;
  onApplyAdjustmentSuccess?: (updatedTemplate: ExecutionFlowTemplateDTO) => void;
}

export const FlowValidateModal: React.FC<FlowValidateModalProps> = ({
  open,
  selectedTemplate,
  onClose,
  onApplyAdjustmentSuccess,
}) => {
  const queryClient = useQueryClient();
  const [enableExecutionTest, setEnableExecutionTest] = useState(false);
  const [testParamsJson, setTestParamsJson] = useState("");
  const [testUserInput, setTestUserInput] = useState("");
  const [validationStage, setValidationStage] = useState<ValidationStage>("idle");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationErrorTitle, setValidationErrorTitle] = useState<string | null>(null);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const validationStageTimersRef = useRef<number[]>([]);

  function clearValidationStageTimers() {
    validationStageTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    validationStageTimersRef.current = [];
  }

  useEffect(() => {
    if (!open || !selectedTemplate) {
      clearValidationStageTimers();
      setValidationStage("idle");
      return;
    }

    setValidationResult(selectedTemplate.validation || null);
    setValidationError(null);
    setValidationErrorTitle(null);
    setEnableExecutionTest(false);
    clearValidationStageTimers();
    setValidationStage("idle");

    try {
      const paramsSchema = selectedTemplate.paramsSchema as Record<string, any>;
      const sampleParams: Record<string, any> = {};
      if (paramsSchema && paramsSchema.properties) {
        Object.entries(paramsSchema.properties).forEach(([key, prop]: [string, any]) => {
          if (prop.type === "string") sampleParams[key] = prop.default || "示例值";
          else if (prop.type === "number") sampleParams[key] = prop.default || 0;
          else if (prop.type === "boolean") sampleParams[key] = prop.default || false;
        });
        setTestParamsJson(JSON.stringify(sampleParams, null, 2));
      } else {
        setTestParamsJson("");
      }
      setTestUserInput(buildDefaultTestUserInput(selectedTemplate, sampleParams));
    } catch {
      setTestParamsJson("");
      setTestUserInput(buildDefaultTestUserInput(selectedTemplate, {}));
    }
  }, [open, selectedTemplate]);

  function beginValidationProgress(withExecutionTest: boolean) {
    clearValidationStageTimers();
    setExecutionLogs([]);
    setValidationStage("auditing");

    const auditLogs = [
      "正在连接 AI 审计引擎...",
      "正在解析流程拓扑结构...",
      "正在检查参数引用完整性...",
      "正在评估原子能力边界...",
      "正在生成优化建议...",
    ];

    auditLogs.forEach((msg, i) => {
      const timerId = window.setTimeout(() => {
        setExecutionLogs((prev) => [...prev, `[Audit] ${msg}`]);
      }, i * 400);
      validationStageTimersRef.current.push(timerId);
    });

    if (withExecutionTest) {
      const timerId = window.setTimeout(() => {
        setValidationStage("executing");
        setExecutionLogs((prev) => [...prev, "[System] 静态审计完成，开始真实验证测试..."]);

        const execLogs = [
          "正在初始化 ReAct 引擎...",
          "正在加载 flow_execute 工具...",
          "正在构造模拟用户请求...",
          "正在观察步骤 1 执行结果...",
          "正在匹配后续步骤...",
          "正在验证最终输出格式...",
        ];

        execLogs.forEach((msg, i) => {
          const tId = window.setTimeout(
            () => {
              setExecutionLogs((prev) => [...prev, `[Execution] ${msg}`]);
            },
            2000 + i * 800
          );
          validationStageTimersRef.current.push(tId);
        });
      }, 2000);
      validationStageTimersRef.current.push(timerId);
    }
  }

  const validateMutation = useMutation(
    (params: {
      id: string;
      enableExecutionTest?: boolean;
      testParams?: Record<string, any>;
      testUserInput?: string;
    }) =>
      executionFlowApi.validate(params.id, {
        enableExecutionTest: params.enableExecutionTest,
        testParams: params.testParams,
        testUserInput: params.testUserInput,
      }),
    {
      onSuccess: (result) => {
        setValidationResult(result.validationResult);
        setValidationError(null);
        setValidationErrorTitle(null);
        queryClient.invalidateQueries(["flows"]);
        clearValidationStageTimers();
        setValidationStage("idle");
        message.success("验证完成");
      },
      onError: (error: any) => {
        const errorDetail = extractValidationErrorDetail(error);
        const errorMessage = extractErrorMessage(error);
        clearValidationStageTimers();
        setValidationStage("idle");
        setValidationResult(null);
        setValidationErrorTitle(errorDetail.title);
        setValidationError(errorDetail.description);
        setExecutionLogs((prev) => [...prev, `[Error] ${errorMessage}`]);
        message.error(errorMessage);
      },
    }
  );

  const applyAdjustmentMutation = useMutation(executionFlowApi.applyAdjustment, {
    onSuccess: (updatedTemplate) => {
      queryClient.invalidateQueries(["flows"]);
      message.success("已应用AI优化建议");
      onClose();
      if (onApplyAdjustmentSuccess) {
        onApplyAdjustmentSuccess(updatedTemplate);
      }
    },
    onError: () => {
      message.error("应用建议失败");
    },
  });

  const handleRunValidation = () => {
    if (!selectedTemplate) return;
    let testParams: Record<string, any> | undefined = undefined;
    if (enableExecutionTest && testParamsJson) {
      try {
        testParams = JSON.parse(testParamsJson);
      } catch {
        message.error("测试参数JSON格式错误");
        return;
      }
    }
    if (enableExecutionTest && !testUserInput.trim()) {
      message.error("请输入模拟用户输入，用于真实 AI 执行测试");
      return;
    }
    setValidationResult(null);
    setValidationError(null);
    setValidationErrorTitle(null);
    beginValidationProgress(enableExecutionTest);
    validateMutation.mutate({
      id: selectedTemplate.id,
      enableExecutionTest,
      testParams,
      testUserInput: enableExecutionTest ? testUserInput.trim() : undefined,
    });
  };

  const handleApplyAdjustment = () => {
    if (selectedTemplate && validationResult?.details?.autoAdjustment) {
      Modal.confirm({
        title: "应用AI优化建议",
        content: "将用AI生成的优化方案替换当前的步骤配置，是否继续？",
        onOk: () => applyAdjustmentMutation.mutate(selectedTemplate.id),
      });
    }
  };

  return (
    <Modal
      title={`AI 验证工作流组合 - ${selectedTemplate?.name}`}
      open={open}
      onCancel={() => {
        clearValidationStageTimers();
        onClose();
      }}
      maskClosable={false}
      footer={[
        <Button
          key="revalidate"
          type="default"
          icon={<PlayCircleOutlined />}
          loading={validateMutation.isLoading}
          onClick={handleRunValidation}
          style={{ marginRight: 8 }}
        >
          {validationResult ? "重新验证" : "开始验证"}
        </Button>,
        validationResult?.details?.autoAdjustment && (
          <Button
            key="apply"
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={applyAdjustmentMutation.isLoading}
            onClick={handleApplyAdjustment}
            style={{ marginRight: 8 }}
          >
            应用建议
          </Button>
        ),
        <Button
          key="close"
          onClick={() => {
            clearValidationStageTimers();
            onClose();
          }}
        >
          关闭
        </Button>,
      ]}
      width={700}
    >
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Space>
            <Switch
              checked={enableExecutionTest}
              onChange={setEnableExecutionTest}
              checkedChildren="执行测试"
              unCheckedChildren="仅静态分析"
            />
            <Tooltip title="启用后将通过ReAct引擎实际执行流程，测试每个步骤是否可正常运行">
              <InfoCircleOutlined />
            </Tooltip>
          </Space>
          {enableExecutionTest && (
            <>
              <Alert
                type="info"
                showIcon
                message="执行测试说明"
                description="执行测试会真实调用 AI，以“模拟用户输入 + 结构化参数”的方式验证该流程是否能稳定完成一个原子能力，而不是自动扩展成完整业务流程。"
              />
              <TextArea
                value={testUserInput}
                onChange={(e) => setTestUserInput(e.target.value)}
                placeholder="模拟用户输入，例如：请帮我查询这个订单的最新状态"
                rows={3}
              />
              <TextArea
                value={testParamsJson}
                onChange={(e) => setTestParamsJson(e.target.value)}
                placeholder="测试参数JSON（用于填充流程中的变量）"
                rows={4}
              />
            </>
          )}
        </Space>
      </Card>

      {validateMutation.isLoading ? (
        <Space direction="vertical" style={{ width: "100%", textAlign: "center" }}>
          <Steps
            size="small"
            direction="vertical"
            current={enableExecutionTest && validationStage === "executing" ? 1 : 0}
            items={
              enableExecutionTest
                ? [
                    {
                      title: "AI 审计流程结构",
                      description: "检查原子能力边界、参数闭合与确定性",
                    },
                    {
                      title: "AI 模拟用户执行",
                      description: "基于模拟用户输入调用 flow_execute 做真实验证",
                    },
                  ]
                : [
                    {
                      title: "AI 审计流程结构",
                      description: "检查原子能力边界、参数闭合与自动优化建议",
                    },
                  ]
            }
          />
          <div
            style={{
              margin: "20px 0",
              padding: "12px",
              backgroundColor: "var(--bg-secondary)",
              borderRadius: "4px",
              textAlign: "left",
              maxHeight: "200px",
              overflowY: "auto",
              border: "1px solid var(--border-color)",
            }}
          >
            <div
              style={{
                fontWeight: "bold",
                marginBottom: "8px",
                borderBottom: "1px solid var(--border-color)",
                paddingBottom: "4px",
                color: "var(--text-primary)",
              }}
            >
              实时验证日志
            </div>
            {executionLogs.map((log, index) => (
              <div
                key={index}
                style={{
                  fontSize: "12px",
                  fontFamily: "monospace",
                  marginBottom: "4px",
                  color: log.startsWith("[Error]")
                    ? "#ff4d4f"
                    : log.startsWith("[Audit]")
                      ? "#1890ff"
                      : log.startsWith("[Execution]")
                        ? "#52c41a"
                        : "var(--text-secondary)",
                }}
              >
                {log}
              </div>
            ))}
            <div style={{ textAlign: "center", marginTop: "8px" }}>
              <Progress percent={100} status="active" showInfo={false} size="small" />
            </div>
          </div>
          <Text strong>
            {enableExecutionTest && validationStage === "executing"
              ? "正在模拟用户输入并执行原子能力测试..."
              : "正在进行AI深度审计..."}
          </Text>
          <Text type="secondary">（这可能需要几秒到几十秒）</Text>
        </Space>
      ) : validationResult ? (
        <Space direction="vertical" style={{ width: "100%" }}>
          <Alert
            type={validationResult.isValid ? "success" : "error"}
            message={validationResult.isValid ? "验证通过" : "验证失败"}
            icon={validationResult.isValid ? <CheckCircleOutlined /> : <WarningOutlined />}
            showIcon
          />
          <Progress
            percent={validationResult.score || 0}
            status={validationResult.isValid ? "success" : "exception"}
            format={(percent) => `${percent}分`}
          />
          {validationResult.warnings && validationResult.warnings.length > 0 && (
            <Alert
              type="warning"
              message="警告"
              description={
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {validationResult.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              }
            />
          )}
          {validationResult.suggestions?.length > 0 && (
            <Alert
              type="info"
              message="优化建议"
              description={
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {validationResult.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              }
            />
          )}
          {validationResult.details?.executionTest && (
            <Collapse ghost>
              <Panel
                header={`执行测试结果 (${validationResult.details.executionTest.success ? "成功" : "失败"}, ${validationResult.details.executionTest.iterations}次迭代)`}
                key="execution"
              >
                {validationResult.details.executionTest.success ? (
                  <Alert
                    type="success"
                    message="执行成功"
                    description={validationResult.details.executionTest.result?.slice(0, 500)}
                  />
                ) : (
                  <Alert
                    type="error"
                    message="执行失败"
                    description={validationResult.details.executionTest.error}
                  />
                )}
                {validationResult.details.executionTest.log?.length > 0 && (
                  <Timeline style={{ marginTop: 16 }}>
                    {validationResult.details.executionTest.log.slice(0, 20).map((log, i) => (
                      <Timeline.Item
                        key={i}
                        color={
                          log.startsWith("[Thought]")
                            ? "blue"
                            : log.startsWith("[Action]")
                              ? "green"
                              : log.startsWith("[Observation]")
                                ? "gray"
                                : log.startsWith("[Error]")
                                  ? "red"
                                  : "blue"
                        }
                      >
                        <Text style={{ fontSize: 12 }}>{log}</Text>
                      </Timeline.Item>
                    ))}
                  </Timeline>
                )}
              </Panel>
            </Collapse>
          )}
          {validationResult.details?.stepAnalysis && (
            <Collapse ghost>
              <Panel header="步骤分析详情" key="details">
                <Table
                  size="small"
                  dataSource={validationResult.details.stepAnalysis}
                  columns={[
                    { title: "步骤", dataIndex: "stepName", key: "stepName" },
                    {
                      title: "可执行",
                      dataIndex: "isExecutable",
                      key: "isExecutable",
                      render: (v: boolean) => (
                        <Tag color={v ? "green" : "red"}>{v ? "是" : "否"}</Tag>
                      ),
                    },
                    {
                      title: "建议",
                      dataIndex: "suggestion",
                      key: "suggestion",
                      render: (v: string) => v || "-",
                    },
                  ]}
                  pagination={false}
                />
              </Panel>
            </Collapse>
          )}
        </Space>
      ) : validationError ? (
        <Space direction="vertical" style={{ width: "100%" }}>
          <Alert
            type="error"
            showIcon
            message={validationErrorTitle || "验证失败"}
            description={validationError}
          />
          {executionLogs.length > 0 && (
            <Collapse ghost defaultActiveKey={["error-log"]}>
              <Panel header="失败日志" key="error-log">
                <Timeline>
                  {executionLogs.map((log, index) => (
                    <Timeline.Item key={index} color={log.startsWith("[Error]") ? "red" : "blue"}>
                      <Text style={{ fontSize: 12 }}>{log}</Text>
                    </Timeline.Item>
                  ))}
                </Timeline>
              </Panel>
            </Collapse>
          )}
          <Alert
            type="info"
            showIcon
            message="你可以直接修改参数后重新验证"
            description="当前弹窗会保持打开，方便查看失败原因并继续重试。"
          />
        </Space>
      ) : (
        <Alert
          type="info"
          showIcon
          message="验证尚未开始"
          description="打开验证面板后不会自动执行。请先确认是否启用执行测试，再点击“开始验证”。"
        />
      )}
    </Modal>
  );
};
