import React from 'react';
import { Row, Col, Card, Typography, Tag, Space, Descriptions } from 'antd';
import type { CapabilityReleaseDetail } from '@/api/capabilities';

const { Text, Paragraph } = Typography;

export interface CapabilityStudioTabContentProps {
  selectedDetail: CapabilityReleaseDetail;
}

export const CapabilityStudioTabContent: React.FC<CapabilityStudioTabContentProps> = ({
  selectedDetail,
}) => {
  const currentDraft = selectedDetail.currentSkillDraft;

  if (!currentDraft) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Text type="secondary">当前 Release 尚未生成 Skill 草案与设计定义</Text>
      </div>
    );
  }

  const triggerKeywords = (currentDraft.triggerKeywords as string[]) || [];
  const paramsSchema = currentDraft.paramsSchema || {};
  const apiEndpoints = currentDraft.apiEndpoints || {};

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card size="small" title="Skill 设计基本定义" style={{ borderRadius: 10 }}>
          <Descriptions column={3} size="small">
            <Descriptions.Item label="Skill 名称">{currentDraft.name}</Descriptions.Item>
            <Descriptions.Item label="源类型">{selectedDetail.release.sourceType}</Descriptions.Item>
            <Descriptions.Item label="描述">{currentDraft.description || '-'}</Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>

      <Col span={12}>
        <Card size="small" title="触发词 (Trigger Keywords)" style={{ borderRadius: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {triggerKeywords.length > 0 ? (
              triggerKeywords.map((kw, i) => (
                <Tag key={i} color="blue">
                  {kw}
                </Tag>
              ))
            ) : (
              <Text type="secondary">无明确触发词</Text>
            )}
          </div>
        </Card>
      </Col>

      <Col span={12}>
        <Card size="small" title="包含工具与绑定" style={{ borderRadius: 10 }}>
          <Space wrap>
            {(currentDraft.tools as string[])?.map((tool, i) => (
              <Tag key={i} color="purple">
                {tool}
              </Tag>
            )) || <Text type="secondary">无额外工具绑定</Text>}
          </Space>
        </Card>
      </Col>

      <Col span={24}>
        <Card size="small" title="参数 Schema 定义 (paramsSchema)" style={{ borderRadius: 10 }}>
          <Paragraph code style={{ margin: 0, maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
            {JSON.stringify(paramsSchema, null, 2)}
          </Paragraph>
        </Card>
      </Col>

      <Col span={24}>
        <Card size="small" title="API Endpoints 定义" style={{ borderRadius: 10 }}>
          <Paragraph code style={{ margin: 0, maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
            {JSON.stringify(apiEndpoints, null, 2)}
          </Paragraph>
        </Card>
      </Col>
    </Row>
  );
};
