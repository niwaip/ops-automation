import React from 'react';
import {
  Collapse,
  Descriptions,
  Tag,
  Typography,
  Space,
  Alert,
  Tabs,
  Card,
  Steps,
} from 'antd';
import {
  InfoCircleOutlined,
  ApiOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { SkillConfigDTO } from '@/api/skill';
import { STEP_TYPES } from '../utils/skillHelpers';

const { Text } = Typography;
const { Panel } = Collapse;
const { TabPane } = Tabs;

interface SkillDetailContentProps {
  skill: SkillConfigDTO;
  embedded?: boolean;
}

export const SkillDetailContent: React.FC<SkillDetailContentProps> = ({
  skill,
  embedded = false,
}) => {
  const renderExecutionFlow = (flow: any[]) => {
    if (!flow || flow.length === 0) return <Text type="secondary">未配置</Text>;

    return (
      <Steps
        size="small"
        direction="vertical"
        current={-1}
        items={flow.map((step) => {
          const typeInfo = STEP_TYPES.find((t) => t.value === step.type) || {
            label: step.type,
            icon: <SettingOutlined />,
            color: 'default',
          };
          return {
            title: (
              <Space>
                <Tag color={typeInfo.color}>{typeInfo.label}</Tag>
                <Text strong>{step.name}</Text>
              </Space>
            ),
            description: (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {step.content ||
                  step.api?.endpoint ||
                  step.tool?.name ||
                  step.script?.language ||
                  '无详情'}
              </div>
            ),
            status: 'wait',
            icon: typeInfo.icon,
          };
        })}
      />
    );
  };

  const renderApiEndpoints = (endpoints: SkillConfigDTO['apiEndpoints']) => {
    if (!endpoints) return <Text type="secondary">未配置</Text>;

    return (
      <Space direction="vertical" size="small">
        {endpoints.render && (
          <Tag color="blue" icon={<ApiOutlined />}>
            文档渲染: {endpoints.render.url}
          </Tag>
        )}
        {endpoints.getSkill && (
          <Tag color="purple" icon={<InfoCircleOutlined />}>
            获取技能: {endpoints.getSkill.url}
          </Tag>
        )}
      </Space>
    );
  };

  return (
    <Collapse defaultActiveKey={['basic', 'flow', 'params']} ghost={embedded}>
      <Panel header="基本信息" key="basic">
        <Descriptions bordered={!embedded} size="small" column={embedded ? 1 : 2}>
          <Descriptions.Item label="技能ID">{skill.id}</Descriptions.Item>
          <Descriptions.Item label="描述" span={embedded ? 1 : 2}>
            {skill.description}
          </Descriptions.Item>
          <Descriptions.Item label="公开状态">
            <Tag color={skill.isPublished ? 'success' : 'default'}>
              {skill.isPublished ? '已公开可执行' : '仅系统定义'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="公开来源">
            {skill.publishedSourceType || <Text type="secondary">未公开</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="关联 Release">
            {skill.publishedReleaseId || <Text type="secondary">未公开</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="部署状态">
            {skill.publishedDeploymentStatus || <Text type="secondary">未公开</Text>}
          </Descriptions.Item>
          {skill.builtinMetadata ? (
            <>
              <Descriptions.Item label="能力键">
                {skill.builtinMetadata.capabilityKey}
              </Descriptions.Item>
              <Descriptions.Item label="当前版本">
                {skill.builtinMetadata.activeVersion || <Text type="secondary">未激活</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="所有者">{skill.builtinMetadata.owner}</Descriptions.Item>
              <Descriptions.Item label="生命周期">
                {skill.builtinMetadata.lifecycle}
              </Descriptions.Item>
              <Descriptions.Item label="访问模式">
                {skill.builtinMetadata.defaultAccess}
              </Descriptions.Item>
              <Descriptions.Item label="版本数">
                {skill.builtinMetadata.versionCount}
              </Descriptions.Item>
            </>
          ) : null}
          <Descriptions.Item label="触发关键字" span={embedded ? 1 : 2}>
            <Space wrap>
              {skill.triggerKeywords?.map((kw) => (
                <Tag key={kw} color="orange">
                  {kw}
                </Tag>
              ))}
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Panel>

      <Panel header="执行流程" key="flow">
        <div style={{ padding: '8px 16px' }}>
          {skill.executionFlowTemplateIds && skill.executionFlowTemplateIds.length > 0 ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                message="此技能关联了流程模板，将按顺序执行模板步骤，随后执行手动追加的步骤"
                type="info"
                showIcon
              />
              <div style={{ marginTop: 8 }}>
                <Text strong>关联模板 ID：</Text>
                {skill.executionFlowTemplateIds.map((id) => (
                  <Tag key={id} color="blue">
                    {id}
                  </Tag>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>{renderExecutionFlow(skill.executionFlow)}</div>
            </Space>
          ) : (
            renderExecutionFlow(skill.executionFlow)
          )}
        </div>
      </Panel>

      <Panel header="参数与配置" key="params">
        <div style={{ padding: 16 }}>
          <Tabs size="small">
            <TabPane tab="参数 Schema" key="schema">
              {Object.keys(skill.paramsSchema?.properties || {}).length > 0 ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ marginBottom: 8 }}>
                    <Text strong>必填参数：</Text>
                    {skill.paramsSchema?.required.map((param) => (
                      <Tag key={param} color="red" style={{ marginLeft: 8 }}>
                        {param}
                      </Tag>
                    ))}
                  </div>
                  {Object.entries(skill.paramsSchema?.properties || {}).map(([key, value]) => (
                    <Card
                      key={key}
                      size="small"
                      style={{ marginBottom: 8 }}
                      title={
                        <Space>
                          <Text strong>{key}</Text>
                          <Tag color={value.required ? 'red' : 'default'}>
                            {value.required ? '必填' : '可选'}
                          </Tag>
                          <Tag color="processing">{value.type}</Tag>
                        </Space>
                      }
                    >
                      <Text>{value.description}</Text>
                      {value.extractionPrompt && (
                        <div style={{ marginTop: 4 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            提取提示: {value.extractionPrompt}
                          </Text>
                        </div>
                      )}
                    </Card>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">未配置参数Schema</Text>
              )}
            </TabPane>
            <TabPane tab="文档生成配置" key="carbone">
              <Descriptions bordered={!embedded} size="small" column={1}>
                <Descriptions.Item label="Carbone模板ID">
                  {skill.carboneTemplateId || <Text type="secondary">未配置</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="Carbone技能ID">
                  {skill.carboneSkillId || <Text type="secondary">未配置</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="内部模板ID">
                  {skill.templateId || <Text type="secondary">未配置</Text>}
                </Descriptions.Item>
              </Descriptions>
            </TabPane>
            <TabPane tab="API 端点" key="api">
              <Card size="small" title="运行时 API 配置" style={{ marginBottom: 16 }}>
                {renderApiEndpoints(skill.apiEndpoints)}
              </Card>
              {skill.publishedSourceType === 'temporal_workflow' && (
                <Alert
                  message="编排型能力说明"
                  description="此 Skill 由 Temporal 工作流发布，其核心逻辑由编排引擎托管。详情请参考关联的 Release 定义。"
                  type="info"
                  showIcon
                />
              )}
            </TabPane>
          </Tabs>
        </div>
      </Panel>
    </Collapse>
  );
};
