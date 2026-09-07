import React, { useState, useMemo } from 'react';
import {
  Tag,
  Typography,
  Button,
  Space,
  Empty,
  Input,
  Radio,
  Select,
  Tooltip,
  Alert,
  theme,
} from 'antd';
import {
  ApiOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DragOutlined,
  HolderOutlined,
  PlusOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type {
  AssembledBaseWorkflow,
  AvailableBaseWorkflowItem,
  StageType,
} from '@/api/orgWorkflow';

const { Text } = Typography;
const { Option } = Select;

interface WorkflowAssemblyPanelProps {
  assembledWorkflows: AssembledBaseWorkflow[];
  availableWorkflows: AvailableBaseWorkflowItem[];
  onChange: (items: AssembledBaseWorkflow[]) => void;
}

const STAGE_CONFIG: Record<
  StageType,
  { label: string; color: string; defaultTrigger: 'on_submit' | 'on_stage_approval' | 'on_approve' | 'on_complete' }
> = {
  submission: { label: '提单申请流', color: 'blue', defaultTrigger: 'on_submit' },
  approval: { label: '协同审批流', color: 'orange', defaultTrigger: 'on_stage_approval' },
  automation: { label: '自动化执行流', color: 'purple', defaultTrigger: 'on_approve' },
  archive: { label: '通知回执流', color: 'green', defaultTrigger: 'on_complete' },
};

export const WorkflowAssemblyPanel: React.FC<WorkflowAssemblyPanelProps> = ({
  assembledWorkflows,
  availableWorkflows,
  onChange,
}) => {
  const { token } = theme.useToken();
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isOverDropZone, setIsOverDropZone] = useState<boolean>(false);
  const [draggedAssembledIndex, setDraggedAssembledIndex] = useState<number | null>(null);
  const [dragOverAssembledIndex, setDragOverAssembledIndex] = useState<number | null>(null);

  // 过滤可用底层资产
  const filteredBaseWorkflows = useMemo(() => {
    return availableWorkflows.filter((item) => {
      const matchStage = stageFilter === 'all' || (item.stageType || 'automation') === stageFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q) ||
        (item.handlerRule || '').toLowerCase().includes(q);
      return matchStage && matchSearch;
    });
  }, [availableWorkflows, stageFilter, searchQuery]);

  // 组装/解绑单个基础流
  const handleToggleWorkflow = (base: AvailableBaseWorkflowItem) => {
    const exists = assembledWorkflows.some((w) => w.refId === base.id);
    if (exists) {
      onChange(assembledWorkflows.filter((w) => w.refId !== base.id));
    } else {
      const st = base.stageType || 'automation';
      const trigger = STAGE_CONFIG[st]?.defaultTrigger || 'on_approve';
      onChange([
        ...assembledWorkflows,
        {
          type: base.type,
          refId: base.id,
          name: base.name,
          triggerEvent: trigger,
          description: base.description || '协同流程环节自动流转',
          stageType: base.stageType,
          handlerRule: base.handlerRule,
          requiredMetadata: base.requiredMetadata,
        },
      ]);
    }
  };

  // 处理拖拽资产到投放区 (Drop to Assemble)
  const handleDropOnZone = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOverDropZone(false);

    const baseId = e.dataTransfer.getData('text/plain');
    if (!baseId) return;

    const base = availableWorkflows.find((w) => w.id === baseId);
    if (!base) return;

    if (!assembledWorkflows.some((w) => w.refId === base.id)) {
      const st = base.stageType || 'automation';
      const trigger = STAGE_CONFIG[st]?.defaultTrigger || 'on_approve';
      onChange([
        ...assembledWorkflows,
        {
          type: base.type,
          refId: base.id,
          name: base.name,
          triggerEvent: trigger,
          description: base.description || '协同流程环节自动流转',
          stageType: base.stageType,
          handlerRule: base.handlerRule,
          requiredMetadata: base.requiredMetadata,
        },
      ]);
    }
  };

  // 组装列表内部拖拽排序 (Reordering within Assembled)
  const handleAssembledDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedAssembledIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/assembled-index', String(index));
  };

  const handleAssembledDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverAssembledIndex !== index) {
      setDragOverAssembledIndex(index);
    }
  };

  const handleAssembledDrop = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    if (draggedAssembledIndex === null || draggedAssembledIndex === targetIndex) {
      setDraggedAssembledIndex(null);
      setDragOverAssembledIndex(null);
      return;
    }

    const updated = [...assembledWorkflows];
    const [moved] = updated.splice(draggedAssembledIndex, 1);
    updated.splice(targetIndex, 0, moved);

    setDraggedAssembledIndex(null);
    setDragOverAssembledIndex(null);
    onChange(updated);
  };

  const handleUpdateTrigger = (index: number, trigger: any) => {
    const updated = [...assembledWorkflows];
    updated[index] = { ...updated[index], triggerEvent: trigger };
    onChange(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Alert
        message="企业工作流 = 提单申请流 + 协同审批流 + 系统执行流 + 回执归档流的完整组装"
        description="一个完整的审批流不仅有底层核销，更包含提单经办流（录入申请人与经办担当）、多级审批核准流、外部系统自动化扣减流与回执归档流。将各环节专用流拖拽至上方已组装区即可组合生效。"
        type="info"
        showIcon
      />

      {/* 1. 已组装的底层资产投放区 (Drop Zone - Dark Mode 适配) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsOverDropZone(true);
        }}
        onDragLeave={() => setIsOverDropZone(false)}
        onDrop={handleDropOnZone}
        style={{
          border: isOverDropZone
            ? `2px dashed ${token.colorPrimary}`
            : assembledWorkflows.length === 0
            ? `2px dashed ${token.colorBorderSecondary}`
            : `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 8,
          background: isOverDropZone
            ? token.colorInfoBg
            : assembledWorkflows.length === 0
            ? token.colorFillAlter
            : token.colorBgContainer,
          padding: 16,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space>
            <ApiOutlined style={{ color: token.colorSuccess }} />
            <Text strong>已组装的流程环节工作流 ({assembledWorkflows.length})</Text>
          </Space>
          {assembledWorkflows.length > 0 && (
            <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
              按住 ⠿ 可拖拽调整环节执行先后次序
            </span>
          )}
        </div>

        {assembledWorkflows.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                isOverDropZone
                  ? '松开鼠标即可组装该流程工作流！'
                  : '将下方提单申请流、审批流、自动化执行流或通知回执流拖拽至此处投放组装'
              }
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {assembledWorkflows.map((item, idx) => {
              const isDragging = draggedAssembledIndex === idx;
              const isDragOver = dragOverAssembledIndex === idx && draggedAssembledIndex !== idx;
              const st = (item.stageType || 'automation') as StageType;
              const stageCfg = STAGE_CONFIG[st] || { label: '执行流', color: 'blue' };

              return (
                <div
                  key={item.refId}
                  draggable
                  onDragStart={(e) => handleAssembledDragStart(e, idx)}
                  onDragOver={(e) => handleAssembledDragOver(e, idx)}
                  onDrop={(e) => handleAssembledDrop(e, idx)}
                  onDragEnd={() => {
                    setDraggedAssembledIndex(null);
                    setDragOverAssembledIndex(null);
                  }}
                  style={{
                    opacity: isDragging ? 0.35 : 1,
                    border: isDragOver
                      ? `2px dashed ${token.colorPrimary}`
                      : `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 6,
                    background: isDragOver ? token.colorInfoBg : token.colorFillAlter,
                    padding: '10px 14px',
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space size={8}>
                      <Tooltip title="拖拽调整执行次序">
                        <HolderOutlined style={{ cursor: 'grab', color: token.colorTextSecondary }} />
                      </Tooltip>
                      <Tag color="blue" style={{ margin: 0 }}>#{idx + 1}</Tag>
                      <Tag color={stageCfg.color} style={{ margin: 0 }}>{stageCfg.label}</Tag>
                      <strong style={{ fontSize: 13, color: token.colorText }}>{item.name}</strong>
                      <code style={{ fontSize: 11, color: token.colorTextSecondary }}>{item.refId}</code>
                    </Space>

                    <Space size={8}>
                      <Select
                        size="small"
                        value={item.triggerEvent || 'on_approve'}
                        style={{ width: 145 }}
                        onChange={(val) => handleUpdateTrigger(idx, val)}
                      >
                        <Option value="on_submit">提单发起时触发</Option>
                        <Option value="on_stage_approval">审批流转时触发</Option>
                        <Option value="on_approve">审批核准通过时</Option>
                        <Option value="on_complete">协同办结归档时</Option>
                      </Select>
                      <Button
                        type="link"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => onChange(assembledWorkflows.filter((_, i) => i !== idx))}
                      >
                        移除
                      </Button>
                    </Space>
                  </div>

                  {/* 业务担当与元数据提示 */}
                  <div style={{ paddingLeft: 26, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {item.handlerRule && (
                      <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
                        <UserOutlined style={{ marginRight: 4 }} />
                        <strong>经办/担当规则：</strong>{item.handlerRule}
                      </span>
                    )}
                    {Array.isArray(item.requiredMetadata) && item.requiredMetadata.length > 0 && (
                      <Space size={4}>
                        <span style={{ fontSize: 11, color: token.colorTextTertiary }}>必备要素:</span>
                        {item.requiredMetadata.map((m) => (
                          <Tag key={m} style={{ fontSize: 10, margin: 0 }}>{m}</Tag>
                        ))}
                      </Space>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. 5173 底层资产池 (Draggable Asset Cards - Dark Mode 适配) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Space>
            <ThunderboltOutlined style={{ color: token.colorPrimary }} />
            <Text strong>5173 流程专用工作流资产池 (可拖拽或点击组装)</Text>
          </Space>
          <Radio.Group
            size="small"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
          >
            <Radio.Button value="all">全部环节</Radio.Button>
            <Radio.Button value="submission">提单申请流</Radio.Button>
            <Radio.Button value="approval">协同审批流</Radio.Button>
            <Radio.Button value="automation">系统自动化流</Radio.Button>
            <Radio.Button value="archive">通知回执流</Radio.Button>
          </Radio.Group>
        </div>

        <Input
          size="small"
          prefix={<SearchOutlined />}
          placeholder="搜索工作流名称、ID、经办担当或功能描述..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          allowClear
        />

        <div
          style={{
            maxHeight: 280,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            paddingRight: 4,
          }}
        >
          {filteredBaseWorkflows.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到匹配的流程专用工作流资产" />
          ) : (
            filteredBaseWorkflows.map((base) => {
              const isAssembled = assembledWorkflows.some((w) => w.refId === base.id);
              const st = (base.stageType || 'automation') as StageType;
              const stageCfg = STAGE_CONFIG[st] || { label: '执行流', color: 'blue' };

              return (
                <div
                  key={base.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('text/plain', base.id);
                  }}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 6,
                    border: isAssembled
                      ? `1px solid ${token.colorSuccessBorder}`
                      : `1px solid ${token.colorBorderSecondary}`,
                    background: isAssembled ? token.colorSuccessBg : token.colorBgContainer,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    cursor: 'grab',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tooltip title="按住可拖拽至上方已组装区域">
                        <DragOutlined style={{ color: token.colorTextSecondary, fontSize: 14 }} />
                      </Tooltip>
                      <Tag color={stageCfg.color} style={{ margin: 0 }}>{stageCfg.label}</Tag>
                      <strong style={{ fontSize: 13, color: token.colorText }}>{base.name}</strong>
                      <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
                        ({base.id})
                      </span>
                    </div>

                    <Space size={8}>
                      {isAssembled ? (
                        <Tag color="success" icon={<CheckCircleOutlined />}>已在组装链中</Tag>
                      ) : (
                        <Button
                          size="small"
                          type="primary"
                          ghost
                          icon={<PlusOutlined />}
                          onClick={() => handleToggleWorkflow(base)}
                        >
                          组装至流程
                        </Button>
                      )}
                    </Space>
                  </div>

                  <div style={{ paddingLeft: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
                      {base.description || '标准企业流转环节'}
                    </span>
                    {base.handlerRule && (
                      <Tag color="geekblue" style={{ fontSize: 11, margin: 0 }}>
                        <UserOutlined style={{ marginRight: 3 }} />
                        {base.handlerRule}
                      </Tag>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
