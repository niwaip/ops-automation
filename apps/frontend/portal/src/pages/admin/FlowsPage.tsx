import React, { useRef, useState } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select,
  Descriptions, Tooltip, Collapse, Steps, Divider, Badge, Empty, Progress,
  Switch, Alert, Dropdown, Timeline
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, PlusOutlined,
  InfoCircleOutlined, ThunderboltOutlined, ApiOutlined,
  FileTextOutlined, CodeOutlined, ToolOutlined, CheckCircleOutlined, WarningOutlined,
  CopyOutlined, ExportOutlined, ImportOutlined, PlayCircleOutlined, EyeOutlined, SettingOutlined,
  ArrowUpOutlined, ArrowDownOutlined, OrderedListOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  executionFlowApi,
  ExecutionFlowTemplateDTO,
  CreateExecutionFlowTemplateDTO,
  ExecutionFlowStep,
  ValidationResult,
  EXECUTION_FLOW_CATEGORIES,
  STEP_TYPE_LABELS,
  StepType,
} from '../../api/flows';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { TextArea } = Input;

// Default step templates for quick creation
const DEFAULT_STEP_TEMPLATES: Record<string, ExecutionFlowStep> = {
  ai_match: {
    type: 'text',
    name: 'AI语义匹配',
    content: '根据用户输入自动识别意图并匹配最佳技能',
    expectedOutput: '匹配到的技能ID和参数',
  },
  collect_params: {
    type: 'text',
    name: '收集参数',
    content: '通过对话收集用户需要的参数',
    expectedOutput: '完整的参数集合',
  },
  generate_params: {
    type: 'api',
    name: 'AI生成参数',
    api: {
      endpoint: '/api/ai/generate-params',
      method: 'POST',
    },
    expectedOutput: 'AI提取的参数JSON',
  },
  user_confirm: {
    type: 'text',
    name: '用户确认',
    content: '展示参数并等待用户确认',
    expectedOutput: '用户确认结果',
  },
  render_document: {
    type: 'api',
    name: '文档渲染',
    api: {
      endpoint: '/api/carbone/render',
      method: 'POST',
    },
    expectedOutput: '渲染后的文档URL',
  },
};

type ValidationStage = 'idle' | 'auditing' | 'executing';

const buildDefaultTestUserInput = (
  template: ExecutionFlowTemplateDTO,
  sampleParams: Record<string, any>
): string => {
  const pairs = Object.entries(sampleParams)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('，');

  if (pairs) {
    return `请帮我执行“${template.name}”这个能力，已知参数：${pairs}。`;
  }

  if (template.goal) {
    return `请按流程完成这个原子能力：${template.goal}`;
  }

  return `请帮我执行“${template.name}”这个原子能力。`;
};

type ValidationErrorDetail = {
  title: string;
  description: string;
};

const extractValidationErrorDetail = (error: any): ValidationErrorDetail => {
  const responseMessage = error?.response?.data?.message;
  const responseCode = error?.response?.data?.code;
  const rawMessage = Array.isArray(responseMessage)
    ? responseMessage.join('；')
    : typeof responseMessage === 'string' && responseMessage.trim()
      ? responseMessage
      : typeof error?.message === 'string' && error.message.trim()
        ? error.message
        : '验证失败，请检查服务状态后重试';
  const normalizedMessage = rawMessage.toLowerCase();

  if (responseCode === 'VALIDATION_TIMEOUT') {
    return { title: '接口超时', description: rawMessage };
  }

  if (responseCode === 'AI_JSON_PARSE_ERROR') {
    return { title: 'AI 返回格式错误', description: rawMessage };
  }

  if (responseCode === 'FLOW_EXECUTION_ERROR') {
    return { title: '执行引擎异常', description: rawMessage };
  }

  if (responseCode === 'NETWORK_ERROR') {
    return { title: '网络请求异常', description: rawMessage };
  }

  if (responseCode === 'TEMPLATE_NOT_FOUND') {
    return { title: '模板不存在', description: rawMessage };
  }

  if (
    error?.code === 'ECONNABORTED' ||
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('超时')
  ) {
    return { title: '接口超时', description: rawMessage };
  }

  if (
    normalizedMessage.includes('json') ||
    normalizedMessage.includes('parse') ||
    normalizedMessage.includes('格式') ||
    normalizedMessage.includes('invalid') ||
    normalizedMessage.includes('不是有效 json')
  ) {
    return { title: 'AI 返回格式错误', description: rawMessage };
  }

  if (
    normalizedMessage.includes('flow_execute') ||
    normalizedMessage.includes('react') ||
    normalizedMessage.includes('stream') ||
    normalizedMessage.includes('执行测试') ||
    normalizedMessage.includes('执行引擎')
  ) {
    return { title: '执行引擎异常', description: rawMessage };
  }

  if (
    normalizedMessage.includes('network error') ||
    normalizedMessage.includes('network') ||
    normalizedMessage.includes('fetch')
  ) {
    return { title: '网络请求异常', description: rawMessage };
  }

  return { title: '验证失败', description: rawMessage };
};

const extractErrorMessage = (error: any): string => {
  const detail = extractValidationErrorDetail(error);
  return detail.title === '验证失败'
    ? detail.description
    : `${detail.title}：${detail.description}`;
};

const FlowsPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [validateModalVisible, setValidateModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ExecutionFlowTemplateDTO | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ExecutionFlowTemplateDTO | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [form] = Form.useForm();
  const [currentSteps, setCurrentSteps] = useState<ExecutionFlowStep[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [enableExecutionTest, setEnableExecutionTest] = useState(false);
  const [testParamsJson, setTestParamsJson] = useState('');
  const [testUserInput, setTestUserInput] = useState('');
  const [validationStage, setValidationStage] = useState<ValidationStage>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationErrorTitle, setValidationErrorTitle] = useState<string | null>(null);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const validationStageTimersRef = useRef<number[]>([]);

  // Queries
  const templatesQuery = useQuery(
    ['flows', selectedCategory, searchText],
    () => executionFlowApi.list({
      category: selectedCategory,
      search: searchText,
      isActive: true,
    })
  );

  function clearValidationStageTimers() {
    validationStageTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    validationStageTimersRef.current = [];
  }

  function beginValidationProgress(withExecutionTest: boolean) {
    clearValidationStageTimers();
    setExecutionLogs([]);
    setValidationStage('auditing');
    
    // 模拟审计日志
    const auditLogs = [
      '正在连接 AI 审计引擎...',
      '正在解析流程拓扑结构...',
      '正在检查参数引用完整性...',
      '正在评估原子能力边界...',
      '正在生成优化建议...'
    ];
    
    auditLogs.forEach((msg, i) => {
      const timerId = window.setTimeout(() => {
        setExecutionLogs(prev => [...prev, `[Audit] ${msg}`]);
      }, i * 400);
      validationStageTimersRef.current.push(timerId);
    });

    if (withExecutionTest) {
      const timerId = window.setTimeout(() => {
        setValidationStage('executing');
        setExecutionLogs(prev => [...prev, '[System] 静态审计完成，开始真实验证测试...']);
        
        // 模拟执行日志
        const execLogs = [
          '正在初始化 ReAct 引擎...',
          '正在加载 flow_execute 工具...',
          '正在构造模拟用户请求...',
          '正在观察步骤 1 执行结果...',
          '正在匹配后续步骤...',
          '正在验证最终输出格式...'
        ];
        
        execLogs.forEach((msg, i) => {
          const tId = window.setTimeout(() => {
            setExecutionLogs(prev => [...prev, `[Execution] ${msg}`]);
          }, 2000 + i * 800);
          validationStageTimersRef.current.push(tId);
        });
      }, 2000);
      validationStageTimersRef.current.push(timerId);
    }
  }

  function resetValidationModalState() {
    clearValidationStageTimers();
    setValidateModalVisible(false);
    setSelectedTemplate(null);
    setValidationResult(null);
    setValidationError(null);
    setValidationErrorTitle(null);
    setEnableExecutionTest(false);
    setTestParamsJson('');
    setTestUserInput('');
    setValidationStage('idle');
    setExecutionLogs([]);
  }

  // Mutations
  const createMutation = useMutation(executionFlowApi.create, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['flows']);
      setEditModalVisible(false);
      form.resetFields();
      setCurrentSteps([]);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateExecutionFlowTemplateDTO> }) =>
      executionFlowApi.update(id, data),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['flows']);
        setEditModalVisible(false);
        setEditingTemplate(null);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const deleteMutation = useMutation(executionFlowApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['flows']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const validateMutation = useMutation(
    (params: {
      id: string;
      enableExecutionTest?: boolean;
      testParams?: Record<string, any>;
      testUserInput?: string;
    }) =>
      executionFlowApi.validate(params.id, {
        enableExecutionTest: params.enableExecutionTest,
        testParams: params.testParams,
        testUserInput: params.testUserInput,
      }),
    {
      onSuccess: (result) => {
        setValidationResult(result.validationResult);
        setValidationError(null);
        setValidationErrorTitle(null);
        setSelectedTemplate((prev) => prev ? { ...prev, validation: result.validationResult } : prev);
        queryClient.invalidateQueries(['flows']);
        clearValidationStageTimers();
        setValidationStage('idle');
        message.success('验证完成');
      },
      onError: (error: any) => {
        const errorDetail = extractValidationErrorDetail(error);
        const errorMessage = extractErrorMessage(error);
        clearValidationStageTimers();
        setValidationStage('idle');
        setValidationResult(null);
        setValidationErrorTitle(errorDetail.title);
        setValidationError(errorDetail.description);
        setExecutionLogs((prev) => [...prev, `[Error] ${errorMessage}`]);
        setValidateModalVisible(true);
        message.error(errorMessage);
      },
    }
  );

  const applyAdjustmentMutation = useMutation(executionFlowApi.applyAdjustment, {
    onSuccess: (updatedTemplate) => {
      queryClient.invalidateQueries(['flows']);
      setSelectedTemplate(updatedTemplate);
      setValidationResult(updatedTemplate.validation || null);
      setValidateModalVisible(false);
      setDetailModalVisible(false);
      handleEdit(updatedTemplate);
      message.success('已应用AI优化建议，并打开模板编辑器供你确认结果');
    },
    onError: () => {
      message.error('应用建议失败');
    },
  });

  const cloneMutation = useMutation(
    ({ id, name }: { id: string; name: string }) => executionFlowApi.clone(id, name),
    {
      onSuccess: () => {
        message.success('复制成功');
        queryClient.invalidateQueries(['flows']);
      },
      onError: () => {
        message.error('复制失败');
      },
    }
  );

  const importMutation = useMutation(executionFlowApi.import, {
    onSuccess: () => {
      message.success('导入成功');
      queryClient.invalidateQueries(['flows']);
      setImportModalVisible(false);
      setImportJson('');
    },
    onError: () => {
      message.error('导入失败，请检查JSON格式');
    },
  });

  // Handlers
  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    setCurrentSteps([]);
    form.setFieldsValue({
      category: 'document',
      isPublic: true,
    });
    setEditModalVisible(true);
  };

  const handleEdit = (template: ExecutionFlowTemplateDTO) => {
    setEditingTemplate(template);
    form.setFieldsValue({
      name: template.name,
      description: template.description,
      goal: template.goal,
      expectedResult: template.expectedResult,
      paramsSchema: template.paramsSchema ? JSON.stringify(template.paramsSchema, null, 2) : '',
      category: template.category,
      isPublic: template.isPublic,
    });
    setCurrentSteps(template.steps as ExecutionFlowStep[]);
    setEditModalVisible(true);
  };

  const handleViewDetail = (template: ExecutionFlowTemplateDTO) => {
    setSelectedTemplate(template);
    setDetailModalVisible(true);
  };

  const handleValidate = (template: ExecutionFlowTemplateDTO) => {
    setSelectedTemplate(template);
    setValidationResult(template.validation);
    setValidationError(null);
    setValidationErrorTitle(null);
    setValidateModalVisible(true);
    setEnableExecutionTest(false);
    clearValidationStageTimers();
    setValidationStage('idle');
    // Parse test params if available
    try {
      const paramsSchema = template.paramsSchema as Record<string, any>;
      const sampleParams: Record<string, any> = {};
      if (paramsSchema && paramsSchema.properties) {
        // Generate sample params from schema
        Object.entries(paramsSchema.properties).forEach(([key, prop]: [string, any]) => {
          if (prop.type === 'string') sampleParams[key] = prop.default || '示例值';
          else if (prop.type === 'number') sampleParams[key] = prop.default || 0;
          else if (prop.type === 'boolean') sampleParams[key] = prop.default || false;
        });
        setTestParamsJson(JSON.stringify(sampleParams, null, 2));
      } else {
        setTestParamsJson('');
      }
      setTestUserInput(buildDefaultTestUserInput(template, sampleParams));
    } catch {
      setTestParamsJson('');
      setTestUserInput(buildDefaultTestUserInput(template, {}));
    }
  };

  const handleRunValidation = () => {
    if (!selectedTemplate) return;
    let testParams: Record<string, any> | undefined = undefined;
    if (enableExecutionTest && testParamsJson) {
      try {
        testParams = JSON.parse(testParamsJson);
      } catch {
        message.error('测试参数JSON格式错误');
        return;
      }
    }
    if (enableExecutionTest && !testUserInput.trim()) {
      message.error('请输入模拟用户输入，用于真实 AI 执行测试');
      return;
    }
    setValidationResult(null);
    setValidationError(null);
    setValidationErrorTitle(null);
    setValidateModalVisible(true);
    beginValidationProgress(enableExecutionTest);
    validateMutation.mutate({
      id: selectedTemplate.id,
      enableExecutionTest,
      testParams,
      testUserInput: enableExecutionTest ? testUserInput.trim() : undefined,
    });
  };

  const handleValidateFromEdit = () => {
    if (editingTemplate) {
      setEditModalVisible(false);
      handleValidate(editingTemplate);
    }
  };

  const handleApplyAdjustment = () => {
    if (selectedTemplate && validationResult?.details?.autoAdjustment) {
      Modal.confirm({
        title: '应用AI优化建议',
        content: '将用AI生成的优化方案替换当前的步骤配置，是否继续？',
        onOk: () => applyAdjustmentMutation.mutate(selectedTemplate.id),
      });
    }
  };

  const handleAddStep = (stepTemplate?: string) => {
    if (stepTemplate && DEFAULT_STEP_TEMPLATES[stepTemplate]) {
      const newStep = { ...DEFAULT_STEP_TEMPLATES[stepTemplate], id: Date.now().toString() };
      setCurrentSteps([...currentSteps, newStep]);
    } else {
      setCurrentSteps([...currentSteps, {
        id: Date.now().toString(),
        type: 'text',
        name: `步骤 ${currentSteps.length + 1}`,
        content: '',
      }]);
    }
  };

  const handleRemoveStep = (index: number) => {
    setCurrentSteps(currentSteps.filter((_, i) => i !== index));
  };

  const handleUpdateStep = (index: number, field: string, value: any) => {
    const updatedSteps = [...currentSteps];
    updatedSteps[index] = { ...updatedSteps[index], [field]: value };
    setCurrentSteps(updatedSteps);
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const newSteps = [...currentSteps];
      [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
      setCurrentSteps(newSteps);
    } else if (direction === 'down' && index < currentSteps.length - 1) {
      const newSteps = [...currentSteps];
      [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
      setCurrentSteps(newSteps);
    }
  };

  const handleSave = () => {
    form.validateFields().then((values) => {
      // 解析参数Schema JSON
      let paramsSchema = undefined;
      if (values.paramsSchema && values.paramsSchema.trim()) {
        try {
          paramsSchema = JSON.parse(values.paramsSchema);
        } catch (e) {
          message.error('参数Schema格式错误，请检查JSON格式');
          return;
        }
      }

      const data: CreateExecutionFlowTemplateDTO = {
        name: values.name,
        description: values.description,
        goal: values.goal,
        expectedResult: values.expectedResult,
        paramsSchema,
        category: values.category || 'document',
        steps: currentSteps,
        executionFlowKeys: currentSteps.map(s => s.name),
        isPublic: values.isPublic,
      };

      if (editingTemplate) {
        updateMutation.mutate({ id: editingTemplate.id, data });
      } else {
        createMutation.mutate(data);
      }
    });
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      content: '删除后无法恢复，是否继续？',
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const handleClone = (template: ExecutionFlowTemplateDTO) => {
    cloneMutation.mutate({ id: template.id, name: `${template.name} (副本)` });
  };

  const handleExport = async (template: ExecutionFlowTemplateDTO) => {
    const result = await executionFlowApi.export(template.id);
    const blob = new Blob([result.data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    if (importJson) {
      importMutation.mutate(importJson);
    }
  };

  // Render step type badge
  const renderStepTypeBadge = (type: StepType | string) => {
    const info = STEP_TYPE_LABELS[type as StepType] || { label: type, color: 'default' };
    const icons: Record<string, React.ReactNode> = {
      text: <FileTextOutlined />,
      script: <CodeOutlined />,
      tool: <ToolOutlined />,
      api: <ApiOutlined />,
      llm: <FileTextOutlined />,
      validator: <CheckCircleOutlined />,
    };
    return (
      <Tag color={info.color} icon={icons[type] || <ToolOutlined />}>
        {info.label}
      </Tag>
    );
  };

  // Render validation score
  const renderValidationScore = (validation: ValidationResult | null) => {
    if (!validation) {
      return <Tag color="default">未验证</Tag>;
    }
    const score = validation.score || 0;
    const color = score >= 80 ? 'success' : score >= 60 ? 'warning' : 'error';
    return (
      <Tooltip title={`评分: ${score}分`}>
        <Badge status={color} text={`${score}分`} />
      </Tooltip>
    );
  };

  // Columns
  const columns: ColumnsType<ExecutionFlowTemplateDTO> = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (name: string, record: ExecutionFlowTemplateDTO) => (
        <a onClick={() => handleViewDetail(record)} style={{ cursor: 'pointer' }}>
          <strong>{name}</strong>
        </a>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: string) => {
        const info = EXECUTION_FLOW_CATEGORIES[category] || { label: category, color: 'default', desc: '' };
        return (
          <Tooltip title={info.desc}>
            <Tag color={info.color}>{info.label}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string) => desc || <Text type="secondary">无描述</Text>,
    },
    {
      title: '步骤数',
      key: 'stepCount',
      width: 80,
      render: (_, record) => (
        <Badge count={record.steps?.length || 0} showZero color="blue" />
      ),
    },
    {
      title: '验证状态',
      key: 'validation',
      width: 100,
      render: (_, record) => renderValidationScore(record.validation),
    },
    {
      title: '使用次数',
      dataIndex: 'usageCount',
      key: 'usageCount',
      width: 80,
      render: (count: number) => (
        <Text type="secondary">{count || 0}</Text>
      ),
    },
    {
      title: '公开',
      dataIndex: 'isPublic',
      key: 'isPublic',
      width: 80,
      render: (isPublic: boolean) => (
        <Tag color={isPublic ? 'green' : 'default'}>
          {isPublic ? '公开' : '私有'}
        </Tag>
      ),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => handleValidate(record)}
          >
            验证
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'detail', icon: <EyeOutlined />, label: '详情', onClick: () => handleViewDetail(record) },
                { key: 'clone', icon: <CopyOutlined />, label: '复制', onClick: () => handleClone(record) },
                { key: 'export', icon: <ExportOutlined />, label: '导出', onClick: () => handleExport(record) },
                { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: () => handleDelete(record.id) },
              ],
            }}
          >
            <Button type="link" size="small" icon={<SettingOutlined />}>
              更多
            </Button>
          </Dropdown>
        </Space>
      ),
    },
  ];

  // Render step editor
  const renderStepEditor = () => (
    <div style={{ marginTop: 16 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<PlusOutlined />} onClick={() => handleAddStep()}>
          添加空白步骤
        </Button>
        <Dropdown
          menu={{
            items: Object.entries(DEFAULT_STEP_TEMPLATES).map(([key, step]) => ({
              key,
              icon: renderStepTypeBadge(step.type),
              label: step.name,
              onClick: () => handleAddStep(key),
            })),
          }}
        >
          <Button icon={<OrderedListOutlined />}>
            添加预设步骤
          </Button>
        </Dropdown>
      </Space>

      {currentSteps.length === 0 ? (
        <Empty description="暂无步骤，请添加" />
      ) : (
        <Timeline>
          {currentSteps.map((step, index) => (
            <Timeline.Item
              key={step.id || index}
              dot={renderStepTypeBadge(step.type)}
              color={step.optional ? 'gray' : 'blue'}
            >
              <Card size="small" style={{ marginBottom: 8 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Input
                      value={step.name}
                      onChange={(e) => handleUpdateStep(index, 'name', e.target.value)}
                      placeholder="步骤名称"
                      style={{ width: 200 }}
                    />
                    <Space>
                      <Select
                        value={step.type}
                        onChange={(v) => handleUpdateStep(index, 'type', v)}
                        style={{ width: 120 }}
                      >
                        {Object.entries(STEP_TYPE_LABELS).map(([key, value]) => (
                          <Option key={key} value={key}>
                            <Tag color={value.color}>{value.label}</Tag>
                          </Option>
                        ))}
                      </Select>
                      <Switch
                        checked={step.optional}
                        onChange={(v) => handleUpdateStep(index, 'optional', v)}
                        checkedChildren="可选"
                        unCheckedChildren="必选"
                      />
                      <Button
                        icon={<ArrowUpOutlined />}
                        onClick={() => handleMoveStep(index, 'up')}
                        disabled={index === 0}
                      />
                      <Button
                        icon={<ArrowDownOutlined />}
                        onClick={() => handleMoveStep(index, 'down')}
                        disabled={index === currentSteps.length - 1}
                      />
                      <Button
                        icon={<DeleteOutlined />}
                        danger
                        onClick={() => handleRemoveStep(index)}
                      />
                    </Space>
                  </Space>

                  {step.type === 'text' && (
                    <TextArea
                      value={step.content}
                      onChange={(e) => handleUpdateStep(index, 'content', e.target.value)}
                      placeholder="步骤指导内容（纯文本）"
                      rows={3}
                    />
                  )}

                  {step.type === 'script' && (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Select
                        value={step.script?.language}
                        onChange={(v) => handleUpdateStep(index, 'script', { ...step.script, language: v })}
                        style={{ width: 150 }}
                      >
                        <Option value="bash">Bash</Option>
                        <Option value="python">Python</Option>
                        <Option value="javascript">JavaScript</Option>
                      </Select>
                      <TextArea
                        value={step.script?.code}
                        onChange={(e) => handleUpdateStep(index, 'script', { ...step.script, code: e.target.value })}
                        placeholder="脚本代码"
                        rows={4}
                      />
                    </Space>
                  )}

                  {step.type === 'tool' && (
                    <Space>
                      <Input
                        value={step.tool?.name}
                        onChange={(e) => handleUpdateStep(index, 'tool', { ...step.tool, name: e.target.value })}
                        placeholder="工具名称（如 Read, Write, Bash）"
                        style={{ width: 200 }}
                      />
                      <Input
                        value={JSON.stringify(step.tool?.params || {})}
                        onChange={(e) => {
                          try {
                            const params = JSON.parse(e.target.value);
                            handleUpdateStep(index, 'tool', { ...step.tool, params });
                          } catch {}
                        }}
                        placeholder="参数JSON"
                        style={{ width: 200 }}
                      />
                    </Space>
                  )}

                  {step.type === 'api' && (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Space>
                        <Select
                          value={step.api?.method}
                          onChange={(v) => handleUpdateStep(index, 'api', { ...step.api, method: v })}
                          style={{ width: 100 }}
                        >
                          <Option value="GET">GET</Option>
                          <Option value="POST">POST</Option>
                          <Option value="PUT">PUT</Option>
                          <Option value="DELETE">DELETE</Option>
                        </Select>
                        <Input
                          value={step.api?.endpoint}
                          onChange={(e) => handleUpdateStep(index, 'api', { ...step.api, endpoint: e.target.value })}
                          placeholder="API端点URL（支持 {city}、{{city}}、{{flow_input.city}}）"
                          style={{ width: 300 }}
                        />
                      </Space>
                    </Space>
                  )}

                  {/* 条件字段 - 支持条件执行 */}
                  <Input
                    value={step.condition}
                    onChange={(e) => handleUpdateStep(index, 'condition', e.target.value)}
                    placeholder="执行条件（可选，如: step_xxx.status == 'success'）"
                    style={{ width: '100%' }}
                  />

                  {/* 输入映射 - 支持变量传递 */}
                  <Input
                    value={step.inputMapping ? JSON.stringify(step.inputMapping) : ''}
                    onChange={(e) => {
                      try {
                        const mapping = e.target.value ? JSON.parse(e.target.value) : undefined;
                        handleUpdateStep(index, 'inputMapping', mapping);
                      } catch {}
                    }}
                    placeholder="输入映射JSON（可选，例如 city 映射到 flow_input.city）"
                    style={{ width: '100%' }}
                  />

                  <Input
                    value={step.expectedOutput}
                    onChange={(e) => handleUpdateStep(index, 'expectedOutput', e.target.value)}
                    placeholder="预期输出描述（可选）"
                    style={{ width: '100%' }}
                  />
                </Space>
              </Card>
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </div>
  );

  return (
    <div>
      <Title level={4}>执行流程模板管理</Title>

      <Card style={{ marginTop: 8, marginBottom: 16 }}>
        <Space direction="vertical" size="small">
          <Text strong>流程模板说明：</Text>
          <Text>• 流程模板定义了AI执行的步骤序列，类似Claude Code Skills</Text>
          <Text>• 每个步骤可以是<strong>纯文本指导</strong>、<strong>脚本执行</strong>、<strong>系统工具</strong>或<strong>API调用</strong></Text>
          <Divider style={{ margin: '8px 0' }} />
          <Text strong>步骤类型：</Text>
          <Space wrap>
            {Object.entries(STEP_TYPE_LABELS).map(([key, value]) => (
              <Tag key={key} color={value.color} icon={
                key === 'text' ? <FileTextOutlined /> :
                key === 'script' ? <CodeOutlined /> :
                key === 'tool' ? <ToolOutlined /> :
                <ApiOutlined />
              }>
                {value.label}
              </Tag>
            ))}
          </Space>
          <Divider style={{ margin: '8px 0' }} />
          <Text strong>AI验证：</Text>
          <Text>• 点击"验证"按钮，AI会检查流程是否可执行、步骤是否合理</Text>
          <Text>• 验证结果包括评分、建议和警告</Text>
        </Space>
      </Card>

      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Input
              placeholder={t('common:search')}
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Select
              placeholder="选择分类"
              value={selectedCategory}
              onChange={setSelectedCategory}
              style={{ width: 150 }}
              allowClear
            >
              {Object.entries(EXECUTION_FLOW_CATEGORIES).map(([key, value]) => (
                <Option key={key} value={key}>
                  <Tag color={value.color}>{value.label}</Tag>
                </Option>
              ))}
            </Select>
          </Space>
          <Space>
            <Button
              icon={<ImportOutlined />}
              onClick={() => setImportModalVisible(true)}
            >
              导入
            </Button>
            <Button
              icon={<PlusOutlined />}
              type="primary"
              onClick={handleCreate}
            >
              创建模板
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => templatesQuery.refetch()}
            >
              {t('common:refresh')}
            </Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={templatesQuery.data?.templates || []}
          rowKey="id"
          loading={templatesQuery.isLoading}
          scroll={{ x: 1200 }}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => t('common:pagination.total', { total }),
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={`模板详情 - ${selectedTemplate?.name}`}
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false);
          setSelectedTemplate(null);
        }}
        footer={null}
        width={900}
      >
        {selectedTemplate && (
          <Collapse defaultActiveKey={['basic', 'steps', 'validation']}>
            <Panel header="基本信息" key="basic">
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="模板ID">{selectedTemplate.id}</Descriptions.Item>
                <Descriptions.Item label="分类">
                  <Tag color={EXECUTION_FLOW_CATEGORIES[selectedTemplate.category]?.color}>
                    {EXECUTION_FLOW_CATEGORIES[selectedTemplate.category]?.label}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>{selectedTemplate.description}</Descriptions.Item>
                <Descriptions.Item label="使用次数">{selectedTemplate.usageCount}</Descriptions.Item>
                <Descriptions.Item label="公开状态">
                  {selectedTemplate.isPublic ? '公开' : '私有'}
                </Descriptions.Item>
              </Descriptions>
            </Panel>

            <Panel header="执行步骤" key="steps">
              <Steps
                current={-1}
                direction="vertical"
                items={selectedTemplate.steps?.map((step: ExecutionFlowStep, idx: number) => ({
                  title: step.name,
                  description: (
                    <Space direction="vertical" size="small">
                      {renderStepTypeBadge(step.type)}
                      {step.type === 'text' && <Text>{step.content}</Text>}
                      {step.type === 'script' && (
                        <Text code>{step.script?.language}: {step.script?.code?.slice(0, 50)}...</Text>
                      )}
                      {step.type === 'tool' && <Text>工具: {step.tool?.name}</Text>}
                      {step.type === 'api' && (
                        <Text>API: {step.api?.method} {step.api?.endpoint}</Text>
                      )}
                      {step.expectedOutput && (
                        <Text type="secondary">预期输出: {step.expectedOutput}</Text>
                      )}
                    </Space>
                  ),
                  status: 'wait',
                  icon: idx === 0 ? <ThunderboltOutlined /> : undefined,
                })) || []}
              />
            </Panel>

            <Panel header="验证结果" key="validation">
              {selectedTemplate.validation ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Progress
                    percent={selectedTemplate.validation.score || 0}
                    status={selectedTemplate.validation.isValid ? 'success' : 'exception'}
                    format={(percent) => `${percent}分`}
                  />
                  {selectedTemplate.validation.warnings && selectedTemplate.validation.warnings.length > 0 && (
                    <Alert
                      type="warning"
                      message="警告"
                      description={
                        <ul>
                          {selectedTemplate.validation.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      }
                    />
                  )}
                  {selectedTemplate.validation.suggestions?.length > 0 && (
                    <Alert
                      type="info"
                      message="优化建议"
                      description={
                        <ul>
                          {selectedTemplate.validation.suggestions.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      }
                    />
                  )}
                  {selectedTemplate.validation.details?.aiCritique && (
                    <Alert
                      type="info"
                      message="AI 审计详情"
                      description={selectedTemplate.validation.details.aiCritique}
                    />
                  )}
                  {selectedTemplate.validation.details?.autoAdjustment && (
                    <Button
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      onClick={() => {
                        setDetailModalVisible(false);
                        setSelectedTemplate(selectedTemplate);
                        setValidationResult(selectedTemplate.validation);
                        setValidateModalVisible(true);
                      }}
                    >
                      查看并应用AI优化建议
                    </Button>
                  )}
                  <Text type="secondary">
                    验证时间: {new Date(selectedTemplate.validation.validatedAt).toLocaleString()}
                  </Text>
                </Space>
              ) : (
                <Empty description="尚未验证" />
              )}
            </Panel>
          </Collapse>
        )}
      </Modal>

      {/* Edit/Create Modal */}
      <Modal
        title={editingTemplate ? '编辑模板' : '创建模板'}
        open={editModalVisible}
        onOk={handleSave}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingTemplate(null);
          setCurrentSteps([]);
        }}
        footer={[
          editingTemplate && (
            <Button
              key="validate"
              icon={<PlayCircleOutlined />}
              onClick={handleValidateFromEdit}
              style={{ marginRight: 8 }}
            >
              验证
            </Button>
          ),
          <Button
            key="cancel"
            onClick={() => {
              setEditModalVisible(false);
              setEditingTemplate(null);
              setCurrentSteps([]);
            }}
          >
            取消
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={createMutation.isLoading || updateMutation.isLoading}
            onClick={handleSave}
          >
            保存
          </Button>,
        ]}
        confirmLoading={createMutation.isLoading || updateMutation.isLoading}
        width={800}
        style={{ top: 20 }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="goal"
            label="流程目标"
            extra="明确的目标描述，指导AI进行验证和宏工具生成"
          >
            <TextArea rows={2} placeholder="例如：调用外部服务查询指定对象的信息并返回格式化结果" />
          </Form.Item>
          <Form.Item
            name="expectedResult"
            label="预期结果"
            extra="期望的输出格式和内容，指导AI验证流程是否达成目标"
          >
            <TextArea rows={2} placeholder="例如：返回包含摘要、关键字段与状态说明的结构化报告" />
          </Form.Item>
          <Form.Item
            name="paramsSchema"
            label="参数定义 (JSON)"
            extra="可选。定义流程需要的输入参数，例如 city: 城市名称"
          >
            <TextArea rows={3} placeholder='{"city": {"type": "string", "description": "城市名称"}}' />
          </Form.Item>
          <Form.Item
            name="category"
            label="分类"
          >
            <Select>
              {Object.entries(EXECUTION_FLOW_CATEGORIES).map(([key, value]) => (
                <Option key={key} value={key}>
                  <Space>
                    <Tag color={value.color}>{value.label}</Tag>
                    <Text type="secondary">{value.desc}</Text>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="isPublic"
            label="公开状态"
            valuePropName="checked"
          >
            <Switch checkedChildren="公开" unCheckedChildren="私有" />
          </Form.Item>
        </Form>

        <Divider>执行步骤配置</Divider>
        {renderStepEditor()}
      </Modal>

      {/* Validate Modal */}
      <Modal
        title={`验证模板 - ${selectedTemplate?.name}`}
        open={validateModalVisible}
        onCancel={resetValidationModalState}
        maskClosable={false}
        footer={[
          <Button
            key="revalidate"
            type="default"
            icon={<PlayCircleOutlined />}
            loading={validateMutation.isLoading}
            onClick={handleRunValidation}
            style={{ marginRight: 8 }}
          >
            {validationResult ? '重新验证' : '开始验证'}
          </Button>,
          validationResult?.details?.autoAdjustment && (
            <Button
              key="apply"
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={applyAdjustmentMutation.isLoading}
              onClick={handleApplyAdjustment}
              style={{ marginRight: 8 }}
            >
              应用建议
            </Button>
          ),
          <Button key="close" onClick={resetValidationModalState}>
            关闭
          </Button>,
        ]}
        width={700}
      >
        {/* Execution Test Options */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
              <Switch
                checked={enableExecutionTest}
                onChange={setEnableExecutionTest}
                checkedChildren="执行测试"
                unCheckedChildren="仅静态分析"
              />
              <Tooltip title="启用后将通过ReAct引擎实际执行流程，测试每个步骤是否可正常运行">
                <InfoCircleOutlined />
              </Tooltip>
            </Space>
            {enableExecutionTest && (
              <>
                <Alert
                  type="info"
                  showIcon
                  message="执行测试说明"
                  description="执行测试会真实调用 AI，以“模拟用户输入 + 结构化参数”的方式验证该流程是否能稳定完成一个原子能力，而不是自动扩展成完整业务流程。"
                />
                <TextArea
                  value={testUserInput}
                  onChange={(e) => setTestUserInput(e.target.value)}
                  placeholder="模拟用户输入，例如：请帮我查询这个订单的最新状态"
                  rows={3}
                />
                <TextArea
                  value={testParamsJson}
                  onChange={(e) => setTestParamsJson(e.target.value)}
                  placeholder="测试参数JSON（用于填充流程中的变量）"
                  rows={4}
                />
              </>
            )}
          </Space>
        </Card>

        {validateMutation.isLoading ? (
          <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
            <Steps
              size="small"
              direction="vertical"
              current={enableExecutionTest && validationStage === 'executing' ? 1 : 0}
              items={
                enableExecutionTest
                  ? [
                      {
                        title: 'AI 审计流程结构',
                        description: '检查原子能力边界、参数闭合与确定性',
                      },
                      {
                        title: 'AI 模拟用户执行',
                        description: '基于模拟用户输入调用 flow_execute 做真实验证',
                      },
                    ]
                  : [
                      {
                        title: 'AI 审计流程结构',
                        description: '检查原子能力边界、参数闭合与自动优化建议',
                      },
                    ]
              }
            />
            <div style={{
              margin: '20px 0',
              padding: '12px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '4px',
              textAlign: 'left',
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', color: 'var(--text-primary)' }}>
                实时验证日志
              </div>
              {executionLogs.map((log, index) => (
                <div key={index} style={{
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  marginBottom: '4px',
                  color: log.startsWith('[Error]') ? '#ff4d4f' :
                         log.startsWith('[Audit]') ? '#1890ff' :
                         log.startsWith('[Execution]') ? '#52c41a' :
                         'var(--text-secondary)'
                }}>
                  {log}
                </div>
              ))}
              <div style={{ textAlign: 'center', marginTop: '8px' }}>
                <Progress percent={100} status="active" showInfo={false} size="small" />
              </div>
            </div>
            <Text strong>
              {enableExecutionTest && validationStage === 'executing'
                ? '正在模拟用户输入并执行原子能力测试...'
                : '正在进行AI深度审计...'}
            </Text>
            <Text type="secondary">（这可能需要几秒到几十秒）</Text>
          </Space>
        ) : validationResult ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              type={validationResult.isValid ? 'success' : 'error'}
              message={validationResult.isValid ? '验证通过' : '验证失败'}
              icon={validationResult.isValid ? <CheckCircleOutlined /> : <WarningOutlined />}
              showIcon
            />
            <Progress
              percent={validationResult.score || 0}
              status={validationResult.isValid ? 'success' : 'exception'}
              format={(percent) => `${percent}分`}
            />
            {validationResult.warnings && validationResult.warnings.length > 0 && (
              <Alert
                type="warning"
                message="警告"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {validationResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                }
              />
            )}
            {validationResult.suggestions?.length > 0 && (
              <Alert
                type="info"
                message="优化建议"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {validationResult.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                }
              />
            )}
            {/* Execution Test Results */}
            {validationResult.details?.executionTest && (
              <Collapse ghost>
                <Panel header={`执行测试结果 (${validationResult.details.executionTest.success ? '成功' : '失败'}, ${validationResult.details.executionTest.iterations}次迭代)`} key="execution">
                  {validationResult.details.executionTest.success ? (
                    <Alert type="success" message="执行成功" description={validationResult.details.executionTest.result?.slice(0, 500)} />
                  ) : (
                    <Alert type="error" message="执行失败" description={validationResult.details.executionTest.error} />
                  )}
                  {validationResult.details.executionTest.log?.length > 0 && (
                    <Timeline style={{ marginTop: 16 }}>
                      {validationResult.details.executionTest.log.slice(0, 20).map((log, i) => (
                        <Timeline.Item key={i} color={
                          log.startsWith('[Thought]') ? 'blue' :
                          log.startsWith('[Action]') ? 'green' :
                          log.startsWith('[Observation]') ? 'gray' :
                          log.startsWith('[Error]') ? 'red' :
                          'blue'
                        }>
                          <Text style={{ fontSize: 12 }}>{log}</Text>
                        </Timeline.Item>
                      ))}
                    </Timeline>
                  )}
                </Panel>
              </Collapse>
            )}
            {validationResult.details?.stepAnalysis && (
              <Collapse ghost>
                <Panel header="步骤分析详情" key="details">
                  <Table
                    size="small"
                    dataSource={validationResult.details.stepAnalysis}
                    columns={[
                      { title: '步骤', dataIndex: 'stepName', key: 'stepName' },
                      {
                        title: '可执行',
                        dataIndex: 'isExecutable',
                        key: 'isExecutable',
                        render: (v: boolean) => (
                          <Tag color={v ? 'green' : 'red'}>
                            {v ? '是' : '否'}
                          </Tag>
                        ),
                      },
                      {
                        title: '建议',
                        dataIndex: 'suggestion',
                        key: 'suggestion',
                        render: (v: string) => v || '-',
                      },
                    ]}
                    pagination={false}
                  />
                </Panel>
              </Collapse>
            )}
          </Space>
        ) : validationError ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              type="error"
              showIcon
              message={validationErrorTitle || '验证失败'}
              description={validationError}
            />
            {executionLogs.length > 0 && (
              <Collapse ghost defaultActiveKey={['error-log']}>
                <Panel header="失败日志" key="error-log">
                  <Timeline>
                    {executionLogs.map((log, index) => (
                      <Timeline.Item
                        key={index}
                        color={log.startsWith('[Error]') ? 'red' : 'blue'}
                      >
                        <Text style={{ fontSize: 12 }}>{log}</Text>
                      </Timeline.Item>
                    ))}
                  </Timeline>
                </Panel>
              </Collapse>
            )}
            <Alert
              type="info"
              showIcon
              message="你可以直接修改参数后重新验证"
              description="当前弹窗会保持打开，方便查看失败原因并继续重试。"
            />
          </Space>
        ) : (
          <Alert
            type="info"
            showIcon
            message="验证尚未开始"
            description="打开验证面板后不会自动执行。请先确认是否启用执行测试，再点击“开始验证”。"
          />
        )}
      </Modal>

      {/* Import Modal */}
      <Modal
        title="导入模板"
        open={importModalVisible}
        onOk={handleImport}
        onCancel={() => {
          setImportModalVisible(false);
          setImportJson('');
        }}
        confirmLoading={importMutation.isLoading}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            message="请粘贴导出的JSON模板数据"
            showIcon
          />
          <TextArea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder="粘贴JSON..."
            rows={10}
          />
        </Space>
      </Modal>
    </div>
  );
};

export default FlowsPage;
