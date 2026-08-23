import { Card, Col, Row, Statistic } from 'antd';
import React from 'react';
import type { HabitLearningOverview, HabitLearningStatus } from '@/api/habitLearning';

interface Props {
  overview?: HabitLearningOverview;
  status?: HabitLearningStatus;
}

export const HabitStatusCards: React.FC<Props> = ({ overview, status }) => (
  <Row gutter={[16, 16]}>
    <Col xs={24} sm={12} lg={6}>
      <Card><Statistic title="当前评价" value={overview?.feedback.total ?? 0} /></Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card><Statistic title="正向评价" value={overview?.feedback.positive ?? 0} valueStyle={{ color: '#3f8600' }} /></Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card><Statistic title="候选习惯" value={status?.candidateCounts.candidate ?? 0} /></Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card><Statistic title="生效习惯" value={status?.habitCounts.active ?? 0} valueStyle={{ color: '#1677ff' }} /></Card>
    </Col>
  </Row>
);

