import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tabs,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AppstoreAddOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  LeftOutlined,
  RocketOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CapabilityRelease,
  CapabilityReleaseDetail,
  capabilityReleaseApi,
} from '../../api/capability-release';
import { executionFlowApi } from '../../api/execution-flow';
import {
  TemporalWorkflowDTO,
  temporalWorkflowApi,
} from '../../api/temporal-workflow';
import { skillApi } from '../../api/skill';
import ParamSchemaEditor, {
  ParamSchemaFieldDraft,
} from '../../components/capability-release/ParamSchemaEditor';

const { Title, Text } = Typography;
const { TextArea } = Input;
const studioPaneStyle: React.CSSProperties = {
  margin: 0,
  maxHeight: 320,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
};

type SnapshotDiffStatus = 'same' | 'changed' | 'added' | 'removed';

interface SnapshotDiffRow {
  path: string;
  leftValue: string;
  rightValue: string;
  status: SnapshotDiffStatus;
}

interface ApiEndpointDraft {
  id: string;
  key: string;
  method: string;
  url: string;
  description: string;
  extraJson: string;
}

type DeploymentEnvironment = 'dev' | 'test' | 'staging' | 'prod';

const MISSING_VALUE = '__capability_snapshot_missing__';

const SOURCE_TYPE_OPTIONS = [
  { label: '模板型能力', value: 'execution_flow_template' },
  { label: 'Temporal 编排型能力', value: 'temporal_workflow' },
] as const;

interface CapabilitySourceOption {
  label: string;
  value: string;
  description?: string;
}

const statusColor = (status: string) => {
  switch (status) {
    case 'draft_ready':
    case 'approved':
    case 'published':
    case 'deployed':
      return 'green';
    case 'pending_approval':
      return 'gold';
    case 'build_failed':
    case 'validation_failed':
    case 'deploy_failed':
      return 'red';
    case 'building':
    case 'validating':
    case 'deploying':
      return 'processing';
    default:
      return 'default';
  }
};

const getNextStepHint = (release: CapabilityRelease): { label: string; color: string } => {
  if (release.deploymentStatus === 'succeeded' || release.deploymentStatus === 'deployed' || release.status === 'deployed') return { label: '观察运行/回滚', color: 'green' };
  if (release.status === 'deploying' || release.deploymentStatus === 'deploying') return { label: '正在部署...', color: 'processing' };
  if (release.status === 'build_failed') return { label: '重新构建', color: 'red' };
  if (release.status === 'validation_failed') return { label: '重新校验', color: 'volcano' };
  if (release.status === 'deploy_failed') return { label: '重新部署', color: 'magenta' };
  if (release.status === 'rolled_back') return { label: '确认回滚结果', color: 'orange' };

  if (release.sourceType === 'temporal_workflow' && release.latestSuccessfulValidationId) {
    return { label: '代码部署 / 发布 Skill', color: 'blue' };
  }
  if (release.publishedSkillId) return { label: '代码部署', color: 'blue' };
  if (release.approvalStatus === 'approved') return { label: '发布 Skill', color: 'cyan' };
  if (release.currentSkillDraftId) return { label: '发布 Skill', color: 'gold' };
  if (release.latestSuccessfulValidationId) return { label: '发布 Skill', color: 'lime' };
  if (release.currentBuildId || release.latestSuccessfulBuildId) return { label: 'Sandbox 校验', color: 'purple' };

  return { label: '开始构建', color: 'default' };
};

const canEnterReleaseCenter = (release: CapabilityRelease): boolean =>
  Boolean(release.publishedSkillId) ||
  ['published', 'deployed', 'rolled_back'].includes(release.status) ||
  ['running', 'succeeded', 'deployed', 'rolled_back'].includes(release.deploymentStatus);

const flattenSnapshotPayload = (
  value: unknown,
  prefix = '',
  output: Record<string, string> = {},
): Record<string, string> => {
  if (Array.isArray(value)) {
    if (value.length === 0 && prefix) {
      output[prefix] = '[]';
      return output;
    }

    value.forEach((item, index) => {
      const nextPath = `${prefix}[${index}]`;
      flattenSnapshotPayload(item, nextPath, output);
    });
    return output;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    if (entries.length === 0 && prefix) {
      output[prefix] = '{}';
      return output;
    }

    entries.forEach(([key, nestedValue]) => {
      const nextPath = prefix ? `${prefix}.${key}` : key;
      flattenSnapshotPayload(nestedValue, nextPath, output);
    });
    return output;
  }

  output[prefix || '$'] =
    typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
  return output;
};

const buildSnapshotDiffRows = (
  leftPayload: Record<string, unknown> = {},
  rightPayload: Record<string, unknown> = {},
): SnapshotDiffRow[] => {
  const leftMap = flattenSnapshotPayload(leftPayload);
  const rightMap = flattenSnapshotPayload(rightPayload);
  const allPaths = Array.from(new Set([...Object.keys(leftMap), ...Object.keys(rightMap)])).sort((a, b) =>
    a.localeCompare(b),
  );

  return allPaths.map((path) => {
    const leftExists = Object.prototype.hasOwnProperty.call(leftMap, path);
    const rightExists = Object.prototype.hasOwnProperty.call(rightMap, path);
    const leftValue = leftExists ? leftMap[path] : MISSING_VALUE;
    const rightValue = rightExists ? rightMap[path] : MISSING_VALUE;

    let status: SnapshotDiffStatus = 'same';
    if (!leftExists && rightExists) {
      status = 'added';
    } else if (leftExists && !rightExists) {
      status = 'removed';
    } else if (leftValue !== rightValue) {
      status = 'changed';
    }

    return {
      path,
      leftValue: leftExists ? leftMap[path] : '<<missing>>',
      rightValue: rightExists ? rightMap[path] : '<<missing>>',
      status,
    };
  });
};

const parseJsonDraft = <T,>(raw: string, fallbackLabel: string): { valid: true; value: T } | { valid: false; error: string } => {
  try {
    return { valid: true, value: JSON.parse(raw) as T };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? `${fallbackLabel}: ${error.message}` : `${fallbackLabel}: JSON 解析失败`,
    };
  }
};

const createParamFieldId = () => `param-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createApiEndpointId = () => `endpoint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const parseParamSchemaToDraft = (
  schema: Record<string, unknown> | undefined,
): { fields: ParamSchemaFieldDraft[]; extras: Record<string, unknown> } => {
  const normalized = schema && typeof schema === 'object' ? schema : {};
  const properties =
    normalized.properties && typeof normalized.properties === 'object'
      ? (normalized.properties as Record<string, Record<string, unknown>>)
      : {};
  const required = Array.isArray(normalized.required)
    ? normalized.required.filter((item): item is string => typeof item === 'string')
    : [];
  const extras = Object.fromEntries(
    Object.entries(normalized).filter(([key]) => key !== 'properties' && key !== 'required'),
  );

  const fields = Object.entries(properties).map(([name, config]) => ({
    id: createParamFieldId(),
    name,
    type: typeof config?.type === 'string' ? config.type : 'string',
    description: typeof config?.description === 'string' ? config.description : '',
    required: required.includes(name) || Boolean(config?.required),
    defaultValue:
      config?.default === undefined
        ? ''
        : typeof config.default === 'string'
          ? config.default
          : JSON.stringify(config.default),
    extractionPrompt:
      typeof config?.extractionPrompt === 'string' ? config.extractionPrompt : '',
    enumValues: Array.isArray(config?.enum)
      ? config.enum.filter((item): item is string => typeof item === 'string')
      : [],
  }));

  return { fields, extras };
};

const normalizeParamDefaultValue = (type: string, raw: string): unknown => {
  const value = raw.trim();
  if (!value) {
    return undefined;
  }

  if (type === 'number') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  if (type === 'boolean') {
    return value === 'true';
  }

  if (type === 'array' || type === 'object') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
};

const buildParamSchemaFromDraft = (
  fields: ParamSchemaFieldDraft[],
  extras: Record<string, unknown>,
): Record<string, unknown> => {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  fields.forEach((field) => {
    const name = field.name.trim();
    if (!name) {
      return;
    }

    const property: Record<string, unknown> = {
      type: field.type || 'string',
      description: field.description.trim(),
      required: field.required,
    };

    const normalizedDefault = normalizeParamDefaultValue(field.type, field.defaultValue);
    if (normalizedDefault !== undefined) {
      property.default = normalizedDefault;
    }
    if (field.extractionPrompt.trim()) {
      property.extractionPrompt = field.extractionPrompt.trim();
    }
    if (field.enumValues.length > 0) {
      property.enum = field.enumValues.map((item) => item.trim()).filter(Boolean);
    }

    properties[name] = property;
    if (field.required) {
      required.push(name);
    }
  });

  return {
    ...extras,
    type: extras.type || 'object',
    properties,
    required,
  };
};

const parseApiEndpointsToDraft = (value: Record<string, unknown> | null | undefined): ApiEndpointDraft[] => {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).map(([key, rawConfig]) => {
    const config = rawConfig && typeof rawConfig === 'object' ? (rawConfig as Record<string, unknown>) : {};
    const extras = Object.fromEntries(
      Object.entries(config).filter(
        ([entryKey]) => !['url', 'method', 'description'].includes(entryKey),
      ),
    );

    return {
      id: createApiEndpointId(),
      key,
      method: typeof config.method === 'string' ? config.method : 'POST',
      url: typeof config.url === 'string' ? config.url : '',
      description: typeof config.description === 'string' ? config.description : '',
      extraJson: Object.keys(extras).length > 0 ? JSON.stringify(extras, null, 2) : '',
    };
  });
};

interface CapabilityReleasePageProps {
  mode?: 'manager' | 'studio';
}

const CapabilityReleasePage: React.FC<CapabilityReleasePageProps> = ({ mode = 'manager' }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const isStudioMode = mode === 'studio';
  const [searchText, setSearchText] = useState('');
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [diffLeftSnapshotId, setDiffLeftSnapshotId] = useState<string | null>(null);
  const [diffRightSnapshotId, setDiffRightSnapshotId] = useState<string | null>(null);
  const [showOnlyDiff, setShowOnlyDiff] = useState(true);
  const [isEditingSource, setIsEditingSource] = useState(false);
  const [sourceNameDraft, setSourceNameDraft] = useState('');
  const [sourcePayloadDraft, setSourcePayloadDraft] = useState('{}');
  const [deployVisible, setDeployVisible] = useState(false);
  const [deployTargetReleaseId, setDeployTargetReleaseId] = useState<string | null>(null);
  const [deployEnvironment, setDeployEnvironment] = useState<DeploymentEnvironment>('staging');
  const [deployStrategy, setDeployStrategy] = useState<'hot_reload' | 'rolling_restart' | 'full_restart'>(
    'rolling_restart',
  );
  const [deployOverridesDraft, setDeployOverridesDraft] = useState('{}');
  const [isEditingSkillDraft, setIsEditingSkillDraft] = useState(false);
  const [skillDraftName, setSkillDraftName] = useState('');
  const [skillDraftDescription, setSkillDraftDescription] = useState('');
  const [skillDraftTriggerKeywords, setSkillDraftTriggerKeywords] = useState<string[]>([]);
  const [skillDraftTools, setSkillDraftTools] = useState<string[]>([]);
  const [skillDraftTemplateIds, setSkillDraftTemplateIds] = useState<string[]>([]);
  const [skillDraftParamFields, setSkillDraftParamFields] = useState<ParamSchemaFieldDraft[]>([]);
  const [skillDraftParamSchemaExtras, setSkillDraftParamSchemaExtras] = useState<Record<string, unknown>>({
    type: 'object',
  });
  const [skillDraftApiEndpointFields, setSkillDraftApiEndpointFields] = useState<ApiEndpointDraft[]>([]);
  const [createForm] = Form.useForm();
  const createSourceType = Form.useWatch('sourceType', createForm);
  const createSourceId = Form.useWatch('sourceId', createForm);

  const releasesQuery = useQuery(['capability-releases'], capabilityReleaseApi.list);
  const temporalWorkflowOptionsQuery = useQuery(
    ['temporal-workflow-options'],
    () => temporalWorkflowApi.list(),
    { staleTime: 30_000 },
  );
  const executionFlowOptionsQuery = useQuery(
    ['execution-flow-template-options'],
    () => executionFlowApi.list({ limit: 200, isActive: true }),
    { staleTime: 30_000 },
  );
  const detailQuery = useQuery(
    ['capability-release-detail', selectedReleaseId],
    () => capabilityReleaseApi.getById(selectedReleaseId as string),
    { enabled: Boolean(selectedReleaseId) },
  );

  const createSourceOptions = useMemo<CapabilitySourceOption[]>(() => {
    if (createSourceType === 'temporal_workflow') {
      return (temporalWorkflowOptionsQuery.data || []).map((workflow: TemporalWorkflowDTO) => ({
        label: workflow.name || `Workflow ${workflow.id.slice(0, 8)}`,
        value: workflow.id,
        description: workflow.description || `Task Queue: ${workflow.taskQueue}`,
      }));
    }

    if (createSourceType === 'execution_flow_template') {
      return (executionFlowOptionsQuery.data?.templates || []).map((template) => ({
        label: template.name || `Template ${template.id.slice(0, 8)}`,
        value: template.id,
        description: template.description || template.goal || template.category,
      }));
    }

    return [];
  }, [
    createSourceType,
    executionFlowOptionsQuery.data?.templates,
    temporalWorkflowOptionsQuery.data,
  ]);
  const isCreateSourceLoading =
    createSourceType === 'temporal_workflow'
      ? temporalWorkflowOptionsQuery.isLoading
      : createSourceType === 'execution_flow_template'
        ? executionFlowOptionsQuery.isLoading
        : false;

  useEffect(() => {
    if (!createVisible) {
      return;
    }

    createForm.setFieldsValue({
      sourceId: undefined,
      sourceName: undefined,
    });
  }, [createForm, createSourceType, createVisible]);

  useEffect(() => {
    if (!createVisible || !createSourceType || !createSourceId) {
      return;
    }

    const selectedSource = createSourceOptions.find((item) => item.value === createSourceId);
    if (!selectedSource) {
      return;
    }

    const currentName = createForm.getFieldValue('sourceName');
    if (!currentName || currentName === '') {
      createForm.setFieldsValue({ sourceName: selectedSource.label });
    }
  }, [
    createForm,
    createSourceId,
    createSourceOptions,
    createSourceType,
    createVisible,
  ]);

  const refreshQueries = async (releaseId?: string) => {
    await queryClient.invalidateQueries(['capability-releases']);
    if (releaseId) {
      await queryClient.invalidateQueries(['capability-release-detail', releaseId]);
    }
  };

  const createMutation = useMutation(capabilityReleaseApi.create, {
    onSuccess: async (result) => {
      message.success('Capability Release 已创建');
      setCreateVisible(false);
      createForm.resetFields();
      setSelectedReleaseId(result.release.release.id);
      await refreshQueries(result.release.release.id);
    },
    onError: (error: any) => {
      message.error(error?.message || '创建失败');
    },
  });

  const validateStaticMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.validateStatic(id),
    {
      onSuccess: async (result, variables) => {
        message.success(result.validation.success ? '静态校验通过' : '静态校验未通过');
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '静态校验失败');
      },
    },
  );

  const generateDraftMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.generateSkillDraft(id),
    {
      onSuccess: async (result, variables) => {
        message.success(`Skill 草案已生成: ${result.skillDraft.name}`);
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '生成 Skill 草案失败');
      },
    },
  );

  const publishMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.publishSkill(id),
    {
      onSuccess: async (result, variables) => {
        message.success(`Skill 发布成功: ${result.publishedSkillId}`);
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '发布 Skill 失败');
      },
    },
  );

  const approveMutation = useMutation(
    ({ id }: { id: string }) =>
      capabilityReleaseApi.approveRelease(id, { decision: 'approved', comment: 'Portal 审批通过' }),
    {
      onSuccess: async (result, variables) => {
        message.success(`Release 已审批: ${result.release.release.status}`);
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '审批失败');
      },
    },
  );

  const deployMutation = useMutation(
    ({
      id,
      environment,
      strategy,
      configOverrides,
    }: {
      id: string;
      environment: DeploymentEnvironment;
      strategy: 'hot_reload' | 'rolling_restart' | 'full_restart';
      configOverrides?: Record<string, unknown>;
    }) =>
      capabilityReleaseApi.deploy(id, { environment, strategy, configOverrides }),
    {
      onSuccess: async (result, variables) => {
        message.success(`部署完成: ${result.deployment.status}`);
        setDeployVisible(false);
        setDeployOverridesDraft('{}');
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '部署失败');
      },
    },
  );

  const rollbackMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.rollback(id, { reason: 'Portal 手工触发回滚' }),
    {
      onSuccess: async (result, variables) => {
        message.success(`已回滚到 Release: ${result.targetReleaseId.slice(0, 8)}`);
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '回滚失败');
      },
    },
  );

  const validateSkillMutation = useMutation(
    ({ skillId }: { skillId: string }) => skillApi.validate(skillId),
    {
      onSuccess: async (result) => {
        const score = result.validation.score;
        message.success(`Skill 校验完成，分数 ${score}`);
      },
      onError: (error: any) => {
        message.error(error?.message || 'Skill 校验失败');
      },
    },
  );

  const archiveReleaseMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.archive(id),
    {
      onSuccess: async (_, variables) => {
        message.success('Release 已删除');
        if (selectedReleaseId === variables.id) {
          setSelectedReleaseId(null);
          setSearchParams({});
        }
        await refreshQueries();
      },
      onError: (error: any) => {
        message.error(error?.message || '删除 Release 失败');
      },
    },
  );

  const updateSourceMutation = useMutation(
    ({
      id,
      sourceName,
      sourcePayload,
    }: {
      id: string;
      sourceName?: string;
      sourcePayload: Record<string, unknown>;
    }) => capabilityReleaseApi.updateSource(id, { sourceName, sourcePayload }),
    {
      onSuccess: async (result, variables) => {
        message.success('源定义已保存为新快照');
        setIsEditingSource(false);
        setSourceNameDraft(result.release.release.sourceName || '');
        setSourcePayloadDraft(
          JSON.stringify(result.release.currentSourceSnapshot?.sourcePayload || {}, null, 2),
        );
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '保存源定义失败');
      },
    },
  );

  const updateSkillDraftMutation = useMutation(
    ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof capabilityReleaseApi.updateSkillDraft>[1];
    }) => capabilityReleaseApi.updateSkillDraft(id, payload),
    {
      onSuccess: async (_, variables) => {
        message.success('Skill 草案已更新');
        setIsEditingSkillDraft(false);
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '更新 Skill 草案失败');
      },
    },
  );

  const filteredReleases = useMemo(() => {
    const releases = releasesQuery.data?.releases || [];
    if (!searchText.trim()) {
      return releases;
    }
    const keyword = searchText.toLowerCase();
    return releases.filter((release) => {
      const nextStepHint = getNextStepHint(release);
      return (
        release.id.toLowerCase().includes(keyword) ||
        String(release.sourceName || '').toLowerCase().includes(keyword) ||
        release.sourceType.toLowerCase().includes(keyword) ||
        release.status.toLowerCase().includes(keyword) ||
        nextStepHint.label.toLowerCase().includes(keyword)
      );
    });
  }, [releasesQuery.data?.releases, searchText]);

  const columns: ColumnsType<CapabilityRelease> = [
    {
      title: 'Release ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => <Text code>{id.slice(0, 8)}</Text>,
      width: 110,
    },
    {
      title: '能力名称',
      dataIndex: 'sourceName',
      key: 'sourceName',
      render: (value: string | null | undefined, record) => value || record.sourceId || '未命名',
    },
    {
      title: '类型',
      dataIndex: 'sourceType',
      key: 'sourceType',
      width: 150,
      render: (value: string) => (
        <Tag color={value === 'temporal_workflow' ? 'purple' : 'blue'}>
          {value === 'temporal_workflow' ? 'Temporal' : 'Template'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    {
      title: 'Skill',
      dataIndex: 'publishedSkillId',
      key: 'publishedSkillId',
      width: 120,
      render: (value: string | null | undefined) =>
        value ? <Text code>{value.slice(0, 8)}</Text> : <Text type="secondary">未发布</Text>,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: '下一步',
      key: 'nextStep',
      width: 140,
      render: (_, record) => {
        const nextStepHint = getNextStepHint(record);
        return <Tag color={nextStepHint.color}>{nextStepHint.label}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 520,
      render: (_, record) => (
        <Space size="small" wrap>
          <Button
            type="link"
            size="small"
            icon={<RocketOutlined />}
            disabled={!canEnterReleaseCenter(record)}
            onClick={() => navigate(`/release-center?releaseId=${record.id}`)}
          >
            进入发布
          </Button>
          {record.publishedSkillId ? (
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() =>
                navigate(`/published-skills/${record.publishedSkillId}?releaseId=${record.id}`)
              }
            >
              已发布 Skill
            </Button>
          ) : null}
          <Button
            type="link"
            size="small"
            icon={<CheckCircleOutlined />}
            loading={validateStaticMutation.isLoading}
            disabled={!record.currentBuildId && !record.latestSuccessfulBuildId}
            onClick={() => validateStaticMutation.mutate({ id: record.id })}
          >
            静态校验
          </Button>
          <Button
            type="link"
            size="small"
            icon={<RocketOutlined />}
            loading={publishMutation.isLoading || generateDraftMutation.isLoading || approveMutation.isLoading}
            disabled={!record.latestSuccessfulValidationId}
            onClick={() => void handlePublishSkill(record)}
          >
            发布 Skill
          </Button>
          <Button
            type="link"
            size="small"
            icon={<RocketOutlined />}
            loading={deployMutation.isLoading}
            disabled={record.sourceType !== 'temporal_workflow' && !record.publishedSkillId}
            onClick={() => openDeployModal(record.id)}
          >
            代码部署
          </Button>
          {record.publishedSkillId ? (
            <Button
              type="link"
              size="small"
              icon={<SafetyCertificateOutlined />}
              loading={validateSkillMutation.isLoading}
              onClick={() => validateSkillMutation.mutate({ skillId: record.publishedSkillId as string })}
            >
              Skill 校验
            </Button>
          ) : null}
          <Button
            type="link"
            size="small"
            icon={<ReloadOutlined />}
            loading={rollbackMutation.isLoading}
            disabled={!record.publishedSkillId && record.deploymentStatus !== 'succeeded' && record.status !== 'deployed'}
            onClick={() => rollbackMutation.mutate({ id: record.id })}
          >
            回滚
          </Button>
          <Button
            danger
            type="link"
            size="small"
            icon={<DeleteOutlined />}
            loading={archiveReleaseMutation.isLoading}
            onClick={() => handleArchiveRelease(record.id)}
          >
            删除 Release
          </Button>
        </Space>
      ),
    },
  ];

  const selectedDetail: CapabilityReleaseDetail | undefined = detailQuery.data?.release;
  const latestBuild = selectedDetail?.builds?.[0];
  const latestValidation = selectedDetail?.validations?.[0];
  const latestDeployment = selectedDetail?.deployments?.[0];
  const latestSmokeValidation =
    selectedDetail?.validations?.find(
      (item) =>
        item.validationType === 'post_deploy_smoke' &&
        item.id === latestDeployment?.smokeValidationId,
    ) ||
    selectedDetail?.validations?.find((item) => item.validationType === 'post_deploy_smoke');
  const latestAuditEvents = selectedDetail?.auditEvents?.slice(0, 12) || [];
  const deploymentProfiles = useMemo(() => {
    const raw = selectedDetail?.currentSourceSnapshot?.sourcePayload?.deploymentProfiles;
    return raw && typeof raw === 'object' ? (raw as Record<string, Record<string, unknown>>) : {};
  }, [selectedDetail?.currentSourceSnapshot?.id]);
  const activeDeployProfile =
    (deployVisible && deployTargetReleaseId === selectedDetail?.release.id
      ? deploymentProfiles[deployEnvironment]
      : undefined) || {};
  const sourceSnapshots = useMemo(
    () =>
      [...(selectedDetail?.sourceSnapshots || [])].sort((left, right) => {
        if (right.snapshotVersion !== left.snapshotVersion) {
          return right.snapshotVersion - left.snapshotVersion;
        }

        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }),
    [selectedDetail?.sourceSnapshots],
  );
  useEffect(() => {
    const releaseIdFromQuery = searchParams.get('releaseId');
    if (releaseIdFromQuery && releaseIdFromQuery !== selectedReleaseId) {
      setSelectedReleaseId(releaseIdFromQuery);
    }
    if (!releaseIdFromQuery && selectedReleaseId) {
      setSelectedReleaseId(null);
    }
  }, [searchParams, selectedReleaseId]);

  useEffect(() => {
    if (!selectedDetail) {
      setDiffLeftSnapshotId(null);
      setDiffRightSnapshotId(null);
      return;
    }

    const currentSnapshotId = selectedDetail.currentSourceSnapshot?.id || sourceSnapshots[0]?.id || null;
    const previousSnapshotId =
      sourceSnapshots.find((snapshot) => snapshot.id !== currentSnapshotId)?.id || currentSnapshotId;

    setDiffLeftSnapshotId(previousSnapshotId);
    setDiffRightSnapshotId(currentSnapshotId);
  }, [selectedDetail?.release.id, selectedDetail?.currentSourceSnapshot?.id, sourceSnapshots]);

  useEffect(() => {
    if (!selectedDetail) {
      setIsEditingSource(false);
      setSourceNameDraft('');
      setSourcePayloadDraft('{}');
      return;
    }

    setSourceNameDraft(selectedDetail.release.sourceName || '');
    setSourcePayloadDraft(
      JSON.stringify(selectedDetail.currentSourceSnapshot?.sourcePayload || {}, null, 2),
    );
    setIsEditingSource(false);
  }, [selectedDetail?.release.id, selectedDetail?.release.sourceName, selectedDetail?.currentSourceSnapshot?.id]);

  useEffect(() => {
    const draft = selectedDetail?.currentSkillDraft;
    if (!draft) {
      setIsEditingSkillDraft(false);
      setSkillDraftName('');
      setSkillDraftDescription('');
      setSkillDraftTriggerKeywords([]);
      setSkillDraftTools([]);
      setSkillDraftTemplateIds([]);
      setSkillDraftParamFields([]);
      setSkillDraftParamSchemaExtras({ type: 'object' });
      setSkillDraftApiEndpointFields([]);
      return;
    }

    const parsedParamSchema = parseParamSchemaToDraft(draft.paramsSchema);
    setSkillDraftName(draft.name || '');
    setSkillDraftDescription(draft.description || '');
    setSkillDraftTriggerKeywords(draft.triggerKeywords || []);
    setSkillDraftTools(draft.tools || []);
    setSkillDraftTemplateIds(draft.executionFlowTemplateIds || []);
    setSkillDraftParamFields(parsedParamSchema.fields);
    setSkillDraftParamSchemaExtras(parsedParamSchema.extras);
    setSkillDraftApiEndpointFields(parseApiEndpointsToDraft(draft.apiEndpoints ?? null));
    setIsEditingSkillDraft(false);
  }, [selectedDetail?.release.id, selectedDetail?.currentSkillDraft?.id, selectedDetail?.currentSkillDraft?.updatedAt]);

  const leftSnapshot =
    sourceSnapshots.find((snapshot) => snapshot.id === diffLeftSnapshotId) || sourceSnapshots[1] || null;
  const rightSnapshot =
    sourceSnapshots.find((snapshot) => snapshot.id === diffRightSnapshotId) ||
    selectedDetail?.currentSourceSnapshot ||
    sourceSnapshots[0] ||
    null;
  const snapshotDiffRows = useMemo(
    () =>
      leftSnapshot && rightSnapshot
        ? buildSnapshotDiffRows(leftSnapshot.sourcePayload, rightSnapshot.sourcePayload)
        : [],
    [leftSnapshot, rightSnapshot],
  );
  const visibleSnapshotDiffRows = useMemo(
    () =>
      showOnlyDiff
        ? snapshotDiffRows.filter((row) => row.status !== 'same')
        : snapshotDiffRows,
    [showOnlyDiff, snapshotDiffRows],
  );
  const snapshotDiffSummary = useMemo(
    () =>
      snapshotDiffRows.reduce(
        (summary, row) => {
          if (row.status === 'added') {
            summary.added += 1;
          } else if (row.status === 'removed') {
            summary.removed += 1;
          } else if (row.status === 'changed') {
            summary.changed += 1;
          } else {
            summary.same += 1;
          }
          return summary;
        },
        { added: 0, removed: 0, changed: 0, same: 0 },
      ),
    [snapshotDiffRows],
  );
  const hasSnapshotDrift = Boolean(
    selectedDetail?.currentSourceSnapshot?.id &&
      latestBuild?.sourceSnapshotId &&
      selectedDetail.currentSourceSnapshot.id !== latestBuild.sourceSnapshotId,
  );
  const hasNoBuild = !latestBuild;
  const hasNoValidation = !latestValidation;
  const sourcePayloadDraftState = useMemo(
    () => parseJsonDraft<Record<string, unknown>>(sourcePayloadDraft || '{}', '源定义 JSON'),
    [sourcePayloadDraft],
  );
  const skillDraftParamsSchemaValue = useMemo(
    () => buildParamSchemaFromDraft(skillDraftParamFields, skillDraftParamSchemaExtras),
    [skillDraftParamFields, skillDraftParamSchemaExtras],
  );
  const skillDraftParamFieldErrors = useMemo(() => {
    const nameSet = new Set<string>();
    const errors: string[] = [];

    skillDraftParamFields.forEach((field, index) => {
      const name = field.name.trim();
      if (!name) {
        errors.push(`第 ${index + 1} 个参数缺少字段名`);
      } else if (nameSet.has(name)) {
        errors.push(`参数名重复: ${name}`);
      } else {
        nameSet.add(name);
      }

      if (!field.type.trim()) {
        errors.push(`参数 ${name || index + 1} 缺少类型`);
      }
    });

    return errors;
  }, [skillDraftParamFields]);
  const skillDraftApiEndpointErrors = useMemo(() => {
    const errors: string[] = [];
    const endpointKeySet = new Set<string>();

    skillDraftApiEndpointFields.forEach((endpoint, index) => {
      const key = endpoint.key.trim();
      if (!key) {
        errors.push(`第 ${index + 1} 个 API Endpoint 缺少标识名`);
      } else if (endpointKeySet.has(key)) {
        errors.push(`API Endpoint 标识重复: ${key}`);
      } else {
        endpointKeySet.add(key);
      }

      if (!endpoint.url.trim()) {
        errors.push(`API Endpoint ${key || index + 1} 缺少 URL`);
      }

      if (endpoint.extraJson.trim()) {
        const parsed = parseJsonDraft<Record<string, unknown>>(
          endpoint.extraJson,
          `API Endpoint ${key || index + 1} 额外 JSON`,
        );
        if (!parsed.valid) {
          errors.push(parsed.error);
        }
      }
    });

    return errors;
  }, [skillDraftApiEndpointFields]);
  const skillDraftApiEndpointsValue = useMemo(() => {
    const endpoints: Record<string, unknown> = {};

    skillDraftApiEndpointFields.forEach((endpoint) => {
      const key = endpoint.key.trim();
      if (!key) {
        return;
      }

      const parsedExtra = endpoint.extraJson.trim()
        ? parseJsonDraft<Record<string, unknown>>(endpoint.extraJson, `API Endpoint ${key} 额外 JSON`)
        : { valid: true as const, value: {} as Record<string, unknown> };

      endpoints[key] = {
        url: endpoint.url.trim(),
        method: endpoint.method,
        description: endpoint.description.trim(),
        ...(parsedExtra.valid ? parsedExtra.value : {}),
      };
    });

    return Object.keys(endpoints).length > 0 ? endpoints : null;
  }, [skillDraftApiEndpointFields]);
  const deployOverridesState = useMemo(
    () => parseJsonDraft<Record<string, unknown>>(deployOverridesDraft || '{}', '部署覆盖参数 JSON'),
    [deployOverridesDraft],
  );

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      if (!values.sourceId && !values.sourcePayload?.trim()) {
        message.error('请选择已有源对象，或填写源定义 JSON');
        return;
      }
      let sourcePayload: Record<string, unknown> | undefined;
      if (values.sourcePayload?.trim()) {
        sourcePayload = JSON.parse(values.sourcePayload);
      }
      createMutation.mutate({
        sourceType: values.sourceType,
        sourceId: values.sourceId || undefined,
        sourceName: values.sourceName || undefined,
        sourcePayload,
      });
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    }
  };

  const openDeployModal = (releaseId: string) => {
    setSelectedReleaseId(releaseId);
    setDeployTargetReleaseId(releaseId);
    setDeployEnvironment('staging');
    setDeployStrategy('rolling_restart');
    setDeployOverridesDraft('{}');
    setDeployVisible(true);
  };

  const handleDeploy = async () => {
    if (!deployTargetReleaseId) {
      return;
    }
    if (!deployOverridesState.valid) {
      message.error(deployOverridesState.error);
      return;
    }

    deployMutation.mutate({
      id: deployTargetReleaseId,
      environment: deployEnvironment,
      strategy: deployStrategy,
      configOverrides: deployOverridesState.value,
    });
  };

  const handlePublishSkill = async (release: CapabilityRelease) => {
    try {
      let latestRelease = release;

      if (!latestRelease.currentSkillDraftId) {
        const draftResult = await capabilityReleaseApi.generateSkillDraft(release.id);
        message.success(`Skill 草案已生成: ${draftResult.skillDraft.name}`);
        latestRelease = draftResult.release;
      }

      if (latestRelease.approvalStatus !== 'approved' && latestRelease.approvalStatus !== 'not_required') {
        const approveResult = await capabilityReleaseApi.approveRelease(release.id, {
          decision: 'approved',
          comment: 'Portal 自动审批通过',
        });
        message.success(`Release 已审批: ${approveResult.release.release.status}`);
        latestRelease = approveResult.release.release;
      }

      const publishResult = await capabilityReleaseApi.publishSkill(release.id);
      message.success(`Skill 发布成功: ${publishResult.publishedSkillId}`);
      await refreshQueries(release.id);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '发布 Skill 失败';
      message.error(messageText);
    }
  };

  const handleArchiveRelease = (releaseId: string) => {
    Modal.confirm({
      title: '删除 Capability Release',
      content: '删除后将归档当前 Release，列表中不再显示。是否继续？',
      okText: '删除',
      okButtonProps: { danger: true, loading: archiveReleaseMutation.isLoading },
      cancelText: '取消',
      onOk: async () => {
        await archiveReleaseMutation.mutateAsync({ id: releaseId });
      },
    });
  };

  const handleSaveSource = async () => {
    if (!selectedReleaseId) {
      return;
    }

    if (!sourcePayloadDraftState.valid) {
      message.error(sourcePayloadDraftState.error);
      return;
    }

    try {
      updateSourceMutation.mutate({
        id: selectedReleaseId,
        sourceName: sourceNameDraft.trim() || undefined,
        sourcePayload: sourcePayloadDraftState.value,
      });
    } catch (error) {
      if (error instanceof Error) {
        message.error(`源定义 JSON 解析失败: ${error.message}`);
        return;
      }
      message.error('源定义 JSON 解析失败');
    }
  };

  const resetSkillDraftEditor = () => {
    const draft = selectedDetail?.currentSkillDraft;
    if (!draft) {
      setIsEditingSkillDraft(false);
      return;
    }

    setSkillDraftName(draft.name || '');
    setSkillDraftDescription(draft.description || '');
    setSkillDraftTriggerKeywords(draft.triggerKeywords || []);
    setSkillDraftTools(draft.tools || []);
    setSkillDraftTemplateIds(draft.executionFlowTemplateIds || []);
    const parsedParamSchema = parseParamSchemaToDraft(draft.paramsSchema);
    setSkillDraftParamFields(parsedParamSchema.fields);
    setSkillDraftParamSchemaExtras(parsedParamSchema.extras);
    setSkillDraftApiEndpointFields(parseApiEndpointsToDraft(draft.apiEndpoints ?? null));
    setIsEditingSkillDraft(false);
  };

  const handleSaveSkillDraft = async () => {
    if (!selectedReleaseId || !selectedDetail?.currentSkillDraft) {
      return;
    }

    if (skillDraftParamFieldErrors.length > 0) {
      message.error(skillDraftParamFieldErrors[0]);
      return;
    }
    if (skillDraftApiEndpointErrors.length > 0) {
      message.error(skillDraftApiEndpointErrors[0]);
      return;
    }

    try {
      updateSkillDraftMutation.mutate({
        id: selectedReleaseId,
        payload: {
          name: skillDraftName.trim(),
          description: skillDraftDescription.trim(),
          triggerKeywords: skillDraftTriggerKeywords.map((item) => item.trim()).filter(Boolean),
          tools: skillDraftTools.map((item) => item.trim()).filter(Boolean),
          executionFlowTemplateIds: skillDraftTemplateIds.map((item) => item.trim()).filter(Boolean),
          paramsSchema: skillDraftParamsSchemaValue,
          apiEndpoints: skillDraftApiEndpointsValue,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        message.error(`Skill 草案 JSON 解析失败: ${error.message}`);
        return;
      }
      message.error('Skill 草案 JSON 解析失败');
    }
  };

  const addSkillDraftParamField = () => {
    setSkillDraftParamFields((current) => [
      ...current,
      {
        id: createParamFieldId(),
        name: '',
        type: 'string',
        description: '',
        required: false,
        defaultValue: '',
        extractionPrompt: '',
        enumValues: [],
      },
    ]);
  };

  const updateSkillDraftParamField = (
    id: string,
    patch: Partial<ParamSchemaFieldDraft>,
  ) => {
    setSkillDraftParamFields((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const removeSkillDraftParamField = (id: string) => {
    setSkillDraftParamFields((current) => current.filter((item) => item.id !== id));
  };

  const moveSkillDraftParamField = (id: string, direction: 'up' | 'down') => {
    setSkillDraftParamFields((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index === -1) {
        return current;
      }

      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const addSkillDraftApiEndpoint = () => {
    setSkillDraftApiEndpointFields((current) => [
      ...current,
      {
        id: createApiEndpointId(),
        key: '',
        method: 'POST',
        url: '',
        description: '',
        extraJson: '',
      },
    ]);
  };

  const updateSkillDraftApiEndpoint = (
    id: string,
    patch: Partial<ApiEndpointDraft>,
  ) => {
    setSkillDraftApiEndpointFields((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const removeSkillDraftApiEndpoint = (id: string) => {
    setSkillDraftApiEndpointFields((current) => current.filter((item) => item.id !== id));
  };

  const studioContent = selectedDetail ? (
    <Row gutter={16} align="top">
      <Col span={11}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {(hasSnapshotDrift || hasNoBuild || hasNoValidation) && (
            <Alert
              type="warning"
              showIcon
              message="Studio 下一步建议"
              description={
                <Text>
                  {hasSnapshotDrift
                    ? '当前快照与最近一次构建不一致，建议重新构建。'
                    : hasNoBuild
                      ? '当前 Release 还没有构建记录，建议先构建。'
                      : hasNoValidation
                        ? '当前 Release 还没有验证记录，建议完成验证。'
                        : '建议重新执行构建与校验。'}
                </Text>
              }
            />
          )}

          <Card size="small" title="源定义 / DSL 快照">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
                <Space direction="vertical" size={2}>
                  <Text strong>{selectedDetail.release.sourceName || '未命名能力'}</Text>
                  <Text type="secondary">
                    当前快照: v{selectedDetail.currentSourceSnapshot?.snapshotVersion || '-'}
                  </Text>
                </Space>
                <Space>
                  {isEditingSource ? (
                    <>
                      <Button
                        size="small"
                        onClick={() => {
                          setIsEditingSource(false);
                          setSourceNameDraft(selectedDetail.release.sourceName || '');
                          setSourcePayloadDraft(
                            JSON.stringify(
                              selectedDetail.currentSourceSnapshot?.sourcePayload || {},
                              null,
                              2,
                            ),
                          );
                        }}
                      >
                        取消
                      </Button>
                      <Button
                        type="primary"
                        size="small"
                          disabled={!sourcePayloadDraftState.valid}
                        loading={updateSourceMutation.isLoading}
                        onClick={() => void handleSaveSource()}
                      >
                        保存快照
                      </Button>
                    </>
                  ) : (
                    <Button size="small" type="link" onClick={() => setIsEditingSource(true)}>
                      编辑源定义
                    </Button>
                  )}
                </Space>
              </Space>

              {isEditingSource ? (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Input
                    placeholder="能力名称"
                    value={sourceNameDraft}
                    onChange={(event) => setSourceNameDraft(event.target.value)}
                  />
                  <TextArea
                    rows={16}
                    value={sourcePayloadDraft}
                    onChange={(event) => setSourcePayloadDraft(event.target.value)}
                    placeholder="请输入 sourcePayload JSON"
                    spellCheck={false}
                    style={{ fontFamily: 'monospace' }}
                  />
                  {!sourcePayloadDraftState.valid && (
                    <Alert type="error" showIcon message={sourcePayloadDraftState.error} />
                  )}
                  <Text type="secondary">
                    保存后会创建新的 source snapshot，并将 Release 状态重置为 `draft`。
                  </Text>
                </Space>
              ) : (
                <pre style={studioPaneStyle}>
                  {JSON.stringify(selectedDetail.currentSourceSnapshot?.sourcePayload || {}, null, 2)}
                </pre>
              )}
            </Space>
          </Card>

          {Object.keys(deploymentProfiles).length > 0 && (
            <Card size="small" title="多环境部署配置">
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {(['dev', 'test', 'staging', 'prod'] as DeploymentEnvironment[])
                  .filter((env) => deploymentProfiles[env])
                  .map((env) => (
                    <Card key={env} size="small" type="inner" title={env}>
                      <pre style={{ ...studioPaneStyle, maxHeight: 160 }}>
                        {JSON.stringify(deploymentProfiles[env], null, 2)}
                      </pre>
                    </Card>
                  ))}
              </Space>
            </Card>
          )}

          <Card size="small" title="当前 Skill 草案">
            {selectedDetail.currentSkillDraft ? (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
                  <Space direction="vertical" size={2}>
                    <Text strong>{selectedDetail.currentSkillDraft.name}</Text>
                    <Text type="secondary">状态: {selectedDetail.currentSkillDraft.status}</Text>
                  </Space>
                  <Space>
                    {isEditingSkillDraft ? (
                      <>
                        <Button size="small" onClick={resetSkillDraftEditor}>
                          取消
                        </Button>
                        <Button
                          type="primary"
                          size="small"
                          disabled={skillDraftParamFieldErrors.length > 0 || skillDraftApiEndpointErrors.length > 0}
                          loading={updateSkillDraftMutation.isLoading}
                          onClick={() => void handleSaveSkillDraft()}
                        >
                          保存草案
                        </Button>
                      </>
                    ) : (
                      <Button size="small" type="link" onClick={() => setIsEditingSkillDraft(true)}>
                        编辑草案
                      </Button>
                    )}
                  </Space>
                </Space>

                {isEditingSkillDraft ? (
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Input
                      placeholder="Skill 名称"
                      value={skillDraftName}
                      onChange={(event) => setSkillDraftName(event.target.value)}
                    />
                    <TextArea
                      rows={3}
                      placeholder="Skill 描述"
                      value={skillDraftDescription}
                      onChange={(event) => setSkillDraftDescription(event.target.value)}
                    />
                    <Select
                      mode="tags"
                      tokenSeparators={[',']}
                      placeholder="触发词，可直接回车或逗号创建标签"
                      value={skillDraftTriggerKeywords}
                      onChange={(value) => setSkillDraftTriggerKeywords(value)}
                      options={skillDraftTriggerKeywords.map((item) => ({ label: item, value: item }))}
                    />
                    <Select
                      mode="tags"
                      tokenSeparators={[',']}
                      placeholder="Tools，可直接回车或逗号创建标签"
                      value={skillDraftTools}
                      onChange={(value) => setSkillDraftTools(value)}
                      options={skillDraftTools.map((item) => ({ label: item, value: item }))}
                    />
                    <Select
                      mode="tags"
                      tokenSeparators={[',']}
                      placeholder="Execution Flow Template IDs，可直接回车或逗号创建标签"
                      value={skillDraftTemplateIds}
                      onChange={(value) => setSkillDraftTemplateIds(value)}
                      options={skillDraftTemplateIds.map((item) => ({ label: item, value: item }))}
                    />
                    <ParamSchemaEditor
                      fields={skillDraftParamFields}
                      errors={skillDraftParamFieldErrors}
                      schemaPreview={skillDraftParamsSchemaValue}
                      onAddField={addSkillDraftParamField}
                      onRemoveField={removeSkillDraftParamField}
                      onMoveField={moveSkillDraftParamField}
                      onChangeField={updateSkillDraftParamField}
                    />
                    <Card
                      size="small"
                      title="API Endpoints"
                      extra={
                        <Button size="small" onClick={addSkillDraftApiEndpoint}>
                          添加 Endpoint
                        </Button>
                      }
                    >
                      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                        {skillDraftApiEndpointFields.length > 0 ? (
                          skillDraftApiEndpointFields.map((endpoint, index) => (
                            <Card
                              key={endpoint.id}
                              size="small"
                              type="inner"
                              title={`Endpoint ${index + 1}`}
                              extra={
                                <Button
                                  size="small"
                                  type="text"
                                  danger
                                  onClick={() => removeSkillDraftApiEndpoint(endpoint.id)}
                                >
                                  删除
                                </Button>
                              }
                            >
                              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                <Input
                                  placeholder="标识名，例如 generateParameters"
                                  value={endpoint.key}
                                  onChange={(event) =>
                                    updateSkillDraftApiEndpoint(endpoint.id, {
                                      key: event.target.value,
                                    })
                                  }
                                />
                                <Select
                                  value={endpoint.method}
                                  onChange={(value) =>
                                    updateSkillDraftApiEndpoint(endpoint.id, {
                                      method: value,
                                    })
                                  }
                                  options={[
                                    { label: 'GET', value: 'GET' },
                                    { label: 'POST', value: 'POST' },
                                    { label: 'PUT', value: 'PUT' },
                                    { label: 'DELETE', value: 'DELETE' },
                                  ]}
                                />
                                <Input
                                  placeholder="URL，例如 /studio/render"
                                  value={endpoint.url}
                                  onChange={(event) =>
                                    updateSkillDraftApiEndpoint(endpoint.id, {
                                      url: event.target.value,
                                    })
                                  }
                                />
                                <TextArea
                                  rows={2}
                                  placeholder="接口描述，可选"
                                  value={endpoint.description}
                                  onChange={(event) =>
                                    updateSkillDraftApiEndpoint(endpoint.id, {
                                      description: event.target.value,
                                    })
                                  }
                                />
                                <TextArea
                                  rows={3}
                                  placeholder={'额外 JSON 字段，可选，例如 {"timeout":5000}'}
                                  value={endpoint.extraJson}
                                  onChange={(event) =>
                                    updateSkillDraftApiEndpoint(endpoint.id, {
                                      extraJson: event.target.value,
                                    })
                                  }
                                  spellCheck={false}
                                  style={{ fontFamily: 'monospace' }}
                                />
                              </Space>
                            </Card>
                          ))
                        ) : (
                          <Text type="secondary">暂无 API Endpoint，点击“添加 Endpoint”开始配置。</Text>
                        )}
                        {skillDraftApiEndpointErrors.length > 0 && (
                          <Alert
                            type="error"
                            showIcon
                            message={skillDraftApiEndpointErrors[0]}
                            description={skillDraftApiEndpointErrors.slice(1).join('；') || undefined}
                          />
                        )}
                        <pre style={{ ...studioPaneStyle, maxHeight: 220 }}>
                          {JSON.stringify(skillDraftApiEndpointsValue, null, 2)}
                        </pre>
                      </Space>
                    </Card>
                    <Text type="secondary">
                      保存后会将草案状态推进到 `reviewed`，并把 Release 审批状态置为待审批。
                    </Text>
                  </Space>
                ) : (
                  <pre style={studioPaneStyle}>
                    {JSON.stringify(selectedDetail.currentSkillDraft.draftPayload, null, 2)}
                  </pre>
                )}
              </Space>
            ) : (
              <Text type="secondary">暂无 Skill 草案</Text>
            )}
          </Card>

          <Card
            size="small"
            title="Snapshot Diff"
            extra={
              sourceSnapshots.length > 1 ? (
                <Space size="small">
                  <Button
                    size="small"
                    onClick={() => {
                      setShowOnlyDiff((current) => !current);
                    }}
                  >
                    {showOnlyDiff ? '显示全部' : '只看差异'}
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setDiffLeftSnapshotId(rightSnapshot?.id || null);
                      setDiffRightSnapshotId(leftSnapshot?.id || null);
                    }}
                  >
                    交换版本
                  </Button>
                </Space>
              ) : null
            }
          >
            {sourceSnapshots.length > 1 && leftSnapshot && rightSnapshot ? (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Space wrap>
                  <Select
                    style={{ width: 220 }}
                    value={diffLeftSnapshotId || undefined}
                    onChange={(value) => setDiffLeftSnapshotId(value)}
                    options={sourceSnapshots.map((snapshot) => ({
                      label: `v${snapshot.snapshotVersion} / ${new Date(snapshot.createdAt).toLocaleString()}`,
                      value: snapshot.id,
                    }))}
                  />
                  <Text type="secondary">对比</Text>
                  <Select
                    style={{ width: 220 }}
                    value={diffRightSnapshotId || undefined}
                    onChange={(value) => setDiffRightSnapshotId(value)}
                    options={sourceSnapshots.map((snapshot) => ({
                      label: `v${snapshot.snapshotVersion} / ${new Date(snapshot.createdAt).toLocaleString()}`,
                      value: snapshot.id,
                    }))}
                  />
                </Space>

                <Space wrap>
                  <Tag color="blue">总字段 {snapshotDiffRows.length}</Tag>
                  <Tag color="gold">变更 {snapshotDiffSummary.changed}</Tag>
                  <Tag color="green">新增 {snapshotDiffSummary.added}</Tag>
                  <Tag color="red">删除 {snapshotDiffSummary.removed}</Tag>
                  {!showOnlyDiff && <Tag>相同 {snapshotDiffSummary.same}</Tag>}
                </Space>

                <div
                  style={{
                    border: '1px solid #f0f0f0',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '220px 1fr 1fr',
                      gap: 0,
                      background: '#fafafa',
                      padding: '8px 12px',
                      fontWeight: 600,
                    }}
                  >
                    <div>字段路径</div>
                    <div>左侧版本 v{leftSnapshot.snapshotVersion}</div>
                    <div>右侧版本 v{rightSnapshot.snapshotVersion}</div>
                  </div>

                  <div style={{ maxHeight: 360, overflow: 'auto' }}>
                    {visibleSnapshotDiffRows.length > 0 ? (
                      visibleSnapshotDiffRows.map((row) => {
                        const backgroundColor =
                          row.status === 'changed'
                            ? '#fffbe6'
                            : row.status === 'added'
                              ? '#f6ffed'
                              : row.status === 'removed'
                                ? '#fff2f0'
                                : '#ffffff';

                        return (
                          <div
                            key={row.path}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '220px 1fr 1fr',
                              gap: 0,
                              borderTop: '1px solid #f0f0f0',
                              background: backgroundColor,
                            }}
                          >
                            <div style={{ padding: 12 }}>
                              <Space direction="vertical" size={4}>
                                <Text code>{row.path}</Text>
                                <Tag
                                  color={
                                    row.status === 'changed'
                                      ? 'gold'
                                      : row.status === 'added'
                                        ? 'green'
                                        : row.status === 'removed'
                                          ? 'red'
                                          : 'default'
                                  }
                                >
                                  {row.status}
                                </Tag>
                              </Space>
                            </div>
                            <pre style={{ ...studioPaneStyle, padding: 12, margin: 0, maxHeight: 'none' }}>
                              {row.leftValue}
                            </pre>
                            <pre style={{ ...studioPaneStyle, padding: 12, margin: 0, maxHeight: 'none' }}>
                              {row.rightValue}
                            </pre>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ padding: 16 }}>
                        <Text type="secondary">
                          {showOnlyDiff ? '当前所选版本之间没有差异。' : '当前没有可展示的快照内容。'}
                        </Text>
                      </div>
                    )}
                  </div>
                </div>
              </Space>
            ) : (
              <Text type="secondary">至少需要两个快照版本才能进行对比</Text>
            )}
          </Card>
        </Space>
      </Col>

      <Col span={13}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Card
            size="small"
            title="最近一次构建"
          >
            {latestBuild ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text>类型：{latestBuild.buildType}</Text>
                <Text>状态：{latestBuild.status}</Text>
                <Text>摘要：{latestBuild.diffSummary || '无'}</Text>
                {latestBuild.logs?.length ? (
                  <pre style={{ ...studioPaneStyle, maxHeight: 180 }}>{latestBuild.logs.join('\n')}</pre>
                ) : null}
                {latestBuild.generatedCode ? (
                  <pre style={studioPaneStyle}>{latestBuild.generatedCode}</pre>
                ) : (
                  <pre style={studioPaneStyle}>
                    {JSON.stringify(latestBuild.generatedConfig || {}, null, 2)}
                  </pre>
                )}
              </Space>
            ) : (
              <Text type="secondary">暂无构建记录</Text>
            )}
          </Card>

          <Card
            size="small"
            title="最近一次验证"
          >
            {latestValidation ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text>类型：{latestValidation.validationType}</Text>
                <Text>结果：{latestValidation.success ? '通过' : '失败'}</Text>
                <Text>分数：{latestValidation.score}</Text>
                {latestValidation.errorSummary && <Text type="danger">{latestValidation.errorSummary}</Text>}
                <pre style={{ ...studioPaneStyle, maxHeight: 220 }}>
                  {latestValidation.logs.join('\n') || '暂无日志'}
                </pre>
              </Space>
            ) : (
              <Text type="secondary">暂无验证记录</Text>
            )}
          </Card>
        </Space>
      </Col>
    </Row>
  ) : null;

  const operationsContent = selectedDetail ? (
    <Row gutter={16} align="top">
      <Col span={24}>
        <Card
          size="small"
          title="快捷操作"
          style={{ marginBottom: 16 }}
          extra={<Text type="secondary">代码部署目标：ops-temporal</Text>}
        >
          <Space wrap>
            <Button
              type="primary"
              icon={<RocketOutlined />}
              disabled={
                selectedDetail.release.sourceType !== 'temporal_workflow'
                  && !selectedDetail.release.publishedSkillId
              }
              loading={deployMutation.isLoading}
              onClick={() => openDeployModal(selectedDetail.release.id)}
            >
              代码部署到 ops-temporal
            </Button>
            <Button
              icon={<RocketOutlined />}
              disabled={!selectedDetail.release.latestSuccessfulValidationId}
              loading={publishMutation.isLoading || generateDraftMutation.isLoading || approveMutation.isLoading}
              onClick={() => void handlePublishSkill(selectedDetail.release)}
            >
              发布 Skill
            </Button>
            <Button
              icon={<SafetyCertificateOutlined />}
              disabled={!selectedDetail.release.publishedSkillId}
              loading={validateSkillMutation.isLoading}
              onClick={() =>
                selectedDetail.release.publishedSkillId
                  ? validateSkillMutation.mutate({ skillId: selectedDetail.release.publishedSkillId })
                  : undefined
              }
            >
              Skill 校验
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={archiveReleaseMutation.isLoading}
              onClick={() => handleArchiveRelease(selectedDetail.release.id)}
            >
              删除 Release
            </Button>
          </Space>
        </Card>
      </Col>
      <Col span={12}>
        <Card size="small" title="最近一次部署">
          {latestDeployment ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text>环境：{latestDeployment.environment}</Text>
              <Text>运行时：{latestDeployment.runtimeType}</Text>
              <Text>状态：{latestDeployment.status}</Text>
              <Text>策略：{latestDeployment.reloadStrategy || '无'}</Text>
              {latestSmokeValidation && (
                <Text>
                  Smoke Test：{latestSmokeValidation.success ? '通过' : '失败'} / 分数 {latestSmokeValidation.score}
                </Text>
              )}
              {latestDeployment.artifactUri && <Text>制品：{latestDeployment.artifactUri}</Text>}
              {latestDeployment.rollbackTargetReleaseId && (
                <Text>回滚目标：{latestDeployment.rollbackTargetReleaseId}</Text>
              )}
              <pre style={studioPaneStyle}>{latestDeployment.logs.join('\n') || '暂无日志'}</pre>
              {latestSmokeValidation && (
                <pre style={{ ...studioPaneStyle, maxHeight: 180 }}>
                  {latestSmokeValidation.logs.join('\n') || '暂无 smoke test 日志'}
                </pre>
              )}
            </Space>
          ) : (
            <Text type="secondary">暂无部署记录</Text>
          )}
        </Card>
      </Col>

      <Col span={12}>
        <Card size="small" title="审计轨迹">
          {latestAuditEvents.length > 0 ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              {latestAuditEvents.map((event) => (
                <Card
                  key={event.id}
                  size="small"
                  style={{ background: event.success ? '#f6ffed' : '#fff2f0' }}
                >
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                      <Text strong>{event.summary}</Text>
                      <Tag color={event.success ? 'green' : 'red'}>{event.eventType}</Tag>
                    </Space>
                    <Text type="secondary">{new Date(event.createdAt).toLocaleString()}</Text>
                    {event.details && (
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(event.details, null, 2)}
                      </pre>
                    )}
                  </Space>
                </Card>
              ))}
            </Space>
          ) : (
            <Text type="secondary">暂无审计事件</Text>
          )}
        </Card>
      </Col>
    </Row>
  ) : null;

  if (isStudioMode) {
    return (
      <div>
        <Space
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
          align="start"
          wrap
        >
          <Space direction="vertical" size={4}>
            <Title level={4} style={{ margin: 0 }}>
              Capability Studio
            </Title>
            <Text type="secondary">
              面向设计与验证的独立工作台，聚焦源定义、构建、校验、草案生成与快照对比。
            </Text>
          </Space>
          <Space wrap>
            <Button icon={<LeftOutlined />} onClick={() => navigate('/admin/capability-releases')}>
              返回 Release 管理
            </Button>
            <Button
              disabled={!selectedDetail?.release.publishedSkillId}
              onClick={() =>
                selectedDetail?.release.publishedSkillId
                  ? navigate(
                      `/published-skills/${selectedDetail.release.publishedSkillId}?releaseId=${selectedDetail.release.id}`,
                    )
                  : undefined
              }
            >
              查看 Published Skill
            </Button>
            <Button
              icon={<RocketOutlined />}
              disabled={!selectedReleaseId}
              onClick={() =>
                selectedReleaseId ? navigate(`/release-center?releaseId=${selectedReleaseId}`) : undefined
              }
            >
              打开 Release Center
            </Button>
          </Space>
        </Space>

        <Card style={{ marginBottom: 16 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Select
              showSearch
              allowClear
              style={{ minWidth: 360 }}
              placeholder="选择要进入的 Release"
              value={selectedReleaseId || undefined}
              optionFilterProp="label"
              loading={releasesQuery.isLoading}
              onChange={(value) => {
                setSelectedReleaseId(value || null);
                setSearchParams(value ? { releaseId: value } : {});
              }}
              options={(releasesQuery.data?.releases || []).map((release) => ({
                value: release.id,
                label: `${release.sourceName || release.sourceId || '未命名能力'} · ${release.id.slice(0, 8)} · ${release.status}`,
              }))}
            />
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={() => refreshQueries(selectedReleaseId || undefined)}>
                刷新
              </Button>
              {selectedReleaseId ? (
                <Button onClick={() => navigate(`/admin/capability-releases?releaseId=${selectedReleaseId}`)}>
                  查看完整 Release
                </Button>
              ) : null}
            </Space>
          </Space>
        </Card>

        {selectedDetail ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Card size="small">
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label="Release ID">{selectedDetail.release.id}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={statusColor(selectedDetail.release.status)}>{selectedDetail.release.status}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="能力名称">
                  {selectedDetail.release.sourceName || '未命名'}
                </Descriptions.Item>
                <Descriptions.Item label="能力类型">
                  {selectedDetail.release.sourceType}
                </Descriptions.Item>
                <Descriptions.Item label="审批状态">
                  {selectedDetail.release.approvalStatus}
                </Descriptions.Item>
                <Descriptions.Item label="部署状态">
                  {selectedDetail.release.deploymentStatus}
                </Descriptions.Item>
              </Descriptions>
            </Card>
            {studioContent}
          </Space>
        ) : (
          <Card>
            <Text type="secondary">
              {releasesQuery.isLoading ? '正在加载 Release 列表...' : '请选择一个 Release 进入 Capability Studio。'}
            </Text>
          </Card>
        )}

        <Modal
          title="代码部署到 ops-temporal"
          open={deployVisible}
          onCancel={() => setDeployVisible(false)}
          onOk={handleDeploy}
          okText="开始代码部署"
          confirmLoading={deployMutation.isLoading}
          okButtonProps={{ disabled: !deployOverridesState.valid }}
          width={760}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space wrap style={{ width: '100%' }}>
              <Select
                style={{ width: 180 }}
                value={deployEnvironment}
                onChange={(value) => setDeployEnvironment(value as DeploymentEnvironment)}
                options={[
                  { label: 'dev', value: 'dev' },
                  { label: 'test', value: 'test' },
                  { label: 'staging', value: 'staging' },
                  { label: 'prod', value: 'prod' },
                ]}
              />
              <Select
                style={{ width: 220 }}
                value={deployStrategy}
                onChange={(value) =>
                  setDeployStrategy(value as 'hot_reload' | 'rolling_restart' | 'full_restart')
                }
                options={[
                  { label: 'hot_reload', value: 'hot_reload' },
                  { label: 'rolling_restart', value: 'rolling_restart' },
                  { label: 'full_restart', value: 'full_restart' },
                ]}
              />
            </Space>

            <Card size="small" title={`环境 Profile 预览: ${deployEnvironment}`}>
              <pre style={{ ...studioPaneStyle, maxHeight: 200 }}>
                {JSON.stringify(activeDeployProfile, null, 2)}
              </pre>
            </Card>

            <TextArea
              rows={8}
              value={deployOverridesDraft}
              onChange={(event) => setDeployOverridesDraft(event.target.value)}
              placeholder='部署覆盖参数 JSON，例如 {"taskQueue":"SKILL_STAGING_QUEUE","workerReload":true}'
              spellCheck={false}
              style={{ fontFamily: 'monospace' }}
            />
            {!deployOverridesState.valid && (
              <Alert type="error" showIcon message={deployOverridesState.error} />
            )}
            <Text type="secondary">
              最终部署参数 = 当前环境 profile + 本次覆盖参数。profile 推荐放在
              `sourcePayload.deploymentProfiles` 下维护。
            </Text>
          </Space>
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <Title level={4}>Capability Release</Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Capability Release 操作台"
        description="当前页面保留 Release 创建、静态校验、发布 Skill、代码部署、Skill 校验、删除与回滚。Temporal Workflow 的代码部署会将当前 workflow 代码同步到 ops-temporal 对应的部署记录。"
      />

      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Input
            placeholder="搜索 Release / 能力名称 / 状态"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            allowClear
            style={{ width: 320 }}
          />
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => refreshQueries(selectedReleaseId || undefined)}>
              刷新
            </Button>
            <Button type="primary" icon={<AppstoreAddOutlined />} onClick={() => setCreateVisible(true)}>
              新建 Release
            </Button>
          </Space>
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredReleases}
          loading={releasesQuery.isLoading}
          pagination={{ showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        />
      </Card>

      <Modal
        title="新建 Capability Release"
        open={createVisible}
        onCancel={() => setCreateVisible(false)}
        onOk={handleCreate}
        confirmLoading={createMutation.isLoading}
        width={760}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="sourceType"
            label="能力类型"
            rules={[{ required: true, message: '请选择能力类型' }]}
          >
            <Select options={SOURCE_TYPE_OPTIONS as unknown as { label: string; value: string }[]} />
          </Form.Item>
          {createSourceType ? (
            <Form.Item
              name="sourceId"
              label={createSourceType === 'temporal_workflow' ? '选择 Temporal Workflow' : '选择 Execution Flow Template'}
            >
              <Select
                allowClear
                showSearch
                loading={isCreateSourceLoading}
                placeholder={
                  createSourceType === 'temporal_workflow'
                    ? '选择一个已有 Temporal Workflow'
                    : '选择一个已有 Execution Flow Template'
                }
                optionFilterProp="label"
                options={createSourceOptions}
                optionRender={(option) => {
                  const data = option.data as CapabilitySourceOption;
                  return (
                    <Space direction="vertical" size={0}>
                      <Text>{data.label}</Text>
                      {data.description ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {data.description}
                        </Text>
                      ) : null}
                    </Space>
                  );
                }}
              />
            </Form.Item>
          ) : null}
          {createSourceType && !isCreateSourceLoading && createSourceOptions.length === 0 ? (
            <Alert
              style={{ marginBottom: 16 }}
              type="warning"
              showIcon
              message={
                createSourceType === 'temporal_workflow'
                  ? '当前没有可选的 Temporal Workflow'
                  : '当前没有可选的 Execution Flow Template'
              }
              description={
                createSourceType === 'temporal_workflow'
                  ? '请先在 Temporal Workflow 页面创建工作流，再回来新建 Capability Release。'
                  : '请先在 Execution Flow Template 页面创建模板，再回来新建 Capability Release。'
              }
            />
          ) : null}
          <Form.Item name="sourceName" label="显示名称">
            <Input placeholder="可选。若不填，系统会尽量从 sourcePayload / sourceId 中推断" />
          </Form.Item>
          <Form.Item name="sourcePayload" label="源定义 JSON">
            <TextArea
              rows={10}
              placeholder='可选。直接贴 JSON，例如 {"name":"天气查询工作流","workflowDsl":{...},"activityDsl":{...}}'
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="代码部署到 ops-temporal"
        open={deployVisible}
        onCancel={() => setDeployVisible(false)}
        onOk={handleDeploy}
        okText="开始代码部署"
        confirmLoading={deployMutation.isLoading}
        okButtonProps={{ disabled: !deployOverridesState.valid }}
        width={760}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap style={{ width: '100%' }}>
            <Select
              style={{ width: 180 }}
              value={deployEnvironment}
              onChange={(value) => setDeployEnvironment(value as DeploymentEnvironment)}
              options={[
                { label: 'dev', value: 'dev' },
                { label: 'test', value: 'test' },
                { label: 'staging', value: 'staging' },
                { label: 'prod', value: 'prod' },
              ]}
            />
            <Select
              style={{ width: 220 }}
              value={deployStrategy}
              onChange={(value) =>
                setDeployStrategy(value as 'hot_reload' | 'rolling_restart' | 'full_restart')
              }
              options={[
                { label: 'hot_reload', value: 'hot_reload' },
                { label: 'rolling_restart', value: 'rolling_restart' },
                { label: 'full_restart', value: 'full_restart' },
              ]}
            />
          </Space>

          <Card size="small" title={`环境 Profile 预览: ${deployEnvironment}`}>
            <pre style={{ ...studioPaneStyle, maxHeight: 200 }}>
              {JSON.stringify(activeDeployProfile, null, 2)}
            </pre>
          </Card>

          <TextArea
            rows={8}
            value={deployOverridesDraft}
            onChange={(event) => setDeployOverridesDraft(event.target.value)}
            placeholder='部署覆盖参数 JSON，例如 {"taskQueue":"SKILL_STAGING_QUEUE","workerReload":true}'
            spellCheck={false}
            style={{ fontFamily: 'monospace' }}
          />
          {!deployOverridesState.valid && (
            <Alert type="error" showIcon message={deployOverridesState.error} />
          )}
          <Text type="secondary">
            最终部署参数 = 当前环境 profile + 本次覆盖参数。profile 推荐放在
            `sourcePayload.deploymentProfiles` 下维护。
          </Text>
        </Space>
      </Modal>

      <Drawer
        title="Release 详情"
        width={1280}
        open={Boolean(selectedReleaseId)}
        onClose={() => {
          setSelectedReleaseId(null);
          setSearchParams({});
        }}
      >
        {selectedDetail ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Card size="small">
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label="Release ID">{selectedDetail.release.id}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={statusColor(selectedDetail.release.status)}>{selectedDetail.release.status}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="能力名称">
                  {selectedDetail.release.sourceName || '未命名'}
                </Descriptions.Item>
                <Descriptions.Item label="能力类型">
                  {selectedDetail.release.sourceType}
                </Descriptions.Item>
                <Descriptions.Item label="当前 Build">{selectedDetail.release.currentBuildId || '无'}</Descriptions.Item>
                <Descriptions.Item label="最近成功验证">
                  {selectedDetail.release.latestSuccessfulValidationId || '无'}
                </Descriptions.Item>
                <Descriptions.Item label="当前草案">
                  {selectedDetail.release.currentSkillDraftId || '无'}
                </Descriptions.Item>
                <Descriptions.Item label="审批状态">
                  {selectedDetail.release.approvalStatus}
                </Descriptions.Item>
                <Descriptions.Item label="已发布 Skill">
                  {selectedDetail.release.publishedSkillId || '无'}
                </Descriptions.Item>
                <Descriptions.Item label="部署状态">
                  {selectedDetail.release.deploymentStatus}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Tabs
              items={[
                {
                  key: 'studio',
                  label: 'Capability Studio',
                  children: studioContent,
                },
                {
                  key: 'ops',
                  label: '发布与运维',
                  children: operationsContent,
                },
              ]}
            />
          </Space>
        ) : (
          <Text type="secondary">正在加载...</Text>
        )}
      </Drawer>
    </div>
  );
};

export default CapabilityReleasePage;
