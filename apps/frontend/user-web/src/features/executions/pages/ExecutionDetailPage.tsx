import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Card, Space, Spin, Table, Tag, Typography } from "antd";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import {
  buildWaitingInputDisplayGroups,
  EXECUTION_ACTIVE_POLLING_STATUSES,
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
  resolveWaitingInputDisplayLabel,
  type ExecutionPhaseDto,
  type ExecutionStepDto,
} from "@ops/user-core";
import { executionApi } from "../../../api";
import { JsonPreview } from "../components/JsonPreview";

interface RequiredInputField {
  name: string;
  type: string;
  description?: string;
  display_name?: string;
  group_label?: string;
  value?: unknown;
}

export function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  const waitingInputStep = execution.status === "waiting_input"
    ? steps?.find((step) => step.id === execution.currentStepId || (step.type === "input_collection" && step.status === "running"))
    : undefined;
  const requiredInputs = Array.isArray(waitingInputStep?.inputJson?.requiredInputs)
    ? waitingInputStep.inputJson.requiredInputs as RequiredInputField[]
    : [];
  const requiredInputGroups = buildWaitingInputDisplayGroups(requiredInputs);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/executions")}>返回列表</Button>
        <Typography.Title level={3} style={{ margin: 0 }}>执行详情</Typography.Title>
      </Space>
      <Card>
        <Table
          pagination={false}
          showHeader={false}
          dataSource={[
            { key: "id", label: "ID", value: execution.id },
            { key: "status", label: "状态", value: <Tag color={EXECUTION_STATUS_COLORS[execution.status]}>{EXECUTION_STATUS_LABELS_ZH[execution.status]}</Tag> },
            { key: "skill", label: "技能", value: execution.skillId },
            { key: "runtime", label: "运行时", value: execution.runtimeType || "-" },
            { key: "failure", label: "失败原因", value: execution.failureReason || "-" },
          ]}
          columns={[
            { title: "字段", dataIndex: "label", key: "label", width: 120 },
            { title: "值", dataIndex: "value", key: "value" },
          ]}
          rowKey="key"
        />
      </Card>
      {requiredInputs.length > 0 ? (
        <Card title="待补输入">
          <Typography.Paragraph type="secondary">
            展示规则来自 user-core，说明待补字段和业务分组已从 portal 页面逻辑中分离。
          </Typography.Paragraph>
          {(requiredInputGroups.length > 0 ? requiredInputGroups : [{ label: "待补字段", items: requiredInputs }]).map((group) => (
            <Card key={group.label} size="small" title={group.label} style={{ marginBottom: 12 }}>
              <Space direction="vertical" style={{ width: "100%" }}>
                {group.items.map((field) => (
                  <div key={field.name}>
                    <Typography.Text strong>{resolveWaitingInputDisplayLabel(field)}</Typography.Text>
                    <div><Typography.Text type="secondary">{field.description || field.type}</Typography.Text></div>
                    <JsonPreview value={field.value} />
                  </div>
                ))}
              </Space>
            </Card>
          ))}
        </Card>
      ) : null}
      <Card title="输入"><JsonPreview value={execution.input || execution.normalizedInput || {}} /></Card>
      <Card title="结果"><JsonPreview value={execution.resultJson || execution.result || {}} /></Card>
      <Card title="步骤">
        <Table<ExecutionStepDto>
          rowKey="id"
          dataSource={steps || []}
          pagination={false}
          columns={[
            { title: "序号", dataIndex: "stepIndex", key: "stepIndex", render: (value: number) => value + 1 },
            { title: "名称", dataIndex: "name", key: "name" },
            { title: "动作", dataIndex: "action", key: "action", render: (value?: string) => value || "-" },
            { title: "状态", dataIndex: "status", key: "status" },
          ]}
        />
      </Card>
      <Card title="阶段">
        <Table<ExecutionPhaseDto>
          rowKey="id"
          dataSource={phases || []}
          pagination={false}
          columns={[
            { title: "阶段", dataIndex: "phaseName", key: "phaseName", render: (value: string, record) => value || record.phaseKey },
            { title: "类型", dataIndex: "phaseType", key: "phaseType" },
            { title: "状态", dataIndex: "status", key: "status" },
            { title: "尝试次数", dataIndex: "attempt", key: "attempt" },
          ]}
        />
      </Card>
    </Space>
  );
}
