import React from 'react';
import { Card, Collapse, Descriptions, Space, Typography } from 'antd';

const { Panel } = Collapse;
const { Text } = Typography;

interface TemplateConfigTabProps {
  config: Record<string, unknown>;
  jsonBlockStyle: React.CSSProperties;
  scriptBlockStyle: React.CSSProperties;
}

const TemplateConfigTab: React.FC<TemplateConfigTabProps> = ({
  config,
  jsonBlockStyle,
  scriptBlockStyle,
}) => {
  const exportedScript = typeof config.script === 'string' ? config.script : '';
  const exportedOutputs = Array.isArray(config.outputs)
    ? (config.outputs as Array<Record<string, unknown>>)
    : [];
  const exportedSkillDraft =
    config.skillDraft && typeof config.skillDraft === 'object'
      ? (config.skillDraft as Record<string, unknown>)
      : null;

  return (
    <>
      {(exportedScript || exportedOutputs.length > 0 || exportedSkillDraft) && (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }} size="middle">
          {exportedScript && (
            <Card size="small" title="JS 脚本">
              <Collapse ghost defaultActiveKey={[]}>
                <Panel header="展开查看 JS 脚本" key="script">
                  <pre style={scriptBlockStyle}>{exportedScript}</pre>
                </Panel>
              </Collapse>
            </Card>
          )}
          {exportedOutputs.length > 0 && (
            <Card size="small" title="输出内容">
              <Descriptions column={1} size="small" bordered>
                {exportedOutputs.map((output, index) => (
                  <Descriptions.Item
                    key={`${index}-${String(output.name || 'output')}`}
                    label={String(output.name || `output_${index + 1}`)}
                  >
                    <div>{String(output.description || '-')}</div>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary">位置: {String(output.location || '-')}</Text>
                    </div>
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </Card>
          )}
          {exportedSkillDraft && (
            <Card size="small" title="Skill 草稿">
              <pre style={jsonBlockStyle}>{JSON.stringify(exportedSkillDraft, null, 2)}</pre>
            </Card>
          )}
        </Space>
      )}
      <pre style={jsonBlockStyle}>{JSON.stringify(config, null, 2)}</pre>
    </>
  );
};

export default TemplateConfigTab;
