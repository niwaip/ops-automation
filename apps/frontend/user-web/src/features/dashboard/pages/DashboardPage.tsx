import { Button, Card, Space, Typography } from 'antd';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { executionApi } from '../../../api';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(['dashboard-executions'], () =>
    executionApi.list({ page: 1, pageSize: 20 })
  );
  const executions = data?.data || [];
  const running = executions.filter((item) => item.status === 'running').length;
  const waiting = executions.filter(
    (item) => item.status === 'waiting_input' || item.status === 'pending_approval'
  ).length;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        用户工作台
      </Typography.Title>
      <Space size={16} style={{ width: '100%' }}>
        <Card loading={isLoading} style={{ flex: 1 }}>
          <Typography.Text>最近执行：{executions.length}</Typography.Text>
        </Card>
        <Card loading={isLoading} style={{ flex: 1 }}>
          <Typography.Text>执行中：{running}</Typography.Text>
        </Card>
        <Card loading={isLoading} style={{ flex: 1 }}>
          <Typography.Text>待处理：{waiting}</Typography.Text>
        </Card>
      </Space>
      <Space>
        <Button type="primary" onClick={() => navigate('/executions/new')}>
          创建执行
        </Button>
        <Button onClick={() => navigate('/published-skills')}>查看技能</Button>
        <Button onClick={() => navigate('/notifications')}>查看通知</Button>
      </Space>
    </Space>
  );
}
