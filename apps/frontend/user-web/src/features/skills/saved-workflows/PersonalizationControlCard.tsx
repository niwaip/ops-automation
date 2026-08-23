import { DeleteOutlined } from '@ant-design/icons';
import { Alert, Button, Card, List, Popconfirm, Space, Switch, Tag, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { personalizationApi } from '@/api/personalization';

export function PersonalizationControlCard() {
  const queryClient = useQueryClient();
  const query = useQuery(['user-personalization'], personalizationApi.getState, {
    staleTime: 30_000,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries(['user-personalization']),
      queryClient.invalidateQueries(['user-saved-skills']),
    ]);
  };
  const toggle = useMutation(personalizationApi.setEnabled, {
    onSuccess: refresh,
    onError: () => {
      message.error('更新个性化设置失败');
    },
  });
  const updateHabit = useMutation(
    ({ id, status }: { id: string; status: 'active' | 'disabled' }) =>
      personalizationApi.setHabitStatus(id, status),
    {
      onSuccess: refresh,
      onError: () => {
        message.error('更新习惯状态失败');
      },
    },
  );
  const clear = useMutation(personalizationApi.clear, {
    onSuccess: async () => {
      await refresh();
      message.success('个性化数据已清除，不影响已保存工作流和定时任务');
    },
    onError: () => {
      message.error('清除个性化数据失败');
    },
  });
  const state = query.data;

  return (
    <Card
      title="个性化与固定流程复用"
      loading={query.isLoading}
      extra={(
        <Space>
          <Typography.Text type="secondary">允许根据历史执行优化推荐</Typography.Text>
          <Switch
            checked={Boolean(state?.personalization.recommendationEnabled)}
            loading={toggle.isLoading}
            onChange={(checked) => toggle.mutate(checked)}
          />
        </Space>
      )}
    >
      <Alert
        showIcon
        type="info"
        message="只复用已审查的精确工作流版本"
        description="本次明确参数始终优先；关闭后不会影响我的工作流和已发布定时任务。"
        style={{ marginBottom: 12 }}
      />
      <List
        size="small"
        dataSource={state?.habits || []}
        locale={{ emptyText: '暂无生效习惯' }}
        renderItem={(habit) => (
          <List.Item
            actions={[
              <Switch
                key="status"
                size="small"
                checked={habit.status === 'active'}
                disabled={habit.status === 'held' || habit.status === 'expired'}
                onChange={(checked) => updateHabit.mutate({
                  id: habit.id,
                  status: checked ? 'active' : 'disabled',
                })}
              />,
            ]}
          >
            <Space wrap>
              <Tag>{habit.kind}</Tag>
              <Typography.Text>{habit.intentKey}</Typography.Text>
              {habit.savedVersion ? <Tag>固定版本 v{habit.savedVersion}</Tag> : null}
              <Tag color={habit.status === 'active' ? 'green' : 'default'}>{habit.status}</Tag>
            </Space>
          </List.Item>
        )}
      />
      <Popconfirm
        title="清除全部个性化数据？"
        description="不会删除保存的工作流和定时任务。"
        onConfirm={() => clear.mutate()}
      >
        <Button danger icon={<DeleteOutlined />} loading={clear.isLoading} style={{ marginTop: 12 }}>
          清除个性化数据
        </Button>
      </Popconfirm>
    </Card>
  );
}
