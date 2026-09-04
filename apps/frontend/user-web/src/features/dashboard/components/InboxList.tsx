import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  FolderOutlined,
  InboxOutlined,
  LoadingOutlined,
  MailOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Empty,
  Input,
  List,
  Popconfirm,
  Radio,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useNavigate } from "react-router-dom";
import type { WorkbenchInboxItem } from "../../../api/workbenchInbox";
import { formatMonthDayTime } from "../../../shared/utils/dateText";
import styles from "../pages/DashboardPage.module.css";

interface InboxListProps {
  inboxItems: WorkbenchInboxItem[];
  inboxFilter: "all" | "unprocessed" | "clarified" | "converted";
  inboxSummary: {
    total: number;
    unprocessed: number;
    clarified: number;
    converted: number;
    archived: number;
  };
  inboxDraft: string;
  clarifyingIds: Record<string, boolean>;
  isSyncingEmail?: boolean;
  onFilterChange: (filter: "all" | "unprocessed" | "clarified" | "converted") => void;
  onDraftChange: (draft: string) => void;
  onQuickIngest: () => void;
  onSyncEmail?: () => void;
  onClarifyItem: (item: WorkbenchInboxItem) => void;
  onConvertToTodo: (id: string) => void;
  onArchiveItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
}

export function InboxList({
  inboxItems,
  inboxFilter,
  inboxSummary,
  inboxDraft,
  clarifyingIds,
  isSyncingEmail,
  onFilterChange,
  onDraftChange,
  onQuickIngest,
  onSyncEmail,
  onClarifyItem,
  onConvertToTodo,
  onArchiveItem,
  onDeleteItem,
}: InboxListProps) {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCollectClick = () => {
    if (!inboxDraft.trim()) {
      // 1. 输入框抖动闪烁提示几下
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);

      // 2. 输入框下方红字显示 3 秒钟
      setErrorMessage("请先输入要收集的内容，再点击收集到收件箱");
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setErrorMessage(null);
      }, 3000);
      return;
    }

    setErrorMessage(null);
    onQuickIngest();
  };

  const handleDraftChange = (val: string) => {
    if (errorMessage && val.trim()) {
      setErrorMessage(null);
    }
    onDraftChange(val);
  };

  const renderSourceTag = (sourceType: string) => {
    switch (sourceType) {
      case "chat":
        return <Tag color="cyan">AI 对话</Tag>;
      case "email":
        return <Tag color="gold">邮件</Tag>;
      case "schedule":
        return <Tag color="geekblue">定时任务</Tag>;
      case "im_channel":
        return <Tag color="purple">IM 消息</Tag>;
      case "workflow":
        return <Tag color="blue">工作流异常</Tag>;
      default:
        return <Tag color="default">手动收集</Tag>;
    }
  };

  const renderConfidenceTag = (item: WorkbenchInboxItem) => {
    const extra = (item.extra || item.unifiedPayload?.extra || {}) as Record<string, any>;
    const isIntervention = Boolean(
      extra.requiresHumanIntervention || item.title?.includes("需人工介入")
    );
    if (isIntervention) {
      return (
        <Tag color="error" icon={<EyeOutlined />}>
          需人工介入
        </Tag>
      );
    }

    const score = Math.round(item.confidence * 100);
    if (score >= 75) {
      return <Tag color="success">置信度 {score}% · 要素完整</Tag>;
    }
    return (
      <Tag color="warning" icon={<RobotOutlined />}>
        置信度 {score}% · 建议 AI 整理
      </Tag>
    );
  };

  const renderStatusTag = (status: string) => {
    switch (status) {
      case "unprocessed":
        return <Tag color="processing">未整理</Tag>;
      case "clarified":
        return <Tag color="cyan">已AI厘清</Tag>;
      case "converted":
        return (
          <Tag color="default" icon={<CheckCircleOutlined style={{ color: "#52c41a" }} />}>
            已转待办
          </Tag>
        );
      case "archived":
        return <Tag color="default">已归档</Tag>;
      default:
        return null;
    }
  };

  return (
    <div className={styles["workbench-card-content-stack"]}>
      {/* 快速收集输入框与定时同步按钮 */}
      <div className={styles["workbench-todo-form"]}>
        <Input.TextArea
          className={isShaking ? styles["inbox-input-shake"] : undefined}
          status={errorMessage ? "error" : undefined}
          value={inboxDraft}
          placeholder="快速收集灵感、邮件要点或外部任务至收件箱（支持多行录入，后续统一整理）..."
          onChange={(e) => handleDraftChange(e.target.value)}
          autoSize={{ minRows: 2, maxRows: 4 }}
        />
        {errorMessage ? (
          <div className={styles["inbox-error-message"]}>
            <ExclamationCircleOutlined />
            <span>{errorMessage}</span>
          </div>
        ) : null}
        <div className={styles["workbench-todo-form-actions"]}>
          <Tooltip title="将上方文本框中输入的便签或要点保存入 GTD 收件箱">
            <Button
              type="primary"
              className={`${styles["workbench-action-button"]} ${styles["workbench-todo-toolbar-button"]} ${styles["is-create"]}`}
              icon={<InboxOutlined />}
              onClick={handleCollectClick}
            >
              收集到收件箱
            </Button>
          </Tooltip>
          {onSyncEmail ? (
            <Tooltip title="执行工作流：从已绑定的邮箱拉取未读邮件并沉淀入 GTD 收件箱">
              <Button
                className={`${styles["workbench-action-button"]} ${styles["workbench-todo-toolbar-button"]} ${styles["is-ai"]}`}
                icon={isSyncingEmail ? <LoadingOutlined spin /> : <MailOutlined />}
                onClick={onSyncEmail}
                loading={isSyncingEmail}
              >
                收取邮件
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {/* 状态筛选 Radio */}
      <Radio.Group
        value={inboxFilter}
        onChange={(e) => onFilterChange(e.target.value)}
        size="small"
        buttonStyle="solid"
      >
        <Radio.Button value="all">全部 ({inboxSummary.total})</Radio.Button>
        <Radio.Button value="unprocessed">
          待整理 ({inboxSummary.unprocessed})
        </Radio.Button>
        <Radio.Button value="clarified">
          已厘清 ({inboxSummary.clarified})
        </Radio.Button>
        <Radio.Button value="converted">
          已转待办 ({inboxSummary.converted})
        </Radio.Button>
      </Radio.Group>

      {/* 收件箱条目列表 (可滚动区域) */}
      <div className={styles["workbench-card-scroll-area"]}>
        {inboxItems.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="收件箱暂无此状态条目 (Inbox Zero)"
          />
        ) : (
          <List
          dataSource={inboxItems}
          renderItem={(item) => {
            const isClarifying = clarifyingIds[item.id];
            const isConverted = item.status === "converted";
            const clarification = item.aiClarification;
            const actionItem = clarification?.actionItem;
            const extra = (item.extra || item.unifiedPayload?.extra || {}) as Record<string, any>;
            const isIntervention = Boolean(extra.requiresHumanIntervention || item.title?.includes("需人工介入"));

            return (
              <List.Item key={item.id} style={{ padding: "8px 0", border: "none" }}>
                <div
                  className={styles["workbench-todo-item"]}
                  style={{
                    width: "100%",
                    opacity: isConverted ? 0.72 : 1,
                    borderLeft: isIntervention
                      ? "3px solid #ff4d4f"
                      : item.confidence < 0.75
                      ? "3px solid #faad14"
                      : "3px solid #1677ff",
                  }}
                >
                  <Space direction="vertical" size={10} style={{ width: "100%" }}>
                    <div
                      className={styles["workbench-todo-row"]}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <Space wrap size={6}>
                          {renderStatusTag(item.status)}
                          {renderSourceTag(item.sourceType)}
                          {renderConfidenceTag(item)}
                          <Typography.Text strong style={{ fontSize: 14 }}>
                            {item.title}
                          </Typography.Text>
                        </Space>

                        <Typography.Paragraph
                          type="secondary"
                          ellipsis={{ rows: 2, expandable: true, symbol: "展开" }}
                          style={{ margin: "6px 0 0", fontSize: 12, whiteSpace: "pre-line" }}
                        >
                          {item.rawContent}
                        </Typography.Paragraph>
                      </div>

                      {/* 右侧动作按钮 */}
                      <Space size={4}>
                        {isIntervention && extra.actionUrl ? (
                          <Button
                            size="small"
                            type="primary"
                            danger
                            icon={<EyeOutlined />}
                            onClick={() => navigate(extra.actionUrl)}
                          >
                            前往处理
                          </Button>
                        ) : null}

                        {!isConverted ? (
                          <>
                            <Tooltip title="使用大模型对内容进行 5W1H 深度厘清并推断优先级/工作流">
                              <Button
                                size="small"
                                icon={isClarifying ? <LoadingOutlined spin /> : <RobotOutlined />}
                                onClick={() => onClarifyItem(item)}
                                disabled={isClarifying}
                                className={styles["workbench-action-button"]}
                              >
                                {item.status === "clarified" ? "重新整理" : "AI 智能整理"}
                              </Button>
                            </Tooltip>

                            <Tooltip title="转为正式待办，进入行动看板排期执行">
                              <Button
                                size="small"
                                type="primary"
                                icon={<ArrowRightOutlined />}
                                onClick={() => onConvertToTodo(item.id)}
                              >
                                转为待办
                              </Button>
                            </Tooltip>

                            <Tooltip title="归档此条目">
                              <Button
                                size="small"
                                icon={<FolderOutlined />}
                                onClick={() => onArchiveItem(item.id)}
                              />
                            </Tooltip>
                          </>
                        ) : null}

                        <Popconfirm
                          title="确定删除此条目吗？"
                          onConfirm={() => onDeleteItem(item.id)}
                          okText="删除"
                          cancelText="取消"
                        >
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Space>
                    </div>

                    {/* AI 智能提炼卡片（若已厘清） */}
                    {clarification ? (
                      <Card
                        size="small"
                        style={{
                          background: "rgba(22, 119, 255, 0.04)",
                          borderColor: "rgba(22, 119, 255, 0.2)",
                          borderRadius: 8,
                        }}
                        styles={{ body: { padding: "8px 12px" } }}
                      >
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                          <Space wrap size={8}>
                            <Tag color="blue" icon={<RobotOutlined />}>AI 提炼建议</Tag>
                            {actionItem?.priority ? (
                              <Tag color={actionItem.priority === "high" ? "warning" : "default"}>
                                优先级: {actionItem.priority}
                              </Tag>
                            ) : null}
                            {actionItem?.dueDate ? (
                              <Tag icon={<ClockCircleOutlined />}>截止: {actionItem.dueDate}</Tag>
                            ) : null}
                            {actionItem?.suggestedWorkflowName ? (
                              <Tag color="purple" icon={<ThunderboltOutlined />}>
                                推荐工作流: {actionItem.suggestedWorkflowName}
                              </Tag>
                            ) : null}
                          </Space>
                          {clarification.refinementNotes ? (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {clarification.refinementNotes}
                            </Typography.Text>
                          ) : null}
                        </Space>
                      </Card>
                    ) : null}

                    {/* 底部元信息 */}
                    <div className={styles["workbench-todo-meta"]}>
                      <Space size={8} wrap>
                        <Tag bordered={false}>
                          收集于 {formatMonthDayTime(item.createdAt)}
                        </Tag>
                        {item.sourceSender ? (
                          <Tag bordered={false}>来源方: {item.sourceSender}</Tag>
                        ) : null}
                        {item.sourceTitle ? (
                          <Tag bordered={false}>主题: {item.sourceTitle}</Tag>
                        ) : null}
                      </Space>
                    </div>
                  </Space>
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </div>
  </div>
  );
}
