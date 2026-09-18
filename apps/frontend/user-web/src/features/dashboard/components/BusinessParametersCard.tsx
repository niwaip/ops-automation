import {
  DownOutlined,
  EditOutlined,
  InfoCircleOutlined,
  SaveOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { Button, Card, Descriptions, Input, Space, Tag, Tooltip } from 'antd';
import { useState, useMemo, useEffect } from 'react';
import { PARAM_LABEL_MAP, formatParamValue } from './CoordinationActionModal';

interface BusinessParametersCardProps {
  parameters: Record<string, any>;
  isSubmitter: boolean;
  isActionable: boolean;
  candidateCompany?: string | null;
  onApplyAutoCorrection?: () => void;
  onChange: (key: string, value: any) => void;
  defaultExpanded?: boolean;
  defaultEditing?: boolean;
  defaultCardCollapsed?: boolean;
  coreKeys?: string[];
  customTitle?: string;
  isRevisionMode?: boolean;
}

const EXCLUDED_KEYS = new Set([
  'downloadUrl',
  'fileUrl',
  'contractUrl',
  'fileName',
  'executionId',
  'contractFileName',
  'isDraftReplaced',
  'originalDraftUrl',
  'originalDraftFileName',
  'originalDraftSize',
  'rawContent',
  'text',
]);

// 默认核心主要关键字段定义（折叠状态下优先展示）
const DEFAULT_CORE_KEY_LIST = [
  'contractTitle',
  'counterpartyName',
  'ourParty',
  'ourCompany',
  'signDate',
  'contractType',
];

export function BusinessParametersCard({
  parameters = {},
  isSubmitter,
  isActionable,
  candidateCompany,
  onApplyAutoCorrection,
  onChange,
  defaultExpanded = false,
  defaultEditing = false,
  defaultCardCollapsed = true,
  coreKeys,
  customTitle,
  isRevisionMode = false,
}: BusinessParametersCardProps) {
  const [isCardCollapsed, setIsCardCollapsed] = useState(defaultCardCollapsed);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isEditing, setIsEditing] = useState(Boolean(defaultEditing && isSubmitter));

  useEffect(() => {
    setIsCardCollapsed(defaultCardCollapsed);
  }, [defaultCardCollapsed]);

  useEffect(() => {
    if (defaultEditing && isSubmitter) {
      setIsEditing(true);
    }
  }, [defaultEditing, isSubmitter]);

  // 过滤有效参数字段
  const validEntries = useMemo(() => {
    const safeParams = parameters && typeof parameters === 'object' ? parameters : {};
    return Object.entries(safeParams).filter(
      ([key, val]) => !EXCLUDED_KEYS.has(key) && val !== undefined && val !== null && val !== ''
    );
  }, [parameters]);

  const targetCoreKeys = useMemo(() => {
    if (coreKeys && coreKeys.length > 0) return coreKeys;
    return DEFAULT_CORE_KEY_LIST;
  }, [coreKeys]);

  // 区分核心关键要件与次要要件（若未命中任何默认核心字段，自动取前 4 项作为核心项）
  const { coreEntries, secondaryEntries, remarksEntry } = useMemo(() => {
    let remarks: [string, any] | null = null;
    const nonRemarksEntries = validEntries.filter(([k, v]) => {
      if (k === 'remarks') {
        remarks = [k, v];
        return false;
      }
      return true;
    });

    const matchedCore: Array<[string, any]> = [];
    const secondary: Array<[string, any]> = [];

    nonRemarksEntries.forEach(([k, v]) => {
      if (targetCoreKeys.includes(k)) {
        matchedCore.push([k, v]);
      } else {
        secondary.push([k, v]);
      }
    });

    if (matchedCore.length === 0 && nonRemarksEntries.length > 0) {
      const fallbackCore = nonRemarksEntries.slice(0, 4);
      const fallbackSecondary = nonRemarksEntries.slice(4);
      return { coreEntries: fallbackCore, secondaryEntries: fallbackSecondary, remarksEntry: remarks };
    }

    return { coreEntries: matchedCore, secondaryEntries: secondary, remarksEntry: remarks };
  }, [validEntries, targetCoreKeys]);

  const canEdit = isSubmitter && isActionable;

  if (validEntries.length === 0) return null;

  return (
    <Card
      size="small"
      title={
        <div
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
          onClick={() => setIsCardCollapsed(!isCardCollapsed)}
        >
          <Space size={6}>
            {isCardCollapsed ? (
              <DownOutlined style={{ fontSize: 11, color: 'var(--text-tertiary)' }} />
            ) : (
              <UpOutlined style={{ fontSize: 11, color: 'var(--text-tertiary)' }} />
            )}
            <span style={{ fontSize: 13, fontWeight: 600 }}>{customTitle || '📋 业务表单要件详情'}</span>
            <Tag color="blue" bordered={false} style={{ fontSize: 11, margin: 0 }}>
              {validEntries.length} 项要件
            </Tag>
            {isRevisionMode && canEdit ? (
              <Tag color="error" bordered={false} style={{ fontSize: 10, margin: 0 }}>
                可修正
              </Tag>
            ) : null}
          </Space>
        </div>
      }
      extra={
        <Space size={8}>
          {isCardCollapsed ? (
            <>
              {canEdit ? (
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setIsCardCollapsed(false);
                    setIsEditing(true);
                  }}
                  style={{ fontSize: 12, padding: 0 }}
                >
                  展开并修正要件
                </Button>
              ) : null}
              <Button
                type="link"
                size="small"
                icon={<DownOutlined />}
                onClick={() => setIsCardCollapsed(false)}
                style={{ fontSize: 12, padding: 0 }}
              >
                展开查看要件
              </Button>
            </>
          ) : (
            <>
              {canEdit ? (
                <Button
                  type="link"
                  size="small"
                  icon={isEditing ? <SaveOutlined /> : <EditOutlined />}
                  onClick={() => setIsEditing(!isEditing)}
                  style={{ fontSize: 12, padding: 0 }}
                >
                  {isEditing ? '完成编辑' : '手动修正要件'}
                </Button>
              ) : !isSubmitter ? (
                <Tooltip title="根据系统合规规范，仅发起/提交者本人有权修正业务要件">
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    <InfoCircleOutlined style={{ marginRight: 4 }} />
                    仅提交者可修正
                  </span>
                </Tooltip>
              ) : null}

              {!isEditing && (secondaryEntries.length > 0 || remarksEntry) ? (
                <Button
                  type="link"
                  size="small"
                  icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
                  onClick={() => setIsExpanded(!isExpanded)}
                  style={{ fontSize: 12, padding: 0 }}
                >
                  {isExpanded
                    ? '收起次要要件'
                    : `展开全部要件 (${validEntries.length} 项)`}
                </Button>
              ) : null}

              <Button
                type="link"
                size="small"
                icon={<UpOutlined />}
                onClick={() => setIsCardCollapsed(true)}
                style={{ fontSize: 12, padding: 0, color: 'var(--text-secondary)' }}
              >
                折叠要件
              </Button>
            </>
          )}
        </Space>
      }
      styles={{
        body: isCardCollapsed
          ? { display: 'none' }
          : { padding: '10px 14px' },
      }}
      style={{
        background: 'var(--bg-secondary, rgba(148, 163, 184, 0.05))',
        borderColor: 'var(--border-color, rgba(148, 163, 184, 0.16))',
        borderRadius: 8,
      }}
    >
      {/* 企业主体纠偏智能提示 */}
      {candidateCompany && candidateCompany !== parameters.counterpartyName ? (
        <div
          style={{
            background: 'rgba(250, 173, 20, 0.09)',
            border: '1px solid rgba(250, 173, 20, 0.35)',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
            ⚠️ 检测到「相对方企业主体」被识别为地址（
            <span style={{ color: 'var(--warning-color, #d46b08)', fontWeight: 600 }}>
              {parameters.counterpartyName}
            </span>
            ），真实企业名称应为「
            <span style={{ color: 'var(--primary-color, #1677ff)', fontWeight: 600 }}>{candidateCompany}</span>」
          </div>
          {canEdit && onApplyAutoCorrection ? (
            <Button
              size="small"
              type="primary"
              style={{ background: 'var(--warning-color, #fa8c16)', borderColor: 'var(--warning-color, #fa8c16)', fontSize: 12 }}
              onClick={onApplyAutoCorrection}
            >
              ⚡ 一键纠偏为「{candidateCompany}」
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* 编辑态 */}
      {isEditing && canEdit ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '10px 16px' }}>
          {validEntries.map(([key, val]) => (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: key === 'remarks' ? 'flex-start' : 'center',
                gap: 8,
                gridColumn: key === 'remarks' || key === 'contractTitle' ? '1 / -1' : undefined,
              }}
            >
              <span
                style={{
                  width: 105,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  flexShrink: 0,
                  textAlign: 'right',
                }}
              >
                {PARAM_LABEL_MAP[key] || key}：
              </span>
              {key === 'remarks' ? (
                <Input.TextArea
                  size="small"
                  rows={2}
                  value={String(val ?? '')}
                  onChange={(e) => onChange(key, e.target.value)}
                  style={{ flex: 1 }}
                />
              ) : (
                <Input
                  size="small"
                  value={String(val ?? '')}
                  onChange={(e) => onChange(key, e.target.value)}
                  style={{ flex: 1 }}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        /* 预览态：双列栅格展示 */
        <div>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, md: 2 }}
            bordered={false}
            style={{ marginBottom: remarksEntry ? 4 : 0 }}
          >
            {/* 核心关键字段始终显示 */}
            {coreEntries.map(([key, val]) => (
              <Descriptions.Item
                key={key}
                label={
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {PARAM_LABEL_MAP[key] || key}
                  </span>
                }
              >
                <span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)' }}>
                  {formatParamValue(key, val)}
                </span>
              </Descriptions.Item>
            ))}

            {/* 展开态下显示其余字段 */}
            {isExpanded
              ? secondaryEntries.map(([key, val]) => (
                  <Descriptions.Item
                    key={key}
                    label={
                      <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        {PARAM_LABEL_MAP[key] || key}
                      </span>
                    }
                  >
                    <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                      {formatParamValue(key, val)}
                    </span>
                  </Descriptions.Item>
                ))
              : null}
          </Descriptions>

          {/* 商务诉求说明：展开时整行块级展示，带优雅浅色引用背景 */}
          {isExpanded && remarksEntry ? (
            <div
              style={{
                marginTop: 6,
                padding: '6px 10px',
                borderRadius: 6,
                background: 'rgba(148, 163, 184, 0.08)',
                borderLeft: '3px solid var(--primary-color, #1677ff)',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 2 }}>
                💬 商务诉求说明：
              </div>
              <div style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                {String(remarksEntry[1])}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
