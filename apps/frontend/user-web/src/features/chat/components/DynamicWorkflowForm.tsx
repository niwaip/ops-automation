import {
  AuditOutlined,
  BankOutlined,
  CalendarOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import {
  Collapse,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
} from 'antd';
import type { FormInstance } from 'antd/es/form';
import dayjs from 'dayjs';
import React, { useEffect, useMemo } from 'react';
import type { WorkflowTemplateDefinition } from '../../../api/workbenchCoordination';
import styles from './DynamicWorkflowForm.module.css';

interface DynamicWorkflowFormProps {
  template: WorkflowTemplateDefinition;
  form: FormInstance;
  initialValues?: Record<string, any>;
}

export const DynamicWorkflowForm: React.FC<DynamicWorkflowFormProps> = ({
  template,
  form,
  initialValues,
}) => {
  const { properties = {}, required = [] } = template.paramsSchema || {};

  const isBilateralContract = Boolean(
    properties['partyA.name'] || properties['partyB.name']
  );

  const hasSignDate = Boolean(
    properties['agreement.signDate.year'] &&
      properties['agreement.signDate.month'] &&
      properties['agreement.signDate.day']
  );

  useEffect(() => {
    const today = new Date();
    const valuesToSet: Record<string, any> = {};

    Object.entries(properties).forEach(([key, prop]) => {
      let rawVal = initialValues ? initialValues[key] : undefined;
      if (rawVal === undefined && initialValues && key.includes('.')) {
        const parts = key.split('.');
        let curr: any = initialValues;
        for (const p of parts) {
          if (curr && typeof curr === 'object') {
            curr = curr[p];
          } else {
            curr = undefined;
            break;
          }
        }
        rawVal = curr;
      }

      if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
        if (prop.type === 'date') {
          valuesToSet[key] = dayjs.isDayjs(rawVal) ? rawVal : dayjs(rawVal);
        } else if (prop.type === 'number') {
          valuesToSet[key] = Number(rawVal);
        } else {
          valuesToSet[key] = rawVal;
        }
      } else if (prop.default !== undefined) {
        valuesToSet[key] = prop.default;
      } else if (key.endsWith('signDate.year') || key === 'year') {
        valuesToSet[key] = today.getFullYear();
      } else if (key.endsWith('signDate.month') || key === 'month') {
        valuesToSet[key] = today.getMonth() + 1;
      } else if (key.endsWith('signDate.day') || key === 'day') {
        valuesToSet[key] = today.getDate();
      }
    });

    if (hasSignDate) {
      const yr = valuesToSet['agreement.signDate.year'] || today.getFullYear();
      const mo = valuesToSet['agreement.signDate.month'] || today.getMonth() + 1;
      const da = valuesToSet['agreement.signDate.day'] || today.getDate();
      valuesToSet['agreement.signDate'] = dayjs(
        `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`
      );
    }

    form.setFieldsValue(valuesToSet);
  }, [template, initialValues, form, properties, hasSignDate]);

  const isWideField = (key: string, prop: any) => {
    return (
      key === 'reason' ||
      key === 'content' ||
      key === 'desc' ||
      key === 'description' ||
      key === 'cooperation.subject' ||
      key === 'attachment.content' ||
      key.includes('address') ||
      Boolean(
        (prop.description &&
          (prop.description.includes('事由') ||
            prop.description.includes('说明') ||
            prop.description.includes('主题') ||
            prop.description.includes('背景'))) ||
          (prop.displayName &&
            (prop.displayName.includes('事由') ||
              prop.displayName.includes('说明') ||
              prop.displayName.includes('主题') ||
              prop.displayName.includes('背景')))
      )
    );
  };

  const renderInput = (key: string, prop: any) => {
    const label = prop.displayName || prop.description || key;

    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
      return (
        <Select
          placeholder={`选择${label}`}
          options={prop.enum.map((opt: any) => ({
            label: String(opt),
            value: opt,
          }))}
        />
      );
    }

    if (prop.type === 'date') {
      return (
        <DatePicker
          showTime={{ format: 'HH:mm' }}
          format="YYYY-MM-DD HH:mm"
          style={{ width: '100%' }}
          placeholder={`选择${label}`}
        />
      );
    }

    if (prop.type === 'number') {
      const isMoney =
        key.toLowerCase().includes('amount') ||
        key.toLowerCase().includes('price') ||
        key.toLowerCase().includes('fee');
      const isYears =
        key.toLowerCase().includes('year') ||
        Boolean(prop.description?.includes('年')) ||
        Boolean(prop.displayName?.includes('年'));
      const isMonths =
        key.toLowerCase().includes('month') ||
        Boolean(prop.description?.includes('月')) ||
        Boolean(prop.displayName?.includes('月'));
      const isDayOfMonth =
        key.toLowerCase().includes('signdate.day') ||
        Boolean(prop.description?.includes('日号')) ||
        Boolean(prop.displayName?.includes('日号'));
      const isDays =
        key.toLowerCase().includes('days') ||
        Boolean(prop.description?.includes('天')) ||
        Boolean(prop.displayName?.includes('天'));
      const isHours =
        !isYears &&
        !isMonths &&
        !isDayOfMonth &&
        !isDays &&
        (key.toLowerCase().includes('hours') ||
          (key.toLowerCase().includes('duration') && !isYears && !isDays));

      let addonAfter: string | undefined;
      if (isYears) addonAfter = '年';
      else if (isMonths) addonAfter = '月';
      else if (isDayOfMonth) addonAfter = '日';
      else if (isDays) addonAfter = '天';
      else if (isHours) addonAfter = '小时';

      return (
        <InputNumber
          style={{ width: '100%' }}
          min={0}
          prefix={isMoney ? '¥' : undefined}
          addonAfter={addonAfter}
          placeholder={`输入${label}`}
        />
      );
    }

    if (prop.type === 'boolean') {
      return <Switch />;
    }

    if (
      key === 'reason' ||
      key === 'content' ||
      key === 'cooperation.subject' ||
      key === 'attachment.content' ||
      Boolean(
        prop.description &&
          (prop.description.includes('事由') ||
            prop.description.includes('说明') ||
            prop.description.includes('背景'))
      )
    ) {
      return <Input.TextArea rows={2} placeholder={`输入${label}`} />;
    }

    return <Input placeholder={`输入${label}`} />;
  };

  const renderFormItem = (
    key: string,
    prop: any,
    customLabel?: string
  ) => {
    if (!prop) return null;
    const isFieldRequired = required.includes(key) || Boolean(prop.required);
    const label = customLabel || prop.displayName || prop.description || key;

    return (
      <Form.Item
        key={key}
        name={[key]}
        label={label}
        rules={[
          {
            required: isFieldRequired,
            message: `请填写${label}`,
          },
        ]}
        style={{ marginBottom: 10 }}
      >
        {renderInput(key, prop)}
      </Form.Item>
    );
  };

  // ==========================================
  // 方案 A：针对包含双方法律主体的标准合同表单布局
  // ==========================================
  if (isBilateralContract) {
    const isHandledDirectly = (k: string) =>
      k === 'partyA.name' ||
      k === 'partyA.address' ||
      k === 'partyB.name' ||
      k === 'partyB.address' ||
      k === 'cooperation.subject' ||
      k === 'confidentiality.durationYears' ||
      k === 'agreement.signDate.year' ||
      k === 'agreement.signDate.month' ||
      k === 'agreement.signDate.day' ||
      k === 'partyA.seal' ||
      k === 'partyB.seal' ||
      k === 'partyA.signature' ||
      k === 'partyB.signature' ||
      k === 'attachment.content';

    const secondaryKeys = [
      'partyA.seal',
      'partyB.seal',
      'partyA.signature',
      'partyB.signature',
      'attachment.content',
    ].filter((k) => properties[k]);

    const otherCoreEntries = Object.entries(properties).filter(
      ([k]) => !isHandledDirectly(k)
    );

    return (
      <div className={styles.formContainer}>
        {/* 1. 双方主体基本信息对照卡 */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <BankOutlined className={styles.sectionHeaderIcon} />
            <span>双方主体信息</span>
            <span className={styles.sectionBadge}>合同签约主体</span>
          </div>
          <div className={styles.partiesGrid}>
            <div className={styles.partySubCard}>
              <div className={styles.partySubCardTitle}>
                <span className={styles.partyTagA}>甲方</span>
                <span>起草 / 披露方主体</span>
              </div>
              {properties['partyA.name'] &&
                renderFormItem(
                  'partyA.name',
                  properties['partyA.name'],
                  '法定企业全称'
                )}
              {properties['partyA.address'] &&
                renderFormItem(
                  'partyA.address',
                  properties['partyA.address'],
                  '注册 / 经营地址'
                )}
            </div>

            <div className={styles.partySubCard}>
              <div className={styles.partySubCardTitle}>
                <span className={styles.partyTagB}>乙方</span>
                <span>接收 / 相对方主体</span>
              </div>
              {properties['partyB.name'] &&
                renderFormItem(
                  'partyB.name',
                  properties['partyB.name'],
                  '法定企业全称'
                )}
              {properties['partyB.address'] &&
                renderFormItem(
                  'partyB.address',
                  properties['partyB.address'],
                  '注册 / 经营地址'
                )}
            </div>
          </div>
        </div>

        {/* 2. 核心合作与保密约定 */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <FileTextOutlined className={styles.sectionHeaderIcon} />
            <span>合作与保密约定</span>
            <span className={styles.sectionBadge}>核心履约要件</span>
          </div>
          <div className={styles.twoColumnGrid}>
            {properties['cooperation.subject'] && (
              <div className={styles.fullWidthItem}>
                {renderFormItem(
                  'cooperation.subject',
                  properties['cooperation.subject'],
                  '合作业务主题 / 项目范围'
                )}
              </div>
            )}

            {properties['confidentiality.durationYears'] && (
              <div>
                {renderFormItem(
                  'confidentiality.durationYears',
                  properties['confidentiality.durationYears'],
                  '保密义务期限'
                )}
              </div>
            )}

            {hasSignDate && (
              <div>
                <Form.Item
                  name="agreement.signDate"
                  label="协议签订日期"
                  rules={[{ required: true, message: '请选择协议签订日期' }]}
                  style={{ marginBottom: 10 }}
                >
                  <DatePicker
                    style={{ width: '100%' }}
                    format="YYYY-MM-DD"
                    placeholder="选择协议签订日期"
                    onChange={(d) => {
                      if (d && d.isValid()) {
                        form.setFieldsValue({
                          'agreement.signDate': d,
                          'agreement.signDate.year': d.year(),
                          'agreement.signDate.month': d.month() + 1,
                          'agreement.signDate.day': d.date(),
                        });
                      }
                    }}
                  />
                </Form.Item>
                <Form.Item name={['agreement.signDate.year']} noStyle>
                  <Input type="hidden" />
                </Form.Item>
                <Form.Item name={['agreement.signDate.month']} noStyle>
                  <Input type="hidden" />
                </Form.Item>
                <Form.Item name={['agreement.signDate.day']} noStyle>
                  <Input type="hidden" />
                </Form.Item>
              </div>
            )}

            {otherCoreEntries.map(([k, p]) => (
              <div
                key={k}
                className={isWideField(k, p) ? styles.fullWidthItem : undefined}
              >
                {renderFormItem(k, p)}
              </div>
            ))}
          </div>
        </div>

        {/* 3. 签署落款占位与附件条款约定（选填折叠卡） */}
        {secondaryKeys.length > 0 && (
          <div className={styles.sectionCard} style={{ paddingBottom: 6 }}>
            <Collapse
              ghost
              className={styles.advancedCollapse}
              items={[
                {
                  key: 'signing-extras',
                  label: (
                    <Space size={6}>
                      <AuditOutlined style={{ color: '#1677ff' }} />
                      <span style={{ fontWeight: 500 }}>
                        签署落款占位与附件条款（选填 · {secondaryKeys.length} 项）
                      </span>
                    </Space>
                  ),
                  children: (
                    <div className={styles.twoColumnGrid}>
                      {properties['partyA.seal'] &&
                        renderFormItem(
                          'partyA.seal',
                          properties['partyA.seal'],
                          '甲方公章盖印文本'
                        )}
                      {properties['partyB.seal'] &&
                        renderFormItem(
                          'partyB.seal',
                          properties['partyB.seal'],
                          '乙方公章盖印文本'
                        )}
                      {properties['partyA.signature'] &&
                        renderFormItem(
                          'partyA.signature',
                          properties['partyA.signature'],
                          '甲方签署人签名文本'
                        )}
                      {properties['partyB.signature'] &&
                        renderFormItem(
                          'partyB.signature',
                          properties['partyB.signature'],
                          '乙方签署人签名文本'
                        )}
                      {properties['attachment.content'] && (
                        <div className={styles.fullWidthItem}>
                          {renderFormItem(
                            'attachment.content',
                            properties['attachment.content'],
                            '附件一补充内容'
                          )}
                        </div>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // 方案 B：针对普通通用业务流程的优雅卡片流式布局
  // ==========================================
  const orderedEntries = useMemo(() => {
    const entries = Object.entries(properties);
    return [...entries].sort(([aKey], [bKey]) => {
      const aIsReason =
        aKey === 'reason' ||
        aKey === 'content' ||
        aKey === 'desc' ||
        aKey === 'description';
      const bIsReason =
        bKey === 'reason' ||
        bKey === 'content' ||
        bKey === 'desc' ||
        bKey === 'description';
      if (aIsReason && !bIsReason) return 1;
      if (!aIsReason && bIsReason) return -1;
      return 0;
    });
  }, [properties]);

  return (
    <div className={styles.formContainer}>
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <CalendarOutlined className={styles.sectionHeaderIcon} />
          <span>业务表单要件</span>
          <span className={styles.sectionBadge}>
            共 {orderedEntries.length} 项输入
          </span>
        </div>
        <div className={styles.twoColumnGrid}>
          {orderedEntries.map(([key, prop]) => {
            const isWide = isWideField(key, prop);
            return (
              <div
                key={key}
                className={isWide ? styles.fullWidthItem : undefined}
              >
                {renderFormItem(key, prop)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
