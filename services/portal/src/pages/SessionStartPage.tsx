import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Select, Input, Button, Space, Spin, message, Descriptions, Tag, Alert } from 'antd';
import {
  ArrowLeftOutlined,
  RobotOutlined,
  PlayCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'react-query';
import { templateApi, Template } from '../api/template';
import { aiApi, RecognizeParamsResponse } from '../api/ai';
import { sessionApi } from '../api/session';
import { useAuthStore } from '../store/authStore';

const { TextArea } = Input;
const { Option } = Select;

const SessionStartPage: React.FC = () => {
  const { t } = useTranslation(['common', 'session', 'template']);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();
  const [userInput, setUserInput] = useState('');
  const [recognizedParams, setRecognizedParams] = useState<RecognizeParamsResponse | null>(null);

  // Fetch published templates
  const templatesQuery = useQuery(
    ['templates', { status: 'PUBLISHED' }],
    () => templateApi.list({ status: 'PUBLISHED' }),
    { staleTime: 30000 }
  );

  // Get selected template details
  const selectedTemplateQuery = useQuery(
    ['template', selectedTemplateId],
    () => templateApi.getById(selectedTemplateId!),
    { enabled: !!selectedTemplateId }
  );

  // AI recognize params mutation
  const recognizeMutation = useMutation(
    () => aiApi.recognizeParams({
      template_id: selectedTemplateId!,
      user_input: userInput,
    }),
    {
      onSuccess: (data) => {
        setRecognizedParams(data);
        message.success(t('session:recognizeSuccess'));
      },
      onError: () => {
        message.error(t('session:recognizeFailed'));
      },
    }
  );

  // Create and start session mutation
  const executeMutation = useMutation(
    async () => {
      // Create session
      const result = await sessionApi.create({
        user_id: user?.id || '',
        template_id: selectedTemplateId!,
        params: recognizedParams?.params || {},
      });
      // Start session
      await sessionApi.start(result.session.id, {
        template_id: selectedTemplateId!,
        params: recognizedParams?.params || {},
      });
      return result.session;
    },
    {
      onSuccess: (session) => {
        message.success(t('session:startSuccess'));
        navigate(`/sessions/${session.id}`);
      },
      onError: () => {
        message.error(t('session:startFailed'));
      },
    }
  );

  const handleRecognize = () => {
    if (!selectedTemplateId) {
      message.warning(t('session:selectTemplateFirst'));
      return;
    }
    if (!userInput.trim()) {
      message.warning(t('session:enterDescription'));
      return;
    }
    recognizeMutation.mutate();
  };

  const handleExecute = () => {
    if (!selectedTemplateId) {
      message.warning(t('session:selectTemplateFirst'));
      return;
    }
    executeMutation.mutate();
  };

  const selectedTemplate = selectedTemplateQuery.data;
  const isLoading = templatesQuery.isLoading || recognizeMutation.isLoading || executeMutation.isLoading;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate('/sessions')}>
          <ArrowLeftOutlined /> {t('session:sessionList')}
        </Button>
      </Space>

      <div className="page-title">{t('session:startNewSession')}</div>

      <Card bordered={false} style={{ maxWidth: 800 }}>
        {/* Step 1: Select Template */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12 }}>{t('session:stepSelectTemplate')}</h3>
          <Select
            style={{ width: '100%' }}
            placeholder={t('session:selectTemplatePlaceholder')}
            value={selectedTemplateId}
            onChange={setSelectedTemplateId}
            loading={templatesQuery.isLoading}
            showSearch
            filterOption={(input, option) =>
              (option?.children as string)?.toLowerCase().includes(input.toLowerCase())
            }
          >
            {templatesQuery.data?.templates.map((template: Template) => (
              <Option key={template.id} value={template.id}>
                {template.name} (v{template.version})
              </Option>
            ))}
          </Select>

          {selectedTemplate && (
            <Descriptions
              style={{ marginTop: 12 }}
              bordered
              size="small"
              column={1}
            >
              <Descriptions.Item label={t('template:description')}>
                {selectedTemplate.description || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('template:stepsCount')}>
                {selectedTemplate.steps?.length || 0}
              </Descriptions.Item>
              <Descriptions.Item label={t('template:paramsSchema')}>
                {selectedTemplate.params_schema?.required?.length > 0
                  ? selectedTemplate.params_schema.required.map((p: string) => (
                      <Tag key={p}>{p}</Tag>
                    ))
                  : t('template:noParams')}
              </Descriptions.Item>
            </Descriptions>
          )}
        </div>

        {/* Step 2: Input Description */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12 }}>{t('session:stepInputDescription')}</h3>
          <TextArea
            rows={4}
            placeholder={t('session:descriptionPlaceholder')}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            disabled={!selectedTemplateId}
          />
          <Button
            type="default"
            icon={<RobotOutlined />}
            onClick={handleRecognize}
            loading={recognizeMutation.isLoading}
            disabled={!selectedTemplateId || !userInput.trim()}
            style={{ marginTop: 12 }}
          >
            {t('session:aiRecognize')}
          </Button>
        </div>

        {/* Step 3: Review Recognized Params */}
        {recognizedParams && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 12 }}>{t('session:stepReviewParams')}</h3>
            <Alert
              type={recognizedParams.confidence > 0.8 ? 'success' : 'warning'}
              message={t('session:confidenceScore', { score: recognizedParams.confidence })}
              style={{ marginBottom: 12 }}
            />
            <Descriptions bordered size="small" column={1}>
              {Object.entries(recognizedParams.params).map(([key, value]) => (
                <Descriptions.Item key={key} label={key}>
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </Descriptions.Item>
              ))}
            </Descriptions>
            {recognizedParams.suggestions && recognizedParams.suggestions.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong>{t('session:suggestions')}:</strong>
                <ul style={{ marginTop: 4 }}>
                  {recognizedParams.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Execute Button */}
        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            size="large"
            onClick={handleExecute}
            loading={executeMutation.isLoading}
            disabled={!selectedTemplateId}
          >
            {t('session:executeSession')}
          </Button>
        </Space>

        {isLoading && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
          </div>
        )}
      </Card>
    </div>
  );
};

export default SessionStartPage;