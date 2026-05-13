import { AISuggestion, TemplateConfig } from '../taskpane/store';

export function getUploadedFileFormat(file: File | null): 'docx' | 'xlsx' | 'pptx' {
  const fileName = file?.name.toLowerCase() || '';
  if (fileName.endsWith('.xlsx')) return 'xlsx';
  if (fileName.endsWith('.pptx')) return 'pptx';
  return 'docx';
}

export function buildPreviewData(
  templateType: TemplateConfig['templateType'],
  suggestions: AISuggestion[]
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    title: '示例标题',
    date: new Date().toISOString().split('T')[0],
    content: '示例内容文本',
  };

  for (const suggestion of suggestions) {
    if (suggestion.type === 'loop' && suggestion.details?.arrayPath) {
      const path = suggestion.details.arrayPath.replace('d.', '');
      data[path] = [
        { name: '项目1', value: 100 },
        { name: '项目2', value: 200 },
        { name: '项目3', value: 300 },
      ];
    }
  }

  switch (templateType) {
    case 'invoice':
      data.invoiceNumber = 'INV-2024-001';
      data.customer = '客户名称';
      data.items = [{ product: '产品A', quantity: 10, price: 100 }];
      data.total = 1000;
      break;
    case 'certificate':
      data.recipient = '持证人';
      data.issueDate = new Date().toISOString().split('T')[0];
      data.expiryDate = '2025-12-31';
      break;
    case 'contract':
      data.partyA = '甲方名称';
      data.partyB = '乙方名称';
      data.contractNumber = 'CON-2024-001';
      break;
  }

  return data;
}

export function formatLocaleDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('zh-CN');
  } catch {
    return dateStr;
  }
}
