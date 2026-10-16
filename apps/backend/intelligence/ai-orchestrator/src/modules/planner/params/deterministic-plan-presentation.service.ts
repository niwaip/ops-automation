import { Injectable } from '@nestjs/common';
import type { RequiredUserInputV1 } from '@ops/backend-deterministic-plan';
import { resolveFriendlyInputDisplayName } from '../../../common/input-label';

export interface FormattedMissingInputPresentation {
  message: string;
  fields: Array<{
    name: string;
    path: string;
    label: string;
    type: string;
    description: string;
  }>;
}

@Injectable()
export class DeterministicPlanPresentationService {
  public formatMissingInputs(
    missingInputs: RequiredUserInputV1[],
    introPrefix?: string,
  ): FormattedMissingInputPresentation {
    const fields = missingInputs.map((input) => {
      const fieldName = (input as any).name || input.targetField;
      const path = (input as any).inputPath || `planInputs.${input.nodeId}.${input.targetField}`;
      const label = resolveFriendlyInputDisplayName({
        name: fieldName,
        display_name: (input as any).displayName || (input as any).display_name,
        description: input.prompt || (input as any).description,
      });
      const isFileField = /file(?:base64|_base64)?/i.test(fieldName);
      const description =
        input.prompt ||
        (input as any).description ||
        (isFileField
          ? '请通过输入框下方的附件图标上传待提取的文档或附件'
          : `请输入 ${label}`);
      const type = (input as any).type || 'string';

      return {
        name: fieldName,
        path,
        label,
        type,
        description,
      };
    });

    const fieldLines = fields
      .map((f, i) => `${i + 1}. **${f.label}** (${f.type}): ${f.description}`)
      .join('\n');

    const prefix = introPrefix || '已完成确定性任务拆分，但还需要补充以下必要参数：';
    const message = `${prefix}\n\n${fieldLines}\n\n请在下方输入框中提供参数以继续执行。`;

    return { message, fields };
  }
}
