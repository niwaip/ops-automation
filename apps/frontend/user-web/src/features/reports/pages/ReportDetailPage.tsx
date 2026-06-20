import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Divider,
  List,
  Progress,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from 'react-query';
import type {
  AIAnalysisResult,
  NotificationResult,
  ReportStatus,
  ValidationResult,
} from '@ops/user-core';
import { authStore } from '../../../adapters/auth/authStore';
import { reportApi, resolveApiUrl } from '../../../api';

const { Title, Text } = Typography;

const STATUS_COLORS: Record<ReportStatus, string> = {
  pending: 'default',
  generating: 'processing',
  completed: 'success',
  failed: 'error',
};

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [polling, setPolling] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const accessToken = authStore.getState().accessToken;

  const reportQuery = useQuery(['user-web-report', id], () => reportApi.getReport(id!), {
    enabled: Boolean(id),
  });
  const statusQuery = useQuery(
    ['user-web-report-status', id],
    () => reportApi.getReportStatus(id!),
    {
      enabled:
        Boolean(id) &&
        (reportQuery.data?.status === 'pending' || reportQuery.data?.status === 'generating'),
      refetchInterval: 3000,
    }
  );

  useEffect(() => {
    const nextStatus = statusQuery.data?.status;
    setPolling(Boolean(nextStatus && (nextStatus === 'pending' || nextStatus === 'generating')));
    if (nextStatus === 'completed' || nextStatus === 'failed') {
      void reportQuery.refetch();
    }
  }, [reportQuery, statusQuery.data?.status]);

  const report = useMemo(() => {
    if (!reportQuery.data) {
      return null;
    }
    const nextStatus = statusQuery.data?.status as ReportStatus | undefined;
    const nextError = statusQuery.data?.error;
    return nextStatus
      ? { ...reportQuery.data, status: nextStatus, error: nextError ?? reportQuery.data.error }
      : reportQuery.data;
  }, [reportQuery.data, statusQuery.data?.error, statusQuery.data?.status]);

  const handleDownload = async () => {
    if (!report || report.status !== 'completed') {
      void message.warning('报告尚未生成完成');
      return;
    }

    setDownloading(true);
    try {
      const response = await fetch(resolveApiUrl(`/reports/${report.id}/download`), {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });

      if (!response.ok) {
        throw new Error('报告下载失败');
      }

      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'report.docx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;]+)/i);
        if (filenameMatch?.[1]) {
          filename = decodeURIComponent(filenameMatch[1].trim().replace(/['"]/g, ''));
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      void message.success(`已下载：${filename}`);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '报告下载失败');
    } finally {
      setDownloading(false);
    }
  };

  if (reportQuery.isLoading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!report) {
    return (
      <Card>
        <Text>{reportQuery.error instanceof Error ? reportQuery.error.message : '未找到报告'}</Text>
      </Card>
    );
  }

  return (
    <Card>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button onClick={() => navigate('/reports')}>返回列表</Button>
          <Title level={3} style={{ margin: 0 }}>
            报告详情
          </Title>
        </Space>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void reportQuery.refetch()}
            loading={polling}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            disabled={report.status !== 'completed'}
            loading={downloading}
            onClick={() => void handleDownload()}
          >
            下载
          </Button>
        </Space>
      </Space>

      {report.status === 'generating' && (
        <Alert
          type="info"
          message="报告生成中"
          description="当前正在执行 AI 分析与文档生成，页面会自动刷新最新状态。"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {report.status === 'failed' && report.error && (
        <Alert
          type="error"
          message="报告生成失败"
          description={report.error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {polling && (
        <Progress percent={50} status="active" showInfo={false} style={{ marginBottom: 16 }} />
      )}

      <Descriptions bordered column={2}>
        <Descriptions.Item label="状态">
          <Tag color={STATUS_COLORS[report.status]}>{report.status.toUpperCase()}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="会话 ID">
          <Tag color="purple">{report.session_id}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="模板 ID">
          <Tag color="blue">{report.template_id}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="创建时间">
          {new Date(report.created_at).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label="完成时间">
          {report.completed_at ? new Date(report.completed_at).toLocaleString() : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="结果文件">
          {report.result_file ? <Text copyable>{report.result_file}</Text> : '-'}
        </Descriptions.Item>
      </Descriptions>

      {report.ai_analysis?.length ? <Divider /> : null}
      {report.ai_analysis?.length ? (
        <>
          <Title level={5}>AI 分析</Title>
          <Collapse
            items={report.ai_analysis.map((analysis: AIAnalysisResult) => ({
              key: analysis.section_id,
              label: `Section: ${analysis.section_id}`,
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>{analysis.analysis}</Text>
                  {analysis.tokens_used ? <Tag>Tokens used: {analysis.tokens_used}</Tag> : null}
                </Space>
              ),
            }))}
          />
        </>
      ) : null}

      {report.validation_results?.length ? <Divider /> : null}
      {report.validation_results?.length ? (
        <>
          <Title level={5}>校验结果</Title>
          <List
            dataSource={report.validation_results}
            renderItem={(item: ValidationResult) => (
              <List.Item>
                <Space>
                  <Tag color={item.passed ? 'success' : 'error'}>
                    {item.passed ? 'PASS' : 'FAIL'}
                  </Tag>
                  <Text>Section: {item.section_id}</Text>
                  {item.condition ? <Tag>{item.condition}</Tag> : null}
                  {item.message ? <Text type="secondary">{item.message}</Text> : null}
                </Space>
              </List.Item>
            )}
          />
        </>
      ) : null}

      {report.notifications?.length ? <Divider /> : null}
      {report.notifications?.length ? (
        <>
          <Title level={5}>通知结果</Title>
          <List
            dataSource={report.notifications}
            renderItem={(item: NotificationResult) => (
              <List.Item>
                <Space>
                  <Tag color={item.sent ? 'success' : 'error'}>{item.sent ? 'SENT' : 'FAILED'}</Tag>
                  <Text>Type: {item.type}</Text>
                  {item.recipients?.length ? <Text>To: {item.recipients.join(', ')}</Text> : null}
                  {item.error ? <Text type="danger">{item.error}</Text> : null}
                </Space>
              </List.Item>
            )}
          />
        </>
      ) : null}
    </Card>
  );
}
