import React, { useMemo } from 'react';
import { Card, Input, Button, Tabs, Space, Modal } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { ListSectionHeader } from '@/components/page/PageScaffold';
import type { ActivityDTO, CreateActivityDto } from '@/api/activity';
import { useActivityState } from './Activity/hooks/useActivityState';
import { useActivityMutations } from './Activity/hooks/useActivityMutations';
import { ActivityListTable } from './Activity/components/ActivityListTable';
import { ActivityEditModal } from './Activity/components/ActivityEditModal';
import { ActivityTestModal } from './Activity/components/ActivityTestModal';
import { generatePythonCode } from './Activity/utils/activityHelpers';

export const ActivityPage: React.FC = () => {
  const state = useActivityState();
  const mutations = useActivityMutations();

  const customList = mutations.customActivitiesQuery.data || [];
  const builtinList = mutations.builtinActivitiesQuery.data || [];

  const filteredCustomList = useMemo(() => {
    if (!state.searchText.trim()) return customList;
    const kw = state.searchText.toLowerCase();
    return customList.filter(
      (item) => item.name.toLowerCase().includes(kw) || item.fn.toLowerCase().includes(kw)
    );
  }, [customList, state.searchText]);

  const filteredBuiltinList = useMemo(() => {
    if (!state.searchText.trim()) return builtinList;
    const kw = state.searchText.toLowerCase();
    return builtinList.filter(
      (item: any) =>
        item.name.toLowerCase().includes(kw) || item.fn.toLowerCase().includes(kw)
    );
  }, [builtinList, state.searchText]);

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
  };

  const handleViewCode = (activity: ActivityDTO) => {
    const code =
      activity.generatedCode ||
      generatePythonCode({
        name: activity.name,
        fn: activity.fn,
        description: '',
        isActive: activity.isActive,
        startToCloseTimeout: activity.timeout || '60s',
        steps: [],
      });
    state.setCurrentActivityName(activity.name);
    state.setCurrentCode(code);
    state.setCodeModalVisible(true);
  };

  return (
    <div style={{ padding: 24 }}>
      <ListSectionHeader
        title="Activity 任务节点管理"
        subtitle="定义与配置 Task Queue 中可独立调度的最小粒度 Python / API / 浏览器 Task 逻辑"
      />

      <Card style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Space>
            <Input
              placeholder="搜索 Activity 名称或函数名..."
              prefix={<SearchOutlined />}
              value={state.searchText}
              onChange={(e) => state.setSearchText(e.target.value)}
              style={{ width: 280 }}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void mutations.customActivitiesQuery.refetch();
                void mutations.builtinActivitiesQuery.refetch();
              }}
            />
          </Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              state.setEditingActivity(null);
              state.setCreateModalVisible(true);
            }}
          >
            新建 Activity
          </Button>
        </div>

        <Tabs
          activeKey={state.activeTab}
          onChange={(key) => state.setActiveTab(key as 'custom' | 'builtin')}
          items={[
            {
              key: 'custom',
              label: `自定义 Activity (${customList.length})`,
              children: (
                <ActivityListTable
                  activeTab="custom"
                  customActivities={filteredCustomList}
                  builtinActivities={[]}
                  isLoading={mutations.customActivitiesQuery.isLoading}
                  onEdit={(act) => {
                    state.setEditingActivity(act);
                    state.setCreateModalVisible(true);
                  }}
                  onDelete={(id) => mutations.deleteActivityMutation.mutate(id)}
                  onTest={(act) => {
                    state.setTestActivity(act);
                    state.setTestModalVisible(true);
                  }}
                  onViewCode={handleViewCode}
                />
              ),
            },
            {
              key: 'builtin',
              label: `系统内置 Activity (${builtinList.length})`,
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
        }}
        onSubmit={handleCreateOrUpdate}
        editingActivity={state.editingActivity}
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
        title={`生成的 Python 代码 - ${state.currentActivityName}`}
        onCancel={() => state.setCodeModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => state.setCodeModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={720}
      >
        <pre style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, fontSize: 13, maxHeight: 450, overflow: 'auto' }}>
          {state.currentCode}
        </pre>
      </Modal>
    </div>
  );
};

export default ActivityPage;
