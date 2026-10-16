import { describe, expect, it } from 'vitest';
import { buildDynamicWorkflowCardPayload } from './dynamicWorkflowCard';
import type { WorkflowTemplateDefinition } from '../../../api/workbenchCoordination';

describe('buildDynamicWorkflowCardPayload', () => {
  const ndaTemplate: WorkflowTemplateDefinition = {
    id: 'legal.nda.generation_and_review_flow',
    workflowId: 'legal.nda.generation_and_review_flow',
    name: '保密合同起草与法务审查闭环流',
    description: '专属保密合同生成技能提取要件生成初稿，流转法务部专项审查批注',
    category: 'legal',
    taskType: 'approval',
    paramsSchema: {
      required: [
        'partyA.name',
        'partyB.name',
        'partyA.address',
        'partyB.address',
        'cooperation.subject',
        'confidentiality.durationYears',
      ],
      properties: {
        'partyA.name': {
          type: 'string',
          displayName: '甲方公司法定全称',
          description: '协议首部甲方法律主体名称',
          required: true,
        },
        'partyB.name': {
          type: 'string',
          displayName: '乙方（接收方）的公司全称',
          description: '协议落款及首部乙方法律主体名称',
          default: '富士通 ( 中国 ) 信息系統有限公司',
          required: true,
        },
        'cooperation.subject': {
          type: 'string',
          displayName: '双方合作的具体业务主题或项目内容',
          description: '保密协议所覆盖的合作项目/业务范围主题',
          required: true,
        },
        'confidentiality.durationYears': {
          type: 'number',
          displayName: '保密期限的具体年数',
          description: '保密义务持续年限（数字）',
          default: 3,
          required: true,
        },
        'agreement.signDate.year': {
          type: 'number',
          displayName: '协议签订年份',
          description: '协议签订日期的年份（数字）',
          required: true,
        },
      },
    },
  };

  it('formats durationYears as 年 instead of 小时 and uses displayName as field label', () => {
    const formValues = {
      'partyA.name': '北京字节跳动科技有限公司',
      'partyB.name': '富士通 ( 中国 ) 信息系統有限公司',
      'cooperation.subject': '智能知识库与流程自动化合作研发',
      'confidentiality.durationYears': 3,
      'agreement.signDate.year': 2026,
    };

    const result = buildDynamicWorkflowCardPayload(ndaTemplate, formValues, {
      id: 'user-1',
      username: 'zhangsan',
      email: 'zhangsan@example.com',
    });

    expect(result.content).toContain('**甲方公司法定全称**：北京字节跳动科技有限公司');
    expect(result.content).toContain('**保密期限的具体年数**：3 年');
    expect(result.content).not.toContain('3 小时');
    expect(result.content).toContain('**协议签订年份**：2026 年');
    expect(result.parameters['confidentiality.durationYears']).toBe(3);
    expect(result.parameters['partyA.name']).toBe('北京字节跳动科技有限公司');
  });

  it('supports resolving dotted keys from nested form values object', () => {
    const nestedFormValues = {
      partyA: { name: '腾讯科技（深圳）有限公司' },
      partyB: { name: '富士通 ( 中国 ) 信息系統有限公司' },
      cooperation: { subject: '云原生自动化平台共建' },
      confidentiality: { durationYears: 5 },
      agreement: { signDate: { year: 2026 } },
    };

    const result = buildDynamicWorkflowCardPayload(ndaTemplate, nestedFormValues);

    expect(result.content).toContain('**甲方公司法定全称**：腾讯科技（深圳）有限公司');
    expect(result.content).toContain('**保密期限的具体年数**：5 年');
    expect(result.content).not.toContain('5 小时');
  });
});
