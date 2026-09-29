import React, { useState } from 'react';
import {
  Modal,
  Button,
  Space,
  Typography,
  Radio,
  Card,
  Tag,
  Alert,
  List,
  Spin,
  Empty,
  Divider,
} from 'antd';
import {
  DeploymentUnitOutlined,
  ThunderboltOutlined,
  AimOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import {
  CompiledRoutingProfileDTO,
  skillApi,
} from '@/api/skill';

const { Text } = Typography;

interface SkillRoutingCompileModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SkillRoutingCompileModal: React.FC<SkillRoutingCompileModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [compilationMode, setCompilationMode] = useState<'deterministic' | 'ai'>('deterministic');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compiledProfiles, setCompiledProfiles] = useState<CompiledRoutingProfileDTO[] | null>(null);

  const handleStartCompile = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await skillApi.compileRouting({
        useAi: compilationMode === 'ai',
      });
      setCompiledProfiles(response.compiled || []);
      onSuccess?.();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '路由特征编译执行失败';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setError(null);
    onClose();
  };

  return (
    <Modal
      title={
        <Space align="center">
          <DeploymentUnitOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <span>对比式技能路由特征编译器</span>
        </Space>
      }
      open={open}
      onCancel={handleResetAndClose}
      width={780}
      footer={[
        <Button key="close" onClick={handleResetAndClose}>
          关闭
        </Button>,
        <Button
          key="compile"
          type="primary"
          icon={<ThunderboltOutlined />}
          loading={loading}
          onClick={handleStartCompile}
        >
          {compiledProfiles ? '重新编译' : '立即触发编译'}
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Alert
          message="手控企业环境高精度意图识别体系"
          description="系统会在技能变更、权限授予或系统启动时自动进行增量编译，也可在此手动全量重算。编译器会对比技能池中的全部技能语料，剥离共享的无辨识度词汇，提炼出正向特征锚点（Positive Anchors）与负向安全防误触边界（Negative Boundaries），以 0 Token 消耗与零副作用精准拦截非执行类咨询并匹配目标企业技能。"
          type="info"
          showIcon
        />

        <Card size="small" title="编译模式设定">
          <Radio.Group
            value={compilationMode}
            onChange={(e) => setCompilationMode(e.target.value)}
            disabled={loading}
          >
            <Space direction="vertical">
              <Radio value="deterministic">
                <Space>
                  <Text strong>快速确定性编译（推荐）</Text>
                  <Tag color="green">0 Token 消耗</Tag>
                  <Tag color="blue">毫秒级就绪</Tag>
                </Space>
                <div style={{ paddingLeft: 24, fontSize: 12, color: 'var(--text-secondary)' }}>
                  基于 TF-IDF 对比特征提取与通用问答防御词库，极速剔除冲突词并生成安全隔离边界。
                </div>
              </Radio>
              <Radio value="ai">
                <Space>
                  <Text strong>AI 语义增强编译</Text>
                  <Tag color="purple">深度语义推断</Tag>
                </Space>
                <div style={{ paddingLeft: 24, fontSize: 12, color: 'var(--text-secondary)' }}>
                  针对复杂近义词与模糊跨系统场景，调用大模型对技能边界与负向排斥项进行增强推断。
                </div>
              </Radio>
            </Space>
          </Radio.Group>
        </Card>

        {error && (
          <Alert message="编译失败" description={error} type="error" showIcon closable />
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '36px 0' }}>
            <Spin tip="正在对技能池执行对比式特征分析与边界抽取..." size="large">
              <div style={{ height: 48 }} />
            </Spin>
          </div>
        )}

        {!loading && compiledProfiles && (
          <div>
            <Divider orientation="left" style={{ margin: '12px 0' }}>
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <span>编译结果（共处理 {compiledProfiles.length} 个技能）</span>
              </Space>
            </Divider>

            {compiledProfiles.length === 0 ? (
              <Empty description="当前没有可编译的有效技能" />
            ) : (
              <List
                dataSource={compiledProfiles}
                pagination={{ pageSize: 5, size: 'small' }}
                renderItem={(profile) => (
                  <List.Item key={profile.skillId}>
                    <Card
                      size="small"
                      style={{ width: '100%' }}
                      title={
                        <Space>
                          <Text strong>{profile.skillName}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            (ID: {profile.skillId.slice(0, 8)}...)
                          </Text>
                        </Space>
                      }
                    >
                      <Space direction="vertical" style={{ width: '100%' }} size={8}>
                        <div>
                          <Space align="center" style={{ marginBottom: 4 }}>
                            <AimOutlined style={{ color: '#52c41a' }} />
                            <Text strong style={{ fontSize: 13, color: '#389e0d' }}>
                              正向特征锚点 ({profile.positiveSignals?.length || 0})：
                            </Text>
                          </Space>
                          <div style={{ marginLeft: 20 }}>
                            {profile.positiveSignals && profile.positiveSignals.length > 0 ? (
                              <Space wrap size={[4, 6]}>
                                {profile.positiveSignals.map((sig, idx) => (
                                  <Tag color="success" key={idx}>
                                    {sig}
                                  </Tag>
                                ))}
                              </Space>
                            ) : (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                无显著正向锚点
                              </Text>
                            )}
                          </div>
                        </div>

                        <div>
                          <Space align="center" style={{ marginBottom: 4 }}>
                            <StopOutlined style={{ color: '#f5222d' }} />
                            <Text strong style={{ fontSize: 13, color: '#cf1322' }}>
                              负向防碰撞边界 ({profile.negativeSignals?.length || 0})：
                            </Text>
                          </Space>
                          <div style={{ marginLeft: 20 }}>
                            {profile.negativeSignals && profile.negativeSignals.length > 0 ? (
                              <Space wrap size={[4, 6]}>
                                {profile.negativeSignals.map((neg, idx) => (
                                  <Tag color="error" key={idx}>
                                    {neg}
                                  </Tag>
                                ))}
                              </Space>
                            ) : (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                无负向安全边界
                              </Text>
                            )}
                          </div>
                        </div>
                      </Space>
                    </Card>
                  </List.Item>
                )}
              />
            )}
          </div>
        )}
      </Space>
    </Modal>
  );
};
