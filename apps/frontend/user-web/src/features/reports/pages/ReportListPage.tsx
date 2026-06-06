import {
  DownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Button, Card, message, Space, Table, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import type { Report, ReportStatus } from "@ops/user-core";
import { reportApi } from "../../../api";

const { Title, Text } = Typography;

const STATUS_COLORS: Record<ReportStatus, string> = {
  pending: "default",
  generating: "processing",
  completed: "success",
  failed: "error",
};

export function ReportListPage() {
  const navigate = useNavigate();
  const { data, isLoading, isFetching, refetch } = useQuery(
    ["user-web-reports"],
    () => reportApi.getReports(),
  );

  const reports = data?.reports || [];

  const handleDownloadInfo = async (report: Report) => {
    if (report.status !== "completed") {
      void message.warning("报告尚未生成完成");
      return;
    }
    try {
      const info = await reportApi.getReportDownloadInfo(report.id);
      void message.success(`报告已就绪：${info.file_name}`);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : "获取下载信息失败");
    }
  };

  return (
    <Card>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>报告列表</Title>
          <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0" }}>
            user-web 直接复用 user-core 中的报告 API 封装，不再维护 portal 私有副本。
          </Typography.Paragraph>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void refetch()} loading={isFetching}>刷新</Button>
      </Space>
      <Table<Report>
        rowKey="id"
        dataSource={reports}
        loading={isLoading}
        pagination={{ pageSize: 10 }}
        columns={[
          {
            title: "报告 ID",
            dataIndex: "id",
            key: "id",
            render: (id: string) => <Text copyable>{id}</Text>,
          },
          {
            title: "模板",
            dataIndex: "template_id",
            key: "template_id",
            render: (id: string) => <Tag color="blue">{id}</Tag>,
          },
          {
            title: "会话",
            dataIndex: "session_id",
            key: "session_id",
            render: (id: string) => <Tag color="purple">{id}</Tag>,
          },
          {
            title: "状态",
            dataIndex: "status",
            key: "status",
            render: (status: ReportStatus) => <Tag color={STATUS_COLORS[status]}>{status.toUpperCase()}</Tag>,
          },
          {
            title: "创建时间",
            dataIndex: "created_at",
            key: "created_at",
            render: (value: string) => new Date(value).toLocaleString(),
          },
          {
            title: "完成时间",
            dataIndex: "completed_at",
            key: "completed_at",
            render: (value?: string) => value ? new Date(value).toLocaleString() : "-",
          },
          {
            title: "操作",
            key: "actions",
            render: (_, record) => (
              <Space>
                <Button icon={<EyeOutlined />} onClick={() => navigate(`/reports/${record.id}`)}>
                  查看
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  disabled={record.status !== "completed"}
                  onClick={() => void handleDownloadInfo(record)}
                >
                  下载
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
