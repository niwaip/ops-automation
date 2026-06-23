import { useEffect } from 'react';
import { carboneAPI } from '../../../../api/carbone-api';
import type {
  TemplateAnalyzeResponse,
  TemplateFieldSpec,
  WorkflowTermAssets,
} from '../../../../api/carbone-api';
import type { AISuggestion } from '../../../../app/store';
import type { TemplateAssetDraftInfo, TemplateAssetNotice } from './identify-panel.types';

type TemplateAssetDraftPayload = {
  templateDocumentIr: any;
  fieldSpecs: TemplateFieldSpec[];
  sourceLanguage: string;
  targetLanguages: string[];
  warnings: string[];
};

interface UseTemplateAssetDraftOptions {
  apiBaseUrl: string;
  draftId: string | null;
  draftStorageKey: string;
  suggestions: AISuggestion[];
  templateName: string;
  assetSourceLanguage: string;
  setAssetSourceLanguage: (value: string) => void;
  assetTargetLanguages: string[];
  setAssetTargetLanguages: (value: string[]) => void;
  templateAssetDraftInfo: TemplateAssetDraftInfo | null;
  setTemplateAssetDraftInfo: (value: TemplateAssetDraftInfo | null) => void;
  templateFieldSpecsDraft: TemplateFieldSpec[];
  setTemplateFieldSpecsDraft: React.Dispatch<React.SetStateAction<TemplateFieldSpec[]>>;
  templateTermAssetsDraft: WorkflowTermAssets | null;
  setTemplateTermAssetsDraft: (value: WorkflowTermAssets | null) => void;
  templateTermAssetsText: string;
  setTemplateTermAssetsText: (value: string) => void;
  setIsSavingTemplateAssetManifest: (value: boolean) => void;
  setTemplateAssetNotice: (value: TemplateAssetNotice | null) => void;
  addDebugLog: (
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    details?: string
  ) => void;
  normalizeLanguageCode: (language?: string) => string;
  extractDocument: () => Promise<any>;
}

function readDraftSnapshot(draftStorageKey: string) {
  const stagedData = localStorage.getItem(draftStorageKey);
  if (!stagedData) {
    return null;
  }
  try {
    return JSON.parse(stagedData);
  } catch {
    return null;
  }
}

function areStringListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function normalizeSuggestedFieldId(suggestedName: string): string {
  const normalized = String(suggestedName || '')
    .replace(/[{}]/g, '')
    .replace(/^[dct]\./, '')
    .replace(/\[(?:\d+)?\]/g, '')
    .replace(/^\.+|\.+$/g, '')
    .trim();
  if (!normalized) {
    return '';
  }

  const segments = normalized
    .split('.')
    .map((segment) => segment.replace(/[^A-Za-z0-9_]/g, ''))
    .filter(Boolean);
  if (segments.length === 0) {
    return '';
  }

  return segments
    .map((segment, index) => {
      if (index === 0) {
        return segment.charAt(0).toLowerCase() + segment.slice(1);
      }
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join('');
}

function inferFieldShape(
  fieldId: string,
  suggestion: AISuggestion
): Pick<TemplateFieldSpec, 'type' | 'policy' | 'riskLevel' | 'required'> {
  const keyword = [
    fieldId,
    suggestion.originalText,
    suggestion.elementPath,
    suggestion.details?.description,
    suggestion.details?.fieldType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/paymentmode|付款方式|支付方式/.test(keyword)) {
    return { type: 'enum', policy: 'enum_mapping', riskLevel: 'medium', required: true };
  }
  if (/bankaccount|银行账号|银行账户|account/.test(keyword)) {
    return { type: 'bank_account', policy: 'format_only', riskLevel: 'high', required: false };
  }
  if (/date|日期|签约日期|签订日期/.test(keyword)) {
    return { type: 'date', policy: 'format_only', riskLevel: 'high', required: false };
  }
  if (/amount|fee|price|total|金额|总额|总价|服务费/.test(keyword)) {
    return { type: 'currency_amount', policy: 'format_only', riskLevel: 'high', required: false };
  }
  if (/partya|partyb|company|entity|甲方|乙方|委托方|受托方/.test(keyword)) {
    return {
      type: 'legal_entity_name',
      policy: 'dictionary_first',
      riskLevel: 'high',
      required: true,
    };
  }
  if (/projectname|项目名称|项目/.test(keyword)) {
    return {
      type: 'project_name',
      policy: 'dictionary_first',
      riskLevel: 'medium',
      required: true,
    };
  }
  if (/location|place|地点|场所/.test(keyword)) {
    return { type: 'geo_name', policy: 'dictionary_first', riskLevel: 'medium', required: false };
  }
  if (/days|天数|期限/.test(keyword)) {
    return { type: 'number', policy: 'format_only', riskLevel: 'medium', required: false };
  }
  return { type: 'text', policy: 'llm_translate', riskLevel: 'medium', required: false };
}

function extractAnchorPrefix(suggestion: AISuggestion): string {
  const candidates = [
    suggestion.details?.beforeBlank,
    suggestion.context,
    suggestion.details?.context,
    suggestion.elementPath,
    suggestion.originalText,
  ]
    .map((value) =>
      String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);

  const matched = candidates.find((value) => /[:：]$/.test(value)) || candidates[0] || '';
  const prefixMatch = matched.match(/^(.{0,40}?[:：])/u);
  return prefixMatch?.[1] || matched.slice(0, 40);
}

function buildTemplateAssetSourceBindings(
  suggestion: AISuggestion
): NonNullable<TemplateFieldSpec['sourceBindings']> {
  const sourceBinding: NonNullable<TemplateFieldSpec['sourceBindings']>[number] = {
    blockId: suggestion.id,
    lang: 'zh',
    anchor: {
      prefix: extractAnchorPrefix(suggestion),
      suffix: suggestion.details?.afterBlank || '',
    },
  };

  const wordAnchor = suggestion.details?.wordAnchor;
  if (wordAnchor?.type === 'content-control' && typeof wordAnchor.contentControlId === 'number') {
    sourceBinding.tokenId = `content-control-${wordAnchor.contentControlId}`;
  }
  if (
    wordAnchor?.type === 'table-cell' &&
    typeof wordAnchor.tableIndex === 'number' &&
    typeof wordAnchor.rowIndex === 'number' &&
    typeof wordAnchor.cellIndex === 'number'
  ) {
    sourceBinding.blockId = `table-${wordAnchor.tableIndex}-row-${wordAnchor.rowIndex}-cell-${wordAnchor.cellIndex}`;
  }
  if (
    wordAnchor?.type === 'text-range' &&
    typeof wordAnchor.paragraphIndex === 'number' &&
    typeof wordAnchor.start === 'number' &&
    typeof wordAnchor.end === 'number'
  ) {
    sourceBinding.blockId = `paragraph-${wordAnchor.paragraphIndex}`;
    sourceBinding.tokenId = `word-range-${wordAnchor.paragraphIndex}-${wordAnchor.start}-${wordAnchor.end}`;
  }

  const excelAnchor = suggestion.details?.excelAnchor;
  if (excelAnchor?.sheetName) {
    sourceBinding.blockId = excelAnchor.address
      ? `${excelAnchor.sheetName}!${excelAnchor.address}`
      : excelAnchor.sheetName;
  }

  return [sourceBinding];
}

function buildTemplateAssetFieldSpecs(
  suggestions: AISuggestion[],
  analyzedFields: TemplateAnalyzeResponse['fields'],
  sourceLanguage: string,
  targetLanguages: string[]
): TemplateFieldSpec[] {
  const fieldMap = new Map<string, TemplateFieldSpec>();

  analyzedFields.forEach((field) => {
    fieldMap.set(field.fieldId, {
      fieldId: field.fieldId,
      valueMode: field.valueMode,
      type: field.type,
      sourceLanguage: field.sourceLanguage || sourceLanguage,
      targetLanguages: field.targetLanguages?.length ? field.targetLanguages : targetLanguages,
      policy: field.policy,
      required: field.required,
      riskLevel: field.riskLevel,
      sourceBindings: field.sourceBindings,
      renderConfig: field.renderConfig,
    });
  });

  suggestions
    .filter((suggestion) => suggestion.type === 'variable' && suggestion.applied !== false)
    .forEach((suggestion) => {
      const fieldId = normalizeSuggestedFieldId(suggestion.suggestedName);
      if (!fieldId) {
        return;
      }

      const inferredShape = inferFieldShape(fieldId, suggestion);
      const existing = fieldMap.get(fieldId);
      const nextSpec: TemplateFieldSpec = {
        fieldId,
        valueMode: existing?.valueMode || 'scalar',
        type: existing?.type || inferredShape.type,
        sourceLanguage: existing?.sourceLanguage || sourceLanguage,
        targetLanguages: Array.from(
          new Set([...(existing?.targetLanguages || []), ...targetLanguages])
        ),
        policy: existing?.policy || inferredShape.policy,
        required: existing?.required ?? inferredShape.required,
        riskLevel: existing?.riskLevel || inferredShape.riskLevel,
        sourceBindings: [
          ...(existing?.sourceBindings || []),
          ...buildTemplateAssetSourceBindings(suggestion),
        ],
        renderConfig: existing?.renderConfig || {
          flattenForCarbone: true,
          includeCanonicalValue: false,
        },
      };
      fieldMap.set(fieldId, nextSpec);
    });

  return Array.from(fieldMap.values());
}

function parseTemplateTermAssetsText(rawText: string): {
  value: WorkflowTermAssets | null;
  error?: string;
} {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) {
    return { value: null };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: null, error: '术语资产必须是 JSON 对象' };
    }
    return { value: parsed as WorkflowTermAssets };
  } catch (error: any) {
    return { value: null, error: `术语资产 JSON 解析失败: ${error?.message || '未知错误'}` };
  }
}

function sanitizeTemplateFieldSpecs(
  specs: TemplateFieldSpec[],
  normalizeLanguageCode: (language?: string) => string
): {
  specs: TemplateFieldSpec[];
  duplicateFieldIds: string[];
  emptyFieldCount: number;
} {
  const duplicateFieldIds = new Set<string>();
  const seen = new Set<string>();
  let emptyFieldCount = 0;

  const sanitized = specs
    .map((field) => ({
      ...field,
      fieldId: String(field.fieldId || '').trim(),
      sourceLanguage: normalizeLanguageCode(field.sourceLanguage),
      targetLanguages: Array.from(
        new Set(
          (field.targetLanguages || []).map((lang) => normalizeLanguageCode(lang)).filter(Boolean)
        )
      ),
    }))
    .filter((field) => {
      if (!field.fieldId) {
        emptyFieldCount += 1;
        return false;
      }
      if (seen.has(field.fieldId)) {
        duplicateFieldIds.add(field.fieldId);
        return false;
      }
      seen.add(field.fieldId);
      return true;
    });

  return {
    specs: sanitized,
    duplicateFieldIds: Array.from(duplicateFieldIds),
    emptyFieldCount,
  };
}

export function useTemplateAssetDraft({
  apiBaseUrl,
  draftId,
  draftStorageKey,
  suggestions,
  templateName,
  assetSourceLanguage,
  setAssetSourceLanguage,
  assetTargetLanguages,
  setAssetTargetLanguages,
  templateAssetDraftInfo,
  setTemplateAssetDraftInfo,
  templateFieldSpecsDraft,
  setTemplateFieldSpecsDraft,
  templateTermAssetsDraft,
  setTemplateTermAssetsDraft,
  templateTermAssetsText,
  setTemplateTermAssetsText,
  setIsSavingTemplateAssetManifest,
  setTemplateAssetNotice,
  addDebugLog,
  normalizeLanguageCode,
  extractDocument,
}: UseTemplateAssetDraftOptions) {
  useEffect(() => {
    setTemplateFieldSpecsDraft(templateAssetDraftInfo?.fields || []);
    setTemplateTermAssetsDraft(templateAssetDraftInfo?.termAssets || null);
    setTemplateTermAssetsText(
      templateAssetDraftInfo?.termAssets
        ? JSON.stringify(templateAssetDraftInfo.termAssets, null, 2)
        : ''
    );
  }, [
    templateAssetDraftInfo,
    setTemplateFieldSpecsDraft,
    setTemplateTermAssetsDraft,
    setTemplateTermAssetsText,
  ]);

  useEffect(() => {
    if (!templateAssetDraftInfo) {
      return;
    }
    const normalizedSourceLanguage = templateAssetDraftInfo.sourceLanguage
      ? normalizeLanguageCode(templateAssetDraftInfo.sourceLanguage)
      : undefined;
    const normalizedTargetLanguages = Array.from(
      new Set(
        (templateAssetDraftInfo.targetLanguages || [])
          .map((lang) => normalizeLanguageCode(lang))
          .filter(Boolean)
      )
    );
    if (templateAssetDraftInfo.sourceLanguage) {
      const nextSourceLanguage = normalizedSourceLanguage || 'zh';
      if (assetSourceLanguage !== nextSourceLanguage) {
        setAssetSourceLanguage(nextSourceLanguage);
      }
    }
    if (!areStringListsEqual(assetTargetLanguages, normalizedTargetLanguages)) {
      setAssetTargetLanguages(normalizedTargetLanguages);
    }
  }, [
    assetSourceLanguage,
    assetTargetLanguages,
    templateAssetDraftInfo,
    normalizeLanguageCode,
    setAssetSourceLanguage,
    setAssetTargetLanguages,
  ]);

  const getEffectiveTemplateTermAssets = (options?: {
    rawText?: string;
    fallbackToDraftState?: boolean;
  }): { value: WorkflowTermAssets | null; error?: string } => {
    const rawText = options?.rawText ?? templateTermAssetsText;
    const parsed = parseTemplateTermAssetsText(rawText);
    if (parsed.error) {
      return parsed;
    }
    if (parsed.value) {
      return parsed;
    }
    if (options?.fallbackToDraftState === false) {
      return { value: null };
    }
    return { value: templateTermAssetsDraft || templateAssetDraftInfo?.termAssets || null };
  };

  const prepareTemplateAssetDraftPayload = async (): Promise<TemplateAssetDraftPayload> => {
    const templateDocumentIr = await extractDocument();
    const sourceLanguage = normalizeLanguageCode(
      assetSourceLanguage || (templateDocumentIr?.metadata?.language as string | undefined)
    );
    const targetLanguages = assetTargetLanguages;
    const effectiveTermAssets = getEffectiveTemplateTermAssets();

    let analyzeResponse: TemplateAnalyzeResponse = {
      analysisId: '',
      languageProfile: {
        sourceLanguage,
        targetLanguages,
        documentMode: targetLanguages.length > 0 ? 'single_or_bilingual' : 'single_language',
      },
      fields: [],
      warnings: [],
    };

    try {
      analyzeResponse = await carboneAPI.analyzeTemplateWorkflow({
        templateDocumentIr,
        sourceLanguage,
        targetLanguages,
        termAssets: effectiveTermAssets.value || undefined,
      });
    } catch (error: any) {
      addDebugLog('warn', '模板工作流分析失败，回退到前端映射', error?.message || '未知错误');
    }

    return {
      templateDocumentIr,
      fieldSpecs: buildTemplateAssetFieldSpecs(
        suggestions,
        analyzeResponse.fields,
        sourceLanguage,
        targetLanguages
      ),
      sourceLanguage,
      targetLanguages,
      warnings: analyzeResponse.warnings || [],
    };
  };

  const buildTermAssetExample = (
    kind: 'fieldDictionary' | 'termbase' | 'enumMappings',
    targetFieldId?: string
  ): WorkflowTermAssets => {
    const current = getEffectiveTemplateTermAssets().value || {};
    const preferredField = targetFieldId
      ? templateFieldSpecsDraft.find((field) => field.fieldId === targetFieldId) ||
        templateAssetDraftInfo?.fields.find((field) => field.fieldId === targetFieldId)
      : undefined;
    const dictionaryField =
      preferredField && preferredField.policy === 'dictionary_first'
        ? preferredField
        : templateFieldSpecsDraft.find((field) => field.policy === 'dictionary_first') ||
          templateAssetDraftInfo?.fields.find((field) => field.policy === 'dictionary_first') ||
          preferredField ||
          templateFieldSpecsDraft[0] ||
          templateAssetDraftInfo?.fields[0];
    const enumField =
      preferredField && preferredField.policy === 'enum_mapping'
        ? preferredField
        : templateFieldSpecsDraft.find((field) => field.policy === 'enum_mapping') ||
          templateAssetDraftInfo?.fields.find((field) => field.policy === 'enum_mapping');
    const sourceLanguage =
      dictionaryField?.sourceLanguage ||
      assetSourceLanguage ||
      templateAssetDraftInfo?.sourceLanguage ||
      'zh';
    const targetLanguage =
      dictionaryField?.targetLanguages?.[0] ||
      assetTargetLanguages[0] ||
      templateAssetDraftInfo?.targetLanguages?.[0] ||
      'ja';

    if (kind === 'fieldDictionary') {
      const fieldId = dictionaryField?.fieldId || 'partyAName';
      const alias = dictionaryField?.sourceBindings?.[0]?.anchor?.prefix || '委托方';
      return {
        ...current,
        fieldDictionary: [
          ...(current.fieldDictionary || []),
          {
            aliases: [alias, alias.replace(/[:：]\s*$/u, '')].filter(Boolean),
            fieldId,
            type: dictionaryField?.type || 'legal_entity_name',
            policy: dictionaryField?.policy || 'dictionary_first',
            riskLevel: dictionaryField?.riskLevel || 'high',
            required: Boolean(dictionaryField?.required),
            scope: 'template',
            status: 'approved',
            version: 1,
          },
        ],
      };
    }

    if (kind === 'termbase') {
      const fieldId = dictionaryField?.fieldId || 'partyAName';
      const sourceValue =
        fieldId === 'projectName' ? '无线网络设备更新' : '广州日产通商贸易有限公司';
      const translatedValue =
        fieldId === 'projectName' ? 'テンプレート専用設備更新' : 'テンプレート専用会社名';
      return {
        ...current,
        termbase: [
          ...(current.termbase || []),
          {
            termId: `tb_tpl_${Date.now()}`,
            applicableFieldIds: [fieldId],
            sourceLanguage,
            sourceValue,
            normalizedSourceValue: sourceValue,
            translations: {
              [sourceLanguage]: sourceValue,
              [targetLanguage]: translatedValue,
            },
            scope: 'template',
            status: 'approved',
            version: 1,
          },
        ],
      };
    }

    const enumName = enumField?.fieldId || 'paymentMode';
    return {
      ...current,
      enumMappings: {
        ...(current.enumMappings || {}),
        [enumName]: [
          ...((current.enumMappings || {})[enumName] || []),
          {
            code: `${enumName}_template`,
            labels: {
              zh: '一次支付',
              ja: 'テンプレート一括払い',
            },
            aliases: ['一次支付', '一次付款'],
            scope: 'template',
            status: 'active',
            version: 1,
          },
        ],
      },
    };
  };

  const handleAppendTemplateTermAssetExample = (
    kind: 'fieldDictionary' | 'termbase' | 'enumMappings',
    targetFieldId?: string
  ) => {
    const nextValue = buildTermAssetExample(kind, targetFieldId);
    setTemplateTermAssetsDraft(nextValue);
    setTemplateTermAssetsText(JSON.stringify(nextValue, null, 2));
    setTemplateAssetNotice({
      type: 'info',
      message:
        kind === 'fieldDictionary'
          ? `已追加字段词典示例项${targetFieldId ? `: ${targetFieldId}` : ''}`
          : kind === 'termbase'
            ? `已追加术语示例项${targetFieldId ? `: ${targetFieldId}` : ''}`
            : `已追加枚举映射示例项${targetFieldId ? `: ${targetFieldId}` : ''}`,
    });
  };

  const persistTemplateFieldSpecs = async (
    specs: TemplateFieldSpec[],
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    if (!draftId) {
      if (!options?.silent) {
        setTemplateAssetNotice({ type: 'error', message: '请先暂存副本后再保存字段定义' });
      }
      return false;
    }

    if (!Array.isArray(specs) || specs.length === 0) {
      if (!options?.silent) {
        setTemplateAssetNotice({ type: 'error', message: '当前没有可保存的字段定义' });
      }
      return false;
    }

    const sanitizedResult = sanitizeTemplateFieldSpecs(specs, normalizeLanguageCode);
    if (sanitizedResult.emptyFieldCount > 0) {
      if (!options?.silent) {
        setTemplateAssetNotice({
          type: 'error',
          message: `存在 ${sanitizedResult.emptyFieldCount} 个空字段名，请先补全后再保存`,
        });
      }
      return false;
    }
    if (sanitizedResult.duplicateFieldIds.length > 0) {
      if (!options?.silent) {
        setTemplateAssetNotice({
          type: 'error',
          message: '字段定义中存在重复 fieldId',
          lines: sanitizedResult.duplicateFieldIds.map((fieldId) => `重复字段: ${fieldId}`),
        });
      }
      return false;
    }

    const parsedTermAssets = getEffectiveTemplateTermAssets({ fallbackToDraftState: false });
    if (parsedTermAssets.error) {
      if (!options?.silent) {
        setTemplateAssetNotice({
          type: 'error',
          message: parsedTermAssets.error,
        });
      }
      return false;
    }

    setIsSavingTemplateAssetManifest(true);
    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const templateDocumentIr = await extractDocument();
      const sourceLanguage = normalizeLanguageCode(
        (templateDocumentIr?.metadata?.language as string | undefined) ||
          templateAssetDraftInfo?.sourceLanguage
      );
      const targetLanguages = Array.from(
        new Set(specs.flatMap((field) => field.targetLanguages || []))
      );
      const saveResult = await carboneAPI.saveTemplateWorkflow({
        templateId: draftId,
        templateMeta: {
          templateName: templateName.trim() || `draft-${Date.now()}`,
          sourceLanguage,
          targetLanguages,
          documentMode: targetLanguages.length > 0 ? 'single_or_bilingual' : 'single_language',
          termAssets: parsedTermAssets.value || undefined,
        },
        templateDocumentIr,
        templateFieldSpecs: sanitizedResult.specs,
        saveMode: 'draft',
      });

      const nextTemplateAssetDraftInfo = {
        fieldCount: sanitizedResult.specs.length,
        status: saveResult.status,
        sourceLanguage,
        targetLanguages,
        bindingPlanVersion: saveResult.bindingPlanVersion,
        fields: sanitizedResult.specs,
        termAssets: parsedTermAssets.value || undefined,
      };
      setTemplateAssetDraftInfo(nextTemplateAssetDraftInfo);
      setTemplateFieldSpecsDraft(sanitizedResult.specs);
      setTemplateTermAssetsDraft(parsedTermAssets.value);

      const snapshot = readDraftSnapshot(draftStorageKey);
      if (snapshot?.draftId === draftId) {
        localStorage.setItem(
          draftStorageKey,
          JSON.stringify({
            ...snapshot,
            templateAssetDraftInfo: nextTemplateAssetDraftInfo,
            workflowDraftInfo: nextTemplateAssetDraftInfo,
          })
        );
      }

      if (!options?.silent) {
        setTemplateAssetNotice({
          type: 'success',
          message: '✅ 字段定义已保存到模板资产清单',
          lines: [
            `${sanitizedResult.specs.length} 个字段 · 状态 ${saveResult.status}`,
            `绑定计划版本 ${saveResult.bindingPlanVersion}`,
          ],
        });
      }
      return true;
    } catch (error: any) {
      if (!options?.silent) {
        setTemplateAssetNotice({
          type: 'error',
          message: `字段定义保存失败: ${error?.message || '未知错误'}`,
        });
      }
      return false;
    } finally {
      setIsSavingTemplateAssetManifest(false);
    }
  };

  const handleTemplateFieldSpecChange = (index: number, patch: Partial<TemplateFieldSpec>) => {
    setTemplateFieldSpecsDraft((current) =>
      current.map((field, fieldIndex) =>
        fieldIndex === index
          ? {
              ...field,
              ...patch,
            }
          : field
      )
    );
  };

  const handleTemplateFieldTargetLanguagesChange = (index: number, rawValue: string) => {
    const targetLanguages = rawValue
      .split(',')
      .map((item) => normalizeLanguageCode(item))
      .filter(Boolean);
    handleTemplateFieldSpecChange(index, {
      targetLanguages: Array.from(new Set(targetLanguages)),
    });
  };

  const handleSaveTemplateFieldSpecs = async () => {
    if (templateFieldSpecsDraft.length > 0) {
      await persistTemplateFieldSpecs(templateFieldSpecsDraft);
      return;
    }

    if (!draftId) {
      setTemplateAssetNotice({ type: 'error', message: '请先暂存模板资产后再保存字段定义' });
      return;
    }

    try {
      const workflowPayload = await prepareTemplateAssetDraftPayload();
      if (workflowPayload.fieldSpecs.length === 0) {
        setTemplateAssetNotice({
          type: 'error',
          message: '当前模板未识别到可保存的模板资产字段',
        });
        return;
      }
      setTemplateFieldSpecsDraft(workflowPayload.fieldSpecs);
      await persistTemplateFieldSpecs(workflowPayload.fieldSpecs);
    } catch (error: any) {
      setTemplateAssetNotice({
        type: 'error',
        message: `生成模板资产字段失败: ${error?.message || '未知错误'}`,
      });
    }
  };

  const handleResetTemplateFieldSpecs = () => {
    setTemplateFieldSpecsDraft(templateAssetDraftInfo?.fields || []);
    setTemplateTermAssetsDraft(templateAssetDraftInfo?.termAssets || null);
    setTemplateTermAssetsText(
      templateAssetDraftInfo?.termAssets
        ? JSON.stringify(templateAssetDraftInfo.termAssets, null, 2)
        : ''
    );
    setTemplateAssetNotice({
      type: 'info',
      message: '已恢复到最近一次保存的字段定义',
    });
  };

  const handleTemplateTermAssetsTextChange = (value: string) => {
    setTemplateTermAssetsText(value);
    const parsed = getEffectiveTemplateTermAssets({ rawText: value, fallbackToDraftState: false });
    if (!parsed.error) {
      setTemplateTermAssetsDraft(parsed.value);
    }
  };

  return {
    handleTemplateFieldSpecChange,
    handleTemplateFieldTargetLanguagesChange,
    handleTemplateTermAssetsTextChange,
    handleAppendTemplateTermAssetExample,
    handleSaveTemplateFieldSpecs,
    handleResetTemplateFieldSpecs,
  };
}
