import React, { useState, useEffect } from 'react';
import {
  Typography,
  Card,
  Row,
  Col,
  Form,
  Input,
  Radio,
  Button,
  Switch,
  Alert,
  message,
  Tag,
  Space,
  Divider,
} from 'antd';
import {
  CloudServerOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  SaveOutlined,
  FolderOpenOutlined,
  CloudUploadOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import {
  storageApi,
  StorageConfig,
  StorageProtocol,
  TestStorageConnectionResult,
  UpdateStorageConfigRequest,
} from '@/api/storage';

const { Title, Text, Paragraph } = Typography;

export const StorageAdminPage: React.FC = () => {
  const [form] = Form.useForm<UpdateStorageConfigRequest>();
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<TestStorageConnectionResult | null>(null);
  const [currentConfig, setCurrentConfig] = useState<StorageConfig | null>(null);
  const selectedProtocol = Form.useWatch('protocol', form) || 'local';

  const loadConfig = async () => {
    setLoading(true);
    try {
      const cfg = await storageApi.getConfig();
      setCurrentConfig(cfg);
      form.setFieldsValue({
        protocol: cfg.protocol || 'local',
        localRoot: cfg.localRoot || 'data/storage/uploads',
        endpoint: cfg.endpoint,
        bucket: cfg.bucket,
        region: cfg.region || 'us-east-1',
        accessKey: cfg.accessKey,
        secretKey: cfg.hasSecret ? '******' : '',
        useSSL: cfg.useSSL !== undefined ? cfg.useSSL : true,
        publicUrl: cfg.publicUrl,
        pathPrefix: cfg.pathPrefix || 'uploads/',
      });
    } catch (err: any) {
      message.error(`获取存储配置失败: ${err.message || '网络异常'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleTestConnection = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      setTestResult(null);
      const res = await storageApi.testConnection(values);
      setTestResult(res);
      if (res.success) {
        message.success('连通性测试通过！');
      } else {
        message.warning('连通性测试未通过，请检查配置');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        protocol: selectedProtocol,
        message: err.message || '校验失败',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (values: UpdateStorageConfigRequest) => {
    setSaving(true);
    try {
      const updated = await storageApi.updateConfig(values);
      setCurrentConfig(updated);
      message.success('存储配置已成功保存并即刻热生效！');
      setTestResult(null);
    } catch (err: any) {
      message.error(`保存失败: ${err.message || '未知异常'}`);
    } finally {
      setSaving(false);
    }
  };

  const getProtocolLabel = (proto: StorageProtocol) => {
    switch (proto) {
      case 'minio':
        return 'MinIO 对象存储';
      case 's3':
        return 'AWS S3 对象存储';
      case 'oss':
        return '阿里云 OSS';
      case 'local':
      default:
        return '本地文件系统';
    }
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: 20 }}>
        <Space direction="horizontal" size={8} align="center">
          <CloudServerOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          <Title level={3} style={{ margin: 0 }}>
            存储管理
          </Title>
        </Space>
        <Paragraph type="secondary" style={{ marginTop: 6, marginBottom: 0 }}>
          在系统管理控制台中配置全平台媒体文件与产物存储方案（无需修改环境变量或重启后端服务）。
        </Paragraph>
      </div>

      {/* Current Active Status Card */}
      <Card
        style={{ marginBottom: 24, borderRadius: 8 }}
        loading={loading}
        title={
          <Space>
            <CloudUploadOutlined />
            <span>当前生效存储引擎</span>
          </Space>
        }
        extra={
          <Tag color="success" icon={<CheckCircleOutlined />}>
            实时热生效
          </Tag>
        }
      >
        <Row gutter={24}>
          <Col xs={24} sm={8}>
            <Text type="secondary">活动协议：</Text>
            <div>
              <Tag color="blue" style={{ fontSize: 14, padding: '4px 10px', marginTop: 4 }}>
                {getProtocolLabel(currentConfig?.protocol || 'local')}
              </Tag>
            </div>
          </Col>
          <Col xs={24} sm={8}>
            <Text type="secondary">存储位置 / Bucket：</Text>
            <div style={{ marginTop: 4, fontWeight: 500 }}>
              {currentConfig?.protocol === 'local'
                ? currentConfig?.localRoot || 'data/storage/uploads'
                : currentConfig?.bucket || '未配置'}
            </div>
          </Col>
          <Col xs={24} sm={8}>
            <Text type="secondary">最近更新时间：</Text>
            <div style={{ marginTop: 4, color: '#8c8c8c' }}>
              {currentConfig?.updatedAt
                ? new Date(currentConfig.updatedAt).toLocaleString()
                : '默认初始化'}
            </div>
          </Col>
        </Row>
      </Card>

      {/* Configuration Form Card */}
      <Card
        title="存储参数设置"
        style={{ borderRadius: 8 }}
        loading={loading}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            protocol: 'local',
            localRoot: 'data/storage/uploads',
            region: 'us-east-1',
            useSSL: true,
            pathPrefix: 'uploads/',
          }}
          onFinish={handleSave}
        >
          {/* Protocol Switcher */}
          <Form.Item
            name="protocol"
            label="存储协议方案"
            rules={[{ required: true, message: '请选择存储方案' }]}
          >
            <Radio.Group buttonStyle="solid" size="middle">
              <Radio.Button value="local">
                <FolderOpenOutlined style={{ marginRight: 6 }} />
                本地文件系统 (Local)
              </Radio.Button>
              <Radio.Button value="minio">
                <CloudServerOutlined style={{ marginRight: 6 }} />
                MinIO 对象存储
              </Radio.Button>
              <Radio.Button value="s3">
                <CloudUploadOutlined style={{ marginRight: 6 }} />
                AWS S3
              </Radio.Button>
              <Radio.Button value="oss">
                <GlobalOutlined style={{ marginRight: 6 }} />
                阿里云 OSS
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Divider style={{ margin: '16px 0' }} />

          {/* Local Storage Settings */}
          {selectedProtocol === 'local' && (
            <Form.Item
              name="localRoot"
              label="本地落盘目录 (Local Directory)"
              tooltip="服务器或容器内的物理落盘目录路径"
              rules={[{ required: true, message: '请输入本地落盘目录' }]}
            >
              <Input placeholder="data/storage/uploads" style={{ maxWidth: 600 }} />
            </Form.Item>
          )}

          {/* S3 / MinIO / OSS Settings */}
          {selectedProtocol !== 'local' && (
            <>
              <Row gutter={16}>
                <Col xs={24} md={14}>
                  <Form.Item
                    name="endpoint"
                    label="服务端点 (Endpoint URL)"
                    tooltip="MinIO 或对象存储的服务域名或 IP 与端口，如 http://minio:9000 或 s3.us-east-1.amazonaws.com"
                    rules={[{ required: true, message: '请输入服务端点' }]}
                  >
                    <Input
                      placeholder={
                        selectedProtocol === 'minio'
                          ? 'http://127.0.0.1:9000'
                          : 's3.us-east-1.amazonaws.com'
                      }
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={10}>
                  <Form.Item
                    name="bucket"
                    label="存储桶名称 (Bucket Name)"
                    tooltip="预先在对象存储服务中创建好的 Bucket 名称"
                    rules={[{ required: true, message: '请输入存储桶名称' }]}
                  >
                    <Input placeholder="ops-automation" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="accessKey"
                    label="访问密钥 ID (Access Key / AK)"
                    rules={[{ required: true, message: '请输入 AccessKey' }]}
                  >
                    <Input placeholder="AKIA..." />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="secretKey"
                    label="私有访问密钥 (Secret Key / SK)"
                    tooltip="用于签名鉴权。保存在系统数据安全目录中，前端脱敏显示"
                  >
                    <Input.Password
                      placeholder={currentConfig?.hasSecret ? '已配置 (留空表示保持原有密钥)' : '请输入 SecretKey'}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="region"
                    label="区域代码 (Region)"
                    tooltip="如 us-east-1, cn-north-1 或 local"
                  >
                    <Input placeholder="us-east-1" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="pathPrefix"
                    label="路径前缀 (Path Prefix)"
                    tooltip="对象在 Bucket 内的前缀路径，默认为 uploads/"
                  >
                    <Input placeholder="uploads/" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="useSSL"
                    label="启用 HTTPS / SSL"
                    valuePropName="checked"
                    tooltip="是否使用 HTTPS 协议连接对象存储端点"
                  >
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="publicUrl"
                label="公开访问基础 URL (Public Base URL, 可选)"
                tooltip="如果 Bucket 设置了公网只读或 CDN 加速域名，可配置此项作为对外访问链接"
              >
                <Input placeholder="https://cdn.example.com" style={{ maxWidth: 600 }} />
              </Form.Item>
            </>
          )}

          {/* Test Result Alert */}
          {testResult && (
            <div style={{ marginTop: 12, marginBottom: 20 }}>
              <Alert
                type={testResult.success ? 'success' : 'error'}
                showIcon
                icon={testResult.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                message={testResult.success ? '连接成功' : '连接失败'}
                description={
                  <div>
                    <Paragraph style={{ margin: 0 }}>{testResult.message}</Paragraph>
                    {testResult.latencyMs !== undefined && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        检测耗时: {testResult.latencyMs} ms
                      </Text>
                    )}
                  </div>
                }
              />
            </div>
          )}

          <Divider style={{ margin: '20px 0' }} />

          {/* Form Actions */}
          <Space size={16}>
            <Button
              type="default"
              icon={<ThunderboltOutlined />}
              loading={testing}
              onClick={handleTestConnection}
            >
              测试连接
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              htmlType="submit"
              loading={saving}
            >
              保存并热生效
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
};

export default StorageAdminPage;
