import { ArrowLeftOutlined } from "@ant-design/icons";
import { App, Button, Card, Form, Input, InputNumber, Space, Spin, Switch, Table, Tag, Typography } from "antd";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  buildExecutionDetailActionCard,
  buildExecutionDetailPhaseRows,
  buildExecutionDetailStepRows,
  buildExecutionDetailSummaryRows,
  buildExecutionWaitingInputInitialValues,
  buildExecutionWaitingInputGroups,
  getExecutionWaitingInputStep,
  getExecutionWaitingInputFields,
  isBooleanInputType,
  isJsonLikeInputType,
  isNumericInputType,
  normalizeExecutionWaitingInputValues,
  resolveExecutionInputPayload,
  resolveExecutionNormalizedResult,
  resolveExecutionResultPayload,
  EXECUTION_ACTIVE_POLLING_STATUSES,
  resolveWaitingInputDisplayLabel,
  type ExecutionDetailPhaseRow,
  type ExecutionDetailStepRow,
  type ExecutionDetailActionButton,
  type RequiredInputField,
  type WorkflowResultArtifact,
} from "@ops/user-core";
import { executionApi } from "../../../api";
import { JsonPreview } from "../components/JsonPreview";

function renderRequiredInputField(field: RequiredInputField) {
  if (isNumericInputType(field.type)) {
    return <InputNumber style={{ width: "100%" }} placeholder={`请输入 ${field.name}`} />;
  }
  if (isBooleanInputType(field.type)) {
    return <Switch />;
  }
  if (isJsonLikeInputType(field.type)) {
    return <Input.TextArea rows={4} placeholder="请输入 JSON 字符串" />;
  }
  return <Input placeholder={field.description || `请输入 ${field.name}`} />;
}

function renderResultArtifacts(artifacts?: WorkflowResultArtifact[]) {
  if (!artifacts || artifacts.length === 0) {
    return null;
  }

  return (
    <Space wrap>
      {artifacts.map((artifact, index) => {
        const href = artifact.downloadUrl || artifact.url;
        if (!href) {
          return null;
        }
        return (
          <Button
            key={`${href}-${index}`}
            type="link"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ paddingInline: 0 }}
          >
            {artifact.label || artifact.name || `结果产物 ${index + 1}`}
          </Button>
        );
      })}
    </Space>
  );
}

export function ExecutionDetailPage() {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const { data: execution, isLoading, error } = useQuery(
    ["user-web-execution", id],
    () => executionApi.getById(id!),
    {
      enabled: Boolean(id),
      refetchInterval: (current) => current && EXECUTION_ACTIVE_POLLING_STATUSES.includes(current.status) ? 3000 : false,
    },
  );
  const { data: steps } = useQuery(["user-web-execution-steps", id], () => executionApi.getSteps(id!), {
    enabled: Boolean(id),
  });
  const { data: phases } = useQuery(["user-web-execution-phases", id], () => executionApi.getPhases(id!), {
    enabled: Boolean(id),
  });

  if (isLoading) {
    return <Spin />;
  }

  if (error || !execution) {
    return <Card><Typography.Text type="danger">{error instanceof Error ? error.message : "执行详情加载失败"}</Typography.Text></Card>;
  }

  const requiredInputs = getExecutionWaitingInputFields(execution, steps);
  const waitingInputStep = getExecutionWaitingInputStep(execution, steps);
  const requiredInputGroups = buildExecutionWaitingInputGroups(execution, steps);
  const summaryRows = buildExecutionDetailSummaryRows(execution);
  const actionCard = buildExecutionDetailActionCard(execution);
  const stepRows = buildExecutionDetailStepRows(steps);
  const phaseRows = buildExecutionDetailPhaseRows(phases);
  const normalizedResult = resolveExecutionNormalizedResult(execution);
  const resultPreviewValue =
    normalizedResult?.structuredData
    ?? normalizedResult?.envelope
    ?? resolveExecutionResultPayload(execution);
  const primaryResultText =
    normalizedResult?.detailText
    || normalizedResult?.summary
    || normalizedResult?.body;
  const shouldShowStructuredResult = Boolean(
    resultPreviewValue !== undefined
    && resultPreviewValue !== null
    && (
      normalizedResult?.envelope?.presentation?.preferStructuredView
      || normalizedResult?.structuredData !== undefined
      || !primaryResultText
    ),
  );
  const refreshExecutionQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries(["user-web-execution", id]),
      queryClient.invalidateQueries(["user-web-execution-steps", id]),
      queryClient.invalidateQueries(["user-web-execution-phases", id]),
      queryClient.invalidateQueries(["user-web-executions"]),
      queryClient.invalidateQueries(["user-web-notifications"]),
    ]);
  };
  const submitInputMutation = useMutation(
    async (values: Record<string, unknown>) => {
      if (!id || !waitingInputStep) {
        throw new Error("当前没有可提交的待补输入步骤");
      }
      const normalizedInput = normalizeExecutionWaitingInputValues(values, requiredInputs);
      return executionApi.submitInput(id, {
        stepId: waitingInputStep.id,
        input: normalizedInput,
      });
    },
    {
      onSuccess: async () => {
        void message.success("输入已提交，执行已恢复");
        await refreshExecutionQueries();
      },
      onError: (mutationError) => {
        void message.error(mutationError instanceof Error ? mutationError.message : "提交输入失败");
      },
    },
  );
  const approveMutation = useMutation(
    async () => {
      if (!id) {
        throw new Error("缺少执行 ID");
      }
      return executionApi.approve(id);
    },
    {
      onSuccess: async () => {
        void message.success("执行已批准");
        await refreshExecutionQueries();
      },
      onError: (mutationError) => {
        void message.error(mutationError instanceof Error ? mutationError.message : "批准执行失败");
      },
    },
  );
  const rejectMutation = useMutation(
    async () => {
      if (!id) {
        throw new Error("缺少执行 ID");
      }
      return executionApi.reject(id);
    },
    {
      onSuccess: async () => {
        void message.success("执行已拒绝");
        await refreshExecutionQueries();
      },
      onError: (mutationError) => {
        void message.error(mutationError instanceof Error ? mutationError.message : "拒绝执行失败");
      },
    },
  );
  const releaseHumanControlMutation = useMutation(
    async () => {
      if (!id) {
        throw new Error("缺少执行 ID");
      }
      return executionApi.releaseHumanControl(id);
    },
    {
      onSuccess: async () => {
        void message.success("已恢复自动执行");
        await refreshExecutionQueries();
      },
      onError: (mutationError) => {
        void message.error(mutationError instanceof Error ? mutationError.message : "恢复自动执行失败");
      },
    },
  );

  useEffect(() => {
    form.setFieldsValue({
      input: buildExecutionWaitingInputInitialValues(requiredInputs),
    });
  }, [form, requiredInputs]);

  const renderActionButton = (button: ExecutionDetailActionButton) => {
    if (button.action === "approve") {
      return (
        <Button
          key={button.key}
          type={button.type}
          danger={button.danger}
          onClick={() => void approveMutation.mutateAsync()}
          loading={approveMutation.isLoading}
          disabled={rejectMutation.isLoading}
        >
          {button.label}
        </Button>
      );
    }

    if (button.action === "reject") {
      return (
        <Button
          key={button.key}
          type={button.type}
          danger={button.danger}
          onClick={() => void rejectMutation.mutateAsync()}
          loading={rejectMutation.isLoading}
          disabled={approveMutation.isLoading}
        >
          {button.label}
        </Button>
      );
    }

    return (
      <Button
        key={button.key}
        type={button.type}
        danger={button.danger}
        onClick={() => void releaseHumanControlMutation.mutateAsync()}
        loading={releaseHumanControlMutation.isLoading}
      >
        {button.label}
      </Button>
    );
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/executions")}>返回列表</Button>
        <Typography.Title level={3} style={{ margin: 0 }}>执行详情</Typography.Title>
      </Space>
      {actionCard ? (
        <Card title={actionCard.title}>
          <Typography.Paragraph type="secondary">
            {actionCard.description}
          </Typography.Paragraph>
          {actionCard.note ? (
            <Typography.Paragraph>
              <Typography.Text strong>{actionCard.note}</Typography.Text>
            </Typography.Paragraph>
          ) : null}
          <Space>
            {actionCard.buttons.map((button) => renderActionButton(button))}
          </Space>
        </Card>
      ) : null}
      <Card>
        <Table
          pagination={false}
          showHeader={false}
          dataSource={summaryRows}
          columns={[
            { title: "字段", dataIndex: "label", key: "label", width: 120 },
            {
              title: "值",
              dataIndex: "value",
              key: "value",
              render: (_, record) => record.status
                ? <Tag color={record.status.color}>{record.status.label}</Tag>
                : record.value,
            },
          ]}
          rowKey="key"
        />
      </Card>
      {requiredInputs.length > 0 ? (
        <Card title="待补输入">
          <Typography.Paragraph type="secondary">
            展示规则来自 user-core，表单渲染和提交由 user-web 承接，当前页面可以直接补充输入并恢复执行。
          </Typography.Paragraph>
          <Form
            form={form}
            layout="vertical"
            onFinish={(values: { input?: Record<string, unknown> }) => {
              submitInputMutation.mutate(values.input || {});
            }}
          >
            {(requiredInputGroups.length > 0 ? requiredInputGroups : [{ label: "待补字段", items: requiredInputs }]).map((group) => (
              <Card key={group.label} size="small" title={group.label} style={{ marginBottom: 12 }}>
                <Space direction="vertical" style={{ width: "100%" }} size={16}>
                  {group.items.map((field) => (
                    <div key={field.name}>
                      <Form.Item
                        label={resolveWaitingInputDisplayLabel(field)}
                        name={["input", field.name]}
                        valuePropName={isBooleanInputType(field.type) ? "checked" : "value"}
                        extra={`${field.description || field.type}${field.value !== undefined ? " | 已有默认值" : ""}`}
                        rules={[{ required: true, message: `请填写 ${resolveWaitingInputDisplayLabel(field)}` }]}
                      >
                        {renderRequiredInputField(field)}
                      </Form.Item>
                      {field.value !== undefined ? (
                        <div style={{ marginTop: -8, marginBottom: 12 }}>
                          <Typography.Text type="secondary">当前建议值</Typography.Text>
                          <JsonPreview value={field.value} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </Space>
              </Card>
            ))}
            <Space>
              <Button onClick={() => form.setFieldsValue({ input: buildExecutionWaitingInputInitialValues(requiredInputs) })}>
                重置
              </Button>
              <Button type="primary" htmlType="submit" loading={submitInputMutation.isLoading} disabled={!waitingInputStep}>
                提交并恢复执行
              </Button>
            </Space>
          </Form>
        </Card>
      ) : null}
      <Card title="输入"><JsonPreview value={resolveExecutionInputPayload(execution)} /></Card>
      <Card title="结果">
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {normalizedResult?.title ? (
            <div>
              <Typography.Text strong>{normalizedResult.title}</Typography.Text>
              {normalizedResult.resultType ? (
                <Tag style={{ marginLeft: 8 }}>{normalizedResult.resultType}</Tag>
              ) : null}
            </div>
          ) : null}
          {primaryResultText ? (
            <Typography.Paragraph
              style={{
                marginBottom: 0,
                whiteSpace: "pre-wrap",
                lineHeight: 1.7,
              }}
            >
              {primaryResultText}
            </Typography.Paragraph>
          ) : null}
          {renderResultArtifacts(normalizedResult?.artifacts)}
          {normalizedResult?.temporalLink ? (
            <Button
              type="link"
              href={normalizedResult.temporalLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ paddingInline: 0, width: "fit-content" }}
            >
              查看 Temporal 执行链路
            </Button>
          ) : null}
          {shouldShowStructuredResult ? (
            <JsonPreview value={resultPreviewValue} />
          ) : null}
        </Space>
      </Card>
      <Card title="步骤">
        <Table<ExecutionDetailStepRow>
          rowKey="id"
          dataSource={stepRows}
          pagination={false}
          columns={[
            { title: "序号", dataIndex: "stepIndexLabel", key: "stepIndexLabel" },
            { title: "名称", dataIndex: "name", key: "name" },
            { title: "动作", dataIndex: "action", key: "action" },
            {
              title: "状态",
              dataIndex: "status",
              key: "status",
              render: (status: string) => status,
            },
          ]}
        />
      </Card>
      <Card title="阶段">
        <Table<ExecutionDetailPhaseRow>
          rowKey="id"
          dataSource={phaseRows}
          pagination={false}
          columns={[
            { title: "阶段", dataIndex: "phaseName", key: "phaseName" },
            { title: "类型", dataIndex: "phaseType", key: "phaseType" },
            { title: "状态", dataIndex: "status", key: "status" },
            { title: "尝试次数", dataIndex: "attempt", key: "attempt" },
          ]}
        />
      </Card>
    </Space>
  );
}
