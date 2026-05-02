import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Space, Tag, Card, Typography, Modal, message } from 'antd';
import { PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined, FileWordOutlined, FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons';
import { reportApi, ReportTemplate, ReportFormat } from '../api/report';

const { Title } = Typography;

const ReportTemplateListPage: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await reportApi.getTemplates();
      setTemplates(response.templates);
    } catch (error) {
      message.error('Failed to load report templates');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: 'Delete Report Template',
      content: 'Are you sure you want to delete this report template?',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await reportApi.deleteTemplate(id);
          message.success('Report template deleted');
          loadTemplates();
        } catch (error) {
          message.error('Failed to delete report template');
        }
      },
    });
  };

  const getFormatIcon = (format: ReportFormat) => {
    switch (format) {
      case 'word':
        return <FileWordOutlined style={{ color: '#2b579a' }} />;
      case 'excel':
        return <FileExcelOutlined style={{ color: '#217346' }} />;
      case 'pdf':
        return <FilePdfOutlined style={{ color: '#f40f02' }} />;
      default:
        return null;
    }
  };

  const getFormatTag = (format: ReportFormat) => {
    const colors: Record<ReportFormat, string> = {
      word: 'blue',
      excel: 'green',
      pdf: 'red',
    };
    return <Tag color={colors[format]} icon={getFormatIcon(format)}>{format.toUpperCase()}</Tag>;
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: ReportTemplate) => (
        <Space>
          {getFormatIcon(record.format)}
          <span>{name}</span>
        </Space>
      ),
    },
    {
      title: 'Format',
      dataIndex: 'format',
      key: 'format',
      render: (format: ReportFormat) => getFormatTag(format),
    },
    {
      title: 'Sections',
      dataIndex: 'sections',
      key: 'sections',
      render: (sections: any[]) => <Tag>{sections.length} sections</Tag>,
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: ReportTemplate) => (
        <Space>
          <Button
            icon={<EyeOutlined />}
            onClick={() => navigate(`/report-templates/${record.id}`)}
          >
            View
          </Button>
          <Button
            icon={<EditOutlined />}
            onClick={() => navigate(`/report-templates/${record.id}/edit`)}
          >
            Edit
          </Button>
          <Button
            icon={<DeleteOutlined />}
            danger
            onClick={() => handleDelete(record.id)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <Title level={4}>Report Templates</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/report-templates/new')}
          >
            Create Template
          </Button>
        </div>
        <Table
          dataSource={templates}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
};

export default ReportTemplateListPage;