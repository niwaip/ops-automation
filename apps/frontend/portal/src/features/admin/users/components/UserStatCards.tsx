import React, { useMemo } from 'react';
import {
  TeamOutlined,
  CheckCircleOutlined,
  ApartmentOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { UserDto } from '@/api/auth';
import { OverviewStatGrid } from '@/components/page/PageScaffold';

interface UserStatCardsProps {
  users: UserDto[];
  total: number;
}

export const UserStatCards: React.FC<UserStatCardsProps> = ({ users, total }) => {
  const statItems = useMemo(() => {
    const activeCount = users.filter((u) => u.isActive).length;
    const adminCount = users.filter((u) => u.role === 'admin').length;
    const agentCount = users.filter((u) => u.role === 'agent').length;
    const deptAssignedCount = users.filter((u) => !!u.department).length;
    const activeRate = total > 0 ? Math.round((activeCount / (users.length || 1)) * 100) : 100;
    const deptRate = users.length > 0 ? Math.round((deptAssignedCount / users.length) * 100) : 0;

    return [
      {
        key: 'total',
        label: '总用户数',
        value: total,
        icon: <TeamOutlined style={{ color: '#1890ff', fontSize: 20 }} />,
        color: '#1890ff',
      },
      {
        key: 'active',
        label: '活跃账号',
        value: `${activeCount} (${activeRate}%)`,
        icon: <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />,
        color: '#52c41a',
      },
      {
        key: 'department',
        label: '部门覆盖率',
        value: `${deptAssignedCount} 人 (${deptRate}%)`,
        icon: <ApartmentOutlined style={{ color: '#fa8c16', fontSize: 20 }} />,
        color: '#fa8c16',
      },
      {
        key: 'admin',
        label: '管理员 / Agent',
        value: `${adminCount} 管理员 / ${agentCount} Agent`,
        icon: <SafetyCertificateOutlined style={{ color: '#722ed1', fontSize: 20 }} />,
        color: '#722ed1',
      },
    ];
  }, [users, total]);

  return <OverviewStatGrid items={statItems} />;
};
