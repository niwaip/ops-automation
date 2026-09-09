import React, { useMemo, useState } from 'react';
import { Alert, Card, Modal, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  ToolCatalogFilters,
  ToolCatalogItem,
  toolCatalogApi,
} from '@/api/tool-catalog';
import { ToolOverviewCards } from '../components/ToolOverviewCards';
import { ToolFilterToolbar } from '../components/ToolFilterToolbar';
import { ToolListTable } from '../components/ToolListTable';
import { ToolDetailDrawer } from '../components/ToolDetailDrawer';

const { Title, Text, Paragraph } = Typography;

const renderConfirmContent = (lines: string[]) => (
  <div
    style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-color-base, #e8e8e8)',
      borderRadius: 10,
      padding: 14,
      marginTop: 8,
    }}
  >
    {lines.map((line) => (
      <Paragraph key={line} style={{ marginBottom: 6, color: 'var(--text-primary)' }}>
        {line}
      </Paragraph>
    ))}
  </div>
);

const SystemToolAdminPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [modal, contextHolder] = Modal.useModal();
  const [filters, setFilters] = useState<ToolCatalogFilters>({});
  const [searchInput, setSearchInput] = useState('');
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const listQuery = useQuery(['tool-catalog', filters], () => toolCatalogApi.list(filters));
  const detailQuery = useQuery(
    ['tool-catalog-detail', selectedToolName],
    () => toolCatalogApi.getByName(selectedToolName!),
    { enabled: detailVisible && Boolean(selectedToolName) }
  );

  const syncUpdatedToolToCache = (updatedTool: ToolCatalogItem) => {
    queryClient.setQueriesData<{ tools: ToolCatalogItem[] } | undefined>(
      ['tool-catalog'],
      (previous) => {
        if (!previous?.tools) return previous;
        return {
          ...previous,
          tools: previous.tools.map((t) => (t.name === updatedTool.name ? updatedTool : t)),
        };
      }
    );
    queryClient.setQueryData(['tool-catalog-detail', updatedTool.name], updatedTool);
  };

  const updateMutation = useMutation(
    ({
      name,
      payload,
    }: {
      name: string;
      payload: Partial<ToolCatalogItem> & { metadataJson?: Record<string, unknown> };
    }) => toolCatalogApi.update(name, payload),
    {
      onSuccess: (updatedTool) => {
        syncUpdatedToolToCache(updatedTool);
        message.success(`原子能力「${updatedTool.displayName || updatedTool.name}」已更新`);
        queryClient.invalidateQueries(['tool-catalog']);
        queryClient.invalidateQueries(['tool-catalog-detail', updatedTool.name]);
      },
      onError: (error: any) => {
        const errorMessage = error?.response?.data?.message || error?.message || '更新配置失败';
        message.error(typeof errorMessage === 'string' ? errorMessage : '更新配置失败');
      },
    }
  );

  const categories = useMemo(
    () =>
      Array.from(
        new Set((listQuery.data?.tools || []).map((t) => t.category).filter(Boolean))
      ).sort() as string[],
    [listQuery.data?.tools]
  );

  const runtimeTypes = useMemo(
    () =>
      Array.from(
        new Set((listQuery.data?.tools || []).map((t) => t.runtimeType).filter(Boolean))
      ).sort() as string[],
    [listQuery.data?.tools]
  );

  const openDetail = (toolName: string) => {
    setSelectedToolName(toolName);
    setDetailVisible(true);
  };

  const closeDetail = () => {
    setDetailVisible(false);
    setSelectedToolName(null);
  };

  const applyFilters = (next: Partial<ToolCatalogFilters>) => {
    setFilters((cur) => ({ ...cur, ...next }));
  };

  const resetFilters = () => {
    setSearchInput('');
    setFilters({});
  };

  const handleQuickToggleStatus = (tool: ToolCatalogItem) => {
    const nextStatus = tool.status === 'active' ? 'disabled' : 'active';
    const boundCount = tool.usageSummary?.boundSkillCount || 0;

    if (nextStatus === 'disabled') {
      modal.confirm({
        title: `确认禁用原子能力「${tool.displayName || tool.name}」？`,
        content: renderConfirmContent([
          `禁用后，大模型运行时快照将不再暴露该原子能力。`,
          `当前已有 ${boundCount} 个 Skill 声明了对该能力的依赖，禁用可能影响相关 Skill 的执行与后续发布校验！`,
        ]),
        okText: '确认禁用',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => updateMutation.mutateAsync({ name: tool.name, payload: { status: nextStatus } }),
      });
      return;
    }

    updateMutation.mutate({ name: tool.name, payload: { status: nextStatus } });
  };

  const handleQuickToggleBinding = (tool: ToolCatalogItem) => {
    const nextBinding = !tool.allowSkillBinding;
    const boundCount = tool.usageSummary?.boundSkillCount || 0;

    if (!nextBinding) {
      modal.confirm({
        title: `确认禁止 Skill 绑定「${tool.displayName || tool.name}」？`,
        content: renderConfirmContent([
          `关闭后，平台将禁止任何新的业务 Skill 声明或绑定该原子能力。`,
          `当前已有 ${boundCount} 个 Skill 正在使用该能力。`,
        ]),
        okText: '确认禁止',
        cancelText: '取消',
        onOk: () =>
          updateMutation.mutateAsync({ name: tool.name, payload: { allowSkillBinding: nextBinding } }),
      });
      return;
    }

    updateMutation.mutate({ name: tool.name, payload: { allowSkillBinding: nextBinding } });
  };

  const handleDrawerSave = async (
    payload: Partial<ToolCatalogItem> & { metadataJson?: Record<string, unknown> }
  ) => {
    if (!selectedToolName || !detailQuery.data) return;

    const warnings: string[] = [];
    if (detailQuery.data.status !== payload.status && payload.status === 'disabled') {
      warnings.push(
        `禁用后，模型快照不再暴露该工具，当前依赖它的 ${
          detailQuery.data.usageSummary?.boundSkillCount || 0
        } 个 Skill 后续发布将受影响。`
      );
    }
    if (
      detailQuery.data.allowSkillBinding !== payload.allowSkillBinding &&
      payload.allowSkillBinding === false
    ) {
      warnings.push(
        `关闭 Skill 绑定后，新 Skill 将无法绑定该能力；已有 ${
          detailQuery.data.usageSummary?.boundSkillCount || 0
        } 个 Skill 正在使用。`
      );
    }
    if (
      detailQuery.data.promptExposure !== payload.promptExposure &&
      payload.promptExposure === 'hidden'
    ) {
      warnings.push('完全隐藏后，模型推理侧将无法感知该能力，调用链路可能发生变化。');
    }

    const execute = () =>
      updateMutation.mutateAsync({ name: selectedToolName, payload }).then(() => {
        closeDetail();
      });

    if (warnings.length > 0) {
      modal.confirm({
        title: '确认保存高影响治理变更？',
        content: renderConfirmContent(warnings),
        okText: '确认保存',
        cancelText: '取消',
        onOk: execute,
      });
      return;
    }

    await execute();
  };

  return (
    <>
      {contextHolder}
      <div>
        {/* Header Title Section */}
        <div style={{ marginBottom: 16 }}>
          <Title level={4} style={{ marginBottom: 4 }}>
            模型原子能力治理
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            面向大模型 ReAct / Planner 规划调度的底层原子能力资产、提示词暴露范围、安全风险与 Skill 绑定准入门禁
          </Text>
        </div>

        {/* Informative Guidance Banner */}
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 20, borderRadius: 10 }}
          message="原子能力与技能定位说明"
          description="这里管理的是大模型推理时可调用的底层原子构件（如意图匹配 skill_match、追问 user_ask、外部接口 api_call、文档渲染 document_render 等）。调整其运行状态、Prompt 暴露或绑定策略，会实时影响快照生成与业务技能准入。"
        />

        {/* Overview Stats Cards */}
        <ToolOverviewCards
          tools={listQuery.data?.tools || []}
          selectedStatus={filters.status}
          onFilterStatus={(status) => applyFilters({ status })}
        />

        {/* Main Table Card */}
        <Card style={{ borderRadius: 14, boxShadow: 'var(--shadow-sm)' }}>
          <ToolFilterToolbar
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            filters={filters}
            onApplyFilters={applyFilters}
            onReset={resetFilters}
            onRefresh={() => listQuery.refetch()}
            categories={categories}
            runtimeTypes={runtimeTypes}
            loading={listQuery.isFetching}
          />

          <ToolListTable
            dataSource={listQuery.data?.tools || []}
            loading={listQuery.isLoading}
            onOpenDetail={openDetail}
            onQuickToggleStatus={handleQuickToggleStatus}
            onQuickToggleBinding={handleQuickToggleBinding}
          />
        </Card>

        {/* Governance Detail Drawer */}
        <ToolDetailDrawer
          visible={detailVisible}
          tool={detailQuery.data}
          isLoading={detailQuery.isLoading}
          isSaving={updateMutation.isLoading}
          onClose={closeDetail}
          onSave={handleDrawerSave}
        />
      </div>
    </>
  );
};

export default SystemToolAdminPage;
