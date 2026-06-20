import { Injectable } from '@nestjs/common';
import { BrowserCommandCandidate } from './browser-command.service';

interface RecorderObservationTraceEntry {
  candidateId: string;
  source: string;
  kind: string;
  reasons: string[];
  summary: string;
}

interface RecorderSuggestedParameter {
  name: string;
  label: string;
  required: boolean;
  reason: string;
}

interface RecorderObservationLike {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  rows?: Array<Record<string, unknown>>;
  regions?: Array<Record<string, unknown>>;
  pageSemantics?: Record<string, unknown>;
  candidates?: BrowserCommandCandidate[];
  candidateTrace?: RecorderObservationTraceEntry[];
  headings: string[];
  links: string[];
  suggestedParameters: RecorderSuggestedParameter[];
}

type SemanticCandidateInput = {
  kind: 'action' | 'field' | 'row' | 'region';
  item: Record<string, unknown>;
  reasons: string[];
};

@Injectable()
export class RecorderObservationService {
  describeObservedElement(item: Record<string, unknown>): string | undefined {
    const segments: string[] = [];
    const ref =
      typeof item.ref === 'string' && item.ref.trim().length > 0 ? item.ref.trim() : undefined;
    const elementId =
      typeof item.id === 'string' && item.id.trim().length > 0 ? item.id.trim() : undefined;
    const dataTestId =
      typeof item.dataTestId === 'string' && item.dataTestId.trim().length > 0
        ? item.dataTestId.trim()
        : undefined;
    const role =
      typeof item.role === 'string' && item.role.trim().length > 0 ? item.role.trim() : undefined;
    const region =
      typeof item.region === 'string' && item.region.trim().length > 0
        ? item.region.trim()
        : undefined;
    const rowKey =
      typeof item.rowKey === 'string' && item.rowKey.trim().length > 0
        ? item.rowKey.trim()
        : undefined;
    const rowText =
      typeof item.rowText === 'string' && item.rowText.trim().length > 0
        ? item.rowText.trim()
        : undefined;
    const field =
      typeof item.field === 'string' && item.field.trim().length > 0
        ? item.field.trim()
        : undefined;
    const action =
      typeof item.action === 'string' && item.action.trim().length > 0
        ? item.action.trim()
        : undefined;
    const stableName =
      typeof item.stableName === 'string' && item.stableName.trim().length > 0
        ? item.stableName.trim()
        : undefined;
    const rowIndex =
      typeof item.rowIndex === 'number'
        ? item.rowIndex + 1
        : typeof item.rowIndex === 'string' && item.rowIndex.trim().length > 0
          ? item.rowIndex.trim()
          : undefined;

    if (ref) {
      segments.push(`ref=${ref}`);
    }
    if (elementId) {
      segments.push(`id=${elementId}`);
    }
    if (dataTestId) {
      segments.push(`testid=${dataTestId}`);
    }
    if (role) {
      segments.push(`role=${role}`);
    }
    if (region) {
      segments.push(`region=${region}`);
    }
    if (rowIndex) {
      segments.push(`row=${rowIndex}`);
    }
    if (rowKey) {
      segments.push(`rowKey=${rowKey}`);
    }
    if (field) {
      segments.push(`field=${field}`);
    }
    if (action) {
      segments.push(`action=${action}`);
    }
    if (stableName) {
      segments.push(`stable=${stableName}`);
    }

    const primaryLabel = [
      item.label,
      item.placeholder,
      item.text,
      item.name,
      item.type,
      item.role,
    ].find((fieldValue) => typeof fieldValue === 'string' && fieldValue.trim().length > 0);

    if (typeof primaryLabel === 'string' && primaryLabel.trim().length > 0) {
      segments.push(`label=${primaryLabel.trim()}`);
    }
    if (rowText) {
      segments.push(`rowText=${rowText.slice(0, 80)}`);
    }

    return segments.length > 0 ? segments.join(' | ') : undefined;
  }

  buildObservedElementDescriptions(items: Array<Record<string, unknown>>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of items) {
      const description = this.describeObservedElement(item);
      if (!description || seen.has(description)) {
        continue;
      }
      seen.add(description);
      result.push(description);
    }
    return result;
  }

  buildCandidatesAndTrace(
    observation: Pick<
      RecorderObservationLike,
      'inputs' | 'buttons' | 'rows' | 'regions' | 'pageSemantics'
    >
  ): {
    candidates: BrowserCommandCandidate[];
    trace: RecorderObservationTraceEntry[];
  } {
    const candidates: BrowserCommandCandidate[] = [];
    const trace: RecorderObservationTraceEntry[] = [];
    const seen = new Set<string>();
    let candidateIndex = 0;
    const nextCandidateId = (kind: BrowserCommandCandidate['kind']) =>
      `${kind}_${++candidateIndex}`;

    const push = (candidate: BrowserCommandCandidate | undefined, reasons: string[]) => {
      if (!candidate || seen.has(candidate.summary)) {
        return;
      }
      seen.add(candidate.summary);
      candidates.push(candidate);
      trace.push({
        candidateId: candidate.candidateId,
        source: candidate.source,
        kind: candidate.kind,
        reasons,
        summary: candidate.summary,
      });
    };

    for (const input of observation.inputs) {
      push(this.buildCandidate(nextCandidateId('input'), 'input', 'probe', input), [
        'visible_input',
      ]);
    }
    for (const button of observation.buttons) {
      push(this.buildCandidate(nextCandidateId('action'), 'action', 'probe', button), [
        'visible_button',
      ]);
    }
    for (const row of observation.rows || []) {
      push(this.buildCandidate(nextCandidateId('row'), 'row', 'row', row), ['row_container']);
      const rowIndex = typeof row.rowIndex === 'number' ? row.rowIndex : undefined;
      const rowKey = typeof row.rowKey === 'string' ? row.rowKey : undefined;
      const rowText = typeof row.rowText === 'string' ? row.rowText : undefined;
      const region = typeof row.region === 'string' ? row.region : undefined;
      const regionType = typeof row.regionType === 'string' ? row.regionType : undefined;

      const rowButtons = Array.isArray(row.rowButtons)
        ? row.rowButtons.filter(
            (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
          )
        : [];
      for (const rowButton of rowButtons) {
        push(
          this.buildCandidate(nextCandidateId('action'), 'action', 'row', {
            ...rowButton,
            rowIndex,
            rowKey,
            rowText,
            region,
            regionType,
          }),
          ['row_action']
        );
      }

      const rowFields = Array.isArray(row.rowFields)
        ? row.rowFields.filter(
            (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
          )
        : [];
      for (const rowField of rowFields) {
        push(
          this.buildCandidate(nextCandidateId('field'), 'field', 'row', {
            ...rowField,
            rowIndex,
            rowKey,
            rowText,
            region,
            regionType,
          }),
          ['row_field']
        );
      }
    }

    for (const region of observation.regions || []) {
      push(this.buildCandidate(nextCandidateId('region'), 'region', 'region', region), [
        'region_container',
      ]);
      const regionName = typeof region.region === 'string' ? region.region : undefined;
      const regionType = typeof region.regionType === 'string' ? region.regionType : undefined;
      const fields = Array.isArray(region.fields)
        ? region.fields.filter(
            (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
          )
        : [];
      for (const field of fields) {
        push(
          this.buildCandidate(nextCandidateId('field'), 'field', 'region', {
            ...field,
            region: regionName,
            regionType,
          }),
          ['region_field']
        );
      }
      const actions = Array.isArray(region.actions)
        ? region.actions.filter(
            (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
          )
        : [];
      for (const action of actions) {
        push(
          this.buildCandidate(nextCandidateId('action'), 'action', 'region', {
            ...action,
            region: regionName,
            regionType,
          }),
          ['region_action']
        );
      }
    }

    for (const semanticInput of this.collectSemanticCandidateInputs(observation.pageSemantics)) {
      push(
        this.buildCandidate(
          nextCandidateId(semanticInput.kind),
          semanticInput.kind,
          'semantic',
          semanticInput.item
        ),
        semanticInput.reasons
      );
    }

    return {
      candidates: candidates.slice(0, 40),
      trace: trace.slice(0, 40),
    };
  }

  inferSuggestedParameters(
    observation: Pick<RecorderObservationLike, 'inputs' | 'buttons' | 'title' | 'text'>
  ): RecorderSuggestedParameter[] {
    const params = new Map<string, RecorderSuggestedParameter>();
    const pageSignals = [
      observation.title || '',
      observation.text || '',
      ...observation.buttons.map((button) => String(button.text || '')),
    ]
      .join(' ')
      .toLowerCase();

    const addParam = (name: string, label: string, reason: string, required = true) => {
      if (!params.has(name)) {
        params.set(name, { name, label, required, reason });
      }
    };

    for (const rawInput of observation.inputs) {
      const input = rawInput as Record<string, unknown>;
      const combined = [
        input.name,
        input.placeholder,
        input.label,
        input.labelText,
        input.id,
        input.type,
        input.autocomplete,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (
        /(search|query|keyword|搜|查询|检索)/i.test(combined) ||
        /(百度一下|搜索)/.test(pageSignals)
      ) {
        addParam('keyword', '搜索关键词', '页面存在明显搜索输入入口');
        continue;
      }
      if (/(username|user name|login|account|user|用户名|账号|账户)/i.test(combined)) {
        addParam('username', '用户名/账号', '检测到账号类输入框');
        continue;
      }
      if (/(email|邮箱|mail)/i.test(combined)) {
        addParam('email', '邮箱', '检测到邮箱输入框');
        continue;
      }
      if (/(phone|mobile|tel|手机号|电话)/i.test(combined)) {
        addParam('phone', '手机号', '检测到手机号输入框');
        continue;
      }
      if (/(password|pass|密码)/i.test(combined)) {
        addParam('password', '密码', '检测到密码输入框');
        continue;
      }
      if (
        /(date range|daterange|date_range|日期范围|时间范围|起止日期|开始日期|结束日期)/i.test(
          combined
        )
      ) {
        addParam('dateRange', '日期范围', '检测到时间范围输入');
        continue;
      }
      if (/(date|日期|时间|start date|end date)/i.test(combined)) {
        addParam('date', '日期', '检测到日期输入');
        continue;
      }
      if (/(code|otp|captcha|verification|验证码|校验码)/i.test(combined)) {
        addParam('verificationCode', '验证码', '检测到验证码输入');
        continue;
      }
    }

    if (params.size === 0 && /(百度一下|搜索|search)/i.test(pageSignals)) {
      addParam('keyword', '搜索关键词', '页面包含搜索语义按钮或标题');
    }

    return [...params.values()];
  }

  buildObservationSummary(observation: RecorderObservationLike): string {
    const lines = [
      `当前页面: ${observation.currentPageUrl || 'unknown'}`,
      `页面标题: ${observation.title || 'unknown'}`,
      observation.inputs.length > 0
        ? `可见输入项: ${observation.inputs.map((input) => JSON.stringify(input)).join('；')}`
        : '可见输入项: 无',
      observation.buttons.length > 0
        ? `可见按钮: ${observation.buttons.map((button) => JSON.stringify(button)).join('；')}`
        : '可见按钮: 无',
      observation.rows?.length
        ? `检测到行上下文: ${observation.rows.map((row) => JSON.stringify(row)).join('；')}`
        : '检测到行上下文: 无',
      observation.regions?.length
        ? `检测到页面区域: ${observation.regions.map((region) => JSON.stringify(region)).join('；')}`
        : '检测到页面区域: 无',
      observation.candidates?.length
        ? `候选对象: ${observation.candidates
            .slice(0, 12)
            .map((candidate) => candidate.summary)
            .join('；')}`
        : '候选对象: 无',
      observation.candidateTrace?.length
        ? `候选 trace: ${observation.candidateTrace
            .slice(0, 12)
            .map((item) => `${item.candidateId}[${item.reasons.join(',')}]`)
            .join('；')}`
        : '候选 trace: 无',
      observation.headings.length > 0
        ? `主要标题: ${observation.headings.join('；')}`
        : '主要标题: 无',
      observation.links.length > 0 ? `主要链接: ${observation.links.join('；')}` : '主要链接: 无',
      observation.suggestedParameters.length > 0
        ? `建议补充参数: ${observation.suggestedParameters.map((param) => `${param.name}(${param.label})`).join('；')}`
        : '建议补充参数: 暂无',
      observation.text ? `页面文本摘录: ${observation.text.slice(0, 500)}` : '页面文本摘录: 无',
    ];
    return lines.join('\n');
  }

  private buildCandidate(
    candidateId: string,
    kind: 'action' | 'input' | 'field' | 'row' | 'region',
    source: BrowserCommandCandidate['source'],
    item: Record<string, unknown>
  ): BrowserCommandCandidate | undefined {
    const label = this.pickCandidateLabel(item);
    if (!label) {
      return undefined;
    }

    const ref = typeof item.ref === 'string' && item.ref.trim() ? item.ref.trim() : undefined;
    const elementId = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : undefined;
    const dataTestId =
      typeof item.dataTestId === 'string' && item.dataTestId.trim()
        ? item.dataTestId.trim()
        : undefined;
    const rowIndex =
      typeof item.rowIndex === 'number' && Number.isFinite(item.rowIndex)
        ? item.rowIndex + 1
        : undefined;
    const rowKey =
      typeof item.rowKey === 'string' && item.rowKey.trim() ? item.rowKey.trim() : undefined;
    const rowText =
      typeof item.rowText === 'string' && item.rowText.trim()
        ? item.rowText.trim().slice(0, 120)
        : undefined;
    const regionName =
      typeof item.region === 'string' && item.region.trim() ? item.region.trim() : undefined;
    const regionType =
      typeof item.regionType === 'string' && item.regionType.trim()
        ? item.regionType.trim()
        : undefined;
    const role = typeof item.role === 'string' && item.role.trim() ? item.role.trim() : undefined;
    const action =
      typeof item.action === 'string' && item.action.trim() ? item.action.trim() : undefined;
    const field =
      typeof item.field === 'string' && item.field.trim() ? item.field.trim() : undefined;
    const stableName =
      typeof item.stableName === 'string' && item.stableName.trim()
        ? item.stableName.trim()
        : undefined;
    const text = typeof item.text === 'string' && item.text.trim() ? item.text.trim() : undefined;
    const entityType =
      typeof item.entityType === 'string' && item.entityType.trim()
        ? item.entityType.trim()
        : undefined;
    const entityId =
      typeof item.entityId === 'string' && item.entityId.trim() ? item.entityId.trim() : undefined;
    const semanticPath = Array.isArray(item.semanticPath)
      ? item.semanticPath.filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0
        )
      : undefined;
    const priority =
      typeof item.priority === 'number' && Number.isFinite(item.priority)
        ? item.priority
        : undefined;
    const explicitPreferredLocator = this.normalizeSemanticLocator(item.preferredLocator);

    return {
      candidateId,
      kind,
      label,
      summary: this.buildCandidateSummaryString({
        candidateId,
        kind,
        ref,
        elementId,
        dataTestId,
        role,
        regionName,
        regionType,
        rowIndex,
        rowKey,
        field,
        action,
        stableName,
        entityType,
        entityId,
        semanticPath,
        label,
        text,
        rowText,
      }),
      source,
      entityType,
      entityId,
      semanticPath,
      priority,
      ref,
      role,
      elementId,
      dataTestId,
      text,
      action,
      field,
      stableName,
      row:
        rowIndex || rowKey || rowText
          ? {
              index: rowIndex,
              key: rowKey,
              text: rowText,
            }
          : undefined,
      region:
        regionName || regionType
          ? {
              name: regionName,
              type: regionType,
            }
          : undefined,
      preferredLocator:
        explicitPreferredLocator ||
        this.pickPreferredLocator({
          ref,
          elementId,
          dataTestId,
          rowIndex,
          field,
          action,
          stableName,
          regionName,
        }),
    };
  }

  private pickPreferredLocator(input: {
    ref?: string;
    elementId?: string;
    dataTestId?: string;
    rowIndex?: number;
    field?: string;
    action?: string;
    stableName?: string;
    regionName?: string;
  }): BrowserCommandCandidate['preferredLocator'] {
    if (input.dataTestId) {
      return { type: 'testid', value: input.dataTestId };
    }
    if (input.elementId) {
      return { type: 'css', value: `#${input.elementId}` };
    }
    if (input.ref) {
      return { type: 'ref', value: input.ref };
    }
    if (input.stableName && input.rowIndex) {
      return {
        type: 'css',
        value: this.buildNthMatchSelector(
          this.buildScopedDataSelector('data-ai-stable-name', input.stableName, input.regionName),
          input.rowIndex
        ),
      };
    }
    if (input.action && input.rowIndex) {
      return {
        type: 'css',
        value: this.buildNthMatchSelector(
          this.buildScopedDataSelector('data-ai-action', input.action, input.regionName),
          input.rowIndex
        ),
      };
    }
    if (input.field && input.rowIndex) {
      return {
        type: 'css',
        value: this.buildNthMatchSelector(
          this.buildScopedDataSelector('data-ai-field', input.field, input.regionName),
          input.rowIndex
        ),
      };
    }
    if (input.field && input.regionName) {
      return {
        type: 'css',
        value: `[data-ai-region="${input.regionName}"] [data-ai-field="${input.field}"]`,
      };
    }
    if (input.field) {
      return { type: 'css', value: `[data-ai-field="${input.field}"]` };
    }
    if (input.action && input.regionName) {
      return {
        type: 'css',
        value: `[data-ai-region="${input.regionName}"] [data-ai-action="${input.action}"]`,
      };
    }
    if (input.action) {
      return { type: 'css', value: `[data-ai-action="${input.action}"]` };
    }
    if (input.stableName) {
      return { type: 'css', value: `[data-ai-stable-name="${input.stableName}"]` };
    }
    return undefined;
  }

  private buildScopedDataSelector(
    attribute: 'data-ai-stable-name' | 'data-ai-action' | 'data-ai-field',
    value: string,
    regionName?: string
  ): string {
    const selector = `[${attribute}="${value}"]`;
    return regionName ? `[data-ai-region="${regionName}"] ${selector}` : selector;
  }

  private buildNthMatchSelector(selector: string, index: number): string {
    return `:nth-match(${selector}, ${index})`;
  }

  private buildCandidateSummaryString(input: {
    candidateId: string;
    kind: string;
    entityType?: string;
    entityId?: string;
    semanticPath?: string[];
    ref?: string;
    elementId?: string;
    dataTestId?: string;
    role?: string;
    regionName?: string;
    regionType?: string;
    rowIndex?: number;
    rowKey?: string;
    field?: string;
    action?: string;
    stableName?: string;
    label: string;
    text?: string;
    rowText?: string;
  }): string {
    const segments = [`candidateId=${input.candidateId}`, `kind=${input.kind}`];
    const values: Array<[string, string | number | undefined]> = [
      ['ref', input.ref],
      ['id', input.elementId],
      ['testid', input.dataTestId],
      ['role', input.role],
      ['entityType', input.entityType],
      ['entityId', input.entityId],
      ['region', input.regionName],
      ['regionType', input.regionType],
      ['row', input.rowIndex],
      ['rowKey', input.rowKey],
      ['field', input.field],
      ['action', input.action],
      ['stable', input.stableName],
      ['label', input.label],
      ['text', input.text],
      ['rowText', input.rowText],
      ['semanticPath', input.semanticPath?.join('/')],
    ];

    for (const [key, value] of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        segments.push(`${key}=${value.trim().slice(0, 120)}`);
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        segments.push(`${key}=${value}`);
      }
    }

    return segments.join(' | ');
  }

  private pickCandidateLabel(item: Record<string, unknown>): string | undefined {
    const label = [
      item.label,
      item.primaryText,
      item.secondaryText,
      item.text,
      item.placeholder,
      item.name,
      item.field,
      item.action,
      item.region,
      item.role,
    ].find((value) => typeof value === 'string' && value.trim().length > 0);
    return typeof label === 'string' ? label.trim() : undefined;
  }

  private collectSemanticCandidateInputs(
    pageSemantics?: Record<string, unknown>
  ): SemanticCandidateInput[] {
    if (!pageSemantics) {
      return [];
    }

    const asRecord = (value: unknown): Record<string, unknown> | undefined =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
    const toText = (value: unknown): string | undefined => {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      if (Array.isArray(value)) {
        const joined = value
          .map((item) => toText(item))
          .filter((item): item is string => Boolean(item))
          .join(' | ');
        return joined || undefined;
      }
      return undefined;
    };
    const toNumber = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    const fieldEntries = (value: unknown): Array<[string, string]> => {
      const record = asRecord(value);
      if (!record) {
        return [];
      }
      return Object.entries(record)
        .map(([key, fieldValue]) => [key, toText(fieldValue)] as [string, string | undefined])
        .filter(
          (entry): entry is [string, string] => Boolean(entry[0]?.trim()) && Boolean(entry[1])
        );
    };

    const pageType = toText(pageSemantics.pageType);
    const regions = Array.isArray(pageSemantics.regions)
      ? pageSemantics.regions
          .map((region) => asRecord(region))
          .filter((region): region is Record<string, unknown> => Boolean(region))
      : [];
    const result: SemanticCandidateInput[] = [];

    regions.forEach((region, regionIndex) => {
      const regionId = toText(region.id) || `region_${regionIndex + 1}`;
      const regionLabel = toText(region.label) || regionId;
      const regionType = toText(region.type) || pageType;
      const regionPriority = toNumber(region.priority);
      const regionPath = [`region:${regionId}`];

      result.push({
        kind: 'region',
        item: {
          label: regionLabel,
          text: regionLabel,
          region: regionLabel,
          regionType,
          priority: regionPriority,
          semanticPath: regionPath,
          preferredLocator: region.preferredLocator,
        },
        reasons: ['semantic_region'],
      });

      fieldEntries(region.fields).forEach(([fieldName, fieldValue]) => {
        result.push({
          kind: 'field',
          item: {
            label: fieldName,
            field: fieldName,
            text: fieldValue,
            region: regionLabel,
            regionType,
            priority: regionPriority,
            semanticPath: [...regionPath, `field:${fieldName}`],
          },
          reasons: ['semantic_region_field'],
        });
      });

      const regionActions = Array.isArray(region.actions)
        ? region.actions
            .map((action) => asRecord(action))
            .filter((action): action is Record<string, unknown> => Boolean(action))
        : [];
      regionActions.forEach((action, actionIndex) => {
        const actionId = toText(action.id) || `action_${actionIndex + 1}`;
        const actionLabel = toText(action.label) || actionId;
        result.push({
          kind: 'action',
          item: {
            label: actionLabel,
            text: actionLabel,
            action: actionId,
            region: regionLabel,
            regionType,
            priority: toNumber(action.priority) ?? regionPriority,
            semanticPath: [...regionPath, `action:${actionId}`],
            preferredLocator: action.preferredLocator,
          },
          reasons: ['semantic_region_action'],
        });
      });

      const items = Array.isArray(region.items)
        ? region.items
            .map((item) => asRecord(item))
            .filter((item): item is Record<string, unknown> => Boolean(item))
        : [];
      items.forEach((row, rowIndex) => {
        const rowKey = toText(row.key) || toText(row.entityId) || `row_${rowIndex + 1}`;
        const primaryText = toText(row.primaryText);
        const secondaryText = toText(row.secondaryText);
        const rowLabel = primaryText || secondaryText || rowKey;
        const rowText =
          [primaryText, secondaryText]
            .filter((value): value is string => Boolean(value))
            .join(' | ') || rowLabel;
        const rowOrdinal = Math.max(0, (toNumber(row.index) || rowIndex + 1) - 1);
        const entityType = toText(row.entityType);
        const entityId = toText(row.entityId);
        const rowPriority = toNumber(row.priority) ?? regionPriority;
        const rowPath = [...regionPath, `item:${rowKey}`];

        result.push({
          kind: 'row',
          item: {
            label: rowLabel,
            text: rowLabel,
            rowKey,
            rowIndex: rowOrdinal,
            rowText,
            region: regionLabel,
            regionType,
            entityType,
            entityId,
            priority: rowPriority,
            semanticPath: rowPath,
            preferredLocator: row.preferredLocator,
          },
          reasons: ['semantic_row'],
        });

        fieldEntries(row.fields).forEach(([fieldName, fieldValue]) => {
          result.push({
            kind: 'field',
            item: {
              label: fieldName,
              field: fieldName,
              text: fieldValue,
              rowKey,
              rowIndex: rowOrdinal,
              rowText,
              region: regionLabel,
              regionType,
              entityType,
              entityId,
              priority: rowPriority,
              semanticPath: [...rowPath, `field:${fieldName}`],
            },
            reasons: ['semantic_row_field'],
          });
        });

        const rowActions = Array.isArray(row.actions)
          ? row.actions
              .map((action) => asRecord(action))
              .filter((action): action is Record<string, unknown> => Boolean(action))
          : [];
        rowActions.forEach((action, actionIndex) => {
          const actionId = toText(action.id) || `action_${actionIndex + 1}`;
          const actionLabel = toText(action.label) || actionId;
          result.push({
            kind: 'action',
            item: {
              label: actionLabel,
              text: actionLabel,
              action: actionId,
              rowKey,
              rowIndex: rowOrdinal,
              rowText,
              region: regionLabel,
              regionType,
              entityType,
              entityId,
              priority: toNumber(action.priority) ?? rowPriority,
              semanticPath: [...rowPath, `action:${actionId}`],
              preferredLocator: action.preferredLocator,
            },
            reasons: ['semantic_row_action'],
          });
        });
      });
    });

    return result;
  }

  private normalizeSemanticLocator(
    value: unknown
  ): BrowserCommandCandidate['preferredLocator'] | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const rawType = typeof record.type === 'string' ? record.type.trim().toLowerCase() : '';
    const rawValue = typeof record.value === 'string' ? record.value.trim() : '';
    if (!rawType || !rawValue) {
      return undefined;
    }
    const type = rawType === 'test-id' ? 'testid' : rawType;
    if (!['ref', 'css', 'role', 'text', 'testid'].includes(type)) {
      return undefined;
    }
    return {
      type: type as 'ref' | 'css' | 'role' | 'text' | 'testid',
      value: rawValue,
    };
  }
}
