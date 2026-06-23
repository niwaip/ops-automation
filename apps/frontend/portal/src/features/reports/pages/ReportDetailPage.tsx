import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Typography,
  Descriptions,
  Tag,
  Button,
  Space,
  Divider,
  Collapse,
  List,
  Alert,
  Spin,
  message,
  Progress,
} from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  reportApi,
  Report,
  ReportStatus,
  ValidationResult,
  AIAnalysisResult,
  NotificationResult,
} from '@/api/report';
import { useAuthStore } from '@/shared/store/authStore';

const { Title, Text } = Typography;
const { Panel } = Collapse;

const ReportDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { accessToken } = useAuthStore();

  useEffect(() => {
    if (id) {
      void loadReport(id);
    }
  }, [id]);

  useEffect(() => {
    if (report?.status === 'generating' || report?.status === 'pending') {
      setPolling(true);
      const interval = setInterval(() => {
        if (id) {
          void reportApi
            .getReportStatus(id)
            .then((status) => {
              if (report) {
                setReport({
                  ...report,
                  status: status.status as ReportStatus,
                  error: status.error,
                });
              }
              if (status.status === 'completed' || status.status === 'failed') {
                setPolling(false);
                void loadReport(id);
                clearInterval(interval);
              }
            })
            .catch(() => {
              setPolling(false);
              clearInterval(interval);
            });
        }
      }, 3000);
      return () => clearInterval(interval);
    }
    setPolling(false);
  }, [report, report?.status, id]);

  const loadReport = async (reportId: string) => {
    setLoading(true);
    try {
      const response = await reportApi.getReport(reportId);
      setReport(response);
    } catch {
      void message.error('Failed to load report');
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

  const handleDownload = async () => {
    if (!report || report.status !== 'completed') {
      void message.warning('Report is not yet completed');
      return;
    }

    setDownloading(true);
    try {
      const response = await fetch(`/api/reports/${report.id}/download`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'report.docx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;]+)/i);
        if (filenameMatch && filenameMatch[1]) {
          filename = decodeURIComponent(filenameMatch[1].trim().replace(/['"]/g, ''));
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      void message.success(`Downloaded: ${filename}`);
    } catch {
      void message.error('Failed to download report');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{ padding: '24px' }}>
        <Text>Report not found</Text>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <Title level={4}>Report {report.id.substring(0, 8)}</Title>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => id && void loadReport(id)}
              loading={polling}
            >
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              disabled={report.status !== 'completed'}
              loading={downloading}
              onClick={() => void handleDownload()}
            >
              Download
            </Button>
          </Space>
        </div>

        {report.status === 'generating' && (
          <Alert
            type="info"
            message="Report is being generated"
            description="AI analysis and document generation in progress. This page will auto-update."
            showIcon
            style={{ marginBottom: '16px' }}
          />
        )}

        {report.status === 'failed' && report.error && (
          <Alert
            type="error"
            message="Report generation failed"
            description={report.error}
            showIcon
            style={{ marginBottom: '16px' }}
          />
        )}

        {polling && (
          <Progress
            percent={50}
            status="active"
            showInfo={false}
            style={{ marginBottom: '16px' }}
          />
        )}

        <Descriptions bordered column={2}>
          <Descriptions.Item label="Status">{getStatusTag(report.status)}</Descriptions.Item>
          <Descriptions.Item label="Session ID">
            <Tag color="purple">{report.session_id}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Template ID">
            <Tag color="blue">{report.template_id.substring(0, 8)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Created At">
            {new Date(report.created_at).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="Completed At">
            {report.completed_at ? new Date(report.completed_at).toLocaleString() : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Result File">
            {report.result_file ? <Text copyable>{report.result_file}</Text> : '-'}
          </Descriptions.Item>
        </Descriptions>

        {report.ai_analysis && report.ai_analysis.length > 0 && <Divider />}

        {report.ai_analysis && report.ai_analysis.length > 0 && (
          <>
            <Title level={5}>AI Analysis Results</Title>
            <Collapse>
              {report.ai_analysis.map((analysis: AIAnalysisResult) => (
                <Panel header={`Section: ${analysis.section_id}`} key={analysis.section_id}>
                  <Text>{analysis.analysis}</Text>
                  {analysis.tokens_used && (
                    <div style={{ marginTop: '8px' }}>
                      <Tag>Tokens used: {analysis.tokens_used}</Tag>
                    </div>
                  )}
                </Panel>
              ))}
            </Collapse>
          </>
        )}

        {report.validation_results && report.validation_results.length > 0 && <Divider />}

        {report.validation_results && report.validation_results.length > 0 && (
          <>
            <Title level={5}>Validation Results</Title>
            <List
              dataSource={report.validation_results}
              renderItem={(item: ValidationResult) => (
                <List.Item>
                  <Space>
                    <Tag color={item.passed ? 'success' : 'error'}>
                      {item.passed ? 'PASS' : 'FAIL'}
                    </Tag>
                    <Text>Section: {item.section_id}</Text>
                    {item.condition && <Tag>{item.condition}</Tag>}
                    {item.message && <Text type="secondary">{item.message}</Text>}
                  </Space>
                </List.Item>
              )}
            />
          </>
        )}

        {report.notifications && report.notifications.length > 0 && <Divider />}

        {report.notifications && report.notifications.length > 0 && (
          <>
            <Title level={5}>Notifications Sent</Title>
            <List
              dataSource={report.notifications}
              renderItem={(item: NotificationResult) => (
                <List.Item>
                  <Space>
                    <Tag color={item.sent ? 'success' : 'error'}>
                      {item.sent ? 'SENT' : 'FAILED'}
                    </Tag>
                    <Text>Type: {item.type}</Text>
                    {item.recipients && <Text>To: {item.recipients.join(', ')}</Text>}
                    {item.error && <Text type="danger">{item.error}</Text>}
                  </Space>
                </List.Item>
              )}
            />
          </>
        )}
      </Card>
    </div>
  );
};

export default ReportDetailPage;
