import React, { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Typography,
  Select,
  Input,
  Popconfirm,
  Tooltip,
  Alert,
  Modal,
  Form,
  theme,
} from 'antd';
import {
  HolderOutlined,
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  RightOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { WorkflowStageDefinition, StageType } from '@/api/orgWorkflow';

const { Text } = Typography;
const { Option } = Select;

interface ProcessStageListProps {
  stages: WorkflowStageDefinition[];
  onChange: (stages: WorkflowStageDefinition[]) => void;
}

const STAGE_TYPE_LABELS: Record<StageType, { label: string; color: string }> = {
  submission: { label: '提单申请', color: 'blue' },
  approval: { label: '人工审批', color: 'orange' },
  automation: { label: '自动化流执行', color: 'purple' },
  archive: { label: '回执与归档', color: 'green' },
};

export const ProcessStageList: React.FC<ProcessStageListProps> = ({ stages, onChange }) => {
  const { token } = theme.useToken();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [addForm] = Form.useForm();

  // 拖拽排序逻辑
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    // leave
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...stages];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    setDraggedIndex(null);
    setDragOverIndex(null);
    onChange(updated);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // 上移/下移
  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stages.length) return;

    const updated = [...stages];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    onChange(updated);
  };

  // 删除阶段
  const handleDelete = (index: number) => {
    const updated = stages.filter((_, i) => i !== index);
    onChange(updated);
  };

  // 阶段字段快速修改
  const handleUpdateStage = (index: number, patch: Partial<WorkflowStageDefinition>) => {
    const updated = [...stages];
    updated[index] = { ...updated[index], ...patch };
    onChange(updated);
  };

  // 添加新阶段
  const handleAddStage = (values: any) => {
    const newStage: WorkflowStageDefinition = {
      id: `stage_${Date.now()}`,
      name: values.name.trim(),
      type: values.type,
      description: values.description?.trim() || '',
      approverRule: values.type === 'approval' ? values.approverRule || 'leader' : undefined,
      approverRole: values.type === 'approval' && values.approverRule === 'role' ? values.approverRole : undefined,
    };
    onChange([...stages, newStage]);
    setIsAddModalVisible(false);
    addForm.resetFields();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Alert
        message="支持拖拽调整流程阶段次序"
        description="按住左侧手柄 ⠿ 可拖拽调序。流程定义明确规定提单经办担当、主管审批流转、底层执行与回执归档各节点职责。"
        type="info"
        showIcon
      />

      {/* 顶部流程管道实时链条预览 (Dark Mode 兼容) */}
      <div
        style={{
          padding: '12px 16px',
          background: token.colorFillAlter,
          borderRadius: 8,
          border: `1px solid ${token.colorBorderSecondary}`,
          overflowX: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 12, color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>
          实时流转链：
        </span>
        {stages.map((stage, idx) => (
          <React.Fragment key={stage.id || idx}>
            <Tag
              color={STAGE_TYPE_LABELS[stage.type]?.color || 'blue'}
              style={{ padding: '2px 8px', fontSize: 12, margin: 0 }}
            >
              {idx + 1}. {stage.name}
            </Tag>
            {idx < stages.length - 1 && (
              <RightOutlined style={{ fontSize: 10, color: token.colorTextTertiary }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* 阶段卡片列表 (支持 Drag & Drop, Dark Mode 适配) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stages.map((stage, idx) => {
          const isDragging = draggedIndex === idx;
          const isDragOver = dragOverIndex === idx && draggedIndex !== idx;

          return (
            <div
              key={stage.id || idx}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              style={{
                opacity: isDragging ? 0.35 : 1,
                border: isDragOver
                  ? `2px dashed ${token.colorPrimary}`
                  : `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 8,
                background: isDragOver ? token.colorInfoBg : token.colorBgContainer,
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'default',
              }}
            >
              <Card
                size="small"
                bodyStyle={{ padding: '12px 16px' }}
                bordered={false}
                style={{ background: 'transparent' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {/* 左侧：拖拽手柄 + 序号 + 名称 + 类型 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Tooltip title="按住拖拽可调整流程节点顺序">
                      <HolderOutlined
                        style={{
                          cursor: 'grab',
                          fontSize: 18,
                          color: token.colorTextSecondary,
                          padding: '4px 6px',
                        }}
                      />
                    </Tooltip>
                    <Tag color="blue" style={{ margin: 0, fontWeight: 'bold' }}>
                      {idx + 1}
                    </Tag>
                    <Input
                      value={stage.name}
                      style={{ width: 160, fontWeight: 500 }}
                      onChange={(e) => handleUpdateStage(idx, { name: e.target.value })}
                      placeholder="节点名称"
                    />
                    <Select
                      value={stage.type}
                      style={{ width: 135 }}
                      onChange={(val) => handleUpdateStage(idx, { type: val })}
                    >
                      <Option value="submission">提单申请阶段</Option>
                      <Option value="approval">人工审批阶段</Option>
                      <Option value="automation">自动化流阶段</Option>
                      <Option value="archive">回执归档阶段</Option>
                    </Select>
                  </div>

                  {/* 右侧：上移/下移/删除操作按钮 */}
                  <Space size={4}>
                    <Tooltip title="向上移动">
                      <Button
                        size="small"
                        type="text"
                        disabled={idx === 0}
                        icon={<ArrowUpOutlined />}
                        onClick={() => handleMove(idx, 'up')}
                      />
                    </Tooltip>
                    <Tooltip title="向下移动">
                      <Button
                        size="small"
                        type="text"
                        disabled={idx === stages.length - 1}
                        icon={<ArrowDownOutlined />}
                        onClick={() => handleMove(idx, 'down')}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="确定删除此流程节点？"
                      onConfirm={() => handleDelete(idx)}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>

                {/* 节点描述与责任人/担当规则配置 */}
                <div style={{ marginTop: 8, paddingLeft: 34, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Input
                    size="small"
                    value={stage.description}
                    placeholder="节点说明（如：申请人填写表单、直属主管在线审批等）"
                    onChange={(e) => handleUpdateStage(idx, { description: e.target.value })}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    {stage.type === 'submission' && (
                      <Space size={6}>
                        <Tag color="cyan" icon={<UserOutlined />}>经办责任：申请人 + @承办担当人</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>必须包含经办担当信息并完成前置校验</Text>
                      </Space>
                    )}

                    {stage.type === 'approval' && (
                      <>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          审批担当规则:
                        </Text>
                        <Select
                          size="small"
                          value={stage.approverRule || 'leader'}
                          style={{ width: 140 }}
                          onChange={(val) => handleUpdateStage(idx, { approverRule: val })}
                        >
                          <Option value="leader">直属主管审批</Option>
                          <Option value="role">按业务角色池审批</Option>
                          <Option value="assignee">指定经办承办人</Option>
                        </Select>

                        {stage.approverRule === 'role' && (
                          <Select
                            size="small"
                            value={stage.approverRole || 'hr'}
                            style={{ width: 130 }}
                            onChange={(val) => handleUpdateStage(idx, { approverRole: val })}
                          >
                            <Option value="admin">管理员组</Option>
                            <Option value="hr">HR 人事组</Option>
                            <Option value="finance">财务审批组</Option>
                            <Option value="lead">业务组长组</Option>
                          </Select>
                        )}
                      </>
                    )}

                    {stage.type === 'automation' && (
                      <Tag color="purple">执行策略：前序审批核准后自动触发绑定的底层流闭环</Tag>
                    )}

                    {stage.type === 'archive' && (
                      <Tag color="green">回执动作：向申请人与经办担当推送电子回执凭证，GTD 收集箱清理归档</Tag>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      {/* 底部添加阶段按钮 */}
      <Button
        type="dashed"
        block
        icon={<PlusOutlined />}
        onClick={() => setIsAddModalVisible(true)}
        style={{ marginTop: 8, height: 40 }}
      >
        添加自定义流程节点 (Add Stage)
      </Button>

      {/* 添加新阶段弹窗 */}
      <Modal
        title="添加自定义流转节点"
        open={isAddModalVisible}
        onCancel={() => {
          setIsAddModalVisible(false);
          addForm.resetFields();
        }}
        onOk={() => addForm.submit()}
        okText="添加并插入"
        cancelText="取消"
      >
        <Form
          form={addForm}
          layout="vertical"
          initialValues={{ type: 'approval', approverRule: 'leader' }}
          onFinish={handleAddStage}
        >
          <Form.Item
            name="name"
            label="节点名称"
            rules={[{ required: true, message: '请输入阶段名称' }]}
          >
            <Input placeholder="如：部门长二审、财务复核、设备出库" />
          </Form.Item>

          <Form.Item name="type" label="节点类型" rules={[{ required: true }]}>
            <Select>
              <Option value="submission">提单申请 (Submission - 录入参数与经办担当)</Option>
              <Option value="approval">人工审批 (Approval - 主管/角色池核准)</Option>
              <Option value="automation">自动化流执行 (Automation - 外部系统对接)</Option>
              <Option value="archive">回执与归档 (Archive - 凭证存档闭环)</Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.type !== curr.type}
          >
            {({ getFieldValue }) =>
              getFieldValue('type') === 'approval' ? (
                <Form.Item name="approverRule" label="审批规则">
                  <Select>
                    <Option value="leader">直属主管审批</Option>
                    <Option value="role">特定业务角色组审批</Option>
                    <Option value="assignee">指定承办担当人</Option>
                  </Select>
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item name="description" label="节点说明">
            <Input.TextArea rows={2} placeholder="说明此流转节点的作用与流转要求" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
