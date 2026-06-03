import { DocumentElement } from '../document-structure.service';
import { 
  TemplateConfig, VariableMapping, TableLoop, ColumnMapping, CombinedVariable, GroupLoop, ContentPattern, PathMappingRule, UserIntent, StaticElement, DEFAULT_PATH_MAPPINGS
} from './types';
import { inferTableArrayPath, generateColumnMappings, calculateTableConfidence } from './table-loop-helper';

export function formatRawSuggestions(rawSuggestions: any[]) : any[] {
    return rawSuggestions.map((s, idx) => ({
      id: `sugg-${Date.now()}-${idx}`,
      type: 'variable',
      elementPath: s.context || `【${s.originalText}】`,
      suggestedName: s.variablePath,
      originalText: s.originalText,
      confidence: s.confidence || 0.7,
      applied: false,
      context: s.context,
      details: {
        chapter: '正文',
        significance: s.significance || '文档填充字段',
        variableName: s.variableName,
        formatter: null
      }
    }));
  }
export function buildVariableMappingsFromSuggestions(suggestions: any[]) : VariableMapping[] {
    return suggestions.reduce<VariableMapping[]>((acc, suggestion, idx) => {
        const path = suggestion?.variablePath || suggestion?.suggestedName;
        if (!path) {
          return acc;
        }

        acc.push({
          path,
          sampleValue: suggestion?.originalText || suggestion?.sampleValue || '',
          index: idx,
          type: (suggestion?.details?.fieldType || suggestion?.fieldType || 'text') as VariableMapping['type'],
          reason: suggestion?.significance || suggestion?.details?.significance || '',
          usage: suggestion?.details?.usage || suggestion?.usage,
          fieldType: suggestion?.details?.fieldType || suggestion?.fieldType
        });

        return acc;
      }, []);
  }
export function extractFormatter(variablePath: string) : string | null {
    const colonIndex = variablePath.indexOf(':');
    if (colonIndex > 0) {
      return variablePath.substring(colonIndex + 1);
    }
    return null;
  }
export function resolveSuggestionGroupMeta(suggestion: any) : { groupLabel?: string; sheetName?: string } {
    const directCandidates = [
      suggestion?.details?.excelAnchor?.sheetName,
      suggestion?.details?.sheetName,
      suggestion?.details?.chapter,
      suggestion?.sectionName,
    ];

    for (const candidate of directCandidates) {
      const normalized = normalizeSkillGroupLabel(candidate);
      if (normalized) {
        return { groupLabel: normalized, sheetName: normalized };
      }
    }

    const textCandidates = [
      suggestion?.details?.displayPosition,
      suggestion?.elementPath,
      suggestion?.context,
      suggestion?.details?.context,
    ];

    for (const candidate of textCandidates) {
      const inferred = extractExcelSheetNameFromText(candidate);
      const normalized = normalizeSkillGroupLabel(inferred);
      if (normalized) {
        return { groupLabel: normalized, sheetName: normalized };
      }
    }

    return {};
  }
export function normalizeSkillGroupLabel(value: unknown) : string | undefined {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return undefined;
    }

    const genericLabels = new Set([
      '参数',
      '正文',
      '默认分组',
      '未归属 Sheet',
      'unknown_sheet',
      'sheet',
    ]);

    return genericLabels.has(normalized) ? undefined : normalized;
  }
export function extractExcelSheetNameFromText(value: unknown) : string | undefined {
    const text = String(value || '').trim();
    if (!text) {
      return undefined;
    }

    const sheetRefMatch = text.match(/^([^!]+)![$A-Z]+\d+(?::[$A-Z]+\d+)?$/i);
    if (sheetRefMatch?.[1]) {
      return sheetRefMatch[1].trim();
    }

    const pairMatch = text.match(/([^|【\n]+?)\s*↔\s*([^|】\n]+)/);
    if (pairMatch?.[1]) {
      return pairMatch[1].trim();
    }

    const embeddedSheetRefMatch = text.match(/([^\s|【】]+)![$A-Z]+\d+(?::[$A-Z]+\d+)?/i);
    if (embeddedSheetRefMatch?.[1]) {
      return embeddedSheetRefMatch[1].trim();
    }

    return undefined;
  }
export function inferFieldType(name: string, originalText: string) : string {
    const lowerName = (name || '').toLowerCase();
    const lowerText = (originalText || '').toLowerCase();

    if (lowerName.includes('日期') || lowerName.includes('date') || lowerName.includes('时间') || lowerName.includes('time')) return 'date';
    if (lowerName.includes('金额') || lowerName.includes('amount') || lowerName.includes('价格') || lowerName.includes('price')) return 'amount';
    if (lowerName.includes('电话') || lowerName.includes('phone') || lowerName.includes('手机')) return 'phone';
    if (lowerName.includes('邮箱') || lowerName.includes('email')) return 'email';
    if (lowerName.includes('地址') || lowerName.includes('address')) return 'address';
    if (lowerName.includes('编号') || lowerName.includes('number') || lowerName.includes('code')) return 'code';
    if (lowerName.includes('数量') || lowerName.includes('count') || lowerName.includes('qty')) return 'number';
    if (lowerName.includes('名称') || lowerName.includes('name') || lowerText.includes('甲方') || lowerText.includes('乙方')) return 'name';

    return 'text';
  }

  /**
   * 推断参数用途
   */
export function inferParameterUsage(name: string, fieldType: string, templateType: string) : string {
    const usageMap: Record<string, string> = {
      date: '用于填写日期信息，表示相关事项的时间节点',
      amount: '用于填写金额数值，表示费用、价格或合同金额',
      phone: '用于填写联系电话，便于后续沟通联系',
      email: '用于填写电子邮箱地址，用于接收通知或发送文件',
      address: '用于填写地址信息，表示当事人或事项的具体位置',
      code: '用于填写编号信息，如合同编号、证书编号等唯一标识',
      number: '用于填写数值信息，如数量、比例等',
      name: '用于填写名称信息，如当事人名称、项目名称等',
    };

    if (usageMap[fieldType]) return usageMap[fieldType];

    // 根据名称推断
    if (name.includes('甲方')) return '合同甲方当事人名称';
    if (name.includes('乙方')) return '合同乙方当事人名称';
    if (name.includes('标题')) return '文档标题，用于标识文档内容';
    if (name.includes('内容')) return '文档主要内容或正文';

    return `${templateType}模板中的${name}字段`;
  }

  /**
   * 生成提取提示
   */
export function generateExtractionHint(name: string, fieldType: string, originalText: string, templateType: string) : string {
    const hints: Record<string, string> = {
      date: `查找内容中的日期表述，如"${originalText}"位置。常见格式：YYYY年MM月DD日、YYYY-MM-DD、YYYY/MM/DD`,
      amount: `查找内容中的金额表述，如"${originalText}"位置。常见格式：数字+单位（元、万元）、带货币符号的数值`,
      phone: `查找内容中的电话号码，通常是11位手机号或带区号的固话格式`,
      email: `查找内容中的邮箱地址，格式为xxx@xxx.xxx`,
      address: `查找内容中的地址信息，通常包含省市、街道、门牌号等`,
      code: `查找内容中的编号信息，如"${originalText}"位置的编号`,
      name: `查找内容中的名称信息，如当事人名称、项目名称等`,
    };

    if (hints[fieldType]) return hints[fieldType];

    return `在内容中查找"${originalText}"位置对应的文本，提取该位置的值`;
  }

  /**
   * 获取默认格式化器
   */
export function getDefaultFormatter(fieldType: string) : string | null {
    const formatters: Record<string, string> = {
      date: ':formatD(YMD)',
      amount: ':formatN(2)',
      number: ':formatN(0)',
    };
    return formatters[fieldType] || null;
  }

  /**
   * 获取验证规则
   */
export function getValidationRules(fieldType: string, name: string) : any {
    const rules: Record<string, any> = {
      date: { pattern: '\\d{4}[-/年]\\d{1,2}[-/月]\\d{1,2}[日]?', message: '日期格式不正确' },
      amount: { pattern: '\\d+(\\.\\d{1,2})?', message: '金额必须是数字' },
      phone: { pattern: '1[3-9]\\d{9}', message: '手机号格式不正确' },
      email: { pattern: '^[\\w.-]+@[\\w.-]+\\.\\w+$', message: '邮箱格式不正确' },
    };
    return rules[fieldType] || { pattern: null, message: '请填写有效值' };
  }

  /**
   * 获取搜索关键词
   */
export function getSearchKeywords(name: string, fieldType: string) : string[] {
    const keywords = [name];

    if (fieldType === 'date') keywords.push('日期', '时间', '年', '月', '日');
    if (fieldType === 'amount') keywords.push('金额', '价格', '费用', '元', '万');
    if (fieldType === 'name') keywords.push('名称', '姓名', '公司', '单位');
    if (fieldType === 'phone') keywords.push('电话', '手机', '联系方式');
    if (fieldType === 'address') keywords.push('地址', '地点', '住址');

    return keywords;
  }

  /**
   * 获取提取模式
   */
export function getExtractionPattern(fieldType: string) : string {
    const patterns: Record<string, string> = {
      date: '识别日期格式：YYYY年MM月DD日、YYYY-MM-DD、YYYY/MM/DD',
      amount: '识别金额格式：数字+元/万元、￥金额、金额元',
      phone: '识别电话格式：11位手机号、区号-号码',
      email: '识别邮箱格式：xxx@domain.xxx',
      address: '识别地址：省市街道门牌号组合',
    };
    return patterns[fieldType] || '查找关键词附近的文本内容';
  }

  /**
   * 将模板变量路径标准化为纯 JSON 路径
   * 例如:
   * - {d.contract.contractNo} -> contract.contractNo
   * - d.contract.contractNo -> contract.contractNo
   * - {#d.items}{/d.items} -> items
   */
export function normalizeSkillParameterPath(variableName: string) : string {
    const rawValue = String(variableName || '').trim();
    if (!rawValue) {
      return '';
    }

    const explicitLoopMatch = rawValue.match(/\{#([cdt])\.([^}]+)\}/);
    if (explicitLoopMatch?.[2]) {
      return explicitLoopMatch[2]
        .replace(/\[(?:i(?:\+\d+)?)|\d+\]/g, '[]')
        .trim();
    }

    const markerMatch = rawValue.match(/\{([cdt])\.([^}:]+)(?::[^}]*)?\}/);
    if (markerMatch?.[2]) {
      return markerMatch[2]
        .replace(/\[(?:i(?:\+\d+)?)|\d+\]/g, '[]')
        .trim();
    }

    return rawValue
      .replace(/\{[#/]?/g, '')
      .replace(/\}/g, '')
      .replace(/^d\./, '')
      .replace(/\[(?:i(?:\+\d+)?)|\d+\]/g, '[]')
      .replace(/:.*$/g, '')
      .trim();
  }
export function isPlaceholderSkillParameterPath(variableName: string) : boolean {
    const normalized = normalizeSkillParameterPath(variableName);
    if (!normalized) {
      return true;
    }

    return normalized
      .split('.')
      .some((segment) => /^field(?:[_-]?\d+)?$/i.test(segment.trim()));
  }
export function sanitizeSkillDataExample(value: unknown) : unknown {
    if (Array.isArray(value)) {
      const mapped = value.map((item) => sanitizeSkillDataExample(item));
      // 只有当映射后的数组完全没有实质性内容时（比如都是空的占位符被过滤了），才返回 [{}]
      const hasContent = mapped.some(item => {
        if (!item || typeof item !== 'object') return !!item;
        return Object.keys(item).length > 0;
      });
      return hasContent ? mapped : [{}];
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (isPlaceholderSkillParameterPath(key)) {
        continue;
      }
      sanitized[key] = sanitizeSkillDataExample(nestedValue);
    }

    return sanitized;
  }

  /**
   * Skill Guide 中的示例值优先使用真实识别值，缺失时再回退到通用示例
   */
export function buildSkillExampleValue(originalText: unknown, fieldType: string, variableName: string) : string {
    const normalized = sanitizeSkillExampleSource(originalText);
    if (normalized) {
      return normalized;
    }

    return generateExampleValue(fieldType, variableName);
  }
export function sanitizeSkillExampleSource(value: unknown) : string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }

    // Ignore Carbone markers when deriving skill examples. They are template syntax,
    // not business sample values.
    if (/^\{[#/d][^}]*\}$/.test(normalized) || /\{[#/d][^}]*\}/.test(normalized)) {
      return '';
    }

    return normalized;
  }

  /**
   * 生成模板描述
   */
export function generateTemplateDescription(templateType: string, documentDescription?: string, parameters?: any[]) : string {
    const baseDescription = `这是一个 ${templateType || 'custom'} 类型的模板渲染任务，需要根据文档理解结果和参数定义生成结构化数据，并用于最终文档渲染。`;
    const paramCount = parameters?.length || 0;
    const paramNames = parameters?.slice(0, 8).map((p) => p.displayName || p.name).join('、') || '待填充字段';
    const paramSummary = `当前共识别 ${paramCount} 个待填充参数，典型参数包括：${paramNames}。该说明主要用于帮助 AI 判断这份文档的语义范围、理解应补充哪些字段，以及如何把自然语言输入组织成最终渲染数据。`;

    return documentDescription
      ? `${documentDescription}\n\n${paramSummary}`
      : `${baseDescription}\n${paramSummary}`;
  }

  /**
   * 根据模板类型获取类型说明
   */
export function getTypeInstructions(templateType: string) : string {
    const typeMap: Record<string, string> = {
      contract: '合同模板：需要准确填写合同编号、甲乙方信息、金额、日期等关键信息',
      invoice: '发票模板：需要准确填写发票号、金额明细、税率等财务信息',
      report: '报告模板：需要填写报告标题、数据统计、分析结论等内容',
      certificate: '证书模板：需要填写证书编号、持证人信息、有效期等',
      letter: '函件模板：需要填写函件标题、收件人、正文内容等',
      custom: '自定义模板：根据具体需求填写相应字段',
    };
    return typeMap[templateType] || typeMap.custom;
  }

  /**
   * 生成示例值
   */
export function generateExampleValue(fieldType: string, variableName: string) : string {
    const cleanPath = normalizeSkillParameterPath(variableName || '');
    const exampleByPath = getBusinessExampleValue(cleanPath, fieldType);
    if (exampleByPath) {
      return exampleByPath;
    }

    const lastPart = cleanPath.split('.').pop() || cleanPath || variableName;

    switch (fieldType) {
      case 'date':
        return '2026-05-10';
      case 'amount':
        return '740,000.00';
      case 'number':
        return '4';
      case 'phone':
        return '13800138000';
      case 'email':
        return 'procurement@example.com';
      case 'address':
        return '北京市朝阳区望京东路 1 号';
      case 'name':
        return '北京智造科技有限公司';
      case 'code':
        return 'PC-2026-001';
      case 'text':
      default:
        // 根据变量名称生成更合适的示例
        if (lastPart.includes('名称') || lastPart.includes('name')) return '北京智造科技有限公司';
        if (lastPart.includes('地址') || lastPart.includes('address')) return '北京市朝阳区望京东路 1 号';
        if (lastPart.includes('日期') || lastPart.includes('date') || lastPart.includes('year')) return '2026';
        if (lastPart.includes('月')) return '05';
        if (lastPart.includes('日') || lastPart.includes('day')) return '10';
        if (lastPart.includes('金额') || lastPart.includes('amount')) return '740,000.00';
        if (lastPart.includes('签字') || lastPart.includes('sign')) return '王建国';
        if (lastPart.includes('保密') || lastPart.includes('confidential')) return '3';
        return `示例${lastPart}`;
    }
  }
export function getBusinessExampleValue(cleanPath: string, fieldType: string) : string | null {
    const normalized = cleanPath.toLowerCase();
    const exactPatterns: Array<[RegExp, string]> = [
      [/(^|\.)(seq|serialno|serialnumber|lineNo|lineno)$/, '1'],
      [/(^|\.)(materialcode|itemcode|productcode|sku|code)$/, 'RB-6A-001'],
      [/(^|\.)(devicename|productname|itemname|goodsname)$/, '工业机器人'],
      [/(^|\.)(model|spec|specification)$/, 'XR-600'],
      [/(^|\.)(unit)$/, '台'],
      [/(^|\.)(quantity|qty|count|num)$/, '4'],
      [/(^|\.)(unitprice|price)$/, '185,000.00'],
      [/(^|\.)(subtotal|amount|total)$/, '740,000.00'],
      [/(^|\.)(contractno|contractnumber)$/, 'PC-2026-001'],
      [/(^|\.)(projectname)$/, '智能制造产线升级项目'],
      [/(^|\.)(buyername|partya|customername)$/, '北京智造科技有限公司'],
      [/(^|\.)(suppliername|partyb|vendorname)$/, '上海远擎自动化设备有限公司'],
      [/(^|\.)(contactname|signer|signname)$/, '王建国'],
      [/(^|\.)(address)$/, '北京市朝阳区望京东路 1 号'],
      [/(^|\.)(phone|mobile|tel)$/, '13800138000'],
      [/(^|\.)(email)$/, 'procurement@example.com'],
    ];

    for (const [pattern, value] of exactPatterns) {
      if (pattern.test(normalized)) {
        return value;
      }
    }

    if (fieldType === 'amount') {
      return '740,000.00';
    }
    if (fieldType === 'number') {
      return '4';
    }
    if (fieldType === 'date') {
      return '2026-05-10';
    }

    return null;
  }

  /**
   * 构建完整的AI使用指导
   */
export function buildCompleteAIInstructions(templateType: string,
    parameters: any[],
    documentDescription?: string) : string {
    const parameterRules = parameters
      .map((p) => `- ${p.name}: ${p.usage || '填写对应值'}；类型=${p.dataType}；提取提示=${p.extractionHint || '结合上下文提取'}；示例=${p.example}`)
      .join('\n');

    return `【系统提示词】
你是模板渲染数据助手。你的任务是根据“文档整体理解”“参数定义”和“用户输入”，生成可直接用于模板渲染的 JSON 数据。

要求：
1. 只输出合法 JSON 对象，不要输出解释、Markdown、代码块或额外说明。
2. 输出结构必须与给定的数据结构示例一致。
3. 优先依据文档整体理解和参数用途补足字段，不要臆造与模板无关的数据。
4. 日期、数字、布尔值等字段要符合对应类型要求。

【用户提示词】
文档整体理解：
${documentDescription || `这是一个 ${templateType || 'custom'} 类型的模板渲染任务。`}

参数定义：
${parameterRules || '- 暂无参数定义'}

请根据用户输入生成最终渲染数据。`;
  }

  /**
   * 构建完整的JSON数据示例
   * 用于展示如何构建可用的数据结构
   */
export function buildDataExampleJson(parameters: any[], tableLoops: Array<Partial<TableLoop>> = []) : string {
    // 构建嵌套的数据结构
    const dataObj: any = {};

    const setValueAtPath = (target: Record<string, any>, rawPath: string, value: unknown) => {
      // 这里的 rawPath 可能是 normalize 后的 "items[].name" 或原始的 "items[i].name"
      // 我们统一处理，不在这里再次 normalize，因为外部已经处理过了
      const cleanPath = rawPath.trim();
      if (!cleanPath) return;

      const pathParts = cleanPath.split('.').filter(Boolean);
      let current = target;

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        
        // 匹配 array 格式: name[0], name[], name[i], 或者单纯的 []
        const arrayMatch = part.match(/^([^\[]*)\[(\d+|i)?\]$/);
        const isArrayPart = !!arrayMatch;
        const key = arrayMatch ? (arrayMatch[1] || '') : part;
        
        let arrayIndex = 0;
        if (arrayMatch && arrayMatch[2] !== undefined) {
           if (arrayMatch[2] !== 'i') {
             arrayIndex = parseInt(arrayMatch[2], 10);
           }
        }
        
        const isLast = i === pathParts.length - 1;

        if (isArrayPart) {
          // 如果 key 为空（说明是像 "items[]." 之后又接了一个 "[]"），则直接在当前 current 上操作
          if (!key) {
            if (!Array.isArray(current)) {
              // 这种情况理论上不应该发生，除非路径格式错误
              return;
            }
            if (isLast) {
              current[arrayIndex] = value;
            } else {
              if (!current[arrayIndex] || typeof current[arrayIndex] !== 'object') {
                current[arrayIndex] = {};
              }
              current = current[arrayIndex];
            }
            continue;
          }

          if (!Array.isArray(current[key])) {
            current[key] = [];
          }
          
          if (isLast) {
            // 如果是空对象且已经有值了，不要覆盖
            if (value && typeof value === 'object' && Object.keys(value).length === 0 && current[key][arrayIndex]) {
              return;
            }
            current[key][arrayIndex] = value;
            return;
          }

          if (!current[key][arrayIndex] || typeof current[key][arrayIndex] !== 'object' || Array.isArray(current[key][arrayIndex])) {
            current[key][arrayIndex] = {};
          }
          current = current[key][arrayIndex];
        } else {
          if (isLast) {
            current[key] = value;
          } else {
            if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
              current[key] = {};
            }
            current = current[key];
          }
        }
      }
    };

    // 1. 先初始化表格循环的路径
    for (const loop of tableLoops) {
      let arrayPath = normalizeSkillParameterPath(loop.arrayPath || '');
      if (arrayPath) {
        // 确保以 [] 结尾但不要重复
        if (!arrayPath.endsWith('[]')) {
          arrayPath += '[]';
        }
        setValueAtPath(dataObj, arrayPath, {});
        setValueAtPath(dataObj, arrayPath.replace(/\[\]$/g, '[1]'), {});
      }
    }

    // 2. 填充具体参数示例值 (parameters 中的 name 已经经过 normalize 包含 [])
    for (const p of parameters) {
      if (!p.name || isPlaceholderSkillParameterPath(p.name)) continue;
      setValueAtPath(dataObj, p.name, p.example);
      if (String(p.name).includes('[]')) {
        setValueAtPath(
          dataObj,
          buildIndexedSkillParameterPath(p.name, 1),
          buildLoopExampleValueForIndex(p.example, p.dataType, p.name, 1),
        );
      }
    }

    // 3. 填充表格列映射的示例值 (作为补充)
    for (const loop of tableLoops) {
      if (Array.isArray(loop.columnMappings)) {
        for (const column of loop.columnMappings) {
          const cleanColumnPath = normalizeSkillParameterPath(column?.variablePath || '');
          if (!cleanColumnPath || isPlaceholderSkillParameterPath(cleanColumnPath)) continue;
          
          const sampleValue = sanitizeSkillExampleSource(column?.sampleValue) || generateExampleValue(
            inferFieldType(column?.headerName || cleanColumnPath, String(sanitizeSkillExampleSource(column?.sampleValue) || '')),
            cleanColumnPath
          );
          setValueAtPath(dataObj, cleanColumnPath, sampleValue);
          if (cleanColumnPath.includes('[]')) {
            const inferredFieldType = inferFieldType(
              column?.headerName || cleanColumnPath,
              String(sanitizeSkillExampleSource(column?.sampleValue) || ''),
            );
            setValueAtPath(
              dataObj,
              buildIndexedSkillParameterPath(cleanColumnPath, 1),
              buildLoopExampleValueForIndex(sampleValue, inferredFieldType, cleanColumnPath, 1),
            );
          }
        }
      }
    }

    return JSON.stringify(dataObj, null, 2);
  }
export function buildIndexedSkillParameterPath(variablePath: string, index: number) : string {
    return normalizeSkillParameterPath(variablePath).replace(/\[\]/g, `[${index}]`);
  }
export function buildLoopExampleValueForIndex(baseValue: unknown,
    fieldType: string,
    variablePath: string,
    index: number,) : string {
    const base = sanitizeSkillExampleSource(baseValue) || generateExampleValue(fieldType, variablePath);
    if (index <= 0) {
      return base;
    }

    const cleanPath = normalizeSkillParameterPath(variablePath || '');
    const lastPart = (cleanPath.split('.').pop() || '').toLowerCase();

    if (/(^|\.)(seq|serialno|serialnumber|lineno|lineno|lineNo)$/i.test(cleanPath) || lastPart === 'seq') {
      return String(index + 1);
    }

    if (/(quantity|qty|count|num)$/i.test(lastPart)) {
      const numeric = Number(String(base).replace(/[^\d.-]/g, ''));
      return Number.isFinite(numeric) && numeric > 0 ? String(numeric + index) : String(index + 1);
    }

    if (/(materialcode|itemcode|productcode|sku|code)$/i.test(lastPart)) {
      const matched = String(base).match(/^(.*?)(\d+)$/);
      if (matched) {
        return `${matched[1]}${String(Number(matched[2]) + index).padStart(matched[2].length, '0')}`;
      }
      return `${base}-${index + 1}`;
    }

    if (/(devicename|productname|itemname|goodsname)$/i.test(lastPart)) {
      const fallbackNames = ['工业机器人', '智能控制柜', '视觉检测单元', '伺服驱动模组'];
      return fallbackNames[index % fallbackNames.length];
    }

    if (/(model|spec|specification)$/i.test(lastPart)) {
      const fallbackModels = ['XR-600', 'XR-610', 'XR-620', 'XR-630'];
      return fallbackModels[index % fallbackModels.length];
    }

    if (/(unitprice|price)$/i.test(lastPart)) {
      const numeric = Number(String(base).replace(/[^\d.-]/g, ''));
      if (Number.isFinite(numeric) && numeric > 0) {
        return (numeric + index * 1000).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
    }

    if (/(subtotal|amount|total)$/i.test(lastPart)) {
      const numeric = Number(String(base).replace(/[^\d.-]/g, ''));
      if (Number.isFinite(numeric) && numeric > 0) {
        return (numeric + index * 5000).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
    }

    return base;
  }
export function extractLoopColumnMappings(suggestion: any,
    tableLoops: Array<Partial<TableLoop>>,
    arrayPath: string) : ColumnMapping[] {
    if (Array.isArray(suggestion?.details?.columnMappings) && suggestion.details.columnMappings.length > 0) {
      return suggestion.details.columnMappings as ColumnMapping[];
    }

    const normalizedArrayPath = String(arrayPath || '').trim();
    if (!normalizedArrayPath) {
      return [];
    }

    const matchedLoop = tableLoops.find((loop) => String(loop.arrayPath || '').trim() === normalizedArrayPath);
    return Array.isArray(matchedLoop?.columnMappings) ? matchedLoop.columnMappings as ColumnMapping[] : [];
  }
export function buildSkillTableLoops(suggestions: any[], templateConfig: any) : TableLoop[] {
    const loopMap = new Map<string, TableLoop>();

    const addLoop = (loop: Partial<TableLoop> | null | undefined) => {
      const arrayPath = String(loop?.arrayPath || '').trim();
      if (!arrayPath) {
        return;
      }

      const normalizedColumnMappings = Array.isArray(loop?.columnMappings)
        ? loop!.columnMappings.map((column: any, index: number) => ({
            headerName: String(column?.headerName || `Column ${index + 1}`),
            variablePath: String(column?.variablePath || '').trim(),
            sampleValue: String(column?.sampleValue || ''),
            columnIndex: column?.columnIndex !== undefined ? Number(column.columnIndex) : index,
          })).filter((column: ColumnMapping) => Boolean(column.variablePath))
        : [];

      const existing = loopMap.get(arrayPath);
      loopMap.set(arrayPath, {
        tableIndex: loop?.tableIndex !== undefined ? Number(loop.tableIndex) : existing?.tableIndex ?? -1,
        headerRow: String(loop?.headerRow || existing?.headerRow || ''),
        dataRowCount: loop?.dataRowCount !== undefined ? Number(loop.dataRowCount) : existing?.dataRowCount ?? 0,
        arrayPath,
        columnMappings: normalizedColumnMappings.length > 0 ? normalizedColumnMappings : existing?.columnMappings || [],
        reason: String(loop?.reason || existing?.reason || '根据循环建议推导的表格循环'),
        confidence: loop?.confidence !== undefined ? Number(loop.confidence) : existing?.confidence ?? 0.9,
      });
    };

    if (Array.isArray(templateConfig?.tableLoops)) {
      templateConfig.tableLoops.forEach((loop: Partial<TableLoop>) => addLoop(loop));
    }

    for (const suggestion of suggestions) {
      if (suggestion?.type !== 'loop' && suggestion?.details?.fieldType !== 'loop') {
        continue;
      }

      const arrayPath = String(
        suggestion?.details?.arrayPath
        || suggestion?.suggestedName
        || ''
      ).trim();

      addLoop({
        arrayPath,
        headerRow: String(suggestion?.elementPath || suggestion?.details?.displayPosition || ''),
        dataRowCount: 1,
        reason: String(suggestion?.details?.significance || suggestion?.context || '来自前端循环建议'),
        confidence: suggestion?.confidence !== undefined ? Number(suggestion.confidence) : 0.9,
        columnMappings: Array.isArray(suggestion?.details?.columnMappings) ? suggestion.details.columnMappings : [],
      });
    }

    return Array.from(loopMap.values());
  }

  /**
   * 构建完整的Markdown格式Skill指南
   * 自包含文档，任何人都可以阅读并生成替换参数
   */
export function buildSkillGuideMarkdown(templateType: string,
    templateDescription: string,
    parameters: any[],
    dataExampleJson: string) : string {
    const now = new Date().toISOString().split('T')[0];

    const paramTable = parameters.map(p => {
      const varPath = normalizeSkillParameterPath(p.name || '');
      return `| \`${varPath}\` | ${p.usage || '填写对应值'} | ${p.dataType} | ${p.example} | \`${buildSkillCarboneSyntax(p.name, p.dataType)}\` |`;
    }).join('\n');
    let parsedExample;
    try {
      parsedExample = typeof dataExampleJson === "string" ? JSON.parse(dataExampleJson) : dataExampleJson;
    } catch (e) {
      parsedExample = dataExampleJson;
    }
    const formattedDataExample = JSON.stringify(parsedExample, null, 2);
    const apiDataExample = JSON.stringify({ data: parsedExample }, null, 2);

    return `# ${templateType} 模板 Skill Guide

> 本文档是AI Skill的完整指南，用于指导如何生成替换参数数据。
> 生成时间: ${now}

---

## 1. 模板概述

${templateDescription}

---

## 2. Carbone 变量语法说明

本模板使用 **Carbone** 模板引擎，常见变量语法如下：

| 语法 | 说明 | 示例 |
|------|------|------|
| \`{d.xxx}\` | 单值变量替换 | \`{d.contract.contractNo}\` |
| \`{d.xxx:formatD(YMD)}\` | 日期格式化 | \`{d.contract.signingDate:formatD(YMD)}\` |
| \`{d.xxx:formatN(2)}\` | 数字格式化 | \`{d.contract.amount:formatN(2)}\` |
| \`{#d.xxx}...{/d.xxx}\` | 循环数组 | \`{#d.items}{d.items.name}{/d.items}\` |

注意：
- Carbone 模板中的 \`{d.xxx}\` 是模板占位语法，不是最终 JSON 的键名。
- 最终渲染数据里应只保留纯 JSON 路径，例如 \`contract.contractNo\`、\`items[0].name\`。

---

## 3. 参数列表及说明

此列表主要用于指导如何从自然语言或业务系统中提取数据。参数路径按照所属层级或Sheet页进行了逻辑分组，请注意观察：

| 参数路径 | 用途说明 | 数据类型 | 示例值 | Carbone语法 |
|----------|----------|----------|--------|-------------|
${paramTable}

---

## 4. 完整数据示例

以下 JSON 结构是经过处理后的最终数据示例，代表了期望的输出格式。请注意观察其中数组和单值字段的处理方式：

\`\`\`json
${formattedDataExample}
\`\`\`

---

## 5. 数据提取步骤

建议按以下顺序从自然语言或业务输入中提取数据：

1. 先根据“模板概述”和“参数列表”判断当前输入对应的文档场景。
2. 再根据参数用途、示例值和字段名称定位用户表达中的关键信息。
3. 将提取到的值转换成正确类型，例如日期、数字、布尔值、数组。
4. 按“完整数据示例”的结构组装最终 JSON。
5. 保证输出的字段结构稳定，不要把 Carbone 模板语法写进 JSON 键名。

---

## 6. API调用示例

渲染时，应将最终生成的 JSON 作为统一运行时渲染接口的 \`data\` 参数传入。

\`\`\`bash
curl -X POST http://localhost:3009/studio/render-resolved \\
  -H "Content-Type: application/json" \\
  -d '{
    "templateId": "your-template-id",
    "data": ${formattedDataExample}
  }'
\`\`\`

调用时请确保：
1. JSON 键名是纯数据路径，不要包含 \`{d.\` 或 \`}\`
2. 单值字段用普通值，循环字段用数组
3. 输出结构与“完整数据示例”保持一致

---

## 7. 注意事项

- 参数用途说明应优先指导模型从自然语言或业务输入中提取值。
- 输出 JSON 必须与“完整数据示例”中的字段结构保持一致。
- 如果模板更新，应同步更新参数清单和完整数据示例。

---

*本文档由AI自动生成，用于指导如何生成替换参数数据。*
`;
  }
export function buildSkillCarboneSyntax(parameterName: string, dataType?: string) : string {
    const normalizedPath = normalizeSkillParameterPath(parameterName || '');
    if (!normalizedPath) {
      return '{d.value}';
    }

    if (dataType === 'loop' && !normalizedPath.includes('[].')) {
      return `{#d.${normalizedPath}}...{/d.${normalizedPath}}`;
    }

    return `{d.${normalizedPath}}`;
  }

  /**
   * AI失败时的后备建议生成
   * @param startIndex 空白的起始索引（用于分批处理时的索引偏移）
   */
