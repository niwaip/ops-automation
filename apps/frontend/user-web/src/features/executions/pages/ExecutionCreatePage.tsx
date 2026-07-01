import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Popconfirm,
  Radio,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Tag,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  LoadingOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  SettingOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { executionApi } from '@/api/execution';
import { scheduleApi } from '@/api/schedules';
import { capabilityReleaseApi } from '@/api/capabilities';
import { SkillParamsSchema, skillApi, SkillConfigDTO } from '@/api/skill';
import { aiApi } from '@/api/ai';
import type { UploadProps } from 'antd';
import { Modal, Upload } from 'antd';
import { useAuthStore } from '@/shared/store/authStore';

const { Title, Text } = Typography;
const { Panel } = Collapse;

type SchemaField = {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  defaultValue?: unknown;
};

type PublishedSkillOption = {
  skillId: string;
  skillName: string;
  updatedAt: string;
};

type PublishedSkillCandidate = PublishedSkillOption & {
  releaseVersion: number;
};

type ExecutionMode = 'immediate' | 'schedule';
type SchedulePattern = 'workdays' | 'weekly' | 'monthly';

type ExecutionCreateFormValues = {
  skillId: string;
  input?: Record<string, unknown>;
  executionMode: ExecutionMode;
  scheduleName?: string;
  scheduleDescription?: string;
  timezone?: string;
  schedulePattern?: SchedulePattern;
  scheduleHour?: string;
  scheduleMinute?: string;
  weeklyDays?: string[];
  monthlyDay?: number;
};

const getDefaultScheduleName = (skillName?: string) => `${skillName || '技能'} 定时执行`;
const WEEKDAY_OPTIONS = [
  { label: '周一', value: '1' },
  { label: '周二', value: '2' },
  { label: '周三', value: '3' },
  { label: '周四', value: '4' },
  { label: '周五', value: '5' },
  { label: '周六', value: '6' },
  { label: '周日', value: '0' },
];
const WEEKDAY_LABEL_MAP = new Map(WEEKDAY_OPTIONS.map((option) => [option.value, option.label]));
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => ({
  label: String(index).padStart(2, '0'),
  value: String(index).padStart(2, '0'),
}));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const minute = String(index * 5).padStart(2, '0');
  return { label: minute, value: minute };
});
const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => ({
  label: `${index + 1} 日`,
  value: index + 1,
}));
const TIMEZONE_OPTIONS = [
  { label: '中国标准时间 (Asia/Shanghai)', value: 'Asia/Shanghai' },
  { label: '协调世界时 (UTC)', value: 'UTC' },
  { label: '日本标准时间 (Asia/Tokyo)', value: 'Asia/Tokyo' },
  { label: '新加坡时间 (Asia/Singapore)', value: 'Asia/Singapore' },
  { label: '伦敦时间 (Europe/London)', value: 'Europe/London' },
  { label: '纽约时间 (America/New_York)', value: 'America/New_York' },
];

const getTypeTagColor = (type: string) => {
  const normalizedType = type.toLowerCase();
  if (normalizedType === 'boolean') return 'green';
  if (normalizedType === 'number' || normalizedType === 'integer') return 'blue';
  if (normalizedType === 'object' || normalizedType === 'json') return 'purple';
  return 'default';
};

const formatDateTime = (value?: string | Date | null) => {
  if (!value) {
    return '-';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('zh-CN', { hour12: false });
};

const stringifyPreview = (value: unknown) => {
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > 240 ? `${text.slice(0, 240)}...` : text;
  } catch {
    return String(value);
  }
};

const buildScheduleCronExpression = (values: ExecutionCreateFormValues) => {
  const hour = values.scheduleHour || '09';
  const minute = values.scheduleMinute || '00';
  const pattern = values.schedulePattern || 'workdays';

  if (pattern === 'weekly') {
    const selectedDays =
      (values.weeklyDays || []).filter((day) => WEEKDAY_LABEL_MAP.has(day)).sort() || [];
    if (selectedDays.length === 0) {
      throw new Error('请选择至少一个每周执行日');
    }
    return `${minute} ${hour} * * ${selectedDays.join(',')}`;
  }

  if (pattern === 'monthly') {
    const day = values.monthlyDay || 1;
    return `${minute} ${hour} ${day} * *`;
  }

  return `${minute} ${hour} * * 1-5`;
};

const buildScheduleRuleText = (values: {
  schedulePattern?: SchedulePattern;
  scheduleHour?: string;
  scheduleMinute?: string;
  weeklyDays?: string[];
  monthlyDay?: number;
}) => {
  const hour = values.scheduleHour || '09';
  const minute = values.scheduleMinute || '00';
  const pattern = values.schedulePattern || 'workdays';
  const timeText = `${hour}:${minute}`;

  if (pattern === 'weekly') {
    const dayText = (values.weeklyDays || [])
      .map((day) => WEEKDAY_LABEL_MAP.get(day))
      .filter(Boolean)
      .join('、');
    return dayText ? `每周 ${dayText} ${timeText}` : `每周 ${timeText}`;
  }

  if (pattern === 'monthly') {
    return `每月 ${values.monthlyDay || 1} 日 ${timeText}`;
  }

  return `每个工作日 ${timeText}`;
};

const summarizeCronExpression = (cronExpression?: string) => {
  if (!cronExpression) {
    return '未设置';
  }

  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return cronExpression;
  }

  const [minute, hour, dayOfMonth, _month, dayOfWeek] = parts;
  const timeText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  if (dayOfMonth === '*' && dayOfWeek === '1-5') {
    return `每个工作日 ${timeText}`;
  }

  if (dayOfMonth !== '*' && dayOfWeek === '*') {
    return `每月 ${dayOfMonth} 日 ${timeText}`;
  }

  if (dayOfMonth === '*' && dayOfWeek !== '*') {
    const weekText = dayOfWeek
      .split(',')
      .map((day) => WEEKDAY_LABEL_MAP.get(day) || day)
      .join('、');
    return `每周 ${weekText} ${timeText}`;
  }

  return cronExpression;
};

const getSchemaFields = (schema?: SkillParamsSchema): SchemaField[] => {
  if (!schema?.properties) {
    return [];
  }

  const requiredFields = new Set(schema.required || []);
  return Object.entries(schema.properties).map(([name, config]) => ({
    name,
    type: config?.type || 'string',
    description: config?.description,
    required: requiredFields.has(name) || Boolean(config?.required),
    defaultValue: config?.default,
  }));
};

const getInitialInputValues = (fields: SchemaField[]): Record<string, unknown> => {
  return fields.reduce<Record<string, unknown>>((acc, field) => {
    if (field.defaultValue === undefined) {
      if (field.type === 'boolean') {
        acc[field.name] = false;
      }
      return acc;
    }

    if (field.type === 'object' || field.type === 'json') {
      acc[field.name] =
        typeof field.defaultValue === 'string'
          ? field.defaultValue
          : JSON.stringify(field.defaultValue, null, 2);
      return acc;
    }

    acc[field.name] = field.defaultValue;
    return acc;
  }, {});
};

const renderInputField = (field: SchemaField) => {
  const normalizedType = field.type.toLowerCase();

  if (normalizedType === 'number' || normalizedType === 'integer') {
    return <InputNumber style={{ width: '100%' }} placeholder={`请输入 ${field.name}`} />;
  }

  if (normalizedType === 'boolean') {
    return <Switch />;
  }

  if (normalizedType === 'object' || normalizedType === 'json') {
    return <Input.TextArea rows={6} placeholder="请输入 JSON 字符串" />;
  }

  return <Input placeholder={field.description || `请输入 ${field.name}`} />;
};

const normalizeInputValues = (
  values: Record<string, unknown>,
  fields: SchemaField[]
): Record<string, unknown> => {
  return fields.reduce<Record<string, unknown>>((acc, field) => {
    const rawValue = values[field.name];

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return acc;
    }

    const normalizedType = field.type.toLowerCase();

    if (
      (normalizedType === 'object' || normalizedType === 'json') &&
      typeof rawValue === 'string'
    ) {
      acc[field.name] = JSON.parse(rawValue);
      return acc;
    }

    acc[field.name] = rawValue;
    return acc;
  }, {});
};

const ExecutionCreatePage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const selectedSkillId = Form.useWatch('skillId', form) as string | undefined;
  const executionMode =
    (Form.useWatch('executionMode', form) as ExecutionMode | undefined) || 'immediate';
  const schedulePattern =
    (Form.useWatch('schedulePattern', form) as SchedulePattern | undefined) || 'workdays';
  const initializedSkillIdRef = useRef<string | undefined>();
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiTextInput, setAiTextInput] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [uploadedText, setUploadedText] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const { user } = useAuthStore();

  // 为页面容器增加一个最大高度和溢出处理，确保在大屏幕下不出现全局滚动条
  const containerStyle: React.CSSProperties = {
    height: '100%',
    minHeight: 0,
    overflowX: 'hidden',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  };
  const panelCardStyle: React.CSSProperties = {
    borderRadius: 18,
    border: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-sm)',
    background: 'var(--bg-card)',
  };
  const subtleCardStyle: React.CSSProperties = {
    borderRadius: 14,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)',
  };
  const pillTagStyle: React.CSSProperties = {
    borderRadius: 999,
    background: 'var(--bg-secondary)',
    borderColor: 'var(--border-color)',
    color: 'var(--text-secondary)',
  };

  const publishedSkillsQuery = useQuery(
    ['published-skills-for-execution-create'],
    capabilityReleaseApi.listReleaseCenter
  );
  const authorizedSkillsQuery = useQuery(['authorized-skills-for-execution-create'], skillApi.list);
  const authorizedSkillIds = useMemo(
    () => new Set((authorizedSkillsQuery.data?.skills || []).map((skill) => skill.id)),
    [authorizedSkillsQuery.data?.skills]
  );

  const skillOptions = useMemo(() => {
    const releases = publishedSkillsQuery.data?.releases || [];
    const skillMap = new Map<string, PublishedSkillCandidate>();

    releases.forEach((release) => {
      if (!release.publishedSkillId) {
        return;
      }
      if (user?.role !== 'admin' && !authorizedSkillIds.has(release.publishedSkillId)) {
        return;
      }

      const sourceKey = [
        release.sourceType,
        release.sourceId || release.sourceName || release.publishedSkillId,
      ].join('::');
      const nextItem: PublishedSkillCandidate = {
        skillId: release.publishedSkillId,
        skillName: release.sourceName || release.sourceId || release.publishedSkillId,
        updatedAt: release.updatedAt,
        releaseVersion: release.releaseVersion || 0,
      };
      const currentItem = skillMap.get(sourceKey);

      const shouldReplace =
        !currentItem ||
        nextItem.releaseVersion > currentItem.releaseVersion ||
        (nextItem.releaseVersion === currentItem.releaseVersion &&
          new Date(nextItem.updatedAt).getTime() > new Date(currentItem.updatedAt).getTime());

      if (shouldReplace) {
        skillMap.set(sourceKey, nextItem);
      }
    });

    return Array.from(skillMap.values())
      .map(({ releaseVersion: _releaseVersion, ...item }) => item)
      .sort((left, right) => left.skillName.localeCompare(right.skillName));
  }, [authorizedSkillIds, publishedSkillsQuery.data?.releases, user?.role]);

  const selectedSkillOption = useMemo(
    () => skillOptions.find((skill) => skill.skillId === selectedSkillId),
    [selectedSkillId, skillOptions]
  );

  const selectedSkillQuery = useQuery(
    ['skill-detail-for-execution-create', selectedSkillId],
    () => skillApi.getById(selectedSkillId ?? ''),
    { enabled: Boolean(selectedSkillId) }
  );

  const selectedSkill: SkillConfigDTO | undefined = selectedSkillQuery.data;
  const selectedSkillDisplayName =
    selectedSkillOption?.skillName || selectedSkill?.name || selectedSkillId || '-';
  const schemaFields = useMemo(
    () => getSchemaFields(selectedSkill?.paramsSchema),
    [selectedSkill?.paramsSchema]
  );
  const requiredFieldCount = schemaFields.filter((field) => field.required).length;
  const optionalFieldCount = schemaFields.length - requiredFieldCount;
  const formLoadingIndicator = <LoadingOutlined style={{ fontSize: 24 }} spin />;

  const schedulesQuery = useQuery(['execution-create-schedules'], () => scheduleApi.list(), {
    staleTime: 15000,
  });
  const scheduleItems = Array.isArray(schedulesQuery.data) ? schedulesQuery.data : [];

  const skillSchedules = useMemo(
    () =>
      scheduleItems
        .filter((schedule) => schedule.skillId === selectedSkillId)
        .sort((left, right) => {
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        }),
    [scheduleItems, selectedSkillId]
  );
  const activeScheduleCount = skillSchedules.filter((schedule) => schedule.isActive).length;

  useEffect(() => {
    const initialSkillId = searchParams.get('skillId');
    if (!initialSkillId) {
      return;
    }

    if (!form.getFieldValue('skillId')) {
      form.setFieldValue('skillId', initialSkillId);
    }
  }, [form, searchParams]);

  useEffect(() => {
    if (!selectedSkill?.id) {
      initializedSkillIdRef.current = undefined;
      form.setFieldValue('input', {});
      return;
    }

    if (initializedSkillIdRef.current === selectedSkill.id) {
      return;
    }

    initializedSkillIdRef.current = selectedSkill.id;
    form.setFieldsValue({
      input: getInitialInputValues(schemaFields),
    });
  }, [form, schemaFields, selectedSkill]);

  useEffect(() => {
    if (!selectedSkillDisplayName || !selectedSkillId) {
      return;
    }

    const currentScheduleName = form.getFieldValue('scheduleName');
    if (!currentScheduleName) {
      form.setFieldValue('scheduleName', getDefaultScheduleName(selectedSkillDisplayName));
    }

    const currentTimezone = form.getFieldValue('timezone');
    if (!currentTimezone) {
      form.setFieldValue('timezone', 'Asia/Shanghai');
    }

    if (!form.getFieldValue('schedulePattern')) {
      form.setFieldValue('schedulePattern', 'workdays');
    }
    if (!form.getFieldValue('scheduleHour')) {
      form.setFieldValue('scheduleHour', '09');
    }
    if (!form.getFieldValue('scheduleMinute')) {
      form.setFieldValue('scheduleMinute', '00');
    }
    if (!form.getFieldValue('weeklyDays')) {
      form.setFieldValue('weeklyDays', ['1']);
    }
    if (!form.getFieldValue('monthlyDay')) {
      form.setFieldValue('monthlyDay', 1);
    }
  }, [form, selectedSkillDisplayName, selectedSkillId]);

  const createMutation = useMutation(
    async (values: ExecutionCreateFormValues) => {
      return executionApi.create({
        skillId: values.skillId,
        input: normalizeInputValues(values.input || {}, schemaFields),
      });
    },
    {
      onSuccess: async (execution) => {
        void message.success('执行已创建');
        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['dashboard-executions-recent']),
          queryClient.invalidateQueries(['dashboard-executions-total']),
          queryClient.invalidateQueries(['dashboard-executions-running']),
          queryClient.invalidateQueries(['dashboard-executions-pending-approval']),
        ]);
        navigate(`/executions/${execution.id}`);
      },
      onError: (error: Error) => {
        void message.error(`创建执行失败：${error.message}`);
      },
    }
  );

  const scheduleMutation = useMutation(
    async (values: ExecutionCreateFormValues) => {
      return scheduleApi.create({
        name: values.scheduleName?.trim() || getDefaultScheduleName(selectedSkillDisplayName),
        description: values.scheduleDescription?.trim() || undefined,
        skillId: values.skillId,
        input: normalizeInputValues(values.input || {}, schemaFields),
        cronExpression: buildScheduleCronExpression(values),
        timezone: values.timezone?.trim() || 'Asia/Shanghai',
      });
    },
    {
      onSuccess: async (schedule) => {
        void message.success(
          `定时任务已创建：${summarizeCronExpression(schedule.cronExpression)}，下次执行时间：${formatDateTime(schedule.nextRunAt)}`
        );
        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['dashboard-executions-recent']),
          queryClient.invalidateQueries(['dashboard-executions-total']),
          queryClient.invalidateQueries(['dashboard-executions-running']),
          queryClient.invalidateQueries(['dashboard-executions-pending-approval']),
          queryClient.invalidateQueries(['execution-create-schedules']),
        ]);
        form.setFieldsValue({
          scheduleName: getDefaultScheduleName(selectedSkillDisplayName),
          scheduleDescription: undefined,
          schedulePattern: 'workdays',
          scheduleHour: '09',
          scheduleMinute: '00',
          weeklyDays: ['1'],
          monthlyDay: 1,
        });
      },
      onError: (error: Error) => {
        void message.error(`创建定时任务失败：${error.message}`);
      },
    }
  );

  const toggleScheduleMutation = useMutation(
    async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return scheduleApi.update(id, { isActive });
    },
    {
      onSuccess: async (schedule) => {
        void message.success(`${schedule.name} 已${schedule.isActive ? '启用' : '停用'}`);
        await queryClient.invalidateQueries(['execution-create-schedules']);
      },
      onError: (error: Error) => {
        void message.error(`更新定时任务状态失败：${error.message}`);
      },
    }
  );

  const triggerScheduleMutation = useMutation(
    async (id: string) => scheduleApi.trigger(id),
    {
      onSuccess: async () => {
        void message.success('已触发一次立即执行');
        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['dashboard-executions-recent']),
          queryClient.invalidateQueries(['execution-create-schedules']),
        ]);
      },
      onError: (error: Error) => {
        void message.error(`触发定时任务失败：${error.message}`);
      },
    }
  );

  const deleteScheduleMutation = useMutation(
    async (id: string) => scheduleApi.delete(id),
    {
      onSuccess: async () => {
        void message.success('定时任务已删除');
        await queryClient.invalidateQueries(['execution-create-schedules']);
      },
      onError: (error: Error) => {
        void message.error(`删除定时任务失败：${error.message}`);
      },
    }
  );

  const handleSubmit = (values: ExecutionCreateFormValues) => {
    try {
      if (values.executionMode === 'schedule') {
        scheduleMutation.mutate(values);
        return;
      }
      createMutation.mutate(values);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '输入格式无效');
    }
  };

  const applyGeneratedParamsToForm = (params: Record<string, unknown>) => {
    const currentValues =
      (form.getFieldValue('input') as Record<string, unknown> | undefined) || {};
    const nextValues: Record<string, unknown> = { ...currentValues };
    schemaFields.forEach((field) => {
      if (params[field.name] !== undefined) {
        const value = params[field.name];
        const normalizedType = field.type.toLowerCase();
        if (
          (normalizedType === 'object' || normalizedType === 'json') &&
          typeof value !== 'string'
        ) {
          nextValues[field.name] = JSON.stringify(value, null, 2);
        } else {
          nextValues[field.name] = value;
        }
      }
    });
    form.setFieldValue('input', nextValues);
    void message.success('已根据AI生成结果自动填充参数');
  };

  const handleOpenAiModal = () => {
    if (!selectedSkillId) {
      void message.warning('请先选择技能');
      return;
    }
    setAiModalOpen(true);
  };

  const handleCloseAiModal = () => {
    setAiModalOpen(false);
    setAiTextInput('');
    setUploadedText('');
    setUploadedFileName('');
    setAiGenerating(false);
  };

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      const isText =
        file.type.startsWith('text/') ||
        file.type === 'application/json' ||
        /\.txt$|\.md$|\.csv$|\.json$/i.test(file.name);
      if (!isText) {
        void message.error('目前仅支持文本文件（.txt/.md/.csv/.json）用于参数识别');
        return Upload.LIST_IGNORE;
      }
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const content = String(reader.result || '');
          setUploadedText(content);
          setUploadedFileName(file.name);
          void message.success(`已读取文本文件：${file.name}`);
        };
        reader.onerror = () => {
          void message.error('读取文件失败');
        };
        reader.readAsText(file);
      } catch {
        void message.error('读取文件失败');
        return Upload.LIST_IGNORE;
      }
      return Upload.LIST_IGNORE;
    },
    multiple: false,
    maxCount: 1,
    showUploadList: false,
  };

  const handleAiGenerate = async () => {
    if (!selectedSkill) {
      void message.error('请先选择技能');
      return;
    }
    const userInput = (aiTextInput || uploadedText || '').trim();
    if (!userInput) {
      void message.warning('请输入文字或上传文本文件');
      return;
    }
    setAiGenerating(true);
    try {
      const templateId = selectedSkill.carboneTemplateId || selectedSkill.templateId || '';
      const paramsSchema = selectedSkill.paramsSchema;
      const result = await aiApi.recognizeParams({
        template_id: templateId || 'unknown',
        user_input: uploadedFileName ? `【文件：${uploadedFileName}】\n${userInput}` : userInput,
        params_schema: paramsSchema,
        context: {
          skillId: selectedSkill.id,
          skillName: selectedSkillDisplayName,
          skillDescription: selectedSkill.description,
          triggerKeywords: selectedSkill.triggerKeywords,
          tools: selectedSkill.tools,
        },
      });
      applyGeneratedParamsToForm(result.params || {});
      handleCloseAiModal();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '参数识别失败');
    } finally {
      setAiGenerating(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={{ marginBottom: 16 }}>
        <Space align="center" style={{ marginBottom: 8 }}>
          <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/executions')}>
            返回执行列表
          </Button>
        </Space>
        <Title level={4} style={{ margin: 0 }}>
          新建执行
        </Title>
      </div>

      {createMutation.isLoading && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="正在创建执行单"
          description="请求已经提交，系统正在创建执行单并准备跳转详情页，请稍候。"
        />
      )}

      {scheduleMutation.isLoading && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="正在创建定时任务"
          description="请求已经提交，系统正在保存 Cron 配置并计算下一次执行时间，请稍候。"
        />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.7fr) minmax(320px, 1fr)',
          gap: 20,
          minHeight: 0,
          flex: 1,
        }}
      >
        <Card style={panelCardStyle} styles={{ body: { maxHeight: '100%', overflowY: 'auto' } }}>
          {publishedSkillsQuery.isLoading || authorizedSkillsQuery.isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
              <Spin tip="正在加载已发布技能..." />
            </div>
          ) : skillOptions.length === 0 ? (
            <Empty description="当前没有已发布技能可发起执行" />
          ) : (
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                skillId: searchParams.get('skillId') || undefined,
                executionMode: 'immediate',
                input: {},
                timezone: 'Asia/Shanghai',
              }}
              onFinish={handleSubmit}
            >
              <div
                style={{
                  marginBottom: 16,
                  padding: 16,
                  borderRadius: 16,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Form.Item
                    name="skillId"
                    label="技能"
                    rules={[{ required: true, message: '请选择一个技能' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      size="large"
                      showSearch
                      placeholder="请选择已发布技能"
                      optionFilterProp="data-search"
                      optionLabelProp="data-label"
                      options={skillOptions.map((skill) => ({
                        value: skill.skillId,
                        label: (
                          <Space size={8}>
                            <span>{skill.skillName}</span>
                            <Tag color="green">published</Tag>
                          </Space>
                        ),
                        'data-label': skill.skillName,
                        'data-search': `${skill.skillName} ${skill.skillId}`,
                      }))}
                    />
                  </Form.Item>
                </Space>
              </div>

              <Card
                size="small"
                type="inner"
                style={{ ...panelCardStyle, marginBottom: 16 }}
                styles={{ body: { padding: 0 } }}
              >
                <Collapse ghost defaultActiveKey={['params-settings']} style={{ paddingInline: 8 }}>
                  <Panel
                    header={
                      <Space wrap size={8}>
                        <Space size={8}>
                          <SettingOutlined style={{ color: 'var(--text-secondary)' }} />
                          <Text strong>参数设置</Text>
                        </Space>
                        <Tag style={pillTagStyle}>{schemaFields.length} 个参数</Tag>
                        <Tag style={pillTagStyle}>{requiredFieldCount} 必填</Tag>
                        {optionalFieldCount > 0 ? (
                          <Tag style={pillTagStyle}>{optionalFieldCount} 可选</Tag>
                        ) : null}
                      </Space>
                    }
                    key="params-settings"
                  >
                    <div
                      style={{
                        marginBottom: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        填写本次执行所需参数
                      </Text>
                      <Space wrap size={8}>
                        <Button
                          size="small"
                          icon={<RobotOutlined />}
                          onClick={handleOpenAiModal}
                          disabled={!selectedSkillId}
                        >
                          智能识别
                        </Button>
                        <Button
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() =>
                            form.setFieldValue('input', getInitialInputValues(schemaFields))
                          }
                          disabled={!selectedSkillId}
                        >
                          恢复默认
                        </Button>
                      </Space>
                    </div>

                    {selectedSkillId && selectedSkillQuery.isFetching ? (
                      <div style={{ padding: '40px 0', textAlign: 'center' }}>
                        <Spin indicator={formLoadingIndicator} tip="正在生成参数表单..." />
                        <div style={{ marginTop: 16 }}>
                          <Text type="secondary">技能参数较多时可能需要几秒，请稍候。</Text>
                        </div>
                      </div>
                    ) : selectedSkillId ? (
                      schemaFields.length > 0 ? (
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                            gap: 12,
                          }}
                        >
                          {schemaFields.map((field) => {
                            const normalizedType = field.type.toLowerCase();
                            return (
                              <div
                                key={field.name}
                                style={{
                                  padding: 14,
                                  borderRadius: 16,
                                  border: '1px solid var(--border-color)',
                                  background: 'var(--bg-card)',
                                }}
                              >
                                <Space
                                  align="start"
                                  style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}
                                >
                                  <Space size={[6, 6]} wrap>
                                    <Text strong>{field.name}</Text>
                                    <Tag
                                      color={getTypeTagColor(field.type)}
                                      style={{ marginInlineEnd: 0, borderRadius: 999 }}
                                    >
                                      {field.type}
                                    </Tag>
                                  </Space>
                                  <Tag
                                    style={{
                                      marginInlineEnd: 0,
                                      ...pillTagStyle,
                                    }}
                                  >
                                    {field.required ? '必填' : '可选'}
                                  </Tag>
                                </Space>
                                <Text
                                  type="secondary"
                                  style={{
                                    display: 'block',
                                    fontSize: 12,
                                    minHeight: 34,
                                    marginBottom: 12,
                                  }}
                                >
                                  {field.description || (field.required ? '必填参数' : '可选参数')}
                                </Text>
                                {field.defaultValue !== undefined && (
                                  <div
                                    style={{
                                      marginBottom: 12,
                                      padding: '8px 10px',
                                      borderRadius: 10,
                                      background: 'var(--bg-secondary)',
                                    }}
                                  >
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      默认值：{typeof field.defaultValue === 'string'
                                        ? field.defaultValue
                                        : stringifyPreview(field.defaultValue)}
                                    </Text>
                                  </div>
                                )}
                                <Form.Item
                                  name={['input', field.name]}
                                  style={{ marginBottom: 8 }}
                                  rules={[
                                    {
                                      validator: (_, value) => {
                                        if (
                                          field.required &&
                                          (value === undefined || value === null || value === '')
                                        ) {
                                          return Promise.reject(new Error(`请输入 ${field.name}`));
                                        }

                                        if (
                                          value &&
                                          (normalizedType === 'object' || normalizedType === 'json') &&
                                          typeof value === 'string'
                                        ) {
                                          JSON.parse(value);
                                        }

                                        return Promise.resolve();
                                      },
                                    },
                                  ]}
                                  valuePropName={normalizedType === 'boolean' ? 'checked' : 'value'}
                                >
                                  {renderInputField(field)}
                                </Form.Item>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <Empty description="该技能没有定义额外输入参数，可直接创建执行" />
                      )
                    ) : (
                      <Empty description="请选择技能后填写参数" />
                    )}
                  </Panel>
                </Collapse>
              </Card>

              <Form.Item name="executionMode" label="执行方式">
                <div
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Space wrap size={12} style={{ flex: 1 }}>
                      <Radio.Group optionType="button" buttonStyle="solid">
                        <Radio.Button value="immediate">立即执行</Radio.Button>
                        <Radio.Button value="schedule">定时执行</Radio.Button>
                      </Radio.Group>
                      {executionMode === 'schedule' ? (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                          }}
                        >
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            规则
                          </Text>
                          <Text strong style={{ fontSize: 12 }}>
                            {buildScheduleRuleText({
                              schedulePattern,
                              scheduleHour: form.getFieldValue('scheduleHour'),
                              scheduleMinute: form.getFieldValue('scheduleMinute'),
                              weeklyDays: form.getFieldValue('weeklyDays'),
                              monthlyDay: form.getFieldValue('monthlyDay'),
                            })}
                          </Text>
                        </div>
                      ) : null}
                    </Space>
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      htmlType="submit"
                      loading={createMutation.isLoading || scheduleMutation.isLoading}
                      disabled={!selectedSkillId}
                    >
                      {executionMode === 'schedule' ? '创建定时任务' : '创建执行'}
                    </Button>
                  </div>
                </div>
              </Form.Item>

              {executionMode === 'schedule' && (
                <Card
                  size="small"
                  type="inner"
                  style={{ ...panelCardStyle, marginBottom: 16 }}
                  styles={{ body: { paddingTop: 16 } }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        gridColumn: '1 / -1',
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
                        gap: 14,
                      }}
                    >
                      <div style={{ ...subtleCardStyle, padding: 14 }}>
                        <Form.Item
                          name="scheduleName"
                          label="任务名称"
                          rules={[{ required: true, message: '请输入定时任务名称' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="例如：日报生成-工作日早上" />
                        </Form.Item>
                      </div>
                      <div style={{ ...subtleCardStyle, padding: 14 }}>
                        <Form.Item
                          name="timezone"
                          label="时区"
                          rules={[{ required: true, message: '请选择时区' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select options={TIMEZONE_OPTIONS} placeholder="请选择时区" />
                        </Form.Item>
                      </div>
                    </div>

                    <div
                      style={{
                        gridColumn: '1 / -1',
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
                        gap: 14,
                      }}
                    >
                      <div style={{ ...subtleCardStyle, padding: 10 }}>
                        <Text
                          type="secondary"
                          style={{ display: 'block', fontSize: 12, marginBottom: 8 }}
                        >
                          执行周期
                        </Text>
                        <Form.Item
                          name="schedulePattern"
                          rules={[{ required: true, message: '请选择执行周期' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Radio.Group
                            optionType="button"
                            buttonStyle="solid"
                            style={{
                              width: '100%',
                              display: 'grid',
                              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                            }}
                          >
                            <Radio.Button value="workdays">工作日</Radio.Button>
                            <Radio.Button value="weekly">按周</Radio.Button>
                            <Radio.Button value="monthly">按月</Radio.Button>
                          </Radio.Group>
                        </Form.Item>
                      </div>

                      <div style={{ ...subtleCardStyle, padding: 14 }}>
                        <Text
                          type="secondary"
                          style={{ display: 'block', fontSize: 12, marginBottom: 8 }}
                        >
                          执行时间
                        </Text>
                        <Form.Item style={{ marginBottom: 0 }}>
                          <div
                            style={{
                              display: 'inline-grid',
                              gridTemplateColumns: '84px auto 84px',
                              gap: 6,
                              alignItems: 'center',
                            }}
                          >
                            <Form.Item
                              name="scheduleHour"
                              noStyle
                              rules={[{ required: true, message: '请选择小时' }]}
                            >
                              <Select
                                size="small"
                                style={{ width: '100%' }}
                                options={HOUR_OPTIONS}
                                placeholder="小时"
                              />
                            </Form.Item>
                            <Text style={{ textAlign: 'center', minWidth: 12 }}>:</Text>
                            <Form.Item
                              name="scheduleMinute"
                              noStyle
                              rules={[{ required: true, message: '请选择分钟' }]}
                            >
                              <Select
                                size="small"
                                style={{ width: '100%' }}
                                options={MINUTE_OPTIONS}
                                placeholder="分钟"
                              />
                            </Form.Item>
                          </div>
                        </Form.Item>
                      </div>
                    </div>

                    {schedulePattern === 'weekly' && (
                      <div style={{ ...subtleCardStyle, padding: 14, gridColumn: '1 / -1' }}>
                        <Form.Item
                          name="weeklyDays"
                          label="每周执行日"
                          rules={[{ required: true, message: '请选择每周执行日' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Checkbox.Group options={WEEKDAY_OPTIONS} />
                        </Form.Item>
                      </div>
                    )}

                    {schedulePattern === 'monthly' && (
                      <div style={{ ...subtleCardStyle, padding: 14, gridColumn: '1 / -1' }}>
                        <Form.Item
                          name="monthlyDay"
                          label="每月执行日"
                          rules={[{ required: true, message: '请选择每月执行日' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select
                            style={{ maxWidth: 240 }}
                            options={MONTH_DAY_OPTIONS}
                            placeholder="请选择每月几号执行"
                          />
                        </Form.Item>
                      </div>
                    )}

                    <div style={{ ...subtleCardStyle, gridColumn: '1 / -1', padding: 14 }}>
                      <Form.Item
                        name="scheduleDescription"
                        label="说明"
                        style={{ marginBottom: 0 }}
                      >
                        <Input.TextArea
                          rows={3}
                          placeholder="可选，补充任务用途、时间窗口或通知说明"
                        />
                      </Form.Item>
                    </div>
                  </div>
                </Card>
              )}

              <Space>
                <Button
                  onClick={() =>
                    form.resetFields([
                      'executionMode',
                      'skillId',
                      'input',
                      'scheduleName',
                      'scheduleDescription',
                      'timezone',
                      'schedulePattern',
                      'scheduleHour',
                      'scheduleMinute',
                      'weeklyDays',
                      'monthlyDay',
                    ])
                  }
                >
                  重置
                </Button>
                {executionMode !== 'schedule' && selectedSkillId ? (
                  <Button onClick={() => form.setFieldValue('executionMode', 'schedule')}>
                    去配置定时任务
                  </Button>
                ) : null}
                <Button onClick={() => navigate('/executions')}>取消</Button>
              </Space>
            </Form>
          )}
        </Card>

        <Space
          direction="vertical"
          size="middle"
          style={{ width: '100%', minHeight: 0, overflowY: 'auto' }}
        >
          <Card
            title="技能信息"
            style={panelCardStyle}
            styles={{ body: { padding: 0 } }}
          >
            <Collapse ghost defaultActiveKey={[]}>
              <Panel
                header={
                  <Space wrap size={8}>
                    <Text strong>技能信息</Text>
                    {selectedSkillId ? <Tag>{selectedSkillDisplayName}</Tag> : null}
                  </Space>
                }
                key="skill-info"
              >
                <div style={{ padding: '0 16px 16px' }}>
                  {selectedSkill ? (
                    <Descriptions bordered size="small" column={1}>
                      <Descriptions.Item label="名称">{selectedSkillDisplayName}</Descriptions.Item>
                      <Descriptions.Item label="技能标识">{selectedSkill.id}</Descriptions.Item>
                      <Descriptions.Item label="状态">
                        <Tag color={selectedSkill.isActive ? 'green' : 'default'}>
                          {selectedSkill.isActive ? 'active' : 'inactive'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="描述">
                        {selectedSkill.description || <Text type="secondary">暂无描述</Text>}
                      </Descriptions.Item>
                      <Descriptions.Item label="工具">
                        <Space wrap>
                          {(selectedSkill.tools || []).length > 0 ? (
                            selectedSkill.tools.map((tool) => (
                              <Tag key={tool} color="purple">
                                {tool}
                              </Tag>
                            ))
                          ) : (
                            <Text type="secondary">无</Text>
                          )}
                        </Space>
                      </Descriptions.Item>
                    </Descriptions>
                  ) : selectedSkillId && selectedSkillQuery.isFetching ? (
                    <div style={{ padding: '32px 0', textAlign: 'center' }}>
                      <Spin indicator={formLoadingIndicator} tip="正在加载技能信息..." />
                    </div>
                  ) : (
                    <Empty description="选择技能后可查看说明" />
                  )}
                </div>
              </Panel>
            </Collapse>
          </Card>

          <Card
            title={
              <Space size={8}>
                <ClockCircleOutlined style={{ color: 'var(--text-secondary)' }} />
                <Text strong>当前定时配置</Text>
              </Space>
            }
            extra={
              <Button
                size="small"
                type="link"
                disabled={!selectedSkillId}
                onClick={() => form.setFieldValue('executionMode', 'schedule')}
              >
                新建
              </Button>
            }
            style={panelCardStyle}
          >
            {!selectedSkillId ? (
              <Empty description="选择技能后查看当前定时任务配置" />
            ) : schedulesQuery.isLoading ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <Spin tip="正在加载定时任务..." />
              </div>
            ) : skillSchedules.length === 0 ? (
              <Empty description="当前技能还没有定时任务配置" />
            ) : (
              <>
                <div
                  style={{
                    marginBottom: 16,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 14,
                  }}
                >
                  <Card
                    size="small"
                    style={subtleCardStyle}
                  >
                    <Statistic title="总数" value={skillSchedules.length} />
                  </Card>
                  <Card
                    size="small"
                    style={subtleCardStyle}
                  >
                    <Statistic title="启用中" value={activeScheduleCount} valueStyle={{ color: '#1677ff' }} />
                  </Card>
                </div>
                <List
                  dataSource={skillSchedules}
                  renderItem={(schedule) => {
                    const updatingThisSchedule =
                      toggleScheduleMutation.isLoading &&
                      toggleScheduleMutation.variables?.id === schedule.id;
                    const deletingThisSchedule =
                      deleteScheduleMutation.isLoading &&
                      deleteScheduleMutation.variables === schedule.id;
                    const triggeringThisSchedule =
                      triggerScheduleMutation.isLoading &&
                      triggerScheduleMutation.variables === schedule.id;

                    return (
                      <List.Item style={{ paddingInline: 0 }}>
                        <Card
                          size="small"
                          style={{
                            width: '100%',
                            ...subtleCardStyle,
                            borderRadius: 16,
                          }}
                        >
                          <Collapse ghost defaultActiveKey={[]} style={{ margin: -8 }}>
                            <Panel
                              key={schedule.id}
                              header={
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <Space wrap size={8}>
                                    <Text strong>{schedule.name}</Text>
                                    <Tag style={pillTagStyle}>
                                      {schedule.isActive ? '启用中' : '已停用'}
                                    </Tag>
                                    <Tag icon={<ClockCircleOutlined />} style={pillTagStyle}>
                                      {summarizeCronExpression(schedule.cronExpression)}
                                    </Tag>
                                  </Space>
                                  <Space wrap size={8}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      下次执行：{formatDateTime(schedule.nextRunAt)}
                                    </Text>
                                    <Tag style={pillTagStyle}>{schedule.timezone}</Tag>
                                  </Space>
                                </div>
                              }
                            >
                              <Space
                                direction="vertical"
                                size={10}
                                style={{ width: '100%' }}
                              >
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  更新时间：{formatDateTime(schedule.updatedAt)}
                                </Text>

                                {schedule.description ? (
                                  <Text type="secondary">{schedule.description}</Text>
                                ) : null}

                                <div
                                  style={{
                                    padding: 10,
                                    borderRadius: 12,
                                    background: 'var(--bg-secondary)',
                                  }}
                                >
                                  <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
                                    输入参数预览
                                  </Text>
                                  <pre
                                    style={{
                                      margin: 0,
                                      fontSize: 12,
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-word',
                                      maxHeight: 120,
                                      overflow: 'auto',
                                    }}
                                  >
                                    {stringifyPreview(schedule.input)}
                                  </pre>
                                </div>

                                <Space wrap size={8}>
                                  <Text type="secondary">上次执行：{formatDateTime(schedule.lastRunAt)}</Text>
                                </Space>

                                <Space wrap>
                                  <Button
                                    size="small"
                                    icon={<PlayCircleOutlined />}
                                    loading={triggeringThisSchedule}
                                    onClick={() => triggerScheduleMutation.mutate(schedule.id)}
                                  >
                                    立即触发
                                  </Button>
                                  <Button
                                    size="small"
                                    icon={schedule.isActive ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                                    loading={updatingThisSchedule}
                                    onClick={() =>
                                      toggleScheduleMutation.mutate({
                                        id: schedule.id,
                                        isActive: !schedule.isActive,
                                      })
                                    }
                                  >
                                    {schedule.isActive ? '停用' : '启用'}
                                  </Button>
                                  <Popconfirm
                                    title="确认删除这个定时任务吗？"
                                    onConfirm={() => deleteScheduleMutation.mutate(schedule.id)}
                                  >
                                    <Button
                                      size="small"
                                      danger
                                      icon={<DeleteOutlined />}
                                      loading={deletingThisSchedule}
                                    >
                                      删除
                                    </Button>
                                  </Popconfirm>
                                </Space>
                              </Space>
                            </Panel>
                          </Collapse>
                        </Card>
                      </List.Item>
                    );
                  }}
                />
              </>
            )}
          </Card>
        </Space>
      </div>
      <Modal
        title="智能识别参数"
        open={aiModalOpen}
        onCancel={handleCloseAiModal}
        onOk={() => void handleAiGenerate()}
        okText={aiGenerating ? '正在识别...' : '识别并填充'}
        confirmLoading={aiGenerating}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input.TextArea
            rows={4}
            placeholder="请输入你的需求描述，系统将基于技能参数 schema 自动识别并填充"
            value={aiTextInput}
            onChange={(e) => setAiTextInput(e.target.value)}
          />
          <Space direction="vertical" style={{ width: '100%' }}>
            <Upload.Dragger {...uploadProps} style={{ padding: 8 }}>
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">拖拽或点击上传文本文件（.txt/.md/.csv/.json）</p>
              <p className="ant-upload-hint">
                将读取文件文本用于参数识别；暂不支持直接解析PDF/Word。
              </p>
            </Upload.Dragger>
            {uploadedFileName ? <Text type="secondary">已选择文件：{uploadedFileName}</Text> : null}
          </Space>
        </Space>
      </Modal>
    </div>
  );
};

export default ExecutionCreatePage;
