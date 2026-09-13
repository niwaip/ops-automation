import { ParamBilingualService } from './param-bilingual.service';
import { ParamContextMergeService } from './param-context-merge.service';
import { ParamPolicyService } from './param-policy.service';
import { ParamRecognizerService } from './param-recognizer.service';
import { ParamRequiredInputPresentationService } from './param-required-input-presentation.service';
import { ParamSchemaService } from './param-schema.service';
import { ParamValueService } from './param-value.service';
import { RecognizerService } from '../../recognizer/recognizer.service';
import { ModelService } from '../../model/model.service';

describe('Confidentiality Agreement Workflow End-to-End Resolution', () => {
  const confidentialitySkill = {
    skillId: 'c4204133-de0e-431f-b1d4-2fc50f897447',
    skillName: 'ConfidentialityAgreementGenerationWorkflow',
    paramsSchema: {
      properties: {
        'partyA.name': {
          type: 'string',
          description: '协议首部甲方法律主体名称',
          displayName: '甲方公司法定全称',
          required: true,
        },
        'partyA.address': {
          type: 'string',
          description: '协议首部甲方注册或联系地址',
          displayName: '甲方注册或经营地址',
          required: true,
        },
        'partyB.name': {
          type: 'string',
          description: '协议落款及首部乙方法律主体名称',
          displayName: '乙方（接收方）的公司全称',
          required: true,
          default: '富士通 ( 中国 ) 信息系統有限公司',
        },
        'partyB.address': {
          type: 'string',
          description: '协议首部乙方注册或联系地址',
          displayName: '乙方注册或经营地址',
          required: true,
          default: '上海浦东新区陆家嘴环路 1000 号',
        },
        'cooperation.subject': {
          type: 'string',
          description: '保密协议所覆盖的合作项目/业务范围主题',
          displayName: '双方合作的具体业务主题或项目内容',
          required: true,
        },
        'confidentiality.durationYears': {
          type: 'number',
          description: '保密义务持续年限（数字）',
          displayName: '保密期限的具体年数',
          required: true,
          default: 3,
        },
        'agreement.signDate.year': {
          type: 'number',
          description: '协议签订日期的年份（数字）',
          displayName: '协议签订年份',
          required: true,
        },
        'agreement.signDate.month': {
          type: 'number',
          description: '协议签订日期的月份（数字）',
          displayName: '协议签订月份',
          required: true,
        },
        'agreement.signDate.day': {
          type: 'number',
          description: '协议签订日期的具体日（数字）',
          displayName: '协议签订日（日号）',
          required: true,
        },
        'attachment.content': {
          type: 'string',
          description: '附件一内容详情',
          displayName: '附件一的具体内容或补充说明',
          required: false,
          default: '无',
        },
      },
      required: [
        'partyA.name',
        'partyA.address',
        'partyB.name',
        'partyB.address',
        'cooperation.subject',
        'confidentiality.durationYears',
        'agreement.signDate.year',
        'agreement.signDate.month',
        'agreement.signDate.day',
      ],
    },
    apiEndpoints: {
      runtimeMetadata: {
        workflowInputPolicy: {
          params: {
            'partyA.name': { enabled: true, requiredMode: 'always' },
            'partyA.address': { enabled: true, requiredMode: 'always' },
            'partyB.name': {
              enabled: true,
              defaultValue: '富士通 ( 中国 ) 信息系統有限公司',
              requiredMode: 'always',
            },
            'partyB.address': {
              enabled: true,
              defaultValue: '上海浦东新区陆家嘴环路 1000 号',
              requiredMode: 'always',
            },
            'cooperation.subject': { enabled: true, requiredMode: 'always' },
            'confidentiality.durationYears': {
              enabled: true,
              defaultValue: 3,
              requiredMode: 'always',
            },
            'agreement.signDate.year': { enabled: true, defaultValue: 0, requiredMode: 'always' },
            'agreement.signDate.month': { enabled: true, defaultValue: 0, requiredMode: 'always' },
            'agreement.signDate.day': { enabled: true, defaultValue: 0, requiredMode: 'always' },
            'attachment.content': { enabled: true, defaultValue: '无', requiredMode: 'optional' },
          },
        },
      },
    },
  } as any;

  function buildParamRecognizerService(): ParamRecognizerService {
    return new ParamRecognizerService(
      new ParamSchemaService(),
      new ParamContextMergeService(),
      new ParamBilingualService({ callModel: jest.fn() } as any),
      new ParamPolicyService(),
      new ParamValueService(),
      new ParamRequiredInputPresentationService()
    );
  }

  it('resolves all required inputs without any missing fields when user provides counterpart and specifies we are party B', () => {
    const service = buildParamRecognizerService();
    const recognizer = new RecognizerService({
      resolveModelId: jest.fn(),
      getClient: jest.fn(),
      getDefaultModel: jest.fn().mockReturnValue(null),
    } as unknown as ModelService);

    // Recognizer simulates deterministic pattern extraction or LLM extraction
    // User input: "生成保密协议 我们是乙方，需要和 北京大街100号 的 豆包公司 ，关于 ai模型开发项目签订保密协议， 签订日是今天"
    // Using basicPatternMatching fallback or simulated LLM response
    const recognizedParams: Record<string, unknown> = {
      'partyA.name': '豆包公司',
      'partyA.address': '北京大街100号',
      'cooperation.subject': 'ai模型开发项目',
      'agreement.signDate.year': new Date().getFullYear(),
      'agreement.signDate.month': new Date().getMonth() + 1,
      'agreement.signDate.day': new Date().getDate(),
    };

    const inputs = service.buildRequiredInputs(confidentialitySkill, {
      params: recognizedParams,
      confidence: 0.95,
    });

    const missingInputs = inputs.filter((i) => i.missing);
    expect(missingInputs).toHaveLength(0);

    const partyAName = inputs.find((i) => i.name === 'partyA.name');
    expect(partyAName?.value).toBe('豆包公司');
    expect(partyAName?.source).toBe('user_input');
    expect(partyAName?.missing).toBe(false);

    const partyAAddress = inputs.find((i) => i.name === 'partyA.address');
    expect(partyAAddress?.value).toBe('北京大街100号');
    expect(partyAAddress?.source).toBe('user_input');
    expect(partyAAddress?.missing).toBe(false);

    const partyBName = inputs.find((i) => i.name === 'partyB.name');
    expect(partyBName?.value).toBe('富士通 ( 中国 ) 信息系統有限公司');
    expect(partyBName?.source).toBe('workflow_default');
    expect(partyBName?.missing).toBe(false);

    const partyBAddress = inputs.find((i) => i.name === 'partyB.address');
    expect(partyBAddress?.value).toBe('上海浦东新区陆家嘴环路 1000 号');
    expect(partyBAddress?.source).toBe('workflow_default');
    expect(partyBAddress?.missing).toBe(false);

    const durationYears = inputs.find((i) => i.name === 'confidentiality.durationYears');
    expect(durationYears?.value).toBe(3);
    expect(durationYears?.source).toBe('workflow_default');
    expect(durationYears?.missing).toBe(false);

    const signYear = inputs.find((i) => i.name === 'agreement.signDate.year');
    expect(signYear?.value).toBe(new Date().getFullYear());
    expect(signYear?.missing).toBe(false);

    const signMonth = inputs.find((i) => i.name === 'agreement.signDate.month');
    expect(signMonth?.value).toBe(new Date().getMonth() + 1);
    expect(signMonth?.missing).toBe(false);

    const signDay = inputs.find((i) => i.name === 'agreement.signDate.day');
    expect(signDay?.value).toBe(new Date().getDate());
    expect(signDay?.missing).toBe(false);
  });
});
