import { Alert, Card, Col, Empty, Progress, Row, Statistic, Table, Tag, Typography } from 'antd';
import React from 'react';
import type { HabitLearningOverview } from '@/api/habitLearning';

const { Text, Paragraph } = Typography;

export const reasonLabels: Record<string, { label: string; desc: string; isSafetyTrigger?: boolean }> = {
  unsafe_or_unexpected_side_effect: {
    label: '不安全或意外副作用',
    desc: '执行产生了非预期的写操作/消息发送（触发系统自动挂起安全熔断）',
    isSafetyTrigger: true,
  },
  wrong_skill_or_workflow: {
    label: '匹配错技能或工作流',
    desc: '意图识别偏差，路由到了不相干的能力',
  },
  wrong_parameters: {
    label: '参数或默认值错误',
    desc: '提取的参数槽位错误或默认值不符合预期',
  },
  missing_step: {
    label: '缺少执行步骤',
    desc: '工作流拆解不完整，漏掉了关键处理环节',
  },
  answer_incorrect: {
    label: '回答内容不正确',
    desc: '最终大模型总结或生成的结果内容有误',
  },
  execution_failed: {
    label: '执行失败',
    desc: '工具调用超时、接口报错或运行中断',
  },
  wrong_output_format: {
    label: '输出格式不符合预期',
    desc: '未按要求的 Markdown、表格或特定文件格式输出',
  },
  other: {
    label: '其他原因',
    desc: '用户自填的其他反馈原因',
  },
};

interface Props {
  overview?: HabitLearningOverview;
  loading: boolean;
}

export const HabitFeedbackPanel: React.FC<Props> = ({ overview, loading }) => {
  const feedback = overview?.feedback;
  const total = feedback?.total || 0;
  const positive = feedback?.positive || 0;
  const negative = feedback?.negative || 0;
  const positiveRate = total > 0 ? Math.round((positive / total) * 100) : 100;
  const reasons = feedback?.negativeReasons || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部评价大盘 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" hoverable>
            <Statistic title="收到评价总量" value={total} suffix="次" />
            <Text type="secondary" style={{ fontSize: 12 }}>来自用户端各任务结果反馈</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" hoverable>
            <Statistic
              title="正向好评 (点赞)"
              value={positive}
              valueStyle={{ color: '#3f8600' }}
              prefix="👍"
              suffix={`(${positiveRate}%)`}
            />
            <Progress percent={positiveRate} size="small" strokeColor="#52c41a" showInfo={false} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" hoverable>
            <Statistic
              title="负向反馈 (点踩)"
              value={negative}
              valueStyle={{ color: negative > 0 ? '#cf1322' : '#8c8c8c' }}
              prefix="👎"
              suffix={total > 0 ? `(${100 - positiveRate}%)` : '(0%)'}
            />
            <Progress percent={100 - positiveRate} size="small" strokeColor="#ff4d4f" showInfo={false} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" hoverable>
            <Statistic
              title="安全熔断机制"
              value={overview?.habitLearning?.activationEnabled ? '自动守卫中' : '已暂停'}
              valueStyle={{ color: '#1677ff', fontSize: 18 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>点踩副作用即时 Auto-Hold 习惯</Text>
          </Card>
        </Col>
      </Row>

      {/* 下方两栏：左侧原因列表，右侧安全联动机制说明 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title={<span>负向点踩原因细分 {reasons.length > 0 && <Tag color="error">{reasons.length} 类问题</Tag>}</span>}
            size="small"
          >
            {reasons.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <Paragraph strong style={{ marginBottom: 4 }}>暂无用户负向点踩数据</Paragraph>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {positive > 0
                        ? `当前已有 ${positive} 次点赞好评，流程未收到任何点踩举报，整体运行状态良好。`
                        : '当用户在工作台对执行结果点击“点踩”并勾选具体原因时，这里将实时聚类呈现。'}
                    </Text>
                  </div>
                }
              />
            ) : (
              <Table
                rowKey="reasonCode"
                loading={loading}
                pagination={false}
                size="small"
                dataSource={reasons}
                columns={[
                  {
                    title: '问题分类',
                    dataIndex: 'reasonCode',
                    render: (code: string) => {
                      const item = reasonLabels[code];
                      return (
                        <div>
                          <Text strong>{item?.label || code}</Text>
                          {item?.isSafetyTrigger && (
                            <Tag color="volcano" style={{ marginLeft: 8 }}>🚨 触发自动挂起</Tag>
                          )}
                          <div style={{ fontSize: 12, color: '#8c8c8c' }}>{item?.desc || '-'}</div>
                        </div>
                      );
                    },
                  },
                  {
                    title: '次数',
                    dataIndex: 'count',
                    width: 90,
                    align: 'right',
                    render: (cnt: number) => <Tag color="red">{cnt} 次</Tag>,
                  },
                ]}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="🛡️ 评价与习惯学习的安全闭环机制" size="small">
            <Alert
              showIcon
              type="info"
              message="即时熔断联动规则"
              description="用户点赞用于积累正向置信度；一旦用户对某次执行点击【点踩】且原因为【不安全或意外副作用】，控制面将立即触发事务级 Auto-Hold，将对应用户的该习惯立刻挂起，防止下一次再次盲目直通！"
              style={{ marginBottom: 12 }}
            />
            <div style={{ fontSize: 13, lineHeight: '22px', color: '#595959' }}>
              <p><b>为什么评价分析平常可能是空的？</b></p>
              <ul>
                <li>普通点赞 👍 仅计入健康度大盘，不产生负向报警；</li>
                <li>只有当用户在聊天会话中主动点击 👎 并勾选了具体的原因标签时，系统才会将其归类入库；</li>
                <li>如果表格为空，表明在统计窗口内**尚未发生过用户明确上报的执行事故**。</li>
              </ul>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};
