import {
  Alert,
  Badge,
  Button,
  Card,
  Descriptions,
  Modal,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import {
  CodeOutlined,
  NodeIndexOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { HabitCandidate } from '@/api/habitLearning';
import { formatRiskLevel, formatHabitStatus } from './HabitCandidateCard';

const { Text } = Typography;

interface HabitDetailModalProps {
  candidate: HabitCandidate | null;
  open: boolean;
  onClose: () => void;
}

export const HabitDetailModal: React.FC<HabitDetailModalProps> = ({
  candidate,
  open,
  onClose,
}) => {
  if (!candidate) return null;

  const riskInfo = formatRiskLevel(candidate.riskLevel);
  const statusInfo = formatHabitStatus(candidate.status);
  const nodes = candidate.planSnapshot?.nodes || [];
  const review = candidate.reviewJson || {};
  const evidence = candidate.evidenceJson || {};

  const isReviewPass = review.decision === 'pass';

  const tabItems = [
    {
      key: 'overview',
      label: (
        <span>
          <NodeIndexOutlined style={{ marginRight: 6 }} />
          基本属性与执行流
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 基本信息表格 */}
          <Descriptions
            bordered
            column={{ xs: 1, sm: 2 }}
            size="small"
            style={{ background: 'var(--bg-card)' }}
          >
            <Descriptions.Item label="工作流名称">
              <Text strong style={{ color: 'var(--text-primary)' }}>
                {candidate.workflowName || '-'}
              </Text>
              {candidate.savedVersion && (
                <Tag style={{ marginLeft: 6, borderRadius: 10 }}>
                  v{candidate.savedVersion}
                </Tag>
              )}
            </Descriptions.Item>

            <Descriptions.Item label="当前状态">
              <Tag color={statusInfo.color} style={{ borderRadius: 10 }}>
                {statusInfo.icon} {statusInfo.badgeText}
              </Tag>
            </Descriptions.Item>

            <Descriptions.Item label="🎯 触发口令 (intentKey)" span={2}>
              <Tag
                color="geekblue"
                style={{
                  fontSize: 13,
                  padding: '2px 10px',
                  borderRadius: 6,
                  fontFamily: 'monospace',
                }}
              >
                {candidate.intentKey || '-'}
              </Tag>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                (用户输入命中该意图时，无需 LLM 规划即可直接调度执行)
              </Text>
            </Descriptions.Item>

            <Descriptions.Item label="所属私有用户">
              <code>{candidate.userKey}</code>
            </Descriptions.Item>

            <Descriptions.Item label="风险评级">
              <Tag color={riskInfo.color} style={{ borderRadius: 10 }}>
                {riskInfo.icon} {riskInfo.text}
              </Tag>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                {riskInfo.tooltip}
              </Text>
            </Descriptions.Item>

            <Descriptions.Item label="沉淀机制">
              <Tag color="purple">用户显式保存工作流 ➔ AI 自动审查直通</Tag>
            </Descriptions.Item>

            <Descriptions.Item label="创建时间">
              {new Date(candidate.createdAt).toLocaleString()}
            </Descriptions.Item>
          </Descriptions>

          {/* 流程拓扑步骤 */}
          <Card
            size="small"
            title={
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                ⚡ 流程步骤链拓扑 (共 {nodes.length > 0 ? nodes.length : 1} 个节点)
              </span>
            }
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
            }}
          >
            {nodes.length > 0 ? (
              <Timeline
                style={{ marginTop: 12 }}
                items={nodes.map((node, idx) => ({
                  color: 'blue',
                  children: (
                    <div style={{ paddingBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag color="cyan" style={{ margin: 0, fontWeight: 600 }}>
                          步骤 {idx + 1}
                        </Tag>
                        <Text strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>
                          {node.title || node.skillId || `节点 ${node.nodeId || idx + 1}`}
                        </Text>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          marginTop: 4,
                          display: 'flex',
                          gap: 12,
                        }}
                      >
                        {node.skillId && <span>执行技能: <code>{node.skillId}</code></span>}
                        {node.capabilityKey && (
                          <span>原子能力: <code>{node.capabilityKey}</code></span>
                        )}
                        {node.dependsOn && node.dependsOn.length > 0 && (
                          <span>前置依赖: {node.dependsOn.join(', ')}</span>
                        )}
                      </div>
                    </div>
                  ),
                }))}
              />
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '8px 0' }}>
                已保存工作流标准执行拓扑（版本 v{candidate.savedVersion || 1}）
              </div>
            )}
          </Card>
        </div>
      ),
    },
    {
      key: 'ai-review',
      label: (
        <span>
          <RobotOutlined style={{ marginRight: 6 }} />
          AI 安全审查详情
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* AI 审查结论横幅 */}
          <Alert
            showIcon
            type={isReviewPass ? 'success' : 'warning'}
            message={
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                AI 审查决策：{isReviewPass ? '审查通过 (Pass) · 准予 0-Token 直通' : String(review.decision || '待复核')}
              </span>
            }
            description={
              <div style={{ marginTop: 4, fontSize: 13 }}>
                {typeof review.summary === 'string'
                  ? review.summary
                  : isReviewPass
                  ? '该习惯源自用户已验证并保存的私有工作流，经由模型安全评估判定无未授权风险与副作用，允许免大模型规划 0-Token 极速直通。'
                  : '尚未通过全自动安全合规审查，需管理员人工核查后方可生效。'}
              </div>
            }
          />

          {/* 审查关键指标与判定依据 */}
          <Descriptions
            bordered
            column={2}
            size="small"
            style={{ background: 'var(--bg-card)' }}
          >
            <Descriptions.Item label="审查结论 (Decision)">
              <Badge
                status={isReviewPass ? 'success' : 'warning'}
                text={isReviewPass ? '通过 (Pass)' : String(review.decision || '未通过')}
              />
            </Descriptions.Item>

            <Descriptions.Item label="版本一致性检查">
              <Tag color={review.reusedExactVersionReview ? 'green' : 'default'}>
                {review.reusedExactVersionReview ? '✓ 复用已审查精确版本' : '实时模型审查'}
              </Tag>
            </Descriptions.Item>

            <Descriptions.Item label="拓扑是否发生变更">
              <Tag color={review.planChanged === false ? 'blue' : 'orange'}>
                {review.planChanged === false ? '未变更 (确定性保证)' : '拓扑有变化'}
              </Tag>
            </Descriptions.Item>

            <Descriptions.Item label="外部写操作风险">
              <Tag color={riskInfo.color}>{riskInfo.text}</Tag>
            </Descriptions.Item>
          </Descriptions>

          {/* 审查 JSON 原始报文 */}
          <Card
            size="small"
            title={
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                <CodeOutlined style={{ marginRight: 6 }} />
                AI 审查结构化数据 (reviewJson)
              </span>
            }
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
            }}
          >
            <pre
              style={{
                margin: 0,
                maxHeight: 220,
                overflow: 'auto',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                padding: 10,
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'monospace',
                border: '1px solid var(--border-color)',
              }}
            >
              {JSON.stringify(review, null, 2)}
            </pre>
          </Card>
        </div>
      ),
    },
    {
      key: 'evidence',
      label: (
        <span>
          <SafetyCertificateOutlined style={{ marginRight: 6 }} />
          审计证据与排查数据
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Descriptions
            bordered
            column={2}
            size="small"
            style={{ background: 'var(--bg-card)' }}
          >
            <Descriptions.Item label="候选记录 ID" span={2}>
              <code>{candidate.id}</code>
            </Descriptions.Item>
            <Descriptions.Item label="关联工作流 ID">
              <code>{evidence.savedSkillId as string || '-'}</code>
            </Descriptions.Item>
            <Descriptions.Item label="工作流版本">
              v{candidate.savedVersion || 1}
            </Descriptions.Item>
            <Descriptions.Item label="执行计划哈希 (planHash)" span={2}>
              <code style={{ wordBreak: 'break-all' }}>
                {(evidence.planHash as string) || '-'}
              </code>
            </Descriptions.Item>
          </Descriptions>

          <Card
            size="small"
            title={
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                <CodeOutlined style={{ marginRight: 6 }} />
                原始证据链 (evidenceJson)
              </span>
            }
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
            }}
          >
            <pre
              style={{
                margin: 0,
                maxHeight: 220,
                overflow: 'auto',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                padding: 10,
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'monospace',
                border: '1px solid var(--border-color)',
              }}
            >
              {JSON.stringify(evidence, null, 2)}
            </pre>
          </Card>
        </div>
      ),
    },
  ];

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThunderboltOutlined style={{ color: '#1677ff' }} />
          <span>习惯详情 · {candidate.workflowName || candidate.intentKey}</span>
          {candidate.savedVersion && (
            <Tag style={{ borderRadius: 10, fontSize: 11 }}>v{candidate.savedVersion}</Tag>
          )}
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          完成
        </Button>,
      ]}
      width={780}
      styles={{
        body: { maxHeight: '72vh', overflowY: 'auto', paddingRight: 4 },
      }}
    >
      <Tabs defaultActiveKey="overview" items={tabItems} style={{ marginTop: 8 }} />
    </Modal>
  );
};
