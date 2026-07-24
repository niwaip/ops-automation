import React from 'react';
import { Row, Col, Card, Button, Tooltip, Space } from 'antd';
import {
  SafetyCertificateOutlined,
  RocketOutlined,
  AppstoreAddOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import type { CapabilityReleaseDetail } from '@/api/capabilities';

export interface CapabilityDetailActionCardsProps {
  selectedDetail: CapabilityReleaseDetail;
  onValidateStatic: (id: string) => void;
  validateStaticLoading: boolean;
  onOpenDeployModal: (id: string) => void;
  hasExecutableCode: boolean;
  onPublishSkill: (release: CapabilityReleaseDetail['release']) => void;
  publishLoading: boolean;
  onValidateSkill: (skillId: string) => void;
  validateSkillLoading: boolean;
  onOpenRealValidate: (id: string) => void;
}

export const CapabilityDetailActionCards: React.FC<CapabilityDetailActionCardsProps> = ({
  selectedDetail,
  onValidateStatic,
  validateStaticLoading,
  onOpenDeployModal,
  hasExecutableCode,
  onPublishSkill,
  publishLoading,
  onValidateSkill,
  validateSkillLoading,
  onOpenRealValidate,
}) => {
  const release = selectedDetail.release;

  return (
    <Row gutter={[12, 12]}>
      <Col span={6} style={{ display: 'flex' }}>
        <Card
          size="small"
          hoverable
          style={{ textAlign: 'center', width: '100%', borderRadius: 10 }}
          styles={{
            body: {
              minHeight: 120,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            },
          }}
        >
          <SafetyCertificateOutlined
            style={{ fontSize: 24, color: 'var(--primary-color)', marginBottom: 8 }}
          />
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>1. 检查</div>
          <Button
            type="primary"
            size="small"
            ghost
            loading={validateStaticLoading}
            onClick={() => onValidateStatic(release.id)}
          >
            静态校验
          </Button>
        </Card>
      </Col>

      <Col span={6} style={{ display: 'flex' }}>
        <Card
          size="small"
          hoverable
          style={{ textAlign: 'center', width: '100%', borderRadius: 10 }}
          styles={{
            body: {
              minHeight: 120,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            },
          }}
        >
          <RocketOutlined style={{ fontSize: 24, color: 'var(--success-color)', marginBottom: 8 }} />
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>2. 重新部署</div>
          <Button
            type="primary"
            size="small"
            ghost
            disabled={!hasExecutableCode}
            onClick={() => onOpenDeployModal(release.id)}
          >
            代码部署
          </Button>
        </Card>
      </Col>

      <Col span={6} style={{ display: 'flex' }}>
        <Card
          size="small"
          hoverable
          style={{ textAlign: 'center', width: '100%', borderRadius: 10 }}
          styles={{
            body: {
              minHeight: 120,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            },
          }}
        >
          <AppstoreAddOutlined
            style={{ fontSize: 24, color: 'var(--accent-color)', marginBottom: 8 }}
          />
          <Tooltip title="将当前 Release 的设计发布到 Skill Center。">
            <div style={{ fontWeight: 'bold', marginBottom: 6, cursor: 'help' }}>
              3. 发布 Skill <QuestionCircleOutlined style={{ fontSize: 11 }} />
            </div>
          </Tooltip>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Button
              type="primary"
              size="small"
              ghost
              loading={publishLoading}
              onClick={() => onPublishSkill(release)}
            >
              发布 Skill
            </Button>
            <Button
              size="small"
              type="link"
              disabled={!release.publishedSkillId}
              loading={validateSkillLoading}
              onClick={() =>
                release.publishedSkillId ? onValidateSkill(release.publishedSkillId) : undefined
              }
              style={{ fontSize: 11, padding: 0 }}
            >
              质量评估 (AI 模拟)
            </Button>
          </Space>
        </Card>
      </Col>

      <Col span={6} style={{ display: 'flex' }}>
        <Card
          size="small"
          hoverable
          style={{ textAlign: 'center', width: '100%', borderRadius: 10 }}
          styles={{
            body: {
              minHeight: 120,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            },
          }}
        >
          <CheckCircleOutlined
            style={{ fontSize: 24, color: 'var(--warning-color)', marginBottom: 8 }}
          />
          <Tooltip title="执行真实校验用例，验证代码逻辑与集成环境。">
            <div style={{ fontWeight: 'bold', marginBottom: 6, cursor: 'help' }}>
              4. 验证 <QuestionCircleOutlined style={{ fontSize: 11 }} />
            </div>
          </Tooltip>
          <Button
            type="primary"
            size="small"
            ghost
            onClick={() => onOpenRealValidate(release.id)}
          >
            真实校验
          </Button>
        </Card>
      </Col>
    </Row>
  );
};
