import { useState } from 'react';
import {
  BulbOutlined,
  DeleteOutlined,
  DownOutlined,
  UpOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  List,
  Popconfirm,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { personalizationApi } from '@/api/personalization';
import styles from '../components/EmployeeManagement.module.css';

export function PersonalizationControlCard() {
  const [collapsed, setCollapsed] = useState(true);
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
  const habitsCount = state?.habits?.length || 0;

  return (
    <Card
      size="small"
      className={styles['workflow-control-card']}
      loading={query.isLoading}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={styles['employee-section-toggle-btn']}
            style={{ flex: 1, padding: '4px 0' }}
          >
            <div className={styles['employee-section-title-wrap']}>
              <BulbOutlined style={{ color: '#6366f1' }} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>个性化与执行习惯偏好</span>
              {habitsCount > 0 && (
                <span className={styles['employee-section-badge']}>{habitsCount} 项习惯</span>
              )}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginRight: 16 }}>
              {collapsed ? <DownOutlined /> : <UpOutlined />}
            </span>
          </button>

          <Space size={8} onClick={(e) => e.stopPropagation()}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>历史偏好推荐</Typography.Text>
            <Switch
              size="small"
              checked={Boolean(state?.personalization.recommendationEnabled)}
              loading={toggle.isLoading}
              onChange={(checked) => toggle.mutate(checked)}
            />
          </Space>
        </div>
      }
      styles={{
        header: { paddingInline: 18, minHeight: 46 },
        body: collapsed ? { display: 'none' } : { padding: 18, paddingTop: 14 },
      }}
    >
      <Alert
        showIcon
        type="info"
        message="只复用已审查的精确工作流版本"
        description="本次明确输入的参数始终拥有最高优先级；关闭推荐不会影响已保存的专属工作流与定时排班。"
        style={{ marginBottom: 12, borderRadius: 10 }}
      />
      <List
        size="small"
        dataSource={state?.habits || []}
        locale={{ emptyText: '暂无已识别的习惯偏好' }}
        renderItem={(habit) => (
          <List.Item
            actions={[
              <Switch
                key="status"
                size="small"
                checked={habit.status === 'active'}
                disabled={habit.status === 'held' || habit.status === 'expired'}
                onChange={(checked) =>
                  updateHabit.mutate({
                    id: habit.id,
                    status: checked ? 'active' : 'disabled',
                  })
                }
              />,
            ]}
          >
            <Space wrap size={[6, 6]}>
              <Tag bordered={false}>{habit.kind}</Tag>
              <Typography.Text strong style={{ fontSize: 13 }}>{habit.intentKey}</Typography.Text>
              {habit.savedVersion ? <Tag color="purple">固定版本 v{habit.savedVersion}</Tag> : null}
              <Tag color={habit.status === 'active' ? 'success' : 'default'} bordered={false}>
                {habit.status === 'active' ? '启用中' : '已暂停'}
              </Tag>
            </Space>
          </List.Item>
        )}
      />
      <Popconfirm
        title="清除全部个性化习惯数据？"
        description="此操作仅清除已记录的行为偏好，不会删除已保存的专属工作流与定时任务。"
        onConfirm={() => clear.mutate()}
        okText="确认清除"
        cancelText="取消"
      >
        <Button danger icon={<DeleteOutlined />} loading={clear.isLoading} style={{ marginTop: 12, borderRadius: 8 }}>
          清除习惯数据
        </Button>
      </Popconfirm>
    </Card>
  );
}
