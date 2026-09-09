import {
  Card,
  Collapse,
  Descriptions,
  Space,
  Tag,
  Typography,
  Tooltip,
  Button,
  message,
} from "antd";
import { CopyOutlined, DownloadOutlined } from "@ant-design/icons";
import { ExecutionDto } from "@/api/execution";
import { resolveExecutionNormalizedResult } from "@ops/user-core";
import { extractExecutionDownloadUrl } from "@ops/user-core";
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from "@/shared/lib/executionStatusMeta";
import { formatDateTime, formatDuration } from "@/features/executions/list/listView";
import { replaceLocalhostWithCurrentHost } from "@/shared/lib/publicUrl";
import { ExpandableMarkdownContent } from "@/features/executions/shared/components/ExpandableMarkdownContent";
import {
  detailPanelStyle,
  renderPanelLabel,
  renderExecutionPayloadContent,
} from "./executionDetailDrawerHelpers";

const { Text } = Typography;
const statusColors = EXECUTION_STATUS_COLORS;
const statusLabels = EXECUTION_STATUS_LABELS_ZH;

interface ExecutionDetailSummarySectionProps {
  execution: ExecutionDto;
  skillDisplayName: string;
  isSelectedBrowserExecution: boolean;
  selectedExecutionInput: unknown;
  selectedExecutionNormalizedResult?: ReturnType<typeof resolveExecutionNormalizedResult>;
  effectiveSelectedResultJson: unknown;
}

export const ExecutionDetailSummarySection: React.FC<ExecutionDetailSummarySectionProps> = ({
  execution,
  skillDisplayName,
  isSelectedBrowserExecution,
  selectedExecutionInput,
  selectedExecutionNormalizedResult,
  effectiveSelectedResultJson,
}) => {
  return (
    <>
      <Collapse
        ghost
        defaultActiveKey={["summary"]}
        expandIconPosition="end"
        items={[
          {
            key: "summary",
            label: renderPanelLabel(
              "基本信息",
              `${skillDisplayName} / ${statusLabels[execution.status]}`
            ),
            extra: (
              <Tooltip title="复制调试信息 (执行 ID & 状态)">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    const debugData = {
                      id: execution.id,
                      status: execution.status,
                      riskLevel: execution.riskLevel,
                      skillId: execution.skillId,
                      skillName: skillDisplayName,
                      startedAt: execution.startedAt || execution.createdAt,
                      endedAt: execution.endedAt,
                      failureReason: execution.failureReason,
                    };
                    void navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
                    void message.success("已复制执行调试信息 (JSON)");
                  }}
                  style={{ color: "var(--text-secondary)" }}
                >
                  复制
                </Button>
              </Tooltip>
            ),
            style: detailPanelStyle,
            children: (
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="ID">
                  <Text copyable={{ text: execution.id }}>{execution.id}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={statusColors[execution.status]}>
                    {statusLabels[execution.status]}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="风险">
                  {execution.riskLevel || "-"}
                </Descriptions.Item>
                <Descriptions.Item label="技能">
                  <Space direction="vertical" size={2}>
                    <Text strong>{skillDisplayName}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {execution.skillId}
                    </Text>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="运行时">
                  <Space direction="vertical" size={2}>
                    <Text>{execution.runtimeType || "default"}</Text>
                    {execution.runtimeSessionId ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {`Session: ${execution.runtimeSessionId}`}
                      </Text>
                    ) : null}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="时间">
                  <Space direction="vertical" size={2}>
                    <Text>{`创建: ${formatDateTime(execution.createdAt)}`}</Text>
                    <Text>{`开始: ${formatDateTime(execution.startedAt)}`}</Text>
                    <Text>{`结束: ${formatDateTime(execution.endedAt)}`}</Text>
                    <Text type="secondary">{`耗时: ${formatDuration(execution)}`}</Text>
                  </Space>
                </Descriptions.Item>
                {execution.currentPhaseKey ? (
                  <Descriptions.Item label="当前阶段">
                    <Tag>{execution.currentPhaseKey}</Tag>
                  </Descriptions.Item>
                ) : null}
                {execution.failureReason ? (
                  <Descriptions.Item label="失败原因">
                    <Text type="danger">{execution.failureReason}</Text>
                  </Descriptions.Item>
                ) : null}
                {execution.takeoverReason ? (
                  <Descriptions.Item label="接管原因">
                    <Text type="warning">{execution.takeoverReason}</Text>
                  </Descriptions.Item>
                ) : null}
                {extractExecutionDownloadUrl(execution) ? (
                  <Descriptions.Item label="文件下载">
                    {extractExecutionDownloadUrl(execution) ? (
                      <Button
                        type="link"
                        size="small"
                        icon={<DownloadOutlined />}
                        href={replaceLocalhostWithCurrentHost(
                          extractExecutionDownloadUrl(execution)
                        )}
                        target="_blank"
                        rel="noreferrer"
                        style={{ padding: 0 }}
                      >
                        下载结果
                      </Button>
                    ) : (
                      "-"
                    )}
                  </Descriptions.Item>
                ) : null}
              </Descriptions>
            ),
          },
        ]}
      />

      {!isSelectedBrowserExecution ? (
        <Card title="输入与输出">
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div>
              <Text strong>输入：</Text>
              <div style={{ marginTop: 8 }}>
                {renderExecutionPayloadContent(selectedExecutionInput, {
                  emptyText: "该执行暂无输入内容。",
                })}
              </div>
            </div>
            <div>
              <Text strong>结果：</Text>
              <div style={{ marginTop: 8 }}>
                {selectedExecutionNormalizedResult?.hasBusinessResult ? (
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    {selectedExecutionNormalizedResult.title ? (
                      <Space wrap size={[8, 8]}>
                        <Text strong>{selectedExecutionNormalizedResult.title}</Text>
                        {selectedExecutionNormalizedResult.resultType ? (
                          <Tag>{selectedExecutionNormalizedResult.resultType}</Tag>
                        ) : null}
                      </Space>
                    ) : null}
                    {selectedExecutionNormalizedResult.summary ||
                    selectedExecutionNormalizedResult.body ? (
                      <div style={{ marginTop: 4 }}>
                        <ExpandableMarkdownContent
                          text={
                            selectedExecutionNormalizedResult.summary ||
                            selectedExecutionNormalizedResult.body ||
                            ""
                          }
                        />
                      </div>
                    ) : null}
                    {selectedExecutionNormalizedResult.artifacts.length > 0 ? (
                      <Space wrap>
                        {selectedExecutionNormalizedResult.artifacts.map(
                          (artifact, index) => {
                            const href = replaceLocalhostWithCurrentHost(
                              artifact.downloadUrl || artifact.url
                            );
                            if (!href) {
                              return null;
                            }
                            return (
                              <Button
                                key={`${artifact.name || artifact.url || index}`}
                                type="default"
                                size="small"
                                icon={<DownloadOutlined />}
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {artifact.name || "下载产物"}
                              </Button>
                            );
                          }
                        )}
                      </Space>
                    ) : null}
                  </Space>
                ) : (
                  renderExecutionPayloadContent(effectiveSelectedResultJson, {
                    emptyText: "该执行暂无结果输出。",
                    treatSingleResultFieldAsMarkdown: true,
                  })
                )}
              </div>
            </div>
          </Space>
        </Card>
      ) : null}
    </>
  );
};
