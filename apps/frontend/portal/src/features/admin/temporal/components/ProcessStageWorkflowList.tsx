import React, { useMemo, useState } from 'react';
import {
  Table,
  Card,
  Input,
  Button,
  Space,
  Tag,
  Typography,
  Radio,
  Tooltip,
  Alert,
  theme,
  message,
  Popconfirm,
  Empty,
} from 'antd';
import {
  EyeOutlined,
  LinkOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  UserOutlined,
  RobotOutlined,
  ApartmentOutlined,
  DeleteOutlined,
  CodeOutlined,
  SafetyCertificateOutlined,
  EditOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import {
  orgWorkflowApi,
  type AvailableBaseWorkflowItem,
  type StageType,
  type StageWorkflowDraft,
} from '@/api/orgWorkflow';
import { StageWorkflowAiDrawer } from './ai-stage-flow/StageWorkflowAiDrawer';
import { ProcessStageCodeModal } from './ProcessStageCodeModal';
import { ProcessStageValidationModal } from './ProcessStageValidationModal';

const { Text } = Typography;

const STAGE_CONFIG: Record<StageType, { label: string; color: string; defaultHook: string }> = {
  submission: { label: '提单申请流', color: 'blue', defaultHook: 'on_submit (提单发起)' },
  approval: { label: '协同审批流', color: 'orange', defaultHook: 'on_stage_approval (流转核决)' },
  automation: { label: '自动化执行流', color: 'purple', defaultHook: 'on_approve (审批通过)' },
  archive: { label: '通知回执流', color: 'green', defaultHook: 'on_complete (办结归档)' },
};

interface ProcessStageWorkflowListProps {
  onViewContract: (item: AvailableBaseWorkflowItem) => void;
  onEditWorkflow?: (item: AvailableBaseWorkflowItem) => void;
  onOpenInFullEditor?: (draft: StageWorkflowDraft) => void;
}

export const ProcessStageWorkflowList: React.FC<ProcessStageWorkflowListProps> = ({
  onViewContract,
  onEditWorkflow,
  onOpenInFullEditor,
}) => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [aiDrawerVisible, setAiDrawerVisible] = useState(false);

  // 查看代码 Modal 状态
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [activeCodeWorkflow, setActiveCodeWorkflow] = useState<AvailableBaseWorkflowItem | null>(null);

  // 运行端对端验证 Modal 状态
  const [validationModalVisible, setValidationModalVisible] = useState(false);
  const [activeValidationWorkflow, setActiveValidationWorkflow] = useState<AvailableBaseWorkflowItem | null>(null);

  const { data: baseWorkflows = [], isLoading, refetch } = useQuery(
    ['available-base-workflows'],
    () => orgWorkflowApi.getAvailableBaseWorkflows()
  );

  const handleDelete = async (id: string) => {
    try {
      await orgWorkflowApi.deleteBaseWorkflow(id);
      message.success('已成功删除该原子工作流');
      refetch();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '删除失败，请稍后重试');
    }
  };

  const handleClearAll = async () => {
    try {
      await orgWorkflowApi.clearAllBaseWorkflows();
      message.success('已清空全部流程专用原子工作流');
      refetch();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '清空失败，请稍后重试');
    }
  };

  // 过滤出流程专用原子流
  const processWorkflows = useMemo(() => {
    return baseWorkflows.filter((item) => Boolean(item.stageType));
  }, [baseWorkflows]);

  // 根据阶段与关键词过滤
  const filteredWorkflows = useMemo(() => {
    return processWorkflows.filter((item) => {
      const matchStage = stageFilter === 'all' || item.stageType === stageFilter;
      const q = searchKeyword.trim().toLowerCase();
      const matchQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q) ||
        (item.handlerRule || '').toLowerCase().includes(q);
      return matchStage && matchQuery;
    });
  }, [processWorkflows, stageFilter, searchKeyword]);

  // 阶段分布统计
  const stageStats = useMemo(() => {
    return {
      total: processWorkflows.length,
      submissionCount: processWorkflows.filter((w) => w.stageType === 'submission').length,
      approvalCount: processWorkflows.filter((w) => w.stageType === 'approval').length,
      automationCount: processWorkflows.filter((w) => w.stageType === 'automation').length,
      archiveCount: processWorkflows.filter((w) => w.stageType === 'archive').length,
    };
  }, [processWorkflows]);

  const columns: ColumnsType<AvailableBaseWorkflowItem> = [
    {
      title: '工作流名称 / 唯一标识 (Key)',
      key: 'name',
      render: (_, record) => (
        <div>
          <Space>
            <ThunderboltOutlined style={{ color: token.colorPrimary, fontSize: 16 }} />
            <strong style={{ fontSize: 14, color: token.colorText }}>{record.name}</strong>
          </Space>
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 2 }}>
            代号：<code>{record.id}</code>
          </div>
          <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 2 }}>
            {record.description}
          </div>
        </div>
      ),
    },
    {
      title: '流程阶段与触发钩子',
      key: 'stage',
      width: 165,
      render: (_, record) => {
        const st = (record.stageType || 'automation') as StageType;
        const cfg = STAGE_CONFIG[st] || { label: '执行流', color: 'blue', defaultHook: 'on_approve' };
        return (
          <Space direction="vertical" size={2}>
            <Tag color={cfg.color} style={{ margin: 0, fontWeight: 500 }}>
              {cfg.label}
            </Tag>
            <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
              钩子：<code>{cfg.defaultHook}</code>
            </span>
          </Space>
        );
      },
    },
    {
      title: '经办与担当规则',
      key: 'handlerRule',
      width: 175,
      render: (_, record) => (
        <div style={{ fontSize: 13 }}>
          {record.handlerRule ? (
            <Tag color="geekblue" style={{ margin: 0 }}>
              <UserOutlined style={{ marginRight: 4 }} />
              {record.handlerRule}
            </Tag>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>自动调度执行</Text>
          )}
        </div>
      ),
    },
    {
      title: '必备要素契约',
      key: 'metadata',
      width: 160,
      render: (_, record) => {
        const fields = Array.isArray(record.requiredMetadata) ? record.requiredMetadata : [];
        if (fields.length === 0) {
          return <Text type="secondary" style={{ fontSize: 12 }}>标准通用信封</Text>;
        }
        return (
          <Space wrap size={4}>
            {fields.map((field) => (
              <Tag
                key={field}
                color={field.includes('担当') || field.includes('handler') ? 'cyan' : 'default'}
                style={{ fontSize: 11, margin: 0 }}
              >
                {field}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '代码与验证状态',
      key: 'validationStatus',
      width: 165,
      render: (_, record) => {
        const isValidated = record.validationStatus === 'validated';
        const hasCode = record.hasGeneratedCode || Boolean(record.generatedCode);

        return (
          <Space direction="vertical" size={3}>
            {isValidated ? (
              <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>
                已验证 ({record.validationScore ?? 100}分)
              </Tag>
            ) : hasCode ? (
              <Tag color="blue" icon={<CodeOutlined />} style={{ margin: 0 }}>
                已生成代码
              </Tag>
            ) : (
              <Tag color="default" style={{ margin: 0 }}>
                草稿待验证
              </Tag>
            )}
            {hasCode && (
              <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
                生产代码已就绪
              </span>
            )}
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 290,
      render: (_, record) => (
        <Space size={2} wrap>
          <Tooltip title="查看/重新生成 Python/Temporal 生产工作流代码">
            <Button
              type="link"
              size="small"
              icon={<CodeOutlined />}
              onClick={() => {
                setActiveCodeWorkflow(record);
                setCodeModalVisible(true);
              }}
            >
              代码
            </Button>
          </Tooltip>

          <Tooltip title="执行端对端沙箱真实验证测试">
            <Button
              type="link"
              size="small"
              icon={<SafetyCertificateOutlined />}
              onClick={() => {
                setActiveValidationWorkflow(record);
                setValidationModalVisible(true);
              }}
            >
              验证
            </Button>
          </Tooltip>

          {onEditWorkflow && (
            <Tooltip title="在标准工作流编辑器中打开并微调 DSL 与步骤">
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => onEditWorkflow(record)}
              >
                编辑
              </Button>
            </Tooltip>
          )}

          <Tooltip title="查看对外暴露的固定端口契约 (I/O Envelope)">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => onViewContract(record)}
            >
              契约
            </Button>
          </Tooltip>

          <Tooltip title="在企业工作流画布中组装该原子流">
            <Button
              type="link"
              size="small"
              icon={<LinkOutlined />}
              onClick={() => navigate('/admin/org-workflows')}
            >
              组装
            </Button>
          </Tooltip>

          <Popconfirm
            title="确定删除该原子工作流吗？"
            description="删除后将从流程阶段列表移除，不可再直接组装。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. 架构说明提示 */}
      <Alert
        message="业务流程专用原子流统一管理中心"
        description="本面板集中收口提单申请流（含申请人与经办担当）、协同审批流、系统自动化流与通知回执归档流。所有原子流均享有标准 DSL 校验、生产代码生成及端对端真实测试验证，并可直接在企业审批流中无缝组装。"
        type="info"
        showIcon
      />

      {/* 2. 统计卡片 (Dark Mode 兼容) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <Card size="small" style={{ borderRadius: 8, background: token.colorBgContainer }}>
          <div style={{ fontSize: 12, color: token.colorTextSecondary }}>流程原子流总数</div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: token.colorText, marginTop: 2 }}>
            {stageStats.total}
          </div>
        </Card>
        <Card size="small" style={{ borderRadius: 8, background: token.colorBgContainer }}>
          <div style={{ fontSize: 12, color: token.colorTextSecondary }}>提单申请流 (含担当)</div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1677ff', marginTop: 2 }}>
            {stageStats.submissionCount}
          </div>
        </Card>
        <Card size="small" style={{ borderRadius: 8, background: token.colorBgContainer }}>
          <div style={{ fontSize: 12, color: token.colorTextSecondary }}>协同审批流</div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fa8c16', marginTop: 2 }}>
            {stageStats.approvalCount}
          </div>
        </Card>
        <Card size="small" style={{ borderRadius: 8, background: token.colorBgContainer }}>
          <div style={{ fontSize: 12, color: token.colorTextSecondary }}>系统自动化执行流</div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#722ed1', marginTop: 2 }}>
            {stageStats.automationCount}
          </div>
        </Card>
        <Card size="small" style={{ borderRadius: 8, background: token.colorBgContainer }}>
          <div style={{ fontSize: 12, color: token.colorTextSecondary }}>通知回执与归档流</div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#52c41a', marginTop: 2 }}>
            {stageStats.archiveCount}
          </div>
        </Card>
      </div>

      {/* 3. 工具栏与分阶段筛选 */}
      <Card size="small" style={{ borderRadius: 8, background: token.colorBgContainer }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <Space wrap>
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索原子工作流名称、代号或经办担当规则..."
              style={{ width: 280 }}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              allowClear
            />
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              刷新
            </Button>
            <Button
              type="primary"
              icon={<RobotOutlined />}
              onClick={() => setAiDrawerVisible(true)}
            >
              AI 对话创建原子流
            </Button>
            <Button
              icon={<ApartmentOutlined />}
              onClick={() => navigate('/admin/org-workflows')}
            >
              进入企业工作流编排
            </Button>
            {processWorkflows.length > 0 && (
              <Popconfirm
                title="确定要清空全部流程专用原子工作流吗？"
                description="清空后所有阶段下的原子工作流将被移除，方便您从第 1 步重新开始自主创建。"
                okText="确认全部清空"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={handleClearAll}
              >
                <Button danger icon={<DeleteOutlined />}>
                  清空全部
                </Button>
              </Popconfirm>
            )}
          </Space>

          <Radio.Group
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            size="small"
          >
            <Radio.Button value="all">全部环节 ({processWorkflows.length})</Radio.Button>
            <Radio.Button value="submission">提单申请流 ({stageStats.submissionCount})</Radio.Button>
            <Radio.Button value="approval">协同审批流 ({stageStats.approvalCount})</Radio.Button>
            <Radio.Button value="automation">系统自动化流 ({stageStats.automationCount})</Radio.Button>
            <Radio.Button value="archive">通知回执流 ({stageStats.archiveCount})</Radio.Button>
          </Radio.Group>
        </div>
      </Card>

      {/* 4. 工作流数据表格 */}
      <Card size="small" style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={filteredWorkflows}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 8 }}
          locale={{
            emptyText: (
              <div style={{ padding: '36px 16px', textAlign: 'center' }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <div>
                      <p style={{ color: token.colorTextSecondary, fontSize: 14, marginBottom: 6 }}>
                        暂无流程专用原子工作流
                      </p>
                      <p style={{ color: token.colorTextTertiary, fontSize: 12, marginBottom: 16 }}>
                        已清空全部预置流程，你可以从第 1 步（提单申请、协同审批、自动化执行或通知归档）开始通过 AI 对话创建！
                      </p>
                    </div>
                  }
                >
                  <Button
                    type="primary"
                    icon={<RobotOutlined />}
                    onClick={() => setAiDrawerVisible(true)}
                  >
                    AI 对话创建第一条原子流
                  </Button>
                </Empty>
              </div>
            ),
          }}
        />
      </Card>

      {/* 5. AI 对话创建原子流抽屉 */}
      <StageWorkflowAiDrawer
        visible={aiDrawerVisible}
        onClose={() => setAiDrawerVisible(false)}
        onWorkflowCreated={() => refetch()}
        onOpenInFullEditor={onOpenInFullEditor}
      />

      {/* 6. 查看/重新生成 Python 代码弹窗 */}
      <ProcessStageCodeModal
        visible={codeModalVisible}
        workflow={activeCodeWorkflow}
        onClose={() => {
          setCodeModalVisible(false);
          setActiveCodeWorkflow(null);
        }}
        onCodeUpdated={() => refetch()}
      />

      {/* 7. 端对端真实测试验证弹窗 */}
      <ProcessStageValidationModal
        visible={validationModalVisible}
        workflow={activeValidationWorkflow}
        onClose={() => {
          setValidationModalVisible(false);
          setActiveValidationWorkflow(null);
        }}
        onValidationSuccess={() => refetch()}
      />
    </div>
  );
};
