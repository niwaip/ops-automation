/**
 * SkillConfirm
 * Skill参数确认组件
 */

import React from 'react';
import { Card, Descriptions, Button, Space, Typography } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import './SkillConfirm.css';

interface SkillConfirmProps {
  skillName: string;
  params: Record<string, unknown>;
  onConfirm: () => void;
  onCancel: () => void;
}

const SkillConfirm: React.FC<SkillConfirmProps> = ({
  skillName,
  params,
  onConfirm,
  onCancel,
}) => {
  // 将参数转换为Descriptions items
  const items = Object.entries(params).map(([key, value]) => ({
    key,
    label: key,
    children: typeof value === 'object' ? JSON.stringify(value) : String(value),
  }));

  return (
    <Card className="skill-confirm-panel" bordered={false}>
      <Typography.Title level={5}>
        确认参数 - {skillName}
      </Typography.Title>
      <Typography.Text type="secondary">
        以下参数已识别完成，请确认后生成文档
      </Typography.Text>

      <Descriptions
        column={1}
        size="small"
        items={items}
        className="skill-confirm-params"
      />

      <Space className="skill-confirm-actions">
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={onConfirm}
        >
          确认生成
        </Button>
        <Button
          icon={<CloseOutlined />}
          onClick={onCancel}
        >
          取消
        </Button>
      </Space>
    </Card>
  );
};

export default SkillConfirm;