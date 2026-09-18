import {
  BellOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  GlobalOutlined,
  PlusOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Tag,
  TimePicker,
  Tooltip,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { imChannelApi, reminderApi, type ReminderInput, type ReminderRule } from '@/api';
import {
  formFromRule,
  resolveOnceDateTime,
  scheduleInput,
  scheduleLabel,
  type ReminderFormValues,
} from './reminderSchedule';
import styles from './ReminderConfigModal.module.css';

const MAX_TITLE_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 4096;
const MAX_DAILY_TIMES = 12;
const MAX_MONTHLY_DAYS = 28;
const FALLBACK_TITLE_LENGTH = 30;
const DEFAULT_TITLE = '消息提醒';
const USER_TIMEZONE =
  (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) ||
  'Asia/Shanghai';

const getInitialValues = (): ReminderFormValues => ({
  pattern: 'daily',
  time: dayjs().hour(9).minute(0),
  times: [8, 12, 16, 20].map((hour) => dayjs().hour(hour).minute(0)),
  onceDate: dayjs(),
  onceTime: dayjs(),
  weekday: 1,
  monthDay: 1,
  sendWechat: false,
  message: '',
  title: '',
});

export function ReminderConfigModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<ReminderFormValues>();
  const [editing, setEditing] = useState<ReminderRule | null>(null);
  const pattern = Form.useWatch('pattern', form);
  const sendWechat = Form.useWatch('sendWechat', form);
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const rules = useQuery(['reminder-rules'], reminderApi.list, { enabled: open });
  const wechat = useQuery(['reminder-wechat'], imChannelApi.getWechat, { enabled: open });
  const wechatConnected = Boolean(wechat.data?.configured && wechat.data?.enabled);

  // 过滤掉已完成的单次提醒（执行时间已过或已取消），不进行展示
  const displayRules = (rules.data || []).filter((rule) => {
    if (rule.runAt) {
      const isPast = new Date(rule.runAt) <= new Date();
      if (isPast || !rule.isActive) {
        return false;
      }
    }
    return true;
  });

  const refresh = () => void queryClient.invalidateQueries(['reminder-rules']);
  const reset = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue(getInitialValues());
  };

  const save = useMutation(
    (input: ReminderInput) =>
      editing ? reminderApi.update(editing.id, input) : reminderApi.create(input),
    {
      onSuccess: () => {
        void message.success(editing ? '提醒已更新' : '提醒已创建');
        refresh();
        reset();
      },
      onError: (error: Error) => {
        void message.error(error.message || '保存失败');
      },
    },
  );

  const update = useMutation(
    ({ id, isActive }: { id: string; isActive: boolean }) =>
      reminderApi.update(id, { isActive }),
    {
      onSuccess: refresh,
      onError: (error: Error) => {
        void message.error(error.message || '更新失败');
      },
    },
  );

  const remove = useMutation(reminderApi.remove, {
    onSuccess: () => {
      refresh();
      void message.success('已删除提醒');
    },
    onError: (error: Error) => {
      void message.error(error.message || '删除失败');
    },
  });

  useEffect(() => {
    if (!open) {
      setEditing(null);
      form.resetFields();
    } else if (!editing) {
      form.setFieldsValue({
        onceDate: dayjs(),
        onceTime: dayjs(),
      });
    }
  }, [open, editing, form]);

  const onSave = (values: ReminderFormValues) => {
    const rawMsg = values.message?.trim();
    if (!rawMsg) {
      void message.error('请输入提醒内容');
      return;
    }

    // 标题可选：若未输入，提取内容前指定长度或使用默认标题
    const finalTitle =
      values.title?.trim() || rawMsg.slice(0, FALLBACK_TITLE_LENGTH) || DEFAULT_TITLE;

    if (values.pattern === 'once') {
      const onceAt = resolveOnceDateTime(values);
      if (!onceAt.isAfter(dayjs())) {
        void message.error('单次提醒时间必须晚于当前时间，请选择未来的时间');
        return;
      }
    }

    if (
      values.pattern === 'dailyMultiple' &&
      (!values.times?.length || values.times.length > MAX_DAILY_TIMES)
    ) {
      void message.error(`请选择 1 至 ${MAX_DAILY_TIMES} 个提醒时间`);
      return;
    }

    save.mutate({
      title: finalTitle,
      message: rawMsg,
      ...scheduleInput(values),
      timezone: USER_TIMEZONE,
      sendWechat: values.sendWechat || false,
    });
  };

  const edit = (rule: ReminderRule) => {
    setEditing(rule);
    const formVals = formFromRule(rule);
    form.setFieldsValue({
      title: rule.title,
      message: rule.message,
      sendWechat: rule.sendWechat,
      ...formVals,
    });
  };

  // 单次任务快捷时间设定
  const setQuickTime = (amount: number, unit: 'minute' | 'hour') => {
    const target = dayjs().add(amount, unit);
    form.setFieldsValue({ onceDate: target, onceTime: target });
  };

  const setQuickTomorrow = (hour: number, minute: number) => {
    const target = dayjs().add(1, 'day').hour(hour).minute(minute).second(0);
    form.setFieldsValue({ onceDate: target, onceTime: target });
  };

  // 周期任务常用时间设定
  const setDailyTime = (hour: number, minute: number) => {
    form.setFieldValue('time', dayjs().hour(hour).minute(minute).second(0));
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={780}
      destroyOnClose
      title={
        <span className={styles.heading}>
          <span className={styles.headingIcon}>
            <BellOutlined />
          </span>
          消息提醒
        </span>
      }
      className={styles.modal}
    >
      {/* 模块1：新建与编辑 */}
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          <span className={styles.sectionBadge}>01</span>
          新建与编辑
        </div>
        <span className={styles.sectionSub}>配置提醒事项与执行时机</span>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={onSave}
        initialValues={getInitialValues()}
        className={styles.form}
        onValuesChange={(changed) => {
          if (changed.pattern === 'once') {
            if (!form.getFieldValue('onceDate')) form.setFieldValue('onceDate', dayjs());
            if (!form.getFieldValue('onceTime')) form.setFieldValue('onceTime', dayjs());
          }
        }}
      >
        {/* 标题（选填）与内容（必填）整齐对齐布局 */}
        <div className={styles.contentStacked}>
          <Form.Item
            name="title"
            label={
              <span className={styles.formLabel}>
                提醒标题 <span className={styles.optionalTag}>选填</span>
              </span>
            }
            rules={[{ max: MAX_TITLE_LENGTH }]}
            className={styles.stackedItem}
          >
            <Input
              size="large"
              placeholder="选填，例如：按时服药、团队周会（留空将自动以内容前缀作为标题）"
              maxLength={MAX_TITLE_LENGTH}
              allowClear
            />
          </Form.Item>

          <Form.Item
            name="message"
            label={<span className={styles.formLabel}>提醒内容</span>}
            rules={[{ required: true, whitespace: true, message: '请输入提醒内容', max: MAX_MESSAGE_LENGTH }]}
            className={styles.stackedItem}
          >
            <Input.TextArea
              rows={2}
              placeholder="例如：休息片刻，按医嘱点击眼药水"
              maxLength={MAX_MESSAGE_LENGTH}
              autoSize={{ minRows: 2, maxRows: 3 }}
            />
          </Form.Item>
        </div>

        {/* 什么时候提醒 */}
        <Form.Item
          name="pattern"
          label={<span className={styles.formLabel}>什么时候提醒</span>}
          rules={[{ required: true }]}
          className={styles.patternFormItem}
        >
          <Radio.Group className={styles.patterns}>
            <Radio.Button value="once">仅一次</Radio.Button>
            <Radio.Button value="daily">每天一次</Radio.Button>
            <Radio.Button value="dailyMultiple">每天多次</Radio.Button>
            <Radio.Button value="workdays">工作日</Radio.Button>
            <Radio.Button value="weekly">每周</Radio.Button>
            <Radio.Button value="monthly">每月</Radio.Button>
          </Radio.Group>
        </Form.Item>

        {/* 动态时间配置框：各类型高度保持一致，避免切换抖动 */}
        <div className={styles.scheduleBox}>
          {pattern === 'once' ? (
            <div className={styles.scheduleRowContainer}>
              <div className={styles.scheduleFieldsRow}>
                <Form.Item
                  name="onceDate"
                  label={<span className={styles.fieldLabel}>提醒日期</span>}
                  rules={[{ required: true, message: '请选择日期' }]}
                  className={styles.inlineItem}
                >
                  <DatePicker
                    size="large"
                    format="YYYY-MM-DD"
                    disabledDate={(date) => date.isBefore(dayjs(), 'day')}
                    placeholder="选择日期"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                <Form.Item
                  name="onceTime"
                  label={<span className={styles.fieldLabel}>提醒时间 (默认当前时间)</span>}
                  rules={[{ required: true, message: '请选择时间' }]}
                  className={styles.inlineItem}
                >
                  <TimePicker
                    size="large"
                    format="HH:mm"
                    placeholder="选择时间"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </div>
              <div className={styles.quickChips}>
                <span className={styles.quickChipsLabel}>快捷填充：</span>
                <button type="button" className={styles.chipBtn} onClick={() => setQuickTime(10, 'minute')}>
                  +10分钟
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setQuickTime(30, 'minute')}>
                  +30分钟
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setQuickTime(1, 'hour')}>
                  +1小时
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setQuickTomorrow(9, 0)}>
                  明天 09:00
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setQuickTomorrow(14, 0)}>
                  明天 14:00
                </button>
              </div>
            </div>
          ) : pattern === 'daily' ? (
            <div className={styles.scheduleRowContainer}>
              <div className={styles.scheduleFieldsRow}>
                <Form.Item
                  name="time"
                  label={<span className={styles.fieldLabel}>每日提醒时间</span>}
                  rules={[{ required: true, message: '请选择时间' }]}
                  className={styles.inlineItem}
                >
                  <TimePicker format="HH:mm" size="large" style={{ width: '100%' }} />
                </Form.Item>
                <div className={styles.fieldHintBlock}>
                  每天固定在此时间自动推送站内提醒
                </div>
              </div>
              <div className={styles.quickChips}>
                <span className={styles.quickChipsLabel}>常用时间：</span>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(9, 0)}>
                  09:00 晨间
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(12, 0)}>
                  12:00 午间
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(14, 0)}>
                  14:00 下午
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(18, 0)}>
                  18:00 傍晚
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(21, 0)}>
                  21:00 晚间
                </button>
              </div>
            </div>
          ) : pattern === 'workdays' ? (
            <div className={styles.scheduleRowContainer}>
              <div className={styles.scheduleFieldsRow}>
                <Form.Item
                  name="time"
                  label={<span className={styles.fieldLabel}>工作日提醒时间 (周一至周五)</span>}
                  rules={[{ required: true, message: '请选择时间' }]}
                  className={styles.inlineItem}
                >
                  <TimePicker format="HH:mm" size="large" style={{ width: '100%' }} />
                </Form.Item>
                <div className={styles.fieldHintBlock}>
                  仅在周一至周五工作日准时推送提醒
                </div>
              </div>
              <div className={styles.quickChips}>
                <span className={styles.quickChipsLabel}>常用时间：</span>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(9, 0)}>
                  09:00 上班
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(10, 0)}>
                  10:00 晨会
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(14, 0)}>
                  14:00 下午
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(17, 30)}>
                  17:30 日报
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(18, 0)}>
                  18:00 下班
                </button>
              </div>
            </div>
          ) : pattern === 'weekly' ? (
            <div className={styles.scheduleRowContainer}>
              <div className={styles.scheduleFieldsRow}>
                <Form.Item
                  name="weekday"
                  label={<span className={styles.fieldLabel}>每周提醒日</span>}
                  className={styles.inlineItem}
                >
                  <Select
                    size="large"
                    options={['日', '一', '二', '三', '四', '五', '六'].map((label, value) => ({
                      label: `每周${label}`,
                      value,
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  name="time"
                  label={<span className={styles.fieldLabel}>提醒时间</span>}
                  rules={[{ required: true, message: '请选择时间' }]}
                  className={styles.inlineItem}
                >
                  <TimePicker format="HH:mm" size="large" style={{ width: '100%' }} />
                </Form.Item>
              </div>
              <div className={styles.quickChips}>
                <span className={styles.quickChipsLabel}>常用时间：</span>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(9, 30)}>
                  09:30
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(10, 0)}>
                  10:00
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(14, 30)}>
                  14:30
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(17, 0)}>
                  17:00
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(18, 0)}>
                  18:00
                </button>
              </div>
            </div>
          ) : pattern === 'monthly' ? (
            <div className={styles.scheduleRowContainer}>
              <div className={styles.scheduleFieldsRow}>
                <Form.Item
                  name="monthDay"
                  label={<span className={styles.fieldLabel}>每月提醒日</span>}
                  className={styles.inlineItem}
                >
                  <Select
                    size="large"
                    options={Array.from({ length: MAX_MONTHLY_DAYS }, (_, i) => ({
                      label: `每月 ${i + 1} 日`,
                      value: i + 1,
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  name="time"
                  label={<span className={styles.fieldLabel}>提醒时间</span>}
                  rules={[{ required: true, message: '请选择时间' }]}
                  className={styles.inlineItem}
                >
                  <TimePicker format="HH:mm" size="large" style={{ width: '100%' }} />
                </Form.Item>
              </div>
              <div className={styles.quickChips}>
                <span className={styles.quickChipsLabel}>常用时间：</span>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(9, 0)}>
                  09:00
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(10, 0)}>
                  10:00
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(14, 0)}>
                  14:00
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(17, 30)}>
                  17:30
                </button>
                <button type="button" className={styles.chipBtn} onClick={() => setDailyTime(18, 0)}>
                  18:00
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.multipleContainer}>
              <div className={styles.multipleHeader}>
                <span className={styles.fieldLabel}>每天提醒的时间列表 (支持 1 至 12 个时间点)</span>
              </div>
              <Form.List name="times">
                {(fields, { add, remove: removeTime }) => (
                  <div className={styles.multipleScrollArea}>
                    <div className={styles.timeGrid}>
                      {fields.map((field, index) => (
                        <div key={field.key} className={styles.timeItem}>
                          <span className={styles.timeIndex}>第 {index + 1} 次</span>
                          <Form.Item
                            name={field.name}
                            rules={[{ required: true, message: '请选择时间' }]}
                            noStyle
                          >
                            <TimePicker format="HH:mm" size="middle" style={{ flex: 1 }} />
                          </Form.Item>
                          {fields.length > 1 && (
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              aria-label={`删除第${index + 1}次`}
                              onClick={() => removeTime(field.name)}
                            />
                          )}
                        </div>
                      ))}
                      {fields.length < MAX_DAILY_TIMES && (
                        <Button
                          className={styles.addTime}
                          icon={<PlusOutlined />}
                          onClick={() => add(dayjs().hour(9).minute(0))}
                        >
                          添加时间
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Form.List>
            </div>
          )}
        </div>

        {/* 顶部消息区 + 同步到微信 合并为同一行配置区 */}
        <div className={styles.deliveryConfigRow}>
          {/* 顶部消息区卡片 */}
          <div className={styles.deliveryCard}>
            <div className={styles.deliveryCardIcon}>
              <BellOutlined />
            </div>
            <div className={styles.deliveryCardInfo}>
              <div className={styles.deliveryCardHeader}>
                <span className={styles.deliveryCardTitle}>顶部消息区</span>
                <Tag color="blue" bordered={false} className={styles.deliveryTag}>
                  默认开启
                </Tag>
              </div>
              <div className={styles.deliveryCardDesc}>
                默认送达站内消息中心，可稍后提醒
              </div>
            </div>
          </div>

          {/* 同步到微信卡片 */}
          <div
            className={`${styles.deliveryCard} ${
              !wechatConnected ? styles.deliveryCardDisabled : ''
            }`}
            onClick={() => {
              if (wechatConnected) {
                form.setFieldValue('sendWechat', !sendWechat);
              }
            }}
          >
            <div className={`${styles.deliveryCardIcon} ${styles.wechatIcon}`}>
              <WechatOutlined />
            </div>
            <div className={styles.deliveryCardInfo}>
              <div className={styles.deliveryCardHeader}>
                <span className={styles.deliveryCardTitle}>同步到微信</span>
                <Form.Item name="sendWechat" valuePropName="checked" noStyle>
                  <Switch
                    disabled={!wechatConnected}
                    onClick={(_, e) => e.stopPropagation()}
                  />
                </Form.Item>
              </div>
              <div className={styles.deliveryCardDesc}>
                {wechatConnected ? '使用已连接的微信渠道推送' : '未连接微信（请先在渠道中绑定）'}
              </div>
            </div>
          </div>
        </div>

        {/* 底部操作区 */}
        <div className={styles.actions}>
          <div className={styles.timezoneInfo}>
            <GlobalOutlined /> 按 {USER_TIMEZONE} 时区执行
          </div>
          <Space>
            {editing && (
              <Button onClick={reset} size="large">
                取消编辑
              </Button>
            )}
            <Button
              type="primary"
              size="large"
              htmlType="submit"
              loading={save.isLoading}
              className={styles.submitBtn}
            >
              {editing ? '保存修改' : '创建提醒'}
            </Button>
          </Space>
        </div>
      </Form>

      {/* 模块2：我的提醒 */}
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          <span className={styles.sectionBadge}>02</span>
          我的提醒
        </div>
        <span className={styles.countBadge}>
          {rules.data ? `共 ${displayRules.length} 条` : '管理已安排的提醒'}
        </span>
      </div>

      {rules.isError && <Alert type="error" showIcon message="加载提醒列表失败，请稍后重试" />}

      {rules.isLoading ? (
        <div className={styles.loadingBox}>正在加载提醒列表…</div>
      ) : !displayRules.length ? (
        <div className={styles.empty}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无进行中的提醒，填写上方表单创建一条开始吧"
          />
        </div>
      ) : (
        <div className={styles.ruleList}>
          {displayRules.map((rule) => {
            const isFinished = rule.runAt && new Date(rule.runAt) <= new Date();
            const statusType = rule.isActive ? 'active' : isFinished ? 'completed' : 'paused';
            const statusLabel = rule.isActive ? '进行中' : isFinished ? '已完成' : '已暂停';
            const statusColor = rule.isActive ? 'success' : isFinished ? 'default' : 'warning';
            const titleDisplay = rule.title || rule.message.slice(0, FALLBACK_TITLE_LENGTH);
            const hasDistinctMessage =
              rule.message && rule.message.trim() !== rule.title?.trim();

            return (
              <div
                key={rule.id}
                className={`${styles.ruleCard} ${!rule.isActive ? styles.ruleCardInactive : ''}`}
              >
                <div className={styles.ruleStatusIndicator}>
                  <span className={`${styles.statusDot} ${styles[`dot_${statusType}`]}`} />
                </div>
                <div className={styles.ruleBody}>
                  <div className={styles.ruleHeader}>
                    <span className={styles.ruleTitle}>{titleDisplay}</span>
                    <div className={styles.tagGroup}>
                      <Tag color={statusColor} bordered={false}>
                        {statusLabel}
                      </Tag>
                      <Tag color="cyan" bordered={false}>
                        站内
                      </Tag>
                      {rule.sendWechat && (
                        <Tag color="geekblue" bordered={false} icon={<WechatOutlined />}>
                          微信
                        </Tag>
                      )}
                    </div>
                  </div>

                  {hasDistinctMessage && (
                    <div className={styles.ruleMessage}>{rule.message}</div>
                  )}

                  <div className={styles.ruleMeta}>
                    <span className={styles.scheduleText}>
                      <CalendarOutlined style={{ marginRight: 4 }} />
                      {scheduleLabel(rule)}
                    </span>
                    {rule.isActive && rule.nextRunAt && (
                      <span className={styles.nextRunText}>
                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                        下次：{dayjs(rule.nextRunAt).format('M月D日 HH:mm')}
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.ruleActions}>
                  {!rule.runAt && (
                    <Tooltip title={rule.isActive ? '点击暂停' : '点击启用'}>
                      <Switch
                        size="small"
                        checked={rule.isActive}
                        loading={update.isLoading}
                        onChange={(isActive) => update.mutate({ id: rule.id, isActive })}
                      />
                    </Tooltip>
                  )}
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    className={styles.editBtn}
                    onClick={() => edit(rule)}
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title="确认删除此提醒？"
                    description="删除后将停止提醒，历史已发送消息仍会保留。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => remove.mutate(rule.id)}
                  >
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`删除${rule.title}`}
                      className={styles.deleteBtn}
                    />
                  </Popconfirm>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
