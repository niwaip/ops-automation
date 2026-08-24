import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Table,
  Card,
  Button,
  Input,
  Space,
  Tag,
  Typography,
  Modal,
  message,
  Form,
  Select,
  Descriptions,
  Tabs,
  Tooltip,
  Collapse,
  Steps,
  Divider,
  Badge,
  Alert,
  Popconfirm,
  Progress,
  Empty,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  KeyOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  RocketOutlined,
  FileTextOutlined,
  OrderedListOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DragOutlined,
  CloseOutlined,
  CodeOutlined,
  MessageOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  skillApi,
  builtinSkillApi,
  roleApi,
  SkillConfigDTO,
  SkillAccessRequestReviewDTO,
  SkillPermissionDTO,
  CreateSkillDTO,
  SkillValidationResult,
  SkillValidationStreamEvent,
} from '@/api/skill';
import {
  isRegistryBuiltinSkill,
  mergeSkillInventory,
} from '@/features/admin/skills/builtinSkillInventory';
import { userApi } from '@/api/auth';
import { carboneApi, CarboneTemplateDTO } from '@/api/carbone';
import { executionFlowApi } from '@/api/flows';
import { SkillAccessRequestReviewTab } from '@/features/admin/skills/components/SkillAccessRequestReviewTab';
import { SkillAdminTabs, SkillAdminTabKey } from '@/features/admin/skills/components/SkillAdminTabs';
import type { ColumnsType } from 'antd/es/table';
import {
  OverviewStatGrid,
  ListSectionHeader,
} from '@/components/page/PageScaffold';

const { Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;
const { Panel } = Collapse;

type SkillParamFormItem = {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  description: string;
  required?: boolean;
  defaultValue?: string;
  extractionPrompt?: string;
};

const BUILTIN_SKILL_NAMES = new Set([
  'markdown_artifact_writer',
  'general_document_generator',
  'system_status_checker',
  'platform.document.markdown-artifact-writer',
  'platform.notification.internal-message',
]);

const isBuiltinSkill = (skill: SkillConfigDTO): boolean => {
  if (isRegistryBuiltinSkill(skill)) {
    return true;
  }

  const id = (skill.id || '').toLowerCase();
  const name = (skill.name || '').toLowerCase();
  const sourceType = (skill.publishedSourceType || '').toLowerCase();

  if (BUILTIN_SKILL_NAMES.has(id) || BUILTIN_SKILL_NAMES.has(name)) {
    return true;
  }

  if (
    id.startsWith('platform.') ||
    id.startsWith('builtin.') ||
    id.startsWith('system.') ||
    name.startsWith('platform.') ||
    name.startsWith('builtin.') ||
    name.startsWith('system.')
  ) {
    return true;
  }

  if (
    sourceType === 'builtin' ||
    sourceType === 'builtin_workflow' ||
    sourceType === 'system' ||
    sourceType === 'default' ||
    sourceType.includes('builtin')
  ) {
    return true;
  }

  return false;
};

const schemaToFormParams = (
  paramsSchema?: SkillConfigDTO['paramsSchema']
): SkillParamFormItem[] => {
  if (!paramsSchema?.properties) {
    return [];
  }

  return Object.entries(paramsSchema.properties).map(([name, config]) => ({
    name,
    type: config.type,
    description: config.description,
    required: paramsSchema.required.includes(name),
    defaultValue: config.default !== undefined ? String(config.default) : undefined,
    extractionPrompt: config.extractionPrompt,
  }));
};

const formParamsToSchema = (items: SkillParamFormItem[] = []) => {
  const properties: Record<
    string,
    {
      type: 'string' | 'number' | 'date' | 'boolean';
      description: string;
      required?: boolean;
      default?: string | number | boolean;
      extractionPrompt?: string;
    }
  > = {};
  const required: string[] = [];

  items.forEach((item) => {
    if (!item?.name) {
      return;
    }

    properties[item.name] = {
      type: item.type,
      description: item.description,
      required: !!item.required,
      extractionPrompt: item.extractionPrompt || undefined,
    };

    if (item.defaultValue !== undefined && item.defaultValue !== '') {
      properties[item.name].default =
        item.type === 'number'
          ? Number(item.defaultValue)
          : item.type === 'boolean'
            ? item.defaultValue === 'true'
            : item.defaultValue;
    }

    if (item.required) {
      required.push(item.name);
    }
  });

  return { properties, required };
};

// Step types for execution flow
const STEP_TYPES = [
  { label: '提示词 (Prompt)', value: 'text', icon: <MessageOutlined />, color: 'blue' },
  { label: 'API 调用', value: 'api', icon: <ApiOutlined />, color: 'green' },
  { label: '工具调用', value: 'tool', icon: <SettingOutlined />, color: 'purple' },
  { label: '脚本执行', value: 'script', icon: <CodeOutlined />, color: 'orange' },
];

const VALIDATION_PHASES = ['启动', '配置检查', '真实执行', 'AI 审计'];

const getValidationProgressMeta = (stage: string, isRunning: boolean, pulse: number) => {
  const normalized = stage.trim();
  const pulseOffset = pulse % 6;

  if (!normalized || normalized === '等待开始' || normalized === '正在启动验证') {
    return {
      current: 0,
      percent: isRunning ? Math.min(18, 12 + pulseOffset) : 0,
      status: isRunning ? ('active' as const) : ('normal' as const),
    };
  }

  if (normalized.includes('配置')) {
    return {
      current: 1,
      percent: Math.min(38, 28 + pulseOffset),
      status: 'active' as const,
    };
  }

  if (normalized.includes('真实模拟执行') || normalized.includes('执行')) {
    return {
      current: 2,
      percent: Math.min(72, 56 + pulseOffset * 2),
      status: 'active' as const,
    };
  }

  if (normalized.includes('审计')) {
    return {
      current: 3,
      percent: Math.min(92, 82 + pulseOffset),
      status: 'active' as const,
    };
  }

  if (normalized.includes('完成')) {
    return {
      current: 3,
      percent: 100,
      status: 'success' as const,
    };
  }

  if (normalized.includes('失败')) {
    return {
      current: 3,
      percent: 100,
      status: 'exception' as const,
    };
  }

  return {
    current: 0,
    percent: isRunning ? Math.min(24, 14 + pulseOffset) : 0,
    status: isRunning ? ('active' as const) : ('normal' as const),
  };
};

interface SkillAdminPageProps {
  embedded?: boolean;
  initialSkillId?: string;
}

const SkillAdminPage: React.FC<SkillAdminPageProps> = ({ embedded, initialSkillId }) => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchText, setSearchText] = useState(searchParams.get('q') || '');
  const [activeTabKey, setActiveTabKey] = useState<SkillAdminTabKey>(
    (searchParams.get('tab') as SkillAdminTabKey) || 'builtin'
  );
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [validationModalVisible, setValidationModalVisible] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillConfigDTO | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillConfigDTO | null>(null);
  const [validationResult, setValidationResult] = useState<SkillValidationResult | null>(null);
  const [validatingSkillId, setValidatingSkillId] = useState<string | null>(null);
  const [validationLogs, setValidationLogs] = useState<string[]>([]);
  const [validationStage, setValidationStage] = useState('等待开始');
  const [validationPulse, setValidationPulse] = useState(0);
  const [permissionUserSearch, setPermissionUserSearch] = useState('');
  const [processingAccessRequestId, setProcessingAccessRequestId] = useState<string | null>(null);
  const [processingAccessRequestAction, setProcessingAccessRequestAction] = useState<
    'approve' | 'reject' | null
  >(null);
  const [form] = Form.useForm();
  const validationAbortRef = useRef<(() => void) | null>(null);

  // Queries
  const skillsQuery = useQuery(['skills'], skillApi.list);
  const builtinSkillsQuery = useQuery(['builtin-skill-inventory'], builtinSkillApi.listInventory);
  const rolesQuery = useQuery(['roles'], roleApi.list);
  const permissionUsersQuery = useQuery(
    ['permission-users', permissionModalVisible],
    () => userApi.list({ page: 1 }),
    { enabled: permissionModalVisible }
  );
  const templatesQuery = useQuery(['carbone-templates'], carboneApi.list);
  const executionFlowTemplatesQuery = useQuery(['flows'], () =>
    executionFlowApi.list({ isActive: true })
  );

  const permissionsQuery = useQuery(
    ['skill-permissions', selectedSkill?.id],
    () => skillApi.getPermissions(selectedSkill!.id),
    {
      enabled:
        permissionModalVisible && !!selectedSkill && !isRegistryBuiltinSkill(selectedSkill),
    }
  );
  const accessRequestsQuery = useQuery(
    ['skill-access-requests', selectedSkill?.id],
    () => skillApi.getAccessRequests(selectedSkill!.id, 'pending'),
    { enabled: permissionModalVisible && !!selectedSkill }
  );
  const approvedAccessRequestsQuery = useQuery(
    ['skill-access-requests', selectedSkill?.id, 'approved'],
    () => skillApi.getAccessRequests(selectedSkill!.id, 'approved'),
    { enabled: permissionModalVisible && !!selectedSkill }
  );
  const rejectedAccessRequestsQuery = useQuery(
    ['skill-access-requests', selectedSkill?.id, 'rejected'],
    () => skillApi.getAccessRequests(selectedSkill!.id, 'rejected'),
    { enabled: permissionModalVisible && !!selectedSkill }
  );

  const allSkills = useMemo(
    () =>
      mergeSkillInventory(
        skillsQuery.data?.skills || [],
        builtinSkillsQuery.data?.skills || []
      ),
    [skillsQuery.data?.skills, builtinSkillsQuery.data?.skills]
  );

  // Mutations
  const createMutation = useMutation(skillApi.create, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['skills']);
      setEditModalVisible(false);
      form.resetFields();
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateSkillDTO> }) => skillApi.update(id, data),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['skills']);
        setEditModalVisible(false);
        setEditingSkill(null);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const deleteMutation = useMutation(skillApi.delete, {
    onSuccess: (_, deletedSkillId) => {
      message.success('Skill 已删除');
      queryClient.invalidateQueries(['skills']);
      if (selectedSkill?.id === deletedSkillId) {
        setSelectedSkill(null);
        setDetailModalVisible(false);
        setPermissionModalVisible(false);
        setValidationModalVisible(false);
      }
      if (editingSkill?.id === deletedSkillId) {
        setEditingSkill(null);
        setEditModalVisible(false);
        form.resetFields();
      }
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const grantMutation = useMutation(
    ({ skillId, roleId }: { skillId: string; roleId: string }) => skillApi.grant(skillId, roleId),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['skill-permissions', selectedSkill?.id]);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const revokeMutation = useMutation(
    ({ skillId, roleId }: { skillId: string; roleId: string }) => skillApi.revoke(skillId, roleId),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['skill-permissions', selectedSkill?.id]);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const approveAccessRequestMutation = useMutation(
    ({ requestId, responseNote }: { requestId: string; responseNote?: string }) =>
      skillApi.approveAccessRequest(requestId, { responseNote }),
    {
      onMutate: ({ requestId }) => {
        setProcessingAccessRequestId(requestId);
        setProcessingAccessRequestAction('approve');
      },
      onSuccess: () => {
        message.success('授权申请已批准');
        queryClient.invalidateQueries(['skill-access-requests', selectedSkill?.id]);
        queryClient.invalidateQueries(['skill-access-requests', selectedSkill?.id, 'approved']);
        queryClient.invalidateQueries(['skill-access-requests', selectedSkill?.id, 'rejected']);
        queryClient.invalidateQueries(['skill-permissions', selectedSkill?.id]);
      },
      onError: (error: any) => {
        const errorMessage = error?.response?.data?.message || error?.message || '批准授权申请失败';
        message.error(typeof errorMessage === 'string' ? errorMessage : '批准授权申请失败');
      },
      onSettled: () => {
        setProcessingAccessRequestId(null);
        setProcessingAccessRequestAction(null);
      },
    }
  );

  const rejectAccessRequestMutation = useMutation(
    ({ requestId, responseNote }: { requestId: string; responseNote?: string }) =>
      skillApi.rejectAccessRequest(requestId, { responseNote }),
    {
      onMutate: ({ requestId }) => {
        setProcessingAccessRequestId(requestId);
        setProcessingAccessRequestAction('reject');
      },
      onSuccess: () => {
        message.success('授权申请已拒绝');
        queryClient.invalidateQueries(['skill-access-requests', selectedSkill?.id]);
        queryClient.invalidateQueries(['skill-access-requests', selectedSkill?.id, 'approved']);
        queryClient.invalidateQueries(['skill-access-requests', selectedSkill?.id, 'rejected']);
      },
      onError: (error: any) => {
        const errorMessage = error?.response?.data?.message || error?.message || '拒绝授权申请失败';
        message.error(typeof errorMessage === 'string' ? errorMessage : '拒绝授权申请失败');
      },
      onSettled: () => {
        setProcessingAccessRequestId(null);
        setProcessingAccessRequestAction(null);
      },
    }
  );

  const applyAdjustmentMutation = useMutation(
    ({ id, generatedSkill }: { id: string; generatedSkill?: Partial<CreateSkillDTO> }) =>
      skillApi.applyAdjustment(id, generatedSkill),
    {
      onSuccess: (updatedSkill) => {
        queryClient.invalidateQueries(['skills']);
        setSelectedSkill(updatedSkill);
        setValidationModalVisible(false);
        setDetailModalVisible(false);
        handleEdit(updatedSkill);
        message.success('已应用 AI 建议，并打开技能编辑器供你确认结果');
      },
      onError: (error: any) => {
        const errorMessage = error?.response?.data?.message || error?.message || '应用建议失败';
        message.error(typeof errorMessage === 'string' ? errorMessage : '应用建议失败');
      },
    }
  );

  const appendValidationLog = (log: string) => {
    setValidationLogs((prev) => [...prev, log]);
  };

  const handleApproveAccessRequest = (
    request: SkillAccessRequestReviewDTO,
    responseNote?: string
  ) => {
    approveAccessRequestMutation.mutate({ requestId: request.id, responseNote });
  };

  const handleRejectAccessRequest = (
    request: SkillAccessRequestReviewDTO,
    responseNote?: string
  ) => {
    rejectAccessRequestMutation.mutate({ requestId: request.id, responseNote });
  };

  const stopValidationStream = () => {
    validationAbortRef.current?.();
    validationAbortRef.current = null;
  };

  const resetValidationState = (options?: { keepSelectedSkill?: boolean }) => {
    stopValidationStream();
    setValidationResult(null);
    setValidationLogs([]);
    setValidationStage('等待开始');
    setValidatingSkillId(null);
    if (!options?.keepSelectedSkill) {
      setSelectedSkill(null);
    }
  };

  useEffect(() => {
    return () => {
      stopValidationStream();
    };
  }, []);

  useEffect(() => {
    if (embedded && initialSkillId && allSkills.length > 0) {
      const skill = allSkills.find((s) => s.id === initialSkillId);
      if (skill) {
        setSelectedSkill(skill);
        // 在内嵌模式下，我们直接展示详情内容，不需要 Modal
      }
      return;
    }

    const keyword = searchParams.get('q') || '';
    setSearchText(keyword);

    const tabParam = searchParams.get('tab') as SkillAdminTabKey;
    if (['builtin', 'custom', 'llm', 'all'].includes(tabParam)) {
      setActiveTabKey(tabParam);
    }

    const skillId = searchParams.get('id');
    if (skillId && allSkills.length > 0) {
      const skill = allSkills.find((s) => s.id === skillId);
      if (skill) {
        setSelectedSkill(skill);
        setDetailModalVisible(true);
      }
    }
  }, [searchParams, allSkills, embedded, initialSkillId]);

  useEffect(() => {
    if (!validatingSkillId) {
      setValidationPulse(0);
      return;
    }

    const timer = window.setInterval(() => {
      setValidationPulse((prev) => prev + 1);
    }, 450);

    return () => window.clearInterval(timer);
  }, [validatingSkillId]);

  // Handlers
  const handleCreate = () => {
    setEditingSkill(null);
    form.resetFields();
    form.setFieldsValue({
      triggerKeywords: [],
      executionFlow: [],
      tools: [],
      parameterDefinitions: [],
      executionFlowTemplateIds: [],
    });
    setEditModalVisible(true);
  };

  const handleEdit = (skill: SkillConfigDTO) => {
    setEditingSkill(skill);
    form.setFieldsValue({
      name: skill.name,
      description: skill.description,
      triggerKeywords: skill.triggerKeywords,
      executionFlow: skill.executionFlow || [],
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: skill.executionFlowTemplateIds || [],
      parameterDefinitions: schemaToFormParams(skill.paramsSchema),
    });
    setEditModalVisible(true);
  };

  const handleViewDetail = (skill: SkillConfigDTO) => {
    setSelectedSkill(skill);
    setDetailModalVisible(true);
  };

  const handleSave = () => {
    form.validateFields().then((values) => {
      const paramsSchema = formParamsToSchema(values.parameterDefinitions || []);

      const data: CreateSkillDTO = {
        name: values.name,
        description: values.description,
        triggerKeywords: values.triggerKeywords || [],
        executionFlow: values.executionFlow || [],
        paramsSchema,
        templateId: values.templateId,
        carboneTemplateId: values.carboneTemplateId,
        carboneSkillId: values.carboneSkillId,
        executionFlowTemplateIds: values.executionFlowTemplateIds || [],
      };

      if (editingSkill) {
        updateMutation.mutate({ id: editingSkill.id, data });
      } else {
        createMutation.mutate(data);
      }
    });
  };

  const handleDelete = (id: string, name?: string) => {
    Modal.confirm({
      title: `确认删除 Skill${name ? `「${name}」` : ''}？`,
      content: '删除后无法恢复，相关角色授权也会一并失效。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const handleManagePermissions = (skill: SkillConfigDTO) => {
    setSelectedSkill(skill);
    setPermissionModalVisible(true);
  };

  const handleGrantRole = (roleId: string) => {
    if (selectedSkill) {
      grantMutation.mutate({ skillId: selectedSkill.id, roleId });
    }
  };

  const handleRevokeRole = (roleId: string) => {
    if (selectedSkill) {
      revokeMutation.mutate({ skillId: selectedSkill.id, roleId });
    }
  };

  const handleValidationEvent = (event: SkillValidationStreamEvent) => {
    if (event.type === 'stage') {
      setValidationStage(event.content || '处理中');
      appendValidationLog(`[阶段] ${event.content}`);
      return;
    }

    if (event.type === 'log') {
      appendValidationLog(event.content);
      return;
    }

    if (event.type === 'result') {
      const validation = event.data?.validation as SkillValidationResult | undefined;
      if (validation) {
        setValidationResult(validation);
      }
      setValidationStage('验证完成');
      setValidatingSkillId(null);
      validationAbortRef.current = null;
      return;
    }

    if (event.type === 'error') {
      appendValidationLog(`[错误] ${event.content}`);
      setValidationStage('验证失败');
      setValidatingSkillId(null);
      validationAbortRef.current = null;
      message.error(event.content || '验证失败');
    }
  };

  const handleValidate = (skill: SkillConfigDTO) => {
    stopValidationStream();
    setSelectedSkill(skill);
    setValidationResult(null);
    setValidationLogs([]);
    setValidationStage('正在启动验证');
    setValidatingSkillId(skill.id);
    setValidationModalVisible(true);
    validationAbortRef.current = skillApi.streamValidate(
      skill.id,
      handleValidationEvent,
      (error) => {
        appendValidationLog(`[错误] ${error.message}`);
        setValidationStage('验证失败');
        setValidatingSkillId(null);
        validationAbortRef.current = null;
        message.error(error.message || '验证失败');
      },
      () => {
        setValidatingSkillId((current) => (current === skill.id ? null : current));
        validationAbortRef.current = null;
      }
    );
  };

  const handleCloseValidationModal = () => {
    resetValidationState();
    setValidationModalVisible(false);
  };

  const handleApplySuggestion = () => {
    if (!selectedSkill || !validationResult?.details?.skillSimulation?.generatedSkill) {
      return;
    }

    applyAdjustmentMutation.mutate({
      id: selectedSkill.id,
      generatedSkill: validationResult.details.skillSimulation
        .generatedSkill as Partial<CreateSkillDTO>,
    });
  };

  // Filter skills by search text & tab
  const builtinSkillsCount = useMemo(
    () => allSkills.filter(isBuiltinSkill).length,
    [allSkills]
  );

  const customSkillsCount = useMemo(
    () => allSkills.filter((s) => !isBuiltinSkill(s)).length,
    [allSkills]
  );

  const filteredSkills = useMemo(() => {
    const keyword = searchText.toLowerCase().trim();
    return allSkills.filter((skill) => {
      if (!keyword) return true;
      return (
        skill.name.toLowerCase().includes(keyword) ||
        (skill.description || '').toLowerCase().includes(keyword) ||
        skill.triggerKeywords?.some((triggerKeyword) =>
          triggerKeyword.toLowerCase().includes(keyword)
        ) ||
        skill.tools?.some((toolName) => toolName.toLowerCase().includes(keyword)) ||
        skill.effectiveTools?.some((toolName) => toolName.toLowerCase().includes(keyword))
      );
    });
  }, [allSkills, searchText]);

  const displayedSkills = useMemo(() => {
    if (activeTabKey === 'builtin') {
      return filteredSkills.filter(isBuiltinSkill);
    }
    if (activeTabKey === 'custom') {
      return filteredSkills.filter((s) => !isBuiltinSkill(s));
    }
    return filteredSkills;
  }, [filteredSkills, activeTabKey]);
  const validationProgressMeta = getValidationProgressMeta(
    validationResult ? '验证完成' : validationStage,
    Boolean(validatingSkillId),
    validationPulse
  );
  const validationAnimatedDots = '.'.repeat((validationPulse % 3) + 1);

  // Render execution flow steps
  const renderExecutionFlow = (flow: any[]) => {
    if (!flow || flow.length === 0) return <Text type="secondary">未配置</Text>;

    return (
      <Steps
        size="small"
        direction="vertical"
        current={-1}
        items={flow.map((step) => {
          const typeInfo = STEP_TYPES.find((t) => t.value === step.type) || {
            label: step.type,
            icon: <SettingOutlined />,
            color: 'default',
          };
          return {
            title: (
              <Space>
                <Tag color={typeInfo.color}>{typeInfo.label}</Tag>
                <Text strong>{step.name}</Text>
              </Space>
            ),
            description: (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {step.content ||
                  step.api?.endpoint ||
                  step.tool?.name ||
                  step.script?.language ||
                  '无详情'}
              </div>
            ),
            status: 'wait',
            icon: typeInfo.icon,
          };
        })}
      />
    );
  };

  // Render API endpoints
  const renderApiEndpoints = (endpoints: SkillConfigDTO['apiEndpoints']) => {
    if (!endpoints) return <Text type="secondary">未配置</Text>;

    return (
      <Space direction="vertical" size="small">
        {endpoints.render && (
          <Tag color="blue" icon={<ApiOutlined />}>
            文档渲染: {endpoints.render.url}
          </Tag>
        )}
        {endpoints.getSkill && (
          <Tag color="purple" icon={<InfoCircleOutlined />}>
            获取技能: {endpoints.getSkill.url}
          </Tag>
        )}
      </Space>
    );
  };

  // Columns
  const columns: ColumnsType<SkillConfigDTO> = [
    {
      title: t('admin:skillName'),
      dataIndex: 'name',
      key: 'name',
      width: 150,
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: t('admin:skillDescription'),
      dataIndex: 'description',
      key: 'description',
      width: 240,
      ellipsis: true,
    },
    {
      title: '执行流程',
      key: 'executionFlow',
      width: 200,
      render: (_, record) => {
        const hasTemplates =
          record.executionFlowTemplateIds && record.executionFlowTemplateIds.length > 0;
        const hasInline = record.executionFlow && record.executionFlow.length > 0;

        if (hasTemplates && hasInline) {
          return (
            <Tag color="orange" icon={<OrderedListOutlined />}>
              模板 + 手动追加
            </Tag>
          );
        }
        if (hasTemplates) {
          return (
            <Tag color="processing" icon={<OrderedListOutlined />}>
              关联模板流程
            </Tag>
          );
        }
        if (!hasInline) {
          return <Text type="secondary">默认流程</Text>;
        }
        return (
          <Space wrap>
            {record.executionFlow.map((step, idx) => (
              <Badge
                key={idx}
                count={idx + 1}
                size="small"
                style={{ backgroundColor: 'var(--primary-color)' }}
              >
                <Tag style={{ margin: 0 }}>{step.name}</Tag>
              </Badge>
            ))}
          </Space>
        );
      },
    },
    {
      title: t('admin:triggerKeywords'),
      dataIndex: 'triggerKeywords',
      key: 'triggerKeywords',
      width: 150,
      render: (keywords: string[]) => (
        <Tooltip title="AI匹配失败时的回退方案">
          <Space size="small" wrap>
            {keywords?.slice(0, 3).map((kw) => (
              <Tag key={kw} color="orange">
                {kw}
              </Tag>
            ))}
            {keywords?.length > 3 && <Tag>+{keywords.length - 3}</Tag>}
          </Space>
        </Tooltip>
      ),
    },
    {
      title: '公开状态',
      key: 'published',
      width: 140,
      render: (_, record) => (
        <Tag color={record.isPublished ? 'success' : 'default'}>
          {record.isPublished ? '已公开可执行' : '仅系统定义'}
        </Tag>
      ),
    },
    {
      title: t('admin:skillStatus'),
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'error'}>{isActive ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 300,
      fixed: 'right',
      render: (_, record) => {
        if (isRegistryBuiltinSkill(record)) {
          return (
            <Space size="small">
              <Button
                type="link"
                size="small"
                icon={<InfoCircleOutlined />}
                onClick={() => handleViewDetail(record)}
              >
                详情
              </Button>
              <Tag color="blue">注册表托管</Tag>
            </Space>
          );
        }

        return (
          <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<InfoCircleOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CheckCircleOutlined />}
            onClick={() => handleValidate(record)}
            loading={validatingSkillId === record.id}
          >
            验证
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            {t('common:edit')}
          </Button>
          <Tooltip
            title={
              record.isPublished
                ? '为普通角色分配该公开 Skill 的使用权限'
                : '只有已公开发布的 Skill 才能分配给普通用户'
            }
          >
            <Button
              type="link"
              size="small"
              icon={<KeyOutlined />}
              disabled={!record.isPublished}
              onClick={() => handleManagePermissions(record)}
            >
              权限
            </Button>
          </Tooltip>
          {record.isPublished ? (
            <Button
              type="link"
              size="small"
              icon={<RocketOutlined />}
              onClick={() => navigate(`/published-skills/${record.id}`)}
            >
              公开详情
            </Button>
          ) : null}
          {record.publishedReleaseId ? (
            <Button
              type="link"
              size="small"
              icon={<OrderedListOutlined />}
              onClick={() =>
                navigate(`/admin/capabilities?releaseId=${record.publishedReleaseId}&mode=view`)
              }
            >
              发布溯源
            </Button>
          ) : null}
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id, record.name)}
          >
            {t('common:delete')}
          </Button>
          </Space>
        );
      },
    },
  ];

  // Permission columns
  const permissionColumns: ColumnsType<SkillPermissionDTO> = [
    {
      title: t('admin:roleName'),
      dataIndex: 'roleName',
      key: 'roleName',
    },
    {
      title: t('admin:grantedAt'),
      dataIndex: 'grantedAt',
      key: 'grantedAt',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      render: (_, record) => (
        <Button type="link" size="small" danger onClick={() => handleRevokeRole(record.roleId)}>
          {t('admin:revoke')}
        </Button>
      ),
    },
  ];

  // Available roles not yet granted
  const grantedRoleIds = permissionsQuery.data?.permissions?.map((p) => p.roleId) || [];
  const roleNameToRoleIdMap = new Map(
    (rolesQuery.data?.roles || []).map((role) => [role.name.trim().toLowerCase(), role.id])
  );
  const availableRoles = rolesQuery.data?.roles?.filter((r) => !grantedRoleIds.includes(r.id));
  const filteredPermissionUsers = (permissionUsersQuery.data?.users || []).filter((user) => {
    const keyword = permissionUserSearch.trim().toLowerCase();
    if (!keyword) return true;
    return (
      user.username.toLowerCase().includes(keyword) ||
      (user.email || '').toLowerCase().includes(keyword) ||
      user.role.toLowerCase().includes(keyword)
    );
  });
  const handledAccessRequests = useMemo(
    () =>
      [
        ...(approvedAccessRequestsQuery.data?.requests || []),
        ...(rejectedAccessRequestsQuery.data?.requests || []),
      ].sort((left, right) => {
        const leftTime = new Date(left.processedAt || left.updatedAt).getTime();
        const rightTime = new Date(right.processedAt || right.updatedAt).getTime();
        return rightTime - leftTime;
      }),
    [approvedAccessRequestsQuery.data?.requests, rejectedAccessRequestsQuery.data?.requests]
  );

  // Available templates for selection
  const templateOptions = templatesQuery.data?.templates?.map((t: CarboneTemplateDTO) => ({
    value: t.id,
    label: `${t.name} (${t.id.slice(0, 8)}...)`,
  }));

  const renderDetailContent = (skill: SkillConfigDTO) => (
    <Collapse defaultActiveKey={['basic', 'flow', 'params']} ghost={embedded}>
      <Panel header="基本信息" key="basic">
        <Descriptions bordered={!embedded} size="small" column={embedded ? 1 : 2}>
          <Descriptions.Item label="技能ID">{skill.id}</Descriptions.Item>
          <Descriptions.Item label="描述" span={embedded ? 1 : 2}>
            {skill.description}
          </Descriptions.Item>
          <Descriptions.Item label="公开状态">
            <Tag color={skill.isPublished ? 'success' : 'default'}>
              {skill.isPublished ? '已公开可执行' : '仅系统定义'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="公开来源">
            {skill.publishedSourceType || <Text type="secondary">未公开</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="关联 Release">
            {skill.publishedReleaseId || <Text type="secondary">未公开</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="部署状态">
            {skill.publishedDeploymentStatus || <Text type="secondary">未公开</Text>}
          </Descriptions.Item>
          {skill.builtinMetadata ? (
            <>
              <Descriptions.Item label="能力键">
                {skill.builtinMetadata.capabilityKey}
              </Descriptions.Item>
              <Descriptions.Item label="当前版本">
                {skill.builtinMetadata.activeVersion || (
                  <Text type="secondary">未激活</Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="所有者">{skill.builtinMetadata.owner}</Descriptions.Item>
              <Descriptions.Item label="生命周期">
                {skill.builtinMetadata.lifecycle}
              </Descriptions.Item>
              <Descriptions.Item label="访问模式">
                {skill.builtinMetadata.defaultAccess}
              </Descriptions.Item>
              <Descriptions.Item label="版本数">
                {skill.builtinMetadata.versionCount}
              </Descriptions.Item>
            </>
          ) : null}
          <Descriptions.Item label="触发关键字" span={embedded ? 1 : 2}>
            <Space wrap>
              {skill.triggerKeywords?.map((kw) => (
                <Tag key={kw} color="orange">
                  {kw}
                </Tag>
              ))}
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Panel>

      <Panel header="执行流程" key="flow">
        <div style={{ padding: '8px 16px' }}>
          {skill.executionFlowTemplateIds && skill.executionFlowTemplateIds.length > 0 ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                message="此技能关联了流程模板，将按顺序执行模板步骤，随后执行手动追加的步骤"
                type="info"
                showIcon
              />
              <div style={{ marginTop: 8 }}>
                <Text strong>关联模板 ID：</Text>
                {skill.executionFlowTemplateIds.map((id) => (
                  <Tag key={id} color="blue">
                    {id}
                  </Tag>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>{renderExecutionFlow(skill.executionFlow)}</div>
            </Space>
          ) : (
            renderExecutionFlow(skill.executionFlow)
          )}
        </div>
      </Panel>

      <Panel header="参数与配置" key="params">
        <div style={{ padding: 16 }}>
          <Tabs size="small">
            <TabPane tab="参数 Schema" key="schema">
              {Object.keys(skill.paramsSchema?.properties || {}).length > 0 ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ marginBottom: 8 }}>
                    <Text strong>必填参数：</Text>
                    {skill.paramsSchema.required.map((param) => (
                      <Tag key={param} color="red" style={{ marginLeft: 8 }}>
                        {param}
                      </Tag>
                    ))}
                  </div>
                  {Object.entries(skill.paramsSchema.properties).map(([key, value]) => (
                    <Card
                      key={key}
                      size="small"
                      style={{ marginBottom: 8 }}
                      title={
                        <Space>
                          <Text strong>{key}</Text>
                          <Tag color={value.required ? 'red' : 'default'}>
                            {value.required ? '必填' : '可选'}
                          </Tag>
                          <Tag color="processing">{value.type}</Tag>
                        </Space>
                      }
                    >
                      <Text>{value.description}</Text>
                      {value.extractionPrompt && (
                        <div style={{ marginTop: 4 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            提取提示: {value.extractionPrompt}
                          </Text>
                        </div>
                      )}
                    </Card>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">未配置参数Schema</Text>
              )}
            </TabPane>
            <TabPane tab="文档生成配置" key="carbone">
              <Descriptions bordered={!embedded} size="small" column={1}>
                <Descriptions.Item label="Carbone模板ID">
                  {skill.carboneTemplateId || <Text type="secondary">未配置</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="Carbone技能ID">
                  {skill.carboneSkillId || <Text type="secondary">未配置</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="内部模板ID">
                  {skill.templateId || <Text type="secondary">未配置</Text>}
                </Descriptions.Item>
              </Descriptions>
            </TabPane>
            <TabPane tab="API 端点" key="api">
              <Card size="small" title="运行时 API 配置" style={{ marginBottom: 16 }}>
                {renderApiEndpoints(skill.apiEndpoints)}
              </Card>
              {skill.publishedSourceType === 'temporal_workflow' && (
                <Alert
                  message="编排型能力说明"
                  description="此 Skill 由 Temporal 工作流发布，其核心逻辑由编排引擎托管。详情请参考关联的 Release 定义。"
                  type="info"
                  showIcon
                />
              )}
            </TabPane>
          </Tabs>
        </div>
      </Panel>
    </Collapse>
  );

  const statItems = useMemo(() => {
    const total = allSkills.length;
    const builtin = builtinSkillsCount;
    const custom = customSkillsCount;
    const published = allSkills.filter((s) => s.isPublished).length;

    return [
      {
        key: 'total',
        label: '技能总数',
        value: total,
        icon: <ThunderboltOutlined style={{ color: 'var(--text-secondary)' }} />,
        color: 'var(--primary-color)',
      },
      {
        key: 'builtin',
        label: '内置 Skill',
        value: builtin,
        icon: <ThunderboltOutlined style={{ color: '#10b981' }} />,
        color: '#10b981',
      },
      {
        key: 'custom',
        label: '自定义 Skill',
        value: custom,
        icon: <ApiOutlined style={{ color: '#8b5cf6' }} />,
        color: '#8b5cf6',
      },
      {
        key: 'published',
        label: '已发布',
        value: published,
        icon: <RocketOutlined style={{ color: 'var(--success-color)' }} />,
        color: 'var(--success-color)',
      },
    ];
  }, [allSkills, builtinSkillsCount, customSkillsCount]);

  if (embedded) {
    return (
      <div style={{ padding: 24 }}>
        {selectedSkill ? (
          renderDetailContent(selectedSkill)
        ) : (
          <Empty description="未找到技能详情" />
        )}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', padding: '0 24px' }}>
      <OverviewStatGrid items={statItems} />

      <Card
        styles={{ body: { padding: '20px 24px' } }}
        style={{
          borderRadius: 16,
          border: '1px solid var(--bg-secondary)',
          background: 'var(--bg-card)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <ListSectionHeader
          title={
            <Space wrap size={12}>
              <Text strong style={{ fontSize: 16 }}>
                技能列表
              </Text>
              <Input
                size="large"
                placeholder={t('common:search')}
                prefix={<SearchOutlined style={{ color: 'var(--text-light)' }} />}
                variant="borderless"
                value={searchText}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setSearchText(nextValue);
                  if (nextValue) {
                    setSearchParams({ q: nextValue }, { replace: true });
                  } else {
                    setSearchParams({}, { replace: true });
                  }
                }}
                allowClear
                style={{
                  width: 320,
                  background: 'var(--bg-secondary)',
                  borderRadius: 12,
                }}
              />
            </Space>
          }
          extra={
            <Space wrap size={12}>
              <Text type="secondary">当前显示 {displayedSkills.length} 条</Text>
              <Button
                size="large"
                icon={<FileTextOutlined />}
                onClick={() => (window.location.href = '/carbone-templates')}
                className="btn-pill"
              >
                模板管理
              </Button>
              <Button
                size="large"
                icon={<OrderedListOutlined />}
                onClick={() => (window.location.href = '/admin/flows')}
                className="btn-pill"
              >
                流程模板
              </Button>
              <Button
                size="large"
                icon={<ReloadOutlined />}
                onClick={() => {
                  skillsQuery.refetch();
                  builtinSkillsQuery.refetch();
                }}
                className="btn-pill"
              >
                {t('common:refresh')}
              </Button>
              {activeTabKey !== 'builtin' ? (
                <Button
                  size="large"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleCreate}
                  className="btn-pill"
                >
                  {t('common:create')}
                </Button>
              ) : null}
            </Space>
          }
        />

        <SkillAdminTabs
          activeKey={activeTabKey}
          onTabChange={(key) => {
            setActiveTabKey(key);
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', key);
                return next;
              },
              { replace: true }
            );
          }}
          builtinSkillsCount={builtinSkillsCount}
          customSkillsCount={customSkillsCount}
          allSkillsCount={allSkills.length}
        >
          {activeTabKey === 'builtin' && builtinSkillsQuery.isError ? (
            <Alert
              type="error"
              showIcon
              message="内置 Skill 注册表加载失败"
              description="当前列表可能不完整，请刷新重试或检查 platform 服务。"
              style={{ marginBottom: 16 }}
            />
          ) : null}
          <Table
            columns={columns}
            dataSource={displayedSkills}
            rowKey="id"
            loading={skillsQuery.isLoading || builtinSkillsQuery.isLoading}
            scroll={{ x: 1200 }}
            pagination={{
              showSizeChanger: true,
              showTotal: (total) => t('common:pagination.total', { total }),
            }}
          />
        </SkillAdminTabs>
      </Card>

      {/* Detail Modal */}
      <Modal
        title={`技能详情 - ${selectedSkill?.name}`}
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false);
          setSelectedSkill(null);
        }}
        footer={
          selectedSkill
            ? [
                ...(isRegistryBuiltinSkill(selectedSkill)
                  ? []
                  : [
                      <Button
                        key="delete"
                        danger
                        icon={<DeleteOutlined />}
                        loading={deleteMutation.isLoading}
                        onClick={() => handleDelete(selectedSkill.id, selectedSkill.name)}
                      >
                        删除 Skill
                      </Button>,
                    ]),
                <Button
                  key="close"
                  onClick={() => {
                    setDetailModalVisible(false);
                    setSelectedSkill(null);
                  }}
                >
                  关闭
                </Button>,
              ]
            : null
        }
        width={850}
      >
        {selectedSkill && renderDetailContent(selectedSkill)}
      </Modal>

      {/* Edit/Create Modal */}
      <Modal
        title={editingSkill ? t('admin:editSkill') : t('admin:createSkill')}
        open={editModalVisible}
        onOk={handleSave}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingSkill(null);
        }}
        confirmLoading={createMutation.isLoading || updateMutation.isLoading}
        width={950}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            取消
          </Button>,
          editingSkill && (
            <Button
              key="delete"
              danger
              icon={<DeleteOutlined />}
              loading={deleteMutation.isLoading}
              onClick={() => handleDelete(editingSkill.id, editingSkill.name)}
            >
              删除 Skill
            </Button>
          ),
          editingSkill && (
            <Button
              key="validate"
              icon={<CheckCircleOutlined />}
              onClick={() => handleValidate(editingSkill)}
              loading={validatingSkillId === editingSkill.id}
            >
              验证并优化
            </Button>
          ),
          <Button
            key="submit"
            type="primary"
            onClick={handleSave}
            loading={createMutation.isLoading || updateMutation.isLoading}
          >
            确定
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Collapse defaultActiveKey={[]} ghost>
            <Panel
              header={
                <Text strong style={{ fontSize: 16 }}>
                  <InfoCircleOutlined /> 基本信息
                </Text>
              }
              key="basic"
            >
              <div style={{ padding: '0 16px' }}>
                <Form.Item
                  name="name"
                  label={t('admin:skillName')}
                  rules={[{ required: true, message: '请输入技能名称' }]}
                >
                  <Input placeholder="技能显示名称，例如：保密合同生成" />
                </Form.Item>
                <Form.Item
                  name="description"
                  label={t('admin:skillDescription')}
                  rules={[{ required: true, message: '请输入描述' }]}
                >
                  <Input.TextArea rows={2} placeholder="详细描述技能的功能和用途" />
                </Form.Item>
                <Form.Item
                  name="triggerKeywords"
                  label={t('admin:triggerKeywords')}
                  extra="AI语义匹配失败时的回退方案，输入关键词后按回车添加"
                >
                  <Select mode="tags" placeholder="输入关键词" />
                </Form.Item>
              </div>
            </Panel>

            <Panel
              header={
                <Text strong style={{ fontSize: 16 }}>
                  <ThunderboltOutlined /> 执行流程编排
                </Text>
              }
              key="flow"
            >
              <div style={{ padding: '0 16px' }}>
                <Form.Item
                  name="executionFlowTemplateIds"
                  label="关联流程模板 (可多选)"
                  extra="按顺序关联一个或多个流程模板。模板步骤将优先执行，随后执行下方手动编排的步骤。"
                >
                  <Select
                    mode="multiple"
                    placeholder="选择流程模板"
                    allowClear
                    showSearch
                    loading={executionFlowTemplatesQuery.isLoading}
                  >
                    {executionFlowTemplatesQuery.data?.templates?.map((template) => (
                      <Option key={template.id} value={template.id}>
                        <Space>
                          <OrderedListOutlined />
                          <Text>{template.name}</Text>
                          <Badge
                            count={template.steps?.length || 0}
                            showZero
                            style={{ marginLeft: 8 }}
                          />
                        </Space>
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.List name="executionFlow">
                  {(fields, { add, remove, move }) => (
                    <div style={{ marginTop: 16 }}>
                      <Divider orientation="left">手动追加/编排步骤</Divider>
                      {fields.map(({ key, name, ...restField }, index) => (
                        <Card
                          key={key}
                          size="small"
                          style={{ marginBottom: 12, borderLeft: '4px solid var(--primary-color)' }}
                          title={
                            <Space>
                              <DragOutlined
                                style={{ cursor: 'grab', color: 'var(--text-light)' }}
                              />
                              <Text strong>步骤 {index + 1}</Text>
                            </Space>
                          }
                          extra={
                            <Space>
                              {index > 0 && (
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={() => move(index, index - 1)}
                                >
                                  上移
                                </Button>
                              )}
                              {index < fields.length - 1 && (
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={() => move(index, index + 1)}
                                >
                                  下移
                                </Button>
                              )}
                              <Popconfirm title="确定删除此步骤吗？" onConfirm={() => remove(name)}>
                                <Button type="link" danger size="small" icon={<CloseOutlined />} />
                              </Popconfirm>
                            </Space>
                          }
                        >
                          <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                            <Form.Item
                              {...restField}
                              name={[name, 'type']}
                              label="类型"
                              rules={[{ required: true }]}
                              style={{ width: 200, marginBottom: 0 }}
                            >
                              <Select placeholder="选择类型">
                                {STEP_TYPES.map((t) => (
                                  <Option key={t.value} value={t.value}>
                                    <Space>
                                      {t.icon}
                                      {t.label}
                                    </Space>
                                  </Option>
                                ))}
                              </Select>
                            </Form.Item>
                            <Form.Item
                              {...restField}
                              name={[name, 'name']}
                              label="名称"
                              rules={[{ required: true }]}
                              style={{ flex: 1, marginBottom: 0 }}
                            >
                              <Input placeholder="步骤名称" />
                            </Form.Item>
                          </div>

                          <Form.Item shouldUpdate noStyle>
                            {() => {
                              const type = form.getFieldValue(['executionFlow', name, 'type']);
                              if (type === 'text') {
                                return (
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'content']}
                                    label="提示词内容"
                                  >
                                    <Input.TextArea
                                      rows={3}
                                      placeholder="输入 AI 提示词或指导文本"
                                    />
                                  </Form.Item>
                                );
                              }
                              if (type === 'api') {
                                return (
                                  <div
                                    style={{
                                      backgroundColor: 'var(--bg-secondary)',
                                      padding: 12,
                                      borderRadius: 4,
                                    }}
                                  >
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'api', 'endpoint']}
                                      label="API 地址"
                                    >
                                      <Input placeholder="https://api.example.com/v1/..." />
                                    </Form.Item>
                                    <div style={{ display: 'flex', gap: 16 }}>
                                      <Form.Item
                                        {...restField}
                                        name={[name, 'api', 'method']}
                                        label="方法"
                                        style={{ width: 120 }}
                                      >
                                        <Select defaultValue="GET">
                                          <Option value="GET">GET</Option>
                                          <Option value="POST">POST</Option>
                                          <Option value="PUT">PUT</Option>
                                          <Option value="DELETE">DELETE</Option>
                                        </Select>
                                      </Form.Item>
                                      <Form.Item
                                        {...restField}
                                        name={[name, 'api', 'timeout']}
                                        label="超时(ms)"
                                        style={{ flex: 1 }}
                                      >
                                        <Input type="number" placeholder="30000" />
                                      </Form.Item>
                                    </div>
                                  </div>
                                );
                              }
                              if (type === 'tool') {
                                return (
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'tool', 'name']}
                                    label="工具名称"
                                  >
                                    <Input placeholder="例如：skill_match, document_render..." />
                                  </Form.Item>
                                );
                              }
                              if (type === 'script') {
                                return (
                                  <div
                                    style={{
                                      backgroundColor: 'var(--bg-secondary)',
                                      padding: 12,
                                      borderRadius: 4,
                                    }}
                                  >
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'script', 'language']}
                                      label="脚本语言"
                                    >
                                      <Select defaultValue="javascript">
                                        <Option value="javascript">JavaScript</Option>
                                        <Option value="python">Python</Option>
                                        <Option value="bash">Bash</Option>
                                      </Select>
                                    </Form.Item>
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'script', 'code']}
                                      label="代码内容"
                                    >
                                      <Input.TextArea
                                        rows={5}
                                        style={{ fontFamily: 'monospace' }}
                                        placeholder="输入脚本代码"
                                      />
                                    </Form.Item>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          </Form.Item>
                        </Card>
                      ))}
                      <Button
                        type="dashed"
                        onClick={() => add({ type: 'text', name: '新步骤' })}
                        block
                        icon={<PlusOutlined />}
                      >
                        添加追加步骤
                      </Button>
                    </div>
                  )}
                </Form.List>
              </div>
            </Panel>

            <Panel
              header={
                <Text strong style={{ fontSize: 16 }}>
                  <ApiOutlined /> 参数与配置
                </Text>
              }
              key="params"
            >
              <div style={{ padding: '0 16px' }}>
                <Tabs size="small">
                  <TabPane tab="参数 Schema" key="schema_edit">
                    <Form.Item
                      name="paramsSchema"
                      label="JSON 定义"
                      extra="定义技能执行所需的参数及其提取提示。支持 JSON 格式。"
                    >
                      <Input.TextArea
                        rows={10}
                        style={{ fontFamily: 'monospace' }}
                        placeholder='{
  "properties": {
    "city": {
      "type": "string",
      "description": "城市名称",
      "required": true,
      "extractionPrompt": "从用户输入中提取城市"
    }
  },
  "required": ["city"]
}'
                      />
                    </Form.Item>
                  </TabPane>
                  <TabPane tab="文档模板配置" key="carbone_edit">
                    <div style={{ marginTop: 8 }}>
                      <Form.Item
                        name="carboneTemplateId"
                        label={t('admin:carboneTemplateId')}
                        extra="选择已有的Carbone模板.用于文档渲染"
                      >
                        <Select
                          placeholder="选择模板"
                          allowClear
                          showSearch
                          loading={templatesQuery.isLoading}
                          options={templateOptions}
                        />
                      </Form.Item>
                      <Form.Item
                        name="carboneSkillId"
                        label={t('admin:carboneSkillId')}
                        extra="Carbone引擎的技能配置ID.用于AI参数生成"
                      >
                        <Input placeholder="UUID格式（可选）" />
                      </Form.Item>
                      <Form.Item name="templateId" label="内部模板ID">
                        <Input placeholder="自定义内部模板标识" />
                      </Form.Item>
                    </div>
                  </TabPane>
                </Tabs>
              </div>
            </Panel>
          </Collapse>
        </Form>
      </Modal>

      {/* Permission Modal */}
      <Modal
        title={`${t('admin:permissionManagement')} - ${selectedSkill?.name}`}
        open={permissionModalVisible}
        onCancel={() => {
          setPermissionModalVisible(false);
          setSelectedSkill(null);
        }}
        footer={null}
        width={980}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Tabs defaultActiveKey="granted">
          <TabPane tab={t('admin:grantedRoles')} key="granted">
            <Table
              columns={permissionColumns}
              dataSource={permissionsQuery.data?.permissions || []}
              rowKey="roleId"
              loading={permissionsQuery.isLoading}
              pagination={false}
            />
          </TabPane>
          <TabPane tab={t('admin:availableRoles')} key="available">
            <Space direction="vertical" style={{ width: '100%' }}>
              {availableRoles?.map((role) => (
                <Card
                  key={role.id}
                  size="small"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span>{role.name}</span>
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => handleGrantRole(role.id)}
                    loading={grantMutation.isLoading}
                  >
                    {t('admin:grant')}
                  </Button>
                </Card>
              ))}
              {availableRoles?.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-light)', padding: 20 }}>
                  {t('admin:noAvailableRoles')}
                </div>
              )}
            </Space>
          </TabPane>
          <TabPane tab="用户视图" key="users">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                type="info"
                showIcon
                message="说明"
                description="当前技能权限按角色生效。点击某个用户的“授权该用户角色”，会给该用户所属角色授权。"
              />
              <Input
                placeholder="搜索用户（用户名/邮箱/角色）"
                prefix={<SearchOutlined />}
                value={permissionUserSearch}
                onChange={(e) => setPermissionUserSearch(e.target.value)}
                allowClear
              />
              <Table
                rowKey="id"
                loading={permissionUsersQuery.isLoading || rolesQuery.isLoading}
                dataSource={filteredPermissionUsers}
                pagination={{ pageSize: 8 }}
                locale={{ emptyText: '暂无可展示用户' }}
                scroll={{ x: 920 }}
                columns={[
                  {
                    title: '用户名',
                    dataIndex: 'username',
                    key: 'username',
                  },
                  {
                    title: '邮箱',
                    dataIndex: 'email',
                    key: 'email',
                    render: (email: string) => email || '-',
                  },
                  {
                    title: '角色',
                    dataIndex: 'role',
                    key: 'role',
                    render: (role: string) => <Tag>{role}</Tag>,
                  },
                  {
                    title: '状态',
                    dataIndex: 'isActive',
                    key: 'isActive',
                    render: (isActive: boolean) => (
                      <Tag color={isActive ? 'success' : 'error'}>{isActive ? '启用' : '停用'}</Tag>
                    ),
                  },
                  {
                    title: '技能可用',
                    key: 'permission',
                    render: (_: unknown, record: { role: string }) => {
                      const normalizedRole = (record.role || '').trim().toLowerCase();
                      const roleId = roleNameToRoleIdMap.get(normalizedRole);
                      const granted = !!roleId && grantedRoleIds.includes(roleId);
                      return (
                        <Tag color={granted ? 'success' : 'default'}>
                          {granted ? '已可用' : '未授权'}
                        </Tag>
                      );
                    },
                  },
                  {
                    title: '操作',
                    key: 'actions',
                    render: (_: unknown, record: { role: string; isActive: boolean }) => {
                      const normalizedRole = (record.role || '').trim().toLowerCase();
                      const roleId = roleNameToRoleIdMap.get(normalizedRole);
                      const granted = !!roleId && grantedRoleIds.includes(roleId);
                      const cannotMapRole = !roleId;
                      return (
                        <Tooltip
                          title={cannotMapRole ? `未找到角色映射：${record.role}` : undefined}
                        >
                          <Button
                            type="primary"
                            size="small"
                            disabled={!record.isActive || granted || cannotMapRole}
                            loading={grantMutation.isLoading}
                            onClick={() => roleId && handleGrantRole(roleId)}
                          >
                            授权该用户角色
                          </Button>
                        </Tooltip>
                      );
                    },
                  },
                ]}
              />
            </Space>
          </TabPane>
          <TabPane
            tab={`授权申请 (${accessRequestsQuery.data?.requests.length || 0})`}
            key="requests"
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                type="info"
                showIcon
                message="待处理申请"
                description="批准后会按申请人的当前角色授予该技能权限；拒绝后仅关闭本次申请，不会影响已有权限。"
              />
              <SkillAccessRequestReviewTab
                requests={accessRequestsQuery.data?.requests || []}
                loading={accessRequestsQuery.isLoading}
                processingRequestId={processingAccessRequestId}
                processingAction={processingAccessRequestAction}
                onApprove={handleApproveAccessRequest}
                onReject={handleRejectAccessRequest}
              />
              <Divider style={{ margin: '8px 0' }}>最近已处理</Divider>
              <SkillAccessRequestReviewTab
                requests={handledAccessRequests}
                loading={
                  approvedAccessRequestsQuery.isLoading || rejectedAccessRequestsQuery.isLoading
                }
                enableReviewActions={false}
                emptyText="当前没有已处理的授权申请"
              />
            </Space>
          </TabPane>
        </Tabs>
      </Modal>

      {/* Validation Modal */}
      <Modal
        title={`验证结果 - ${selectedSkill?.name}`}
        open={validationModalVisible}
        onCancel={handleCloseValidationModal}
        footer={[
          validationResult?.details?.skillSimulation?.generatedSkill && (
            <Button
              key="apply-suggestion"
              type="primary"
              onClick={handleApplySuggestion}
              loading={applyAdjustmentMutation.isLoading}
            >
              应用建议
            </Button>
          ),
          <Button key="close" onClick={handleCloseValidationModal}>
            关闭
          </Button>,
        ]}
        width={700}
      >
        {validatingSkillId && !validationResult && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Space direction="vertical" size="large">
              <RocketOutlined spin style={{ fontSize: 48, color: 'var(--primary-color)' }} />
              <Text strong style={{ fontSize: 16 }}>
                正在验证{validationAnimatedDots}
              </Text>
              <Text type="secondary">当前阶段：{validationStage}</Text>
              <div style={{ width: 520, maxWidth: '100%' }}>
                <Steps
                  size="small"
                  current={validationProgressMeta.current}
                  items={VALIDATION_PHASES.map((title, index) => ({
                    title,
                    status:
                      index < validationProgressMeta.current
                        ? 'finish'
                        : index === validationProgressMeta.current
                          ? 'process'
                          : 'wait',
                  }))}
                />
                <Progress
                  percent={validationProgressMeta.percent}
                  status={validationProgressMeta.status}
                  showInfo={false}
                  strokeColor="var(--primary-color)"
                  style={{ marginTop: 16, marginBottom: 8 }}
                />
                <Text type="secondary">正在执行真实代码验证与 AI 审计，日志会持续刷新</Text>
              </div>
              <Text type="secondary">AI正在分析 Skill 配置并执行真实模拟，可能需要 1-3 分钟</Text>
            </Space>
          </div>
        )}
        {validationLogs.length > 0 && (
          <Card
            size="small"
            title={validatingSkillId ? `实时日志 - ${validationStage}` : '执行日志'}
            style={{ marginBottom: validationResult ? 16 : 0 }}
          >
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 240,
                overflow: 'auto',
              }}
            >
              {validationLogs.join('\n')}
            </pre>
          </Card>
        )}
        {/* Results */}
        {validationResult && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Overall Result */}
            <Card>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  {validationResult.isValid ? (
                    <CheckCircleOutlined style={{ fontSize: 32, color: 'var(--success-color)' }} />
                  ) : (
                    <ExclamationCircleOutlined
                      style={{ fontSize: 32, color: 'var(--error-color)' }}
                    />
                  )}
                  <Text strong style={{ fontSize: 18 }}>
                    {validationResult.isValid ? '验证通过' : '验证失败'}
                  </Text>
                </Space>
                <Tag color={validationResult.isValid ? 'success' : 'error'}>
                  得分: {validationResult.score}/100
                </Tag>
              </Space>
            </Card>

            {/* Config Analysis */}
            {validationResult.details?.configAnalysis && (
              <Card title="配置分析" size="small">
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="触发关键词">
                    <Tag
                      color={
                        validationResult.details.configAnalysis.hasTriggerKeywords
                          ? 'success'
                          : 'error'
                      }
                    >
                      {validationResult.details.configAnalysis.hasTriggerKeywords
                        ? '已配置'
                        : '缺失'}
                    </Tag>
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      质量: {validationResult.details.configAnalysis.triggerKeywordQuality}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="参数Schema">
                    <Tag
                      color={
                        validationResult.details.configAnalysis.hasParamsSchema
                          ? 'success'
                          : 'error'
                      }
                    >
                      {validationResult.details.configAnalysis.hasParamsSchema ? '已配置' : '缺失'}
                    </Tag>
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      完整度: {validationResult.details.configAnalysis.paramsSchemaCompleteness}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="文档模板">
                    <Tag
                      color={
                        validationResult.details.configAnalysis.hasTemplate ? 'success' : 'warning'
                      }
                    >
                      {validationResult.details.configAnalysis.hasTemplate ? '已配置' : '未配置'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="流程模板">
                    <Tag
                      color={
                        validationResult.details.configAnalysis.hasFlowTemplate
                          ? 'success'
                          : 'warning'
                      }
                    >
                      {validationResult.details.configAnalysis.hasFlowTemplate
                        ? '已关联'
                        : '未关联'}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {/* Skill Simulation */}
            {validationResult.details?.skillSimulation && (
              <Card title="整体技能模拟验证" size="small">
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Descriptions size="small" column={2}>
                    <Descriptions.Item label="模拟请求">
                      {validationResult.details.skillSimulation.simulatedRequest}
                    </Descriptions.Item>
                    <Descriptions.Item label="验证得分">
                      <Tag
                        color={
                          validationResult.details.skillSimulation.validationScore >= 80
                            ? 'success'
                            : validationResult.details.skillSimulation.validationScore >= 60
                              ? 'warning'
                              : 'error'
                        }
                      >
                        {validationResult.details.skillSimulation.validationScore}%
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="模拟结果">
                      <Tag
                        color={
                          validationResult.details.skillSimulation.success ? 'success' : 'error'
                        }
                      >
                        {validationResult.details.skillSimulation.success ? '通过' : '失败'}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="ReAct迭代">
                      {validationResult.details.skillSimulation.iterations ?? 0}
                    </Descriptions.Item>
                    <Descriptions.Item label="总结" span={2}>
                      {validationResult.details.skillSimulation.summary}
                    </Descriptions.Item>
                  </Descriptions>

                  {validationResult.details.skillSimulation.log &&
                    validationResult.details.skillSimulation.log.length > 0 && (
                      <>
                        <Divider style={{ margin: '8px 0' }} />
                        <Text strong>ReAct 执行日志</Text>
                        <Card size="small">
                          <pre
                            style={{
                              margin: 0,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              maxHeight: 240,
                              overflow: 'auto',
                            }}
                          >
                            {validationResult.details.skillSimulation.log.join('\n')}
                          </pre>
                        </Card>
                      </>
                    )}

                  {validationResult.details.skillSimulation.generatedSkill && (
                    <>
                      <Divider style={{ margin: '8px 0' }} />
                      <Text strong>标准 Skill 预览</Text>
                      <Card size="small">
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {JSON.stringify(
                            validationResult.details.skillSimulation.generatedSkill,
                            null,
                            2
                          )}
                        </pre>
                      </Card>
                    </>
                  )}
                </Space>
              </Card>
            )}

            {/* Warnings and Suggestions */}
            {validationResult.warnings.length > 0 && (
              <Card title="警告" size="small">
                <Space direction="vertical" size="small">
                  {validationResult.warnings.map((w, idx) => (
                    <Text key={idx} type="warning">
                      ⚠️ {w}
                    </Text>
                  ))}
                </Space>
              </Card>
            )}
            {validationResult.suggestions.length > 0 && (
              <Card title="建议" size="small">
                <Space direction="vertical" size="small">
                  {validationResult.suggestions.map((s, idx) => (
                    <Text key={idx} type="secondary">
                      💡 {s}
                    </Text>
                  ))}
                </Space>
              </Card>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default SkillAdminPage;
