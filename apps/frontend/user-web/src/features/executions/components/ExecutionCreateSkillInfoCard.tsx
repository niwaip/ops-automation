import React from 'react';
import { Collapse, Descriptions, Empty, Space, Spin, Tag, Typography } from 'antd';
import type { SkillConfigDTO } from '@/api/skill';
import ExecutionCreatePanelCard from '@/features/executions/components/ExecutionCreatePanelCard';

const { Panel } = Collapse;
const { Text } = Typography;

interface ExecutionCreateSkillInfoCardProps {
  selectedSkillId?: string;
  selectedSkillDisplayName: string;
  selectedSkill?: SkillConfigDTO;
  skillLoading: boolean;
  loadingIndicator: React.ReactElement;
}

const ExecutionCreateSkillInfoCard: React.FC<ExecutionCreateSkillInfoCardProps> = ({
  selectedSkillId,
  selectedSkillDisplayName,
  selectedSkill,
  skillLoading,
  loadingIndicator,
}) => {
  return (
    <ExecutionCreatePanelCard title="技能信息" styles={{ body: { padding: 0 } }}>
      <Collapse ghost defaultActiveKey={[]}>
        <Panel
          header={
            <Space wrap size={8}>
              <Text strong>技能信息</Text>
              {selectedSkillId ? <Tag>{selectedSkillDisplayName}</Tag> : null}
            </Space>
          }
          key="skill-info"
        >
          <div style={{ padding: '0 16px 16px' }}>
            {selectedSkill ? (
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="名称">{selectedSkillDisplayName}</Descriptions.Item>
                <Descriptions.Item label="技能标识">{selectedSkill.id}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={selectedSkill.isActive ? 'green' : 'default'}>
                    {selectedSkill.isActive ? 'active' : 'inactive'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="描述">
                  {selectedSkill.description || <Text type="secondary">暂无描述</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="工具">
                  <Space wrap>
                    {(selectedSkill.tools || []).length > 0 ? (
                      selectedSkill.tools.map((tool) => (
                        <Tag key={tool} color="purple">
                          {tool}
                        </Tag>
                      ))
                    ) : (
                      <Text type="secondary">无</Text>
                    )}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            ) : selectedSkillId && skillLoading ? (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <Spin indicator={loadingIndicator} tip="正在加载技能信息..." />
              </div>
            ) : (
              <Empty description="选择技能后可查看说明" />
            )}
          </div>
        </Panel>
      </Collapse>
    </ExecutionCreatePanelCard>
  );
};

export default ExecutionCreateSkillInfoCard;
