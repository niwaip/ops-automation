import { Space, Card, Tag, Typography, Alert, Tooltip } from 'antd';
import type { AiWorkflowDraft } from '@/api/temporal';
import {
  groupWorkflowInputParams,
  asPlainRecord,
  collectTemplateVariablesFromValue,
  shorten,
  HTTP_REQUEST_STEP_CONFIG_KEY,
  STRUCTURED_TRANSFORM_STEP_CONFIG_KEY,
} from './workflowEditHelpers';

const { Text } = Typography;

export const renderDraftInputParamSummary = (draft: AiWorkflowDraft) => {
  const groups = groupWorkflowInputParams(draft.workflowDsl.inputParams);
  if (groups.length === 0) {
    return <Text type="secondary">未声明输入参数</Text>;
  }
  return (
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      {groups.map((group) => (
        <Card key={`draft-group-${group.key}`} size="small" title={group.label}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {group.scalarEntries.map(([key, value]) => (
              <div
                key={`draft-input-${group.key}-${key}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '96px 64px minmax(0, 1fr)',
                  gap: 8,
                  alignItems: 'start',
                  padding: '8px 10px',
                  border: '1px solid var(--bg-secondary)',
                  borderRadius: 8,
                  background: 'var(--bg-card)',
                }}
              >
                <Tag color="blue" style={{ margin: 0, width: 'fit-content' }}>
                  {key}
                </Tag>
                <Tag
                  color={value.required ? 'red' : 'default'}
                  style={{ margin: 0, width: 'fit-content' }}
                >
                  {value.required ? '必填' : '可选'}
                </Tag>
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  {value.description ? (
                    <Text>{value.description}</Text>
                  ) : (
                    <Text type="secondary">未填写说明</Text>
                  )}
                  {value.defaultValue ? (
                    <Text type="secondary">默认值: {value.defaultValue}</Text>
                  ) : null}
                </Space>
              </div>
            ))}
            {group.arrayGroups.map((arrayGroup) => (
              <Card
                key={`draft-array-${group.key}-${arrayGroup.arrayPath}`}
                size="small"
                title={`循环变量 · ${arrayGroup.arrayPath}`}
              >
                <Space wrap size={[6, 6]}>
                  {arrayGroup.entries.map(([key, value]) => (
                    <Tooltip key={`draft-array-tag-${key}`} title={value.description || key}>
                      <Tag color="purple" style={{ margin: 0 }}>
                        {value.fieldName || key}
                      </Tag>
                    </Tooltip>
                  ))}
                </Space>
              </Card>
            ))}
          </Space>
        </Card>
      ))}
    </Space>
  );
};

export const renderDraftOutputParamSummary = (draft: AiWorkflowDraft) => {
  const entries = Object.entries(draft.workflowDsl.outputParams || {});
  if (entries.length === 0) {
    return <Text type="secondary">未声明输出参数</Text>;
  }
  return (
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      {entries.map(([key, value]) => (
        <div
          key={`draft-output-${key}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '110px minmax(0, 1fr)',
            gap: 8,
            alignItems: 'start',
            padding: '8px 10px',
            border: '1px solid var(--bg-secondary)',
            borderRadius: 8,
            background: 'var(--bg-card)',
          }}
        >
          <Tag color="green" style={{ margin: 0, width: 'fit-content' }}>
            {key}
          </Tag>
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            {value.description ? (
              <Text>{value.description}</Text>
            ) : (
              <Text type="secondary">未填写说明</Text>
            )}
            {value.sourceStep ? <Text type="secondary">来源步骤: {value.sourceStep}</Text> : null}
          </Space>
        </div>
      ))}
    </Space>
  );
};

export const renderDraftContractCard = (draft: AiWorkflowDraft) => {
  const inputEntries = Object.entries(draft.workflowDsl.inputParams || {});
  const requiredInputs = inputEntries.filter(([, value]) => value.required);
  const optionalInputs = inputEntries.filter(([, value]) => !value.required);
  const outputEntries = Object.entries(draft.workflowDsl.outputParams || {});
  const stepEntries = draft.workflowDsl.steps || [];
  const sampleInputPayload = inputEntries.reduce<Record<string, string>>((acc, [key, value]) => {
    const description = String(value.description || '').trim();
    const fallback = value.required ? `<required:${key}>` : `<optional:${key}>`;
    acc[key] = value.defaultValue || (description ? `<${description}>` : fallback);
    return acc;
  }, {});
  const sampleOutputPayload = outputEntries.reduce<Record<string, string>>(
    (acc, [key, value]) => {
      const description = String(value.description || '').trim();
      const sourceStep = String(value.sourceStep || '').trim();
      acc[key] = description || (sourceStep ? `<from:${sourceStep}>` : `<output:${key}>`);
      return acc;
    },
    {}
  );

  const renderKeyTags = (
    entries: Array<
      [
        string,
        { description?: string; required?: boolean; defaultValue?: string; sourceStep?: string },
      ]
    >,
    color: string,
    emptyText: string
  ) => {
    if (entries.length === 0) {
      return <Text type="secondary">{emptyText}</Text>;
    }
    return (
      <Space wrap size={[6, 6]}>
        {entries.map(([key, value]) => (
          <Tooltip
            key={`contract-${color}-${key}`}
            title={
              [
                value.description ? `说明: ${value.description}` : '',
                value.defaultValue ? `默认值: ${value.defaultValue}` : '',
                value.sourceStep ? `来源步骤: ${value.sourceStep}` : '',
              ]
                .filter(Boolean)
                .join('\n') || key
            }
          >
            <Tag color={color} style={{ margin: 0 }}>
              {key}
            </Tag>
          </Tooltip>
        ))}
      </Space>
    );
  };

  const stepCallItems = stepEntries.map((step, index) => {
    const rawInput = asPlainRecord(step.input);
    const httpConfig = asPlainRecord(rawInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
    const transformConfig = asPlainRecord(rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
    const inputVariables = Array.from(
      collectTemplateVariablesFromValue({
        ...rawInput,
        ...(Object.keys(httpConfig).length > 0 ? httpConfig : {}),
        ...(Object.keys(transformConfig).length > 0 ? transformConfig : {}),
      })
    );
    return {
      key: `step-call-${step.id || index}`,
      stepLabel: step.name || `步骤 ${index + 1}`,
      activityLabel: step.activityName || step.activityRef || '未指定 Activity',
      timeout: step.startToCloseTimeout || '-',
      callType:
        Object.keys(httpConfig).length > 0
          ? `HTTP ${(httpConfig.method || 'GET').toString().toUpperCase()}`
          : Object.keys(transformConfig).length > 0
            ? `结构化转换 ${transformConfig.outputMode || 'json'}`
            : '通用 Activity',
      target:
        Object.keys(httpConfig).length > 0
          ? httpConfig.urlTemplate || '-'
          : Object.keys(transformConfig).length > 0
            ? shorten(String(transformConfig.instructionTemplate || '结构化转换'), 60)
            : '-',
      params: inputVariables,
    };
  });

  const lineageItems = stepEntries.flatMap((step, index) => {
    const rawInput = asPlainRecord(step.input);
    const httpConfig = asPlainRecord(rawInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
    const transformConfig = asPlainRecord(rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
    const responseFieldMappings = asPlainRecord(httpConfig.responseFieldMappings);
    const outputSchema = asPlainRecord(transformConfig.outputSchema);
    const inputVariables = Array.from(
      collectTemplateVariablesFromValue({
        ...rawInput,
        ...(Object.keys(httpConfig).length > 0 ? httpConfig : {}),
        ...(Object.keys(transformConfig).length > 0 ? transformConfig : {}),
      })
    );

    const baseInfo = {
      stepLabel: step.name || `步骤 ${index + 1}`,
      activityLabel: step.activityName || step.activityRef || '未指定 Activity',
    };
    const transformFieldMappings = asPlainRecord(transformConfig.fieldMappings);

    const inputLinks = inputVariables.map((variable) => ({
      key: `lineage-input-${step.id}-${variable}`,
      source: `输入.${variable}`,
      step: baseInfo.stepLabel,
      activity: baseInfo.activityLabel,
      target:
        Object.keys(httpConfig).length > 0
          ? `请求配置.${String(httpConfig.method || 'GET').toUpperCase()}`
          : Object.keys(transformConfig).length > 0
            ? `转换配置.${transformConfig.outputMode || 'json'}`
            : '步骤输入',
      detail:
        Object.keys(httpConfig).length > 0
          ? httpConfig.urlTemplate || '动态请求'
          : Object.keys(transformConfig).length > 0
            ? transformConfig.textTemplate ||
              transformConfig.instructionTemplate ||
              (Object.keys(transformFieldMappings).length > 0
                ? Object.entries(transformFieldMappings)
                    .map(([k, v]) => `${k}<-${v}`)
                    .join('；')
                : '结构化转换')
            : '',
    }));

    const outputLinks = Object.entries(draft.workflowDsl.outputParams || {})
      .filter(([, value]) => (value.sourceStep || '') === step.id)
      .map(([key, value]) => ({
        key: `lineage-output-${step.id}-${key}`,
        source: baseInfo.stepLabel,
        step: baseInfo.stepLabel,
        activity: baseInfo.activityLabel,
        target: `输出.${key}`,
        detail: value.description || '',
      }));

    const responseMappingLinks = Object.entries(responseFieldMappings).map(([key, value]) => ({
      key: `lineage-http-map-${step.id}-${key}`,
      source: baseInfo.stepLabel,
      step: baseInfo.stepLabel,
      activity: baseInfo.activityLabel,
      target: `字段.${key}`,
      detail: `提取路径 ${value}`,
    }));

    const schemaLinks = Object.keys(outputSchema).map((key) => ({
      key: `lineage-schema-${step.id}-${key}`,
      source: baseInfo.stepLabel,
      step: baseInfo.stepLabel,
      activity: baseInfo.activityLabel,
      target: `字段.${key}`,
      detail: typeof outputSchema[key] === 'string' ? String(outputSchema[key]) : '输出结构字段',
    }));

    return [...inputLinks, ...responseMappingLinks, ...schemaLinks, ...outputLinks];
  });

  const groupedLineageSections = [
    {
      title: '输入驱动',
      items: lineageItems.filter((item) => item.source.startsWith('输入.')),
    },
    {
      title: '步骤提取',
      items: lineageItems.filter((item) => item.target.startsWith('字段.')),
    },
    {
      title: '最终输出',
      items: lineageItems.filter((item) => item.target.startsWith('输出.')),
    },
  ].filter((section) => section.items.length > 0);

  const qualityHints = [
    ...(inputEntries.length === 0
      ? ['当前草稿还没有显式声明输入参数，建议确认是否需要定义标准入口契约。']
      : []),
    ...(requiredInputs.some(([, value]) => !String(value.description || '').trim())
      ? ['存在必填输入缺少参数说明，建议补充 description，方便调用方理解。']
      : []),
    ...(outputEntries.length === 0
      ? ['当前草稿还没有显式声明输出字段，返回结构可能只能依赖最后一步结果。']
      : []),
    ...(outputEntries.some(([, value]) => !String(value.description || '').trim())
      ? ['存在输出字段缺少说明，建议补充 outputParams.description。']
      : []),
    ...stepEntries.flatMap((step, index) => {
      const rawInput = asPlainRecord(step.input);
      const httpConfig = asPlainRecord(rawInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
      const transformConfig = asPlainRecord(rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
      const stepName = step.name || `步骤 ${index + 1}`;
      const messages: string[] = [];
      if (Object.keys(httpConfig).length > 0) {
        if (!String(httpConfig.urlTemplate || '').trim()) {
          messages.push(`${stepName} 使用了 HTTP 请求能力，但还没有明确的 URL 模版。`);
        }
        if (
          (httpConfig.responseMode || '') === 'bodyMap' &&
          Object.keys(asPlainRecord(httpConfig.responseFieldMappings)).length === 0
        ) {
          messages.push(`${stepName} 设置了多字段返回，但还没有配置字段映射。`);
        }
      }
      if (Object.keys(transformConfig).length > 0) {
        const isAiTransform = step.activityRef === 'builtin:aiStructuredTransform';
        if (isAiTransform && !String(transformConfig.instructionTemplate || '').trim()) {
          messages.push(`${stepName} 使用了 AI 结构化转换，但还没有明确的处理规则。`);
        }
        if (
          !isAiTransform &&
          (transformConfig.outputMode || 'json') === 'text' &&
          !String(transformConfig.textTemplate || '').trim() &&
          Object.keys(asPlainRecord(transformConfig.fieldMappings)).length === 0
        ) {
          messages.push(
            `${stepName} 使用了固定规则文本转换，但还没有配置 textTemplate 或 fieldMappings。`
          );
        }
        if (
          (transformConfig.outputMode || 'json') === 'json' &&
          Object.keys(asPlainRecord(transformConfig.outputSchema)).length === 0
        ) {
          messages.push(`${stepName} 输出模式为 JSON，但还没有定义 outputSchema。`);
        }
      }
      if (!step.activityName && !step.activityRef) {
        messages.push(`${stepName} 还没有绑定 Activity。`);
      }
      return messages;
    }),
  ];

  return (
    <div style={{ marginTop: 12 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: 10,
              padding: 10,
              border: '1px solid var(--bg-secondary)',
            }}
          >
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              必填输入
            </Text>
            {renderKeyTags(requiredInputs, 'red', '当前没有必填输入')}
          </div>
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: 10,
              padding: 10,
              border: '1px solid var(--bg-secondary)',
            }}
          >
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              可选输入
            </Text>
            {renderKeyTags(optionalInputs, 'default', '当前没有可选输入')}
          </div>
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: 10,
              padding: 10,
              border: '1px solid var(--bg-secondary)',
            }}
          >
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              输出字段
            </Text>
            {renderKeyTags(outputEntries, 'green', '当前没有声明输出字段')}
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: 10,
            padding: 10,
            border: '1px solid var(--bg-secondary)',
          }}
        >
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            草稿质量提示
          </Text>
          {qualityHints.length === 0 ? (
            <Alert type="success" showIcon message="当前草稿的输入、输出和步骤配置都比较完整。" />
          ) : (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {qualityHints.map((item, index) => (
                <Alert key={`quality-hint-${index}`} type="warning" showIcon message={item} />
              ))}
            </Space>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 10,
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: 10,
              padding: 10,
              border: '1px solid var(--bg-secondary)',
            }}
          >
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              输入示例 JSON
            </Text>
            <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto', fontSize: 11 }}>
              {JSON.stringify(sampleInputPayload, null, 2)}
            </pre>
          </div>
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: 10,
              padding: 10,
              border: '1px solid var(--bg-secondary)',
            }}
          >
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              输出示例 JSON
            </Text>
            <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto', fontSize: 11 }}>
              {JSON.stringify(sampleOutputPayload, null, 2)}
            </pre>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 10,
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: 10,
              padding: 10,
              border: '1px solid var(--bg-secondary)',
            }}
          >
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              入口摘要
            </Text>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Text>工作流名称: {draft.workflowDsl.name || draft.name}</Text>
              <Text>
                Task Queue: {draft.taskQueue || draft.workflowDsl.taskQueue || 'SKILL_TASK_QUEUE'}
              </Text>
              <Text>
                入口参数:{' '}
                {inputEntries.length === 0 ? '无' : inputEntries.map(([key]) => key).join('，')}
              </Text>
              <Text>
                必填参数:{' '}
                {requiredInputs.length === 0
                  ? '无'
                  : requiredInputs.map(([key]) => key).join('，')}
              </Text>
            </Space>
          </div>
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: 10,
              padding: 10,
              border: '1px solid var(--bg-secondary)',
            }}
          >
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              返回摘要
            </Text>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Text>
                输出字段:{' '}
                {outputEntries.length === 0
                  ? '未声明'
                  : outputEntries.map(([key]) => key).join('，')}
              </Text>
              <Text>
                来源步骤:{' '}
                {Array.from(
                  new Set(outputEntries.map(([, value]) => value.sourceStep).filter(Boolean))
                ).join('，') || '默认最后一步'}
              </Text>
              <Text type="secondary">
                返回结构优先基于 outputParams 定义，若未声明则以最后一步结果为准。
              </Text>
            </Space>
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: 10,
            padding: 10,
            border: '1px solid var(--bg-secondary)',
          }}
        >
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            步骤调用摘要
          </Text>
          {stepCallItems.length === 0 ? (
            <Text type="secondary">当前草稿还没有步骤调用信息</Text>
          ) : (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {stepCallItems.map((item) => (
                <div
                  key={item.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 0.9fr)',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--bg-secondary)',
                  }}
                >
                  <div>
                    <Space wrap size={[6, 6]}>
                      <Tag color="purple" style={{ margin: 0 }}>
                        {item.stepLabel}
                      </Tag>
                      <Tag color="blue" style={{ margin: 0 }}>
                        {item.activityLabel}
                      </Tag>
                      <Tag style={{ margin: 0 }}>{item.callType}</Tag>
                    </Space>
                    <div style={{ marginTop: 6, fontSize: 12 }}>{item.target}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>超时: {item.timeout}</div>
                    <div style={{ fontSize: 12 }}>
                      输入依赖:{' '}
                      {item.params.length > 0 ? item.params.join('，') : '无显式模版变量'}
                    </div>
                  </div>
                </div>
              ))}
            </Space>
          )}
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: 10,
            padding: 10,
            border: '1px solid var(--bg-secondary)',
          }}
        >
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            字段来源链路
          </Text>
          {groupedLineageSections.length === 0 ? (
            <Text type="secondary">当前草稿还无法推导明确的字段链路</Text>
          ) : (
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {groupedLineageSections.map((section) => (
                <div key={section.title}>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>
                    {section.title}
                  </Text>
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    {section.items.slice(0, 12).map((item) => (
                      <div
                        key={item.key}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 0.9fr) 28px minmax(0, 1.1fr)',
                          gap: 8,
                          alignItems: 'center',
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: 'var(--bg-secondary)',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <Text strong>{item.source}</Text>
                          {item.detail ? (
                            <div
                              style={{
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                                marginTop: 2,
                              }}
                            >
                              {item.detail}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                          {'->'}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <Text>{item.target}</Text>
                          <div
                            style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}
                          >
                            {item.step} / {item.activity}
                          </div>
                        </div>
                      </div>
                    ))}
                  </Space>
                </div>
              ))}
            </Space>
          )}
        </div>
      </Space>
    </div>
  );
};

export const renderDraftStepSummary = (draft: AiWorkflowDraft) => {
  const steps = draft.workflowDsl.steps || [];
  if (steps.length === 0) {
    return <Text type="secondary">未生成步骤</Text>;
  }
  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {steps.map((step, index) => {
        const rawInput = asPlainRecord(step.input);
        const httpConfig = asPlainRecord(rawInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
        const transformConfig = asPlainRecord(rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
        const responseFieldMappings = asPlainRecord(httpConfig.responseFieldMappings);
        const outputSchema = asPlainRecord(transformConfig.outputSchema);
        const transformFieldMappings = asPlainRecord(transformConfig.fieldMappings);
        const isAiTransform = step.activityRef === 'builtin:aiStructuredTransform';
        return (
          <div
            key={`draft-step-${step.id || index}`}
            style={{
              padding: '10px 12px',
              border: '1px solid var(--bg-secondary)',
              borderRadius: 10,
              background: 'var(--bg-card)',
            }}
          >
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space wrap size={[6, 6]}>
                <Tag color="purple" style={{ margin: 0 }}>
                  步骤 {index + 1}
                </Tag>
                <Text strong>{step.name || `步骤 ${index + 1}`}</Text>
                {step.activityName ? <Tag style={{ margin: 0 }}>{step.activityName}</Tag> : null}
                {step.startToCloseTimeout ? (
                  <Tag color="gold" style={{ margin: 0 }}>
                    {step.startToCloseTimeout}
                  </Tag>
                ) : null}
              </Space>

              {Object.keys(httpConfig).length > 0 ? (
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Text>
                    HTTP 请求: {(httpConfig.method || 'GET').toString().toUpperCase()}{' '}
                    {httpConfig.urlTemplate || '-'}
                  </Text>
                  <Text type="secondary">返回模式: {httpConfig.responseMode || 'body'}</Text>
                  {httpConfig.responseBodyPath ? (
                    <Text type="secondary">提取路径: {httpConfig.responseBodyPath}</Text>
                  ) : null}
                  {Object.keys(responseFieldMappings).length > 0 ? (
                    <Text type="secondary">
                      字段映射:{' '}
                      {Object.entries(responseFieldMappings)
                        .map(([k, v]) => `${k} <- ${v}`)
                        .join('；')}
                    </Text>
                  ) : null}
                </Space>
              ) : null}

              {Object.keys(transformConfig).length > 0 ? (
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Text>
                    {isAiTransform ? 'AI 结构化转换' : '固定规则结构化转换'}:{' '}
                    {transformConfig.contentType || 'text'} {'->'}{' '}
                    {transformConfig.outputMode || 'json'}
                  </Text>
                  {transformConfig.instructionTemplate ? (
                    <Text type="secondary">
                      处理规则: {shorten(String(transformConfig.instructionTemplate), 80)}
                    </Text>
                  ) : null}
                  {!isAiTransform && Object.keys(transformFieldMappings).length > 0 ? (
                    <Text type="secondary">
                      字段映射:{' '}
                      {Object.entries(transformFieldMappings)
                        .map(([k, v]) => `${k} <- ${v}`)
                        .join('；')}
                    </Text>
                  ) : null}
                  {!isAiTransform && transformConfig.textTemplate ? (
                    <Text type="secondary">
                      文本模版: {shorten(String(transformConfig.textTemplate), 80)}
                    </Text>
                  ) : null}
                  {Object.keys(outputSchema).length > 0 ? (
                    <div
                      style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 8 }}
                    >
                      <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                        输出结构
                      </Text>
                      <pre style={{ margin: 0, maxHeight: 140, overflow: 'auto', fontSize: 11 }}>
                        {JSON.stringify(outputSchema, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </Space>
              ) : null}
            </Space>
          </div>
        );
      })}
    </Space>
  );
};

export const buildDraftDiffSummary = (current: AiWorkflowDraft, previous?: AiWorkflowDraft | null) => {
  if (!previous) {
    return {
      addedInputs: Object.keys(current.workflowDsl.inputParams || {}),
      changedInputs: [] as string[],
      addedOutputs: Object.keys(current.workflowDsl.outputParams || {}),
      changedOutputs: [] as string[],
      addedSteps: (current.workflowDsl.steps || []).map(
        (s, idx) => s.name || s.activityName || `步骤 ${idx + 1}`
      ),
      changedSteps: [] as string[],
    };
  }

  const currInputs = current.workflowDsl.inputParams || {};
  const prevInputs = previous.workflowDsl.inputParams || {};
  const addedInputs = Object.keys(currInputs).filter((k) => !prevInputs[k]);
  const changedInputs = Object.keys(currInputs).filter(
    (k) => prevInputs[k] && JSON.stringify(currInputs[k]) !== JSON.stringify(prevInputs[k])
  );

  const currOutputs = current.workflowDsl.outputParams || {};
  const prevOutputs = previous.workflowDsl.outputParams || {};
  const addedOutputs = Object.keys(currOutputs).filter((k) => !prevOutputs[k]);
  const changedOutputs = Object.keys(currOutputs).filter(
    (k) => prevOutputs[k] && JSON.stringify(currOutputs[k]) !== JSON.stringify(prevOutputs[k])
  );

  const currSteps = current.workflowDsl.steps || [];
  const prevSteps = previous.workflowDsl.steps || [];
  const prevStepIds = new Set(prevSteps.map((s) => s.id).filter(Boolean));
  const addedSteps = currSteps
    .filter((s) => !s.id || !prevStepIds.has(s.id))
    .map((s, idx) => s.name || s.activityName || `步骤 ${idx + 1}`);

  const prevStepMap = new Map(prevSteps.map((s) => [s.id, s]));
  const changedSteps = currSteps
    .filter((s) => s.id && prevStepMap.has(s.id))
    .filter((s) => JSON.stringify(s) !== JSON.stringify(prevStepMap.get(s.id)))
    .map((s, idx) => s.name || s.activityName || `步骤 ${idx + 1}`);

  return {
    addedInputs,
    changedInputs,
    addedOutputs,
    changedOutputs,
    addedSteps,
    changedSteps,
  };
};

export const renderDraftDiffSummary = (current: AiWorkflowDraft, previous?: AiWorkflowDraft | null) => {
  const diff = buildDraftDiffSummary(current, previous);
  const hasChanges =
    diff.addedInputs.length > 0 ||
    diff.changedInputs.length > 0 ||
    diff.addedOutputs.length > 0 ||
    diff.changedOutputs.length > 0 ||
    diff.addedSteps.length > 0 ||
    diff.changedSteps.length > 0;
  if (!hasChanges) {
    return (
      <Alert
        type="info"
        showIcon
        message={
          previous
            ? '本轮草稿与上一轮相比没有识别到明显结构变化。'
            : '这是首轮草稿，后续修改会在这里展示差异。'
        }
      />
    );
  }
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: 10,
        padding: 10,
        border: '1px solid var(--bg-secondary)',
      }}
    >
      <Text strong style={{ display: 'block', marginBottom: 8 }}>
        相对上一轮的变化
      </Text>
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        {diff.addedInputs.length > 0 ? (
          <Alert
            type="success"
            showIcon
            message={`新增输入参数: ${diff.addedInputs.join('，')}`}
          />
        ) : null}
        {diff.changedInputs.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message={`输入参数已调整: ${diff.changedInputs.join('；')}`}
          />
        ) : null}
        {diff.addedOutputs.length > 0 ? (
          <Alert
            type="success"
            showIcon
            message={`新增输出字段: ${diff.addedOutputs.join('，')}`}
          />
        ) : null}
        {diff.changedOutputs.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message={`输出字段已调整: ${diff.changedOutputs.join('；')}`}
          />
        ) : null}
        {diff.addedSteps.length > 0 ? (
          <Alert type="success" showIcon message={`新增步骤: ${diff.addedSteps.join('，')}`} />
        ) : null}
        {diff.changedSteps.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message={`已调整步骤: ${diff.changedSteps.join('，')}`}
          />
        ) : null}
      </Space>
    </div>
  );
};
