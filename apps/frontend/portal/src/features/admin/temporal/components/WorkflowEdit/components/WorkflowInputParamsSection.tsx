import React from 'react';
import { Card, Space, Tag, Tabs, Typography, Collapse, Tooltip, Checkbox, Input, Button } from 'antd';
import type { WorkflowDsl, WorkflowInputParamDefinition } from '@/api/temporal';
import type { GroupedWorkflowInputParams } from '../utils/workflowEditHelpers';

const { Text } = Typography;

export interface WorkflowInputParamsSectionProps {
  workflowDsl: WorkflowDsl;
  setWorkflowDsl: React.Dispatch<React.SetStateAction<WorkflowDsl>>;
  groupedWorkflowInputParams: GroupedWorkflowInputParams[];
  SECTION_CARD_STYLE: React.CSSProperties;
  SECTION_CARD_BODY_STYLE: React.CSSProperties;
  SOFT_PANEL_STYLE: React.CSSProperties;
}

export const WorkflowInputParamsSection: React.FC<WorkflowInputParamsSectionProps> = ({
  workflowDsl,
  setWorkflowDsl,
  groupedWorkflowInputParams,
  SECTION_CARD_STYLE,
  SECTION_CARD_BODY_STYLE,
  SOFT_PANEL_STYLE,
}) => {
  const updateSingleWorkflowInputParam = (key: string, nextValue: WorkflowInputParamDefinition) => {
    setWorkflowDsl((prev) => ({
      ...prev,
      inputParams: {
        ...prev.inputParams,
        [key]: nextValue,
      },
    }));
  };

  const updateArrayGroupRequiredState = (keys: string[], required: boolean) => {
    if (keys.length === 0) {
      return;
    }
    setWorkflowDsl((prev) => {
      const nextInputParams = { ...(prev.inputParams || {}) };
      keys.forEach((key) => {
        const current = nextInputParams[key];
        if (!current) {
          return;
        }
        nextInputParams[key] = {
          ...current,
          required,
        };
      });
      return {
        ...prev,
        inputParams: nextInputParams,
      };
    });
  };

  const renderInputParamEditor = (
    key: string,
    param: WorkflowInputParamDefinition,
    compactLabel?: boolean
  ) => {
    const getLangSortWeight = (lang: string) => {
      const normalized = String(lang || '')
        .trim()
        .toLowerCase();
      if (
        normalized === 'zh' ||
        normalized === 'zh-cn' ||
        normalized === 'zh-hans' ||
        normalized === 'zh-hans-cn' ||
        normalized === 'cn'
      ) {
        return 0;
      }
      if (normalized === 'jp' || normalized === 'ja') {
        return 1;
      }
      if (normalized === 'en' || normalized === 'en-us' || normalized === 'en-gb') {
        return 2;
      }
      return 3;
    };
    const normalizedLocalizedVariants = Array.from(
      new Set(
        [
          ...(Array.isArray(param.localizedVariants) ? param.localizedVariants : []),
          ...Object.keys(param.localizedDefaultValue || {}),
        ]
          .map((lang) => String(lang || '').trim())
          .filter(Boolean)
      )
    ).sort((left, right) => {
      const diff = getLangSortWeight(left) - getLangSortWeight(right);
      if (diff !== 0) {
        return diff;
      }
      return left.localeCompare(right, 'zh-Hans-CN');
    });
    const isBilingual = normalizedLocalizedVariants.length >= 2;
    const visibleLabel = String(
      param.displayName || (compactLabel ? param.fieldName : '') || param.fieldName || key
    ).trim();
    const getLocalizedLabel = (lang: string) => {
      const normalized = String(lang || '')
        .trim()
        .toLowerCase();
      if (
        normalized === 'zh' ||
        normalized === 'zh-cn' ||
        normalized === 'zh-hans' ||
        normalized === 'zh-hans-cn' ||
        normalized === 'cn'
      ) {
        return '中文';
      }
      if (normalized === 'jp' || normalized === 'ja') {
        return '日文';
      }
      if (normalized === 'en' || normalized === 'en-us' || normalized === 'en-gb') {
        return '英文';
      }
      return lang;
    };

    return (
      <div
        key={key}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, 220px) auto minmax(0, 1fr) auto',
          gap: 10,
          alignItems: 'center',
          padding: '12px 14px',
          border: '1px solid var(--bg-secondary)',
          borderRadius: 14,
          background: 'var(--bg-card)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <Tooltip title={param.description || '未填写用途'}>
          <Text strong ellipsis style={{ minWidth: 0, fontSize: 13, cursor: 'help' }}>
            {visibleLabel}
          </Text>
        </Tooltip>
        <Checkbox
          checked={param.required === true}
          onChange={(event) =>
            updateSingleWorkflowInputParam(key, { ...param, required: event.target.checked })
          }
          style={{ whiteSpace: 'nowrap' }}
        >
          必填
        </Checkbox>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isBilingual ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
            gap: 8,
            minWidth: 0,
            width: '100%',
          }}
        >
          {normalizedLocalizedVariants.length > 0 ? (
            normalizedLocalizedVariants.map((lang) => (
              <Input
                key={`${key}-${lang}`}
                value={
                  param.localizedDefaultValue?.[lang] === undefined ||
                  param.localizedDefaultValue?.[lang] === null
                    ? ''
                    : String(param.localizedDefaultValue?.[lang])
                }
                onChange={(event) =>
                  updateSingleWorkflowInputParam(key, {
                    ...param,
                    localizedDefaultValue: {
                      ...(param.localizedDefaultValue || {}),
                      [lang]: event.target.value,
                    },
                  })
                }
                placeholder={isBilingual ? `${getLocalizedLabel(lang)}默认值` : '默认值'}
                size="small"
                style={{ width: '100%' }}
              />
            ))
          ) : (
            <Input
              value={param.defaultValue || ''}
              onChange={(event) =>
                updateSingleWorkflowInputParam(key, { ...param, defaultValue: event.target.value })
              }
              placeholder="默认值"
              size="small"
              style={{ width: '100%' }}
            />
          )}
        </div>
        <Button
          size="small"
          danger
          type="text"
          onClick={() => {
            const newParams = { ...workflowDsl.inputParams };
            delete (newParams as any)[key];
            setWorkflowDsl({ ...workflowDsl, inputParams: newParams });
          }}
          style={{ paddingInline: 4, flexShrink: 0, justifySelf: 'end' }}
        >
          ×
        </Button>
      </div>
    );
  };

  const renderCollapsibleInputSection = (
    panelKey: string,
    title: React.ReactNode,
    children: React.ReactNode
  ) => (
    <Collapse
      size="small"
      defaultActiveKey={[panelKey]}
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--bg-card)',
        border: '1px solid var(--bg-secondary)',
      }}
      items={[
        {
          key: panelKey,
          label: title,
          children,
          styles: {
            header: { padding: '12px 14px' },
            body: { padding: '0 14px 14px' },
          },
        },
      ]}
    />
  );

  const renderArrayGroupTitle = (arrayGroup: GroupedWorkflowInputParams['arrayGroups'][number]) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        width: '100%',
      }}
    >
      <Space size={8} wrap>
        <span>{`循环变量 · ${arrayGroup.arrayPath}`}</span>
        <Tag color="purple" style={{ margin: 0 }}>
          {arrayGroup.entries.length} 项
        </Tag>
      </Space>
      <Space size={8} wrap onClick={(event) => event.stopPropagation()}>
        <Button
          size="small"
          onClick={() =>
            updateArrayGroupRequiredState(
              arrayGroup.entries.map(([entryKey]) => entryKey),
              true
            )
          }
        >
          全选
        </Button>
        <Button
          size="small"
          onClick={() =>
            updateArrayGroupRequiredState(
              arrayGroup.entries.map(([entryKey]) => entryKey),
              false
            )
          }
        >
          清除
        </Button>
      </Space>
    </div>
  );

  const renderWorkflowInputGroup = (group: GroupedWorkflowInputParams) => (
    <Space key={group.key} direction="vertical" size={12} style={{ width: '100%' }}>
      {group.scalarEntries.length > 0
        ? renderCollapsibleInputSection(
            `${group.key}-scalar`,
            <Space size={8} wrap>
              <span>普通变量</span>
              <Tag style={{ margin: 0 }}>{group.scalarEntries.length} 项</Tag>
            </Space>,
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  group.scalarEntries.length > 1 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
                gap: 8,
              }}
            >
              {group.scalarEntries.map(([key, param]) => renderInputParamEditor(key, param))}
            </div>
          )
        : null}
      {group.arrayGroups.map((arrayGroup) => (
        <div key={`${group.key}-${arrayGroup.arrayPath}`}>
          {renderCollapsibleInputSection(
            `${group.key}-${arrayGroup.arrayPath}`,
            renderArrayGroupTitle(arrayGroup),
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  arrayGroup.entries.length > 1 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
                gap: 8,
              }}
            >
              {arrayGroup.entries.map(([key, param]) => renderInputParamEditor(key, param, true))}
            </div>
          )}
        </div>
      ))}
    </Space>
  );

  return (
    <Card
      title="输入参数（Workflow 入参明细）"
      size="small"
      style={{ ...SECTION_CARD_STYLE, marginBottom: 16 }}
      styles={{ body: SECTION_CARD_BODY_STYLE }}
    >
      <div style={SOFT_PANEL_STYLE}>
        {groupedWorkflowInputParams.length <= 1 ? (
          groupedWorkflowInputParams.length === 0 ? (
            <Text type="secondary">当前没有输入参数，可手动添加。</Text>
          ) : (
            renderWorkflowInputGroup(groupedWorkflowInputParams[0])
          )
        ) : (
          <Tabs
            type="card"
            items={groupedWorkflowInputParams.map((group) => ({
              key: group.key,
              label: (
                <Space size={6}>
                  <span>{group.label}</span>
                  {group.scalarEntries.length > 0 ? (
                    <Tag style={{ margin: 0 }}>普通 {group.scalarEntries.length}</Tag>
                  ) : null}
                  {group.arrayGroups.length > 0 ? (
                    <Tag color="purple" style={{ margin: 0 }}>
                      循环 {group.arrayGroups.length}
                    </Tag>
                  ) : null}
                </Space>
              ),
              children: renderWorkflowInputGroup(group),
            }))}
          />
        )}
      </div>
    </Card>
  );
};
