import React, { useMemo } from 'react';
import { Card, Tabs, Modal, Button, Space, message, Typography } from 'antd';
import { CopyOutlined, CodeOutlined } from '@ant-design/icons';
import { ListSectionHeader } from '@/components/page/PageScaffold';
import type { ActivityDTO, BuiltinActivityDTO, CreateActivityDto } from '@/api/activity';
import { useActivityState } from './Activity/hooks/useActivityState';
import { useActivityMutations } from './Activity/hooks/useActivityMutations';
import { ActivityOverviewCards, type ActivityQuickFilter } from './Activity/components/ActivityOverviewCards';
import { ActivityFilterToolbar } from './Activity/components/ActivityFilterToolbar';
import { ActivityListTable } from './Activity/components/ActivityListTable';
import { ActivityEditModal } from './Activity/components/ActivityEditModal';
import { ActivityTestModal } from './Activity/components/ActivityTestModal';
import { generatePythonCode, activityToCloneDraft } from './Activity/utils/activityHelpers';

const { Text } = Typography;

export const ActivityPage: React.FC = () => {
  const state = useActivityState();
  const mutations = useActivityMutations();

  const customList = mutations.customActivitiesQuery.data || [];
  const builtinList = mutations.builtinActivitiesQuery.data || [];
  const isRefreshing =
    mutations.customActivitiesQuery.isFetching || mutations.builtinActivitiesQuery.isFetching;

  // Filter custom list
  const filteredCustomList = useMemo(() => {
    let list = customList;
    if (state.activeFilter === 'builtin') return [];
    if (['script', 'api', 'browser', 'carbone'].includes(state.activeFilter)) {
      list = list.filter((item) => (item.handler || 'script') === state.activeFilter);
    }

    if (!state.searchText.trim()) return list;
    const kw = state.searchText.toLowerCase();
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(kw) ||
        item.fn.toLowerCase().includes(kw) ||
        (item.config?.description || '').toLowerCase().includes(kw)
    );
  }, [customList, state.activeFilter, state.searchText]);

  // Filter builtin list
  const filteredBuiltinList = useMemo(() => {
    let list = builtinList;
    if (state.activeFilter === 'custom') return [];
    if (['script', 'api', 'browser', 'carbone'].includes(state.activeFilter)) {
      list = list.filter((item: BuiltinActivityDTO) => (item.handler || 'script') === state.activeFilter);
    }

    if (!state.searchText.trim()) return list;
    const kw = state.searchText.toLowerCase();
    return list.filter(
      (item: BuiltinActivityDTO) =>
        item.name.toLowerCase().includes(kw) ||
        item.fn.toLowerCase().includes(kw) ||
        (item.description || '').toLowerCase().includes(kw)
    );
  }, [builtinList, state.activeFilter, state.searchText]);

  const handleSelectFilter = (filter: ActivityQuickFilter) => {
    state.setActiveFilter(filter);
    if (filter === 'builtin') {
      state.setActiveTab('builtin');
    } else if (filter === 'custom') {
      state.setActiveTab('custom');
    }
  };

  const handleRefresh = () => {
    void mutations.customActivitiesQuery.refetch();
    void mutations.builtinActivitiesQuery.refetch();
    message.success('已刷新工作单元数据');
  };

  const handleCreateOrUpdate = (values: CreateActivityDto) => {
    if (state.editingActivity) {
      mutations.updateActivityMutation.mutate({
        id: state.editingActivity.id,
        dto: values,
      });
    } else {
      mutations.createActivityMutation.mutate(values);
    }
    state.setCreateModalVisible(false);
    state.setEditingActivity(null);
    state.setInitialDraft(null);
  };

  const handleClone = (activity: ActivityDTO | BuiltinActivityDTO) => {
    const draft = activityToCloneDraft(activity);
    state.setEditingActivity(null);
    state.setInitialDraft(draft);
    state.setCreateModalVisible(true);
    message.info(`已复制 [${activity.name}] 为草稿模板，可进行配置调整`);
  };

  const handleViewCode = (activity: ActivityDTO) => {
    const code =
      activity.generatedCode ||
      generatePythonCode({
        name: activity.name,
        fn: activity.fn,
        description: activity.config?.description || '',
        isActive: activity.isActive,
        startToCloseTimeout: activity.timeout || '60s',
        steps: [],
      });
    state.setCurrentActivityName(activity.name);
    state.setCurrentCode(code);
    state.setCodeModalVisible(true);
  };

  const handleViewBuiltinCode = (activity: BuiltinActivityDTO) => {
    const code =
      activity.generatedCode ||
      generatePythonCode({
        name: activity.name,
        fn: activity.fn,
        description: activity.description || 'Builtin Activity Driver',
        isActive: true,
        startToCloseTimeout: activity.timeout || '60s',
        steps: [],
      });
    state.setCurrentActivityName(activity.name);
    state.setCurrentCode(code);
    state.setCodeModalVisible(true);
  };

  const handleCopyCurrentCode = () => {
    if (!state.currentCode) return;
    navigator.clipboard.writeText(state.currentCode);
    message.success('Python 活动代码已复制到剪贴板');
  };

  return (
    <div style={{ padding: 24 }}>
      <ListSectionHeader
        title="工作单元 (Activities) 任务节点管理"
        subtitle="定义与编排 Temporal 工作流原子能力，支持从技能 (Skills) 快速复制生成与 AI 编译"
      />

      <ActivityOverviewCards
        customActivities={customList}
        builtinActivities={builtinList}
        activeFilter={state.activeFilter}
        onSelectFilter={handleSelectFilter}
      />

      <Card style={{ borderRadius: 12 }}>
        <ActivityFilterToolbar
          searchText={state.searchText}
          onSearchChange={state.setSearchText}
          activeFilter={state.activeFilter}
          onFilterChange={handleSelectFilter}
          onRefresh={handleRefresh}
          onCreate={() => {
            state.setEditingActivity(null);
            state.setInitialDraft(null);
            state.setCreateModalVisible(true);
          }}
          onImportFromSkill={() => {
            state.setEditingActivity(null);
            state.setInitialDraft(null);
            state.setCreateModalVisible(true);
          }}
          loading={isRefreshing}
        />

        <Tabs
          activeKey={state.activeTab}
          onChange={(key) => state.setActiveTab(key as 'custom' | 'builtin')}
          items={[
            {
              key: 'custom',
              label: `自定义 Activity (${filteredCustomList.length}/${customList.length})`,
              children: (
                <ActivityListTable
                  activeTab="custom"
                  customActivities={filteredCustomList}
                  builtinActivities={[]}
                  isLoading={mutations.customActivitiesQuery.isLoading}
                  onEdit={(act) => {
                    state.setEditingActivity(act);
                    state.setInitialDraft(null);
                    state.setCreateModalVisible(true);
                  }}
                  onDelete={(id) => mutations.deleteActivityMutation.mutate(id)}
                  onTest={(act) => {
                    state.setTestActivity(act);
                    state.setTestModalVisible(true);
                  }}
                  onViewCode={handleViewCode}
                  onClone={handleClone}
                  onViewBuiltinCode={() => {}}
                />
              ),
            },
            {
              key: 'builtin',
              label: `系统内置驱动 (${filteredBuiltinList.length}/${builtinList.length})`,
              children: (
                <ActivityListTable
                  activeTab="builtin"
                  customActivities={[]}
                  builtinActivities={filteredBuiltinList}
                  isLoading={mutations.builtinActivitiesQuery.isLoading}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onTest={() => {}}
                  onViewCode={() => {}}
                  onClone={handleClone}
                  onViewBuiltinCode={handleViewBuiltinCode}
                />
              ),
            },
          ]}
        />
      </Card>

      <ActivityEditModal
        visible={state.createModalVisible}
        onCancel={() => {
          state.setCreateModalVisible(false);
          state.setEditingActivity(null);
          state.setInitialDraft(null);
        }}
        onSubmit={handleCreateOrUpdate}
        editingActivity={state.editingActivity}
        initialDraft={state.initialDraft}
        loading={
          mutations.createActivityMutation.isLoading || mutations.updateActivityMutation.isLoading
        }
        onTestActivity={(act) => {
          state.setTestActivity(act as any);
          state.setTestModalVisible(true);
        }}
      />

      <ActivityTestModal
        visible={state.testModalVisible}
        onCancel={() => {
          state.setTestModalVisible(false);
          state.setTestActivity(null);
        }}
        activity={state.testActivity}
      />

      <Modal
        open={state.codeModalVisible}
        title={
          <Space>
            <CodeOutlined style={{ color: 'var(--primary-color)' }} />
            <span>Python Activity 执行代码 - {state.currentActivityName}</span>
          </Space>
        }
        onCancel={() => state.setCodeModalVisible(false)}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyCurrentCode}>
            复制代码
          </Button>,
          <Button key="close" type="primary" onClick={() => state.setCodeModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={760}
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">
            此代码在 Temporal Worker 宿主环境运行，包含活动注册修饰符及异常熔断捕获。
          </Text>
        </div>
        <pre
          style={{
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            padding: 16,
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.5,
            maxHeight: 480,
            overflow: 'auto',
            border: '1px solid var(--border-color)',
            fontFamily: 'Monaco, Menlo, monospace',
          }}
        >
          {state.currentCode}
        </pre>
      </Modal>
    </div>
  );
};

export default ActivityPage;
