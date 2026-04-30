import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Space, Tag, Card, Typography, message } from 'antd';
import { EyeOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { reportApi, Report, ReportStatus } from '../api/report';

const { Title, Text } = Typography;

const ReportListPage: React.FC = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const response = await reportApi.getReports();
      setReports(response.reports);
    } catch (error) {
      message.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const getStatusTag = (status: ReportStatus) => {
    const colors: Record<ReportStatus, string> = {
      pending: 'default',
      generating: 'processing',
      completed: 'success',
      failed: 'error',
    };
    return <Tag color={colors[status]}>{status.toUpperCase()}</Tag>;
  };

  const handleDownload = async (report: Report) => {
    if (report.status !== 'completed') {
      message.warning('Report is not yet completed');
      return;
    }
    try {
      const info = await reportApi.getReportDownloadInfo(report.id);
      // In a real app, this would trigger a file download
      message.success(`Report ready: ${info.file_name}`);
      // Could open download URL or trigger browser download
    } catch (error) {
      message.error('Failed to get download info');
    }
  };

  const columns = [
    {
      title: 'Report ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => <Text copyable>{id.substring(0, 8)}...</Text>,
    },
    {
      title: 'Template',
      dataIndex: 'template_id',
      key: 'template_id',
      render: (id: string) => <Tag color="blue">{id.substring(0, 8)}</Tag>,
    },
    {
      title: 'Session',
      dataIndex: 'session_id',
      key: 'session_id',
      render: (id: string) => <Tag color="purple">{id}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: ReportStatus) => getStatusTag(status),
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: 'Completed At',
      dataIndex: 'completed_at',
      key: 'completed_at',
      render: (date: string) => date ? new Date(date).toLocaleString() : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Report) => (
        <Space>
          <Button
            icon={<EyeOutlined />}
            onClick={() => navigate(`/reports/${record.id}`)}
          >
            View
          </Button>
          <Button
            icon={<DownloadOutlined />}
            disabled={record.status !== 'completed'}
            onClick={() => handleDownload(record)}
          >
            Download
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <Title level={4}>Generated Reports</Title>
          <Button icon={<ReloadOutlined />} onClick={loadReports}>
            Refresh
          </Button>
        </div>
        <Table
          dataSource={reports}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
};

export default ReportListPage;