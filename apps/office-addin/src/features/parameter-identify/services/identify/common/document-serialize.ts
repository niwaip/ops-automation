import { DocumentIR } from '../../../../../host/adapters/document-ir';

export function serializeWordDocument(documentIR: DocumentIR): string {
  return documentIR.elements
    .filter((element) => element.type === 'paragraph' || element.type === 'table')
    .map((element) => element.text || '')
    .filter(Boolean)
    .join('\n');
}

export function serializeDocument(documentIR: DocumentIR): string {
  if (documentIR.host === 'word') {
    return serializeWordDocument(documentIR);
  }

  return JSON.stringify(documentIR);
}

export function buildDocumentContext(documentIR: DocumentIR, templateType: string): string {
  if (documentIR.host === 'excel') {
    const pairCount = documentIR.stats.sheetPairCount || 0;
    const sheetCount = documentIR.stats.sheetCount || 0;
    return `这是一份${templateType}类型的Excel表格。空白模板sheet保留结构，真实数据sheet提供实例内容，用户后续还会手动补足信息。请先基于Office原生结构解析成对sheet差异，识别可参数化cells、跨行循环和表格区域，再结合AI输出参数名称、描述、类型和模板化建议。当前只处理保留且参与比较的sheet对照组，共${pairCount}组、${sheetCount}个sheet。`;
  }

  return `这是一份${templateType}类型的${
    documentIR.host === 'word' ? 'Word文档' : 'PPT演示文稿'
  }，需要识别可参数化区域并生成模板变量`;
}
