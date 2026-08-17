import React from 'react';
import { Tabs, Badge, Space } from 'antd';
import {
  ThunderboltOutlined,
  ApiOutlined,
  OrderedListOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { LlmOperationTab } from '../llm-operations/components/LlmOperationTab';

export type SkillAdminTabKey = 'builtin' | 'custom' | 'llm' | 'all';

interface SkillAdminTabsProps {
  activeKey: SkillAdminTabKey;
  onTabChange: (key: SkillAdminTabKey) => void;
  builtinSkillsCount: number;
  customSkillsCount: number;
  allSkillsCount: number;
  children: React.ReactNode;
}

export function SkillAdminTabs({
  activeKey,
  onTabChange,
  builtinSkillsCount,
  customSkillsCount,
  allSkillsCount,
  children,
}: SkillAdminTabsProps) {
  return (
    <>
      <Tabs
        activeKey={activeKey}
        onChange={(key) => onTabChange(key as SkillAdminTabKey)}
        items={[
          {
            key: 'builtin',
            label: (
              <Space>
                <ThunderboltOutlined />
                <span>内置 Skill</span>
                <Badge
                  count={builtinSkillsCount}
                  overflowCount={999}
                  style={{
                    backgroundColor: activeKey === 'builtin' ? '#10b981' : 'var(--text-light)',
                  }}
                />
              </Space>
            ),
          },
          {
            key: 'custom',
            label: (
              <Space>
                <ApiOutlined />
                <span>自定义 Skill</span>
                <Badge
                  count={customSkillsCount}
                  overflowCount={999}
                  style={{
                    backgroundColor: activeKey === 'custom' ? '#8b5cf6' : 'var(--text-light)',
                  }}
                />
              </Space>
            ),
          },
          {
            key: 'llm',
            label: (
              <Space>
                <BulbOutlined />
                <span>LLM 能力</span>
              </Space>
            ),
            children: <LlmOperationTab />,
          },
          {
            key: 'all',
            label: (
              <Space>
                <OrderedListOutlined />
                <span>全部 Skill</span>
                <Badge
                  count={allSkillsCount}
                  overflowCount={999}
                  style={{
                    backgroundColor:
                      activeKey === 'all' ? 'var(--primary-color)' : 'var(--text-light)',
                  }}
                />
              </Space>
            ),
          },
        ]}
        style={{ marginBottom: 16 }}
      />

      {activeKey !== 'llm' && children}
    </>
  );
}