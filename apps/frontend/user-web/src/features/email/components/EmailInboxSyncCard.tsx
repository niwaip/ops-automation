import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  InboxOutlined,
  LoadingOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Divider,
  Space,
  Tag,
  Typography,
  theme,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate } from "react-router-dom";
import { workbenchInboxApi } from "@/api/workbenchInbox";
import { formatMonthDayTime } from "@/shared/utils/dateText";

const { Text, Paragraph } = Typography;

interface EmailInboxSyncCardProps {
  isConfigured: boolean;
}

export function EmailInboxSyncCard({ isConfigured }: EmailInboxSyncCardProps) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 查询当前同步状态
  const { data: syncStatus } = useQuery(
    "email-sync-status",
    () => workbenchInboxApi.getEmailSyncStatus(),
    {
      staleTime: 15000,
      refetchInterval: 30000,
      enabled: isConfigured,
    }
  );

  // 手动触发一次同步
  const syncMutation = useMutation(
    async () => {
      return await workbenchInboxApi.syncEmail();
    },
    {
      onSuccess: (res) => {
        void queryClient.invalidateQueries("email-sync-status");
        void queryClient.invalidateQueries("workbench-inbox");
        void queryClient.invalidateQueries("workbench-inbox-summary");
        if (res.success) {
          message.success({
            content: (
              <Space>
                <span>{res.message}</span>
                <Button
                  type="link"
                  size="small"
                  onClick={() => navigate("/dashboard")}
                  style={{ padding: 0 }}
                >
                  前往工作台查看
                </Button>
              </Space>
            ),
            duration: 4,
          });
        } else {
          message.warning(res.message);
        }
      },
      onError: (err: any) => {
        message.error(`同步失败: ${err?.message || "网络请求异常"}`);
      },
    }
  );

  return (
    <Card
      title={
        <Space size={8}>
          <InboxOutlined style={{ color: "#1677ff", fontSize: 16 }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>GTD 收件箱自动同步</span>
        </Space>
      }
      bordered
      style={{
        borderRadius: token.borderRadiusLG,
        background: token.colorBgContainer,
        borderColor: token.colorBorderSecondary,
        boxShadow: token.boxShadowTertiary,
      }}
      styles={{ body: { padding: "14px 16px" } }}
    >
      <Paragraph style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 12 }}>
        系统已内置邮件定时监听工作流，<strong>每小时整点（0 * * * *）</strong>自动收取最新未读邮件，存入 GTD 收件箱并自动更新原邮件为已读状态。
      </Paragraph>

      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text type="secondary" style={{ fontSize: 13 }}>运行调度周期：</Text>
          <Tag color="geekblue" icon={<ClockCircleOutlined />}>
            每小时一次 (0 * * * *)
          </Tag>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text type="secondary" style={{ fontSize: 13 }}>流转策略：</Text>
          <Text style={{ fontSize: 12 }}>未读入收件箱 ➔ 原邮箱置为已读</Text>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text type="secondary" style={{ fontSize: 13 }}>当前同步状态：</Text>
          {syncStatus?.lastSyncStatus === "success" ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              正常运行
            </Tag>
          ) : syncStatus?.lastSyncStatus === "failed" ? (
            <Tag color="error">同步异常</Tag>
          ) : (
            <Tag color="default">就绪待触发</Tag>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text type="secondary" style={{ fontSize: 13 }}>上次同步时间：</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {syncStatus?.lastSyncedAt
              ? formatMonthDayTime(syncStatus.lastSyncedAt)
              : "暂无同步记录"}
          </Text>
        </div>

        <Divider style={{ margin: "8px 0" }} />

        <Button
          type="primary"
          ghost
          icon={syncMutation.isLoading ? <LoadingOutlined spin /> : <SyncOutlined />}
          onClick={() => syncMutation.mutate()}
          loading={syncMutation.isLoading}
          disabled={!isConfigured}
          style={{ width: "100%", borderRadius: 6 }}
        >
          立即手动测试同步一次
        </Button>
      </Space>
    </Card>
  );
}
