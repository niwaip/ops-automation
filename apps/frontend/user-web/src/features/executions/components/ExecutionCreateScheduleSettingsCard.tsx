import React from 'react';
import { Checkbox, Form, Input, Radio, Select, Typography } from 'antd';
import ExecutionCreatePanelCard from '@/features/executions/components/ExecutionCreatePanelCard';
import { executionCreateSubtleCardStyle } from '@/features/executions/components/executionCreateStyles';
import type { SchedulePattern } from '@/features/executions/lib/executionCreate';
import {
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  MONTH_DAY_OPTIONS,
  TIMEZONE_OPTIONS,
  WEEKDAY_OPTIONS,
} from '@/features/executions/lib/executionCreate';

const { Text } = Typography;

interface ExecutionCreateScheduleSettingsCardProps {
  schedulePattern: SchedulePattern;
}

const ExecutionCreateScheduleSettingsCard: React.FC<
  ExecutionCreateScheduleSettingsCardProps
> = ({ schedulePattern }) => {
  return (
    <ExecutionCreatePanelCard
      size="small"
      type="inner"
      style={{ marginBottom: 16 }}
      styles={{ body: { paddingTop: 16 } }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          gap: 14,
        }}
      >
        <div
          style={{
            gridColumn: '1 / -1',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
            gap: 14,
          }}
        >
          <div style={{ ...executionCreateSubtleCardStyle, padding: 14 }}>
            <Form.Item
              name="scheduleName"
              label="任务名称"
              rules={[{ required: true, message: '请输入定时任务名称' }]}
              style={{ marginBottom: 0 }}
            >
              <Input placeholder="例如：日报生成-工作日早上" />
            </Form.Item>
          </div>
          <div style={{ ...executionCreateSubtleCardStyle, padding: 14 }}>
            <Form.Item
              name="timezone"
              label="时区"
              rules={[{ required: true, message: '请选择时区' }]}
              style={{ marginBottom: 0 }}
            >
              <Select options={TIMEZONE_OPTIONS} placeholder="请选择时区" />
            </Form.Item>
          </div>
        </div>

        <div
          style={{
            gridColumn: '1 / -1',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
            gap: 14,
          }}
        >
          <div style={{ ...executionCreateSubtleCardStyle, padding: 10 }}>
            <Text
              type="secondary"
              style={{ display: 'block', fontSize: 12, marginBottom: 8 }}
            >
              执行周期
            </Text>
            <Form.Item
              name="schedulePattern"
              rules={[{ required: true, message: '请选择执行周期' }]}
              style={{ marginBottom: 0 }}
            >
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                }}
              >
                <Radio.Button value="workdays">工作日</Radio.Button>
                <Radio.Button value="weekly">按周</Radio.Button>
                <Radio.Button value="monthly">按月</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </div>

          <div style={{ ...executionCreateSubtleCardStyle, padding: 14 }}>
            <Text
              type="secondary"
              style={{ display: 'block', fontSize: 12, marginBottom: 8 }}
            >
              执行时间
            </Text>
            <Form.Item style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: 'inline-grid',
                  gridTemplateColumns: '84px auto 84px',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <Form.Item
                  name="scheduleHour"
                  noStyle
                  rules={[{ required: true, message: '请选择小时' }]}
                >
                  <Select
                    size="small"
                    style={{ width: '100%' }}
                    options={HOUR_OPTIONS}
                    placeholder="小时"
                  />
                </Form.Item>
                <Text style={{ textAlign: 'center', minWidth: 12 }}>:</Text>
                <Form.Item
                  name="scheduleMinute"
                  noStyle
                  rules={[{ required: true, message: '请选择分钟' }]}
                >
                  <Select
                    size="small"
                    style={{ width: '100%' }}
                    options={MINUTE_OPTIONS}
                    placeholder="分钟"
                  />
                </Form.Item>
              </div>
            </Form.Item>
          </div>
        </div>

        {schedulePattern === 'weekly' ? (
          <div style={{ ...executionCreateSubtleCardStyle, padding: 14, gridColumn: '1 / -1' }}>
            <Form.Item
              name="weeklyDays"
              label="每周执行日"
              rules={[{ required: true, message: '请选择每周执行日' }]}
              style={{ marginBottom: 0 }}
            >
              <Checkbox.Group options={WEEKDAY_OPTIONS} />
            </Form.Item>
          </div>
        ) : null}

        {schedulePattern === 'monthly' ? (
          <div style={{ ...executionCreateSubtleCardStyle, padding: 14, gridColumn: '1 / -1' }}>
            <Form.Item
              name="monthlyDay"
              label="每月执行日"
              rules={[{ required: true, message: '请选择每月执行日' }]}
              style={{ marginBottom: 0 }}
            >
              <Select
                style={{ maxWidth: 240 }}
                options={MONTH_DAY_OPTIONS}
                placeholder="请选择每月几号执行"
              />
            </Form.Item>
          </div>
        ) : null}

        <div style={{ ...executionCreateSubtleCardStyle, gridColumn: '1 / -1', padding: 14 }}>
          <Form.Item name="scheduleDescription" label="说明" style={{ marginBottom: 0 }}>
            <Input.TextArea
              rows={3}
              placeholder="可选，补充任务用途、时间窗口或通知说明"
            />
          </Form.Item>
        </div>
      </div>
    </ExecutionCreatePanelCard>
  );
};

export default ExecutionCreateScheduleSettingsCard;
