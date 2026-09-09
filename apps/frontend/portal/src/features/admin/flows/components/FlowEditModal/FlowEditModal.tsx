import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Space,
  Tag,
  message,
  Typography,
  theme,
} from 'antd';
import {
  ApartmentOutlined,
  PlayCircleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from 'react-query';
import {
  CreateExecutionFlowTemplateDTO,
  ExecutionFlowStep,
  ExecutionFlowTemplateDTO,
  StepType,
  executionFlowApi,
} from '@/api/flows';
import { DEFAULT_STEP_TEMPLATES } from '../flowHelpers';
import {
  InspectorSelection,
  EditorViewMode,
  ParamFieldItem,
  parseSchemaToFields,
  buildFieldsToSchema,
} from './flowEditorTypes';
import { FlowNodePalette } from './FlowNodePalette';
import { FlowCanvas } from './FlowCanvas';
import { FlowNodeInspector } from './FlowNodeInspector';
import { FlowMetaInspector } from './FlowMetaInspector';

const { Text } = Typography;

interface FlowEditModalProps {
  open: boolean;
  editingTemplate: ExecutionFlowTemplateDTO | null;
  onClose: () => void;
  onSuccess: () => void;
  onValidateFromEdit?: (template: ExecutionFlowTemplateDTO) => void;
}

export const FlowEditModal: React.FC<FlowEditModalProps> = ({
  open,
  editingTemplate,
  onClose,
  onSuccess,
  onValidateFromEdit,
}) => {
  const { token } = theme.useToken();
  const queryClient = useQueryClient();

  // 基础元信息状态
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [category, setCategory] = useState('document');
  const [isPublic, setIsPublic] = useState(true);

  // 参数与步骤状态
  const [steps, setSteps] = useState<ExecutionFlowStep[]>([]);
  const [paramFields, setParamFields] = useState<ParamFieldItem[]>([]);
  const [rawJsonSchema, setRawJsonSchema] = useState('');

  // 交互与视图状态
  const [viewMode, setViewMode] = useState<EditorViewMode>('graph');
  const [selection, setSelection] = useState<InspectorSelection>({ type: 'meta' });

  // 弹窗展开时数据初始化
  useEffect(() => {
    if (!open) return;

    if (editingTemplate) {
      setName(editingTemplate.name || '');
      setDescription(editingTemplate.description || '');
      setGoal(editingTemplate.goal || '');
      setExpectedResult(editingTemplate.expectedResult || '');
      setCategory(editingTemplate.category || 'document');
      setIsPublic(editingTemplate.isPublic ?? true);

      const parsedSteps = (editingTemplate.steps as ExecutionFlowStep[]) || [];
      setSteps(parsedSteps);

      const parsedFields = parseSchemaToFields(editingTemplate.paramsSchema);
      setParamFields(parsedFields);
      setRawJsonSchema(
        editingTemplate.paramsSchema
          ? JSON.stringify(editingTemplate.paramsSchema, null, 2)
          : ''
      );

      // 如果有步骤，默认选中第一步，否则选中全局
      if (parsedSteps.length > 0) {
        setSelection({
          type: 'step',
          stepIndex: 0,
          stepId: parsedSteps[0].id || 'step_0',
        });
      } else {
        setSelection({ type: 'meta' });
      }
    } else {
      setName('');
      setDescription('');
      setGoal('');
      setExpectedResult('');
      setCategory('document');
      setIsPublic(true);
      setSteps([]);
      setParamFields([]);
      setRawJsonSchema('');
      setSelection({ type: 'meta' });
    }
  }, [open, editingTemplate]);

  // Mutations
  const createMutation = useMutation(executionFlowApi.create, {
    onSuccess: () => {
      message.success('工作流组合创建成功');
      void queryClient.invalidateQueries(['flows']);
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      message.error(err?.message || '创建失败');
    },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateExecutionFlowTemplateDTO> }) =>
      executionFlowApi.update(id, data),
    {
      onSuccess: () => {
        message.success('工作流组合更新成功');
        void queryClient.invalidateQueries(['flows']);
        onSuccess();
        onClose();
      },
      onError: (err: any) => {
        message.error(err?.message || '更新失败');
      },
    }
  );

  // 步骤管理操作
  const handleAddStep = (type: StepType, templateKey?: string) => {
    let newStep: ExecutionFlowStep;
    if (templateKey && DEFAULT_STEP_TEMPLATES[templateKey]) {
      newStep = {
        ...DEFAULT_STEP_TEMPLATES[templateKey],
        id: `step_${Date.now()}`,
      };
    } else {
      newStep = {
        id: `step_${Date.now()}`,
        type,
        name: `${type.toUpperCase()} 步骤 ${steps.length + 1}`,
        ...(type === 'api'
          ? { api: { method: 'POST', endpoint: '/api/v1/service' } }
          : type === 'script'
          ? { script: { language: 'python', code: '# 入参请读取 inputs\n', timeout: 60 } }
          : type === 'tool'
          ? { tool: { name: 'system_tool', params: {} } }
          : { content: '' }),
      };
    }

    const nextSteps = [...steps, newStep];
    setSteps(nextSteps);
    setSelection({
      type: 'step',
      stepIndex: nextSteps.length - 1,
      stepId: newStep.id!,
    });
  };

  const handleInsertStep = (index: number) => {
    const newStep: ExecutionFlowStep = {
      id: `step_${Date.now()}`,
      type: 'api',
      name: `步骤 ${index + 1}`,
      api: { method: 'POST', endpoint: '' },
    };
    const nextSteps = [...steps];
    nextSteps.splice(index, 0, newStep);
    setSteps(nextSteps);
    setSelection({
      type: 'step',
      stepIndex: index,
      stepId: newStep.id!,
    });
  };

  const handleMoveStep = (index: number, direction: 'prev' | 'next') => {
    const targetIndex = direction === 'prev' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;

    const nextSteps = [...steps];
    const [moved] = nextSteps.splice(index, 1);
    nextSteps.splice(targetIndex, 0, moved);
    setSteps(nextSteps);
    setSelection({
      type: 'step',
      stepIndex: targetIndex,
      stepId: moved.id || `step_${targetIndex}`,
    });
  };

  const handleDuplicateStep = (index: number) => {
    const original = steps[index];
    const duplicated: ExecutionFlowStep = {
      ...JSON.parse(JSON.stringify(original)),
      id: `step_${Date.now()}`,
      name: `${original.name} (副本)`,
    };
    const nextSteps = [...steps];
    nextSteps.splice(index + 1, 0, duplicated);
    setSteps(nextSteps);
    setSelection({
      type: 'step',
      stepIndex: index + 1,
      stepId: duplicated.id!,
    });
  };

  const handleDeleteStep = (index: number) => {
    const nextSteps = steps.filter((_, i) => i !== index);
    setSteps(nextSteps);
    setSelection({ type: 'meta' });
  };

  const handleUpdateStep = (field: string, value: any) => {
    if (selection.type !== 'step') return;
    const { stepIndex } = selection;
    const nextSteps = [...steps];
    nextSteps[stepIndex] = { ...nextSteps[stepIndex], [field]: value };
    setSteps(nextSteps);
  };

  // 保存处理
  const handleSave = () => {
    if (!name.trim()) {
      message.error('请输入工作流组合名称');
      setSelection({ type: 'meta' });
      return;
    }

    let finalParamsSchema: Record<string, any> | undefined = undefined;
    if (rawJsonSchema.trim()) {
      try {
        finalParamsSchema = JSON.parse(rawJsonSchema);
      } catch {
        message.error('参数定义 JSON 格式不合法，请核对');
        return;
      }
    } else {
      finalParamsSchema = buildFieldsToSchema(paramFields);
    }

    const payload: CreateExecutionFlowTemplateDTO = {
      name: name.trim(),
      description: description.trim() || undefined,
      goal: goal.trim() || undefined,
      expectedResult: expectedResult.trim() || undefined,
      paramsSchema: finalParamsSchema,
      category,
      steps,
      executionFlowKeys: steps.map((s) => s.name),
      isPublic,
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const activeStep = selection.type === 'step' ? steps[selection.stepIndex] : null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width="94vw"
      style={{ top: 20, maxWidth: 1440 }}
      styles={{
        body: {
          height: 'calc(86vh - 80px)',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ApartmentOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <span style={{ fontWeight: 600 }}>
            {editingTemplate ? `编辑工作流组合 · ${editingTemplate.name}` : '新建工作流组合'}
          </span>
          <Tag color="blue">{category}</Tag>
        </div>
      }
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            💡 提示：点击画布中的节点可直接在右侧配置，点击连接线上的「+」可在对应位置插入步骤
          </Text>
          <Space>
            {editingTemplate && onValidateFromEdit && (
              <Button
                icon={<PlayCircleOutlined />}
                onClick={() => {
                  onClose();
                  onValidateFromEdit(editingTemplate);
                }}
              >
                AI 仿真验证
              </Button>
            )}
            <Button onClick={onClose}>取消</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={createMutation.isLoading || updateMutation.isLoading}
              onClick={handleSave}
            >
              保存工作流组合
            </Button>
          </Space>
        </div>
      }
    >
      {/* 顶部调色板与视图切换栏 */}
      <FlowNodePalette
        onAddStep={handleAddStep}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        stepsCount={steps.length}
      />

      {/* 工作区 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左侧主要渲染区域 */}
        <div style={{ flex: 1, height: '100%', overflow: 'hidden', position: 'relative' }}>
          {viewMode === 'graph' && (
            <FlowCanvas
              steps={steps}
              paramFields={paramFields}
              goal={goal}
              expectedResult={expectedResult}
              selection={selection}
              onSelectStep={(index, step) =>
                setSelection({
                  type: 'step',
                  stepIndex: index,
                  stepId: step.id || `step_${index}`,
                })
              }
              onSelectStart={() => setSelection({ type: 'start' })}
              onSelectEnd={() => setSelection({ type: 'end' })}
              onSelectMeta={() => setSelection({ type: 'meta' })}
              onInsertStep={handleInsertStep}
              onMoveStep={handleMoveStep}
              onDuplicateStep={handleDuplicateStep}
              onDeleteStep={handleDeleteStep}
            />
          )}

          {viewMode === 'list' && (
            <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
              <div style={{ maxWidth: 800, margin: '0 auto' }}>
                <Text type="secondary">顺序步骤列表（点击可选中并在右侧编辑）：</Text>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {steps.map((st, idx) => (
                    <div
                      key={st.id || idx}
                      onClick={() =>
                        setSelection({
                          type: 'step',
                          stepIndex: idx,
                          stepId: st.id || `step_${idx}`,
                        })
                      }
                      style={{
                        padding: '12px 16px',
                        borderRadius: 8,
                        border:
                          selection.type === 'step' && selection.stepIndex === idx
                            ? '2px solid #1677ff'
                            : `1px solid ${token.colorBorder}`,
                        background: token.colorBgContainer,
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Space>
                        <Tag color="blue">#{idx + 1}</Tag>
                        <span style={{ fontWeight: 600 }}>{st.name}</span>
                        <Tag>{st.type}</Tag>
                      </Space>
                      <Space>
                        <Button
                          size="small"
                          disabled={idx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveStep(idx, 'prev');
                          }}
                        >
                          上移
                        </Button>
                        <Button
                          size="small"
                          disabled={idx === steps.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveStep(idx, 'next');
                          }}
                        >
                          下移
                        </Button>
                        <Button
                          size="small"
                          danger
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteStep(idx);
                          }}
                        >
                          删除
                        </Button>
                      </Space>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {viewMode === 'json' && (
            <div style={{ padding: 20, height: '100%', overflowY: 'auto' }}>
              <pre
                style={{
                  background: '#1e293b',
                  color: '#e2e8f0',
                  padding: 16,
                  borderRadius: 8,
                  fontSize: 12,
                  lineHeight: '18px',
                  fontFamily: 'monospace',
                  maxHeight: '100%',
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(
                  {
                    name,
                    description,
                    category,
                    isPublic,
                    goal,
                    expectedResult,
                    paramsSchema: rawJsonSchema ? JSON.parse(rawJsonSchema || '{}') : buildFieldsToSchema(paramFields),
                    steps,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>

        {/* 右侧属性检查器 Inspector */}
        {selection.type === 'step' && activeStep ? (
          <FlowNodeInspector
            step={activeStep}
            stepIndex={selection.stepIndex}
            totalSteps={steps.length}
            onUpdateStep={handleUpdateStep}
            onDuplicateStep={() => handleDuplicateStep(selection.stepIndex)}
            onDeleteStep={() => handleDeleteStep(selection.stepIndex)}
            onClose={() => setSelection({ type: 'meta' })}
          />
        ) : (
          <FlowMetaInspector
            name={name}
            description={description}
            goal={goal}
            expectedResult={expectedResult}
            category={category}
            isPublic={isPublic}
            paramFields={paramFields}
            rawJsonSchema={rawJsonSchema}
            selection={selection}
            onChangeName={setName}
            onChangeDescription={setDescription}
            onChangeGoal={setGoal}
            onChangeExpectedResult={setExpectedResult}
            onChangeCategory={setCategory}
            onChangeIsPublic={setIsPublic}
            onChangeParamFields={(fields) => {
              setParamFields(fields);
              const built = buildFieldsToSchema(fields);
              setRawJsonSchema(built ? JSON.stringify(built, null, 2) : '');
            }}
            onChangeRawJsonSchema={(raw) => {
              setRawJsonSchema(raw);
              try {
                const parsed = JSON.parse(raw);
                setParamFields(parseSchemaToFields(parsed));
              } catch {
                // intermediate text
              }
            }}
          />
        )}
      </div>
    </Modal>
  );
};
