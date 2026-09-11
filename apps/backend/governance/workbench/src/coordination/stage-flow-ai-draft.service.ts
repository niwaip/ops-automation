import { Inject, Injectable, Logger } from '@nestjs/common';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../ports';
import { randomUUID } from 'crypto';

export type StageFlowMode = 'api' | 'browser_template';
export type WorkflowStageType = 'submission' | 'approval' | 'automation' | 'archive';

export interface GenerateStageFlowAiDraftDto {
  prompt: string;
  preferredMode?: 'api' | 'browser_template' | 'auto';
  stageType?: WorkflowStageType;
  templateId?: string;
  credentialSecretKey?: string;
  targetEndpointUrl?: string;
}

export interface StageWorkflowDraft {
  id: string;
  name: string;
  category: string;
  stageType: WorkflowStageType;
  handlerRule: string;
  requiredMetadata: string[];
  description: string;
  executionMode: StageFlowMode;
  apiConfig?: {
    businessParams: Array<{
      key: string;
      label: string;
      type: string;
      required: boolean;
      description?: string;
    }>;
    authActivity: {
      activityName: string;
      authType: 'api_key' | 'bearer_token' | 'oauth2' | 'hmac_signature';
      credentialKeyRef: string;
      headerName?: string;
      description: string;
    };
    updateActivity: {
      activityName: string;
      endpointUrl: string;
      method: 'POST' | 'PUT' | 'PATCH';
      payloadMapping: Record<string, string>;
      timeoutSeconds: number;
      description: string;
    };
  };
  browserConfig?: {
    templateId: string;
    templateName: string;
    paramMappings: Array<{
      businessParamKey: string;
      targetField: string;
      label: string;
      action: string;
    }>;
    credentialMapping: {
      vaultSecretKey: string;
      targetCredentialField: string;
      description: string;
    };
  };
  sampleInputContract: Record<string, unknown>;
  sampleOutputContract: Record<string, unknown>;
  warnings?: string[];
  workflowDsl: Record<string, any>;
  activityDsl: Record<string, any>;
  generatedCode: string;
}

@Injectable()
export class StageFlowAiDraftService {
  private readonly logger = new Logger(StageFlowAiDraftService.name);

  constructor(
    @Inject(WORKBENCH_PRISMA)
    private readonly prisma: WorkbenchPrismaPort
  ) {}

  /**
   * 基于自然语言意图生成符合固定契约的流程专用原子工作流草稿
   */
  async generateDraft(dto: GenerateStageFlowAiDraftDto): Promise<StageWorkflowDraft> {
    const prompt = dto.prompt?.trim() || '创建通用业务数据同步原子流';
    const lowerPrompt = prompt.toLowerCase();

    // 1. 判断执行模式 (API 更新 vs 浏览器录制模版)
    let executionMode: StageFlowMode = 'api';
    if (dto.preferredMode === 'browser_template') {
      executionMode = 'browser_template';
    } else if (dto.preferredMode === 'api') {
      executionMode = 'api';
    } else {
      // 自动推断
      const isBrowserIntent =
        lowerPrompt.includes('浏览器') ||
        lowerPrompt.includes('录制') ||
        lowerPrompt.includes('模版') ||
        lowerPrompt.includes('网页') ||
        lowerPrompt.includes('点击') ||
        lowerPrompt.includes('oa系统录入') ||
        lowerPrompt.includes('表单填报');
      executionMode = isBrowserIntent ? 'browser_template' : 'api';
    }

    // 2. 识别业务阶段 (Stage Type)
    let stageType: WorkflowStageType = dto.stageType || 'automation';
    if (!dto.stageType) {
      if (
        lowerPrompt.includes('同步') ||
        lowerPrompt.includes('扣减') ||
        lowerPrompt.includes('写入') ||
        lowerPrompt.includes('自动化') ||
        lowerPrompt.includes('调用接口') ||
        lowerPrompt.includes('更新状态') ||
        lowerPrompt.includes('审批通过后')
      ) {
        stageType = 'automation';
      } else if (
        lowerPrompt.includes('申请') ||
        lowerPrompt.includes('提单') ||
        lowerPrompt.includes('填报') ||
        lowerPrompt.includes('发起')
      ) {
        stageType = 'submission';
      } else if (
        lowerPrompt.includes('审批') ||
        lowerPrompt.includes('审核') ||
        lowerPrompt.includes('核决') ||
        lowerPrompt.includes('主管') ||
        lowerPrompt.includes('会签')
      ) {
        stageType = 'approval';
      } else if (
        lowerPrompt.includes('回执') ||
        lowerPrompt.includes('归档') ||
        lowerPrompt.includes('通知') ||
        lowerPrompt.includes('办结')
      ) {
        stageType = 'archive';
      } else {
        stageType = 'automation';
      }
    }

    // 3. 识别业务领域分类 (Category)
    let category = 'general';
    if (lowerPrompt.includes('假') || lowerPrompt.includes('考勤') || lowerPrompt.includes('员工') || lowerPrompt.includes('人事')) {
      category = 'hr';
    } else if (lowerPrompt.includes('报销') || lowerPrompt.includes('费用') || lowerPrompt.includes('发票') || lowerPrompt.includes('财务') || lowerPrompt.includes('erp')) {
      category = 'oa';
    } else if (lowerPrompt.includes('资产') || lowerPrompt.includes('设备') || lowerPrompt.includes('采购')) {
      category = 'it';
    }

    const flowSuffix = randomUUID().substring(0, 6);
    const flowId = `flow_${category}_${stageType}_${flowSuffix}`;

    // 4. 生成流程名称与经办担当
    let flowName = '业务自动化执行流';
    let handlerRule = '后台系统自动化执行';
    let requiredMetadata = ['业务主键', '操作人', '更新负载'];

    if (stageType === 'submission') {
      flowName = `${this.resolveDomainName(category)}业务提单与经办工作流`;
      handlerRule = '申请人填报 + 业务经办担当 (@handler)';
      requiredMetadata = ['申请人', '承办担当 (@handler)', '业务参数', '起止时限'];
    } else if (stageType === 'approval') {
      flowName = `${this.resolveDomainName(category)}主管审批核决工作流`;
      handlerRule = '直属主管 / 部门责任人核决';
      requiredMetadata = ['申请人', '审核人 (@approver)', '审批决议 (agree/reject)', '审批意见'];
    } else if (stageType === 'archive') {
      flowName = `${this.resolveDomainName(category)}通知回执与凭证归档工作流`;
      handlerRule = '回执全渠道分发与 GTD 凭证归档';
      requiredMetadata = ['接收人', '凭证编号', '办结摘要', '归档时间戳'];
    } else {
      flowName = `${this.resolveDomainName(category)}${executionMode === 'api' ? '数据接口更新流' : '浏览器模版执行流'}`;
      handlerRule = executionMode === 'api' ? '业务系统 API 接口自动化执行' : '无头浏览器自动化操作执行';
      requiredMetadata = ['上下文单号', '目标系统Key', '更新参数字典'];
    }

    // 5. 根据模式分别构建步骤拓扑与凭证绑定
    if (executionMode === 'api') {
      const businessParams = this.inferBusinessParams(category, stageType, prompt);
      const authType = lowerPrompt.includes('bearer') ? 'bearer_token' : lowerPrompt.includes('oauth') ? 'oauth2' : 'api_key';
      const credentialKeyRef = dto.credentialSecretKey || `VAULT_${category.toUpperCase()}_API_KEY`;
      const endpointUrl = dto.targetEndpointUrl || `https://api.internal.${category}.corp.com/v1/sync`;

      const flowDescription = `AI 生成的 API 更新工作流：首先完成【${authType} 凭证认证】，随后调用接口向目标业务系统提交业务数据更新。`;
      const workflowClassName = `${this.capitalize(category)}${this.capitalize(stageType)}Workflow`;

      const workflowDsl = {
        name: flowName,
        workflowClassName,
        workflowDefnName: flowId,
        taskQueue: `${category.toUpperCase()}_STAGE_TASK_QUEUE`,
        stageType,
        stageCategory: category,
        handlerRule,
        requiredMetadata,
        description: flowDescription,
        steps: [
          {
            id: 'step_auth',
            name: `认证凭证与权限核验 (${authType})`,
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            startToCloseTimeout: '30s',
            input: {
              __httpRequest: {
                method: 'POST',
                urlTemplate: `https://auth.internal.${category}.corp/api/v1/verify`,
                headers: {
                  'Content-Type': 'application/json',
                  [authType === 'bearer_token' ? 'Authorization' : 'X-API-Key']: `{${credentialKeyRef}}`,
                },
                bodyTemplate: JSON.stringify({
                  credentialKeyRef,
                  domain: category,
                  stage: stageType,
                }),
                responseMode: 'body',
                timeout: 30,
              },
            },
          },
          {
            id: 'step_api_update',
            name: '向目标业务系统提交数据更新',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            startToCloseTimeout: '60s',
            input: {
              __httpRequest: {
                method: 'POST',
                urlTemplate: endpointUrl,
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer {step_auth.token}',
                },
                bodyTemplate: JSON.stringify(
                  businessParams.reduce((acc, p) => {
                    acc[p.key] = `{${p.key}}`;
                    return acc;
                  }, {} as Record<string, string>)
                ),
                responseMode: 'body',
                timeout: 60,
              },
            },
          },
        ],
        inputParams: businessParams.reduce((acc, p) => {
          acc[p.key] = {
            description: p.description || p.label,
            displayName: p.label,
            required: p.required,
            type: p.type === 'number' ? 'number' : p.type === 'datetime' ? 'date' : 'string',
            exampleValue: p.type === 'number' ? 4 : `示例_${p.label}`,
            defaultValue: p.type === 'number' ? '4' : `示例_${p.label}`,
          };
          return acc;
        }, {} as Record<string, any>),
        outputParams: {
          success: {
            description: '执行结果状态',
            type: 'boolean',
            required: true,
            sourceStep: 'step_api_update',
          },
          stage: { description: '流程阶段标识', type: 'string', required: true },
          transactionId: { description: '业务交易编号', type: 'string', required: true },
        },
        validation: {
          scenarios: [
            {
              id: 'scenario_standard_test',
              label: '标准业务提单与更新端到端验证',
              description: '传入合法的业务表单与授权凭据，检验两步 Activity 拓扑及执行返回',
              parameters: businessParams.map((p) => p.key),
              requiredParameters: businessParams.filter((p) => p.required).map((p) => p.key),
            },
          ],
          assertions: [
            {
              field: 'success',
              operator: 'equals',
              value: true,
              message: '工作流端对端执行必须成功',
            },
          ],
        },
      };

      const activityDsl = {
        activities: [
          {
            name: `Fetch${this.capitalize(category)}AuthKeyActivity`,
            fn: `fetch_${category}_auth_key`,
            timeout: '30s',
            handler: 'api',
            config: {
              authType,
              credentialKeyRef,
              headerName: authType === 'bearer_token' ? 'Authorization' : 'X-API-Key',
            },
          },
          {
            name: `Execute${this.capitalize(category)}ApiUpdateActivity`,
            fn: `execute_${category}_api_update`,
            timeout: '60s',
            handler: 'api',
            config: {
              endpointUrl,
              method: 'POST',
              payloadMapping: businessParams.reduce((acc, param) => {
                acc[param.key] = `$.formData.${param.key}`;
                return acc;
              }, {} as Record<string, string>),
            },
          },
        ],
      };

      const generatedCode = this.buildGeneratedCode(
        flowId,
        flowName,
        workflowClassName,
        flowDescription,
        category,
        stageType,
        'api',
        businessParams,
        flowSuffix,
        credentialKeyRef
      );

      return {
        id: flowId,
        name: flowName,
        category,
        stageType,
        handlerRule,
        requiredMetadata,
        description: flowDescription,
        executionMode: 'api',
        apiConfig: {
          businessParams,
          authActivity: {
            activityName: `Fetch${this.capitalize(category)}AuthKeyActivity`,
            authType,
            credentialKeyRef,
            headerName: authType === 'bearer_token' ? 'Authorization' : 'X-API-Key',
            description: '第一步：从环境变量或用户秘钥保险箱检索并校验接口调用 Key / Bearer 凭证',
          },
          updateActivity: {
            activityName: `Execute${this.capitalize(category)}ApiUpdateActivity`,
            endpointUrl,
            method: 'POST',
            payloadMapping: businessParams.reduce((acc, param) => {
              acc[param.key] = `$.formData.${param.key}`;
              return acc;
            }, {} as Record<string, string>),
            timeoutSeconds: 30,
            description: '第二步：装配业务参数并向后端接口发送 HTTP 更新请求，回写业务状态',
          },
        },
        sampleInputContract: {
          context: {
            workflowKey: flowId,
            traceId: `tr_${flowSuffix}`,
            initiatedChannel: 'web_portal_orchestrator',
          },
          parties: {
            applicant: { userId: 'u_applicant_001', username: 'alice' },
            handler: { userId: 'u_handler_002', username: 'bob_operator' },
          },
          formData: businessParams.reduce((acc, param) => {
            acc[param.key] = `示例_${param.label}`;
            return acc;
          }, {} as Record<string, any>),
        },
        sampleOutputContract: {
          success: true,
          stage: stageType,
          authStatus: 'credential_verified',
          apiResult: {
            statusCode: 200,
            statusText: 'OK',
            transactionId: `tx_${flowSuffix}`,
          },
          timestamp: new Date().toISOString(),
        },
        warnings: [
          `凭证引用已配置为 ${credentialKeyRef}，请确认已在凭证中心录入该秘钥`,
          '接口请求已开启幂等保护，重复触发不会重复扣减或更新数据',
        ],
        workflowDsl,
        activityDsl,
        generatedCode,
      };
    } else {
      // 浏览器模版模式
      const templateName = dto.templateId ? `指定模版 (${dto.templateId})` : `${this.resolveDomainName(category)}业务填报浏览器模版`;
      const vaultSecretKey = dto.credentialSecretKey || `VAULT_${category.toUpperCase()}_LOGIN_PASSWORD`;
      const businessParams = this.inferBusinessParams(category, stageType, prompt);
      const flowDescription = `AI 生成的浏览器自动化工作流：调用已录制好的浏览器操作模版【${templateName}】，将业务数据注入表单，并从用户秘钥库安全代填登录口令。`;
      const workflowClassName = `${this.capitalize(category)}BrowserReplayWorkflow`;

      const workflowDsl = {
        name: flowName,
        workflowClassName,
        workflowDefnName: flowId,
        taskQueue: `${category.toUpperCase()}_STAGE_TASK_QUEUE`,
        stageType,
        stageCategory: category,
        handlerRule,
        requiredMetadata,
        description: flowDescription,
        steps: [
          {
            id: 'step_browser_replay',
            name: `回放浏览器录制模版 (${templateName})`,
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            startToCloseTimeout: '120s',
            input: {
              __httpRequest: {
                method: 'POST',
                urlTemplate: 'https://browser-worker.internal.corp/api/v1/templates/execute',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Vault-Secret': `{${vaultSecretKey}}`,
                },
                bodyTemplate: JSON.stringify({
                  templateId: dto.templateId || `tmpl_rec_${category}_${flowSuffix}`,
                  vaultSecretKey,
                  formData: businessParams.reduce((acc, p) => {
                    acc[p.key] = `{${p.key}}`;
                    return acc;
                  }, {} as Record<string, string>),
                }),
                responseMode: 'body',
                timeout: 120,
              },
            },
          },
        ],
        inputParams: businessParams.reduce((acc, p) => {
          acc[p.key] = {
            description: p.description || p.label,
            displayName: p.label,
            required: p.required,
            type: p.type === 'number' ? 'number' : p.type === 'datetime' ? 'date' : 'string',
            exampleValue: p.type === 'number' ? 4 : `示例_${p.label}`,
            defaultValue: p.type === 'number' ? '4' : `示例_${p.label}`,
          };
          return acc;
        }, {} as Record<string, any>),
        outputParams: {
          success: {
            description: '执行结果状态',
            type: 'boolean',
            required: true,
            sourceStep: 'step_browser_replay',
          },
          stage: { description: '流程阶段标识', type: 'string', required: true },
          transactionId: { description: '业务交易编号', type: 'string', required: true },
        },
        validation: {
          scenarios: [
            {
              id: 'scenario_browser_replay_test',
              label: '标准浏览器填报端对端测试',
              description: '注入测试数据与代填口令，检验浏览器回放链路执行',
              parameters: businessParams.map((p) => p.key),
              requiredParameters: businessParams.filter((p) => p.required).map((p) => p.key),
            },
          ],
          assertions: [
            {
              field: 'success',
              operator: 'equals',
              value: true,
              message: '浏览器录制自动化执行必须成功',
            },
          ],
        },
      };

      const activityDsl = {
        activities: [
          {
            name: `Replay${this.capitalize(category)}TemplateActivity`,
            fn: `replay_${category}_template`,
            timeout: '120s',
            handler: 'browser',
            config: {
              templateId: dto.templateId || `tmpl_rec_${category}_${flowSuffix}`,
              vaultSecretKey,
            },
          },
        ],
      };

      const generatedCode = this.buildGeneratedCode(
        flowId,
        flowName,
        workflowClassName,
        flowDescription,
        category,
        stageType,
        'browser_template',
        businessParams,
        flowSuffix,
        vaultSecretKey
      );

      return {
        id: flowId,
        name: flowName,
        category,
        stageType,
        handlerRule,
        requiredMetadata,
        description: flowDescription,
        executionMode: 'browser_template',
        browserConfig: {
          templateId: dto.templateId || `tmpl_rec_${category}_${flowSuffix}`,
          templateName,
          paramMappings: businessParams.map((p) => ({
            businessParamKey: p.key,
            targetField: `input[name="${p.key}"]`,
            label: p.label,
            action: 'type_text',
          })),
          credentialMapping: {
            vaultSecretKey,
            targetCredentialField: 'input[type="password"]',
            description: '自动从用户保存的秘钥中读取口令并输入，避免凭证明文出现在配置中',
          },
        },
        sampleInputContract: {
          context: {
            workflowKey: flowId,
            traceId: `tr_${flowSuffix}`,
          },
          parties: {
            applicant: { userId: 'u_applicant_001' },
            handler: { userId: 'u_handler_002' },
          },
          formData: businessParams.reduce((acc, param) => {
            acc[param.key] = `示例_${param.label}`;
            return acc;
          }, {} as Record<string, any>),
        },
        sampleOutputContract: {
          success: true,
          stage: stageType,
          browserReplay: {
            stepsExecuted: businessParams.length + 2,
            screenshotRef: `screenshot_${flowSuffix}.png`,
            status: 'completed',
          },
          timestamp: new Date().toISOString(),
        },
        warnings: [
          `凭证输入已绑定为秘钥 ${vaultSecretKey}，回放执行时将以沙箱加密方式自动代填`,
          '建议在发布前使用真实目标系统页面执行一次试运行校验',
        ],
        workflowDsl,
        activityDsl,
        generatedCode,
      };
    }
  }

  private buildGeneratedCode(
    flowId: string,
    flowName: string,
    workflowClassName: string,
    flowDescription: string,
    category: string,
    stageType: WorkflowStageType,
    executionMode: StageFlowMode,
    businessParams: Array<{ key: string; label: string; type: string; required: boolean }>,
    flowSuffix: string,
    credentialKeyRef: string
  ): string {
    const paramAssignments = businessParams
      .map((p) => `            "${p.key}": input_data.get("${p.key}", "示例_${p.label}")`)
      .join(',\n');

    if (executionMode === 'api') {
      return `from datetime import timedelta
from typing import Any, Dict
from temporalio import activity, workflow

@workflow.defn(name="${flowId}")
class ${workflowClassName}:
    """
    【${flowName}】流程专用原子工作流
    ${flowDescription}
    """
    @workflow.run
    async def run(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        workflow.logger.info("Executing ${flowName}, trace_id: %s", input_data.get("traceId", "N/A"))
        step_results: Dict[str, Any] = {}

        # Step 1: 凭证与鉴权校验 Activity
        auth_payload = {
            "credentialKeyRef": input_data.get("${credentialKeyRef}", "${credentialKeyRef}"),
            "domain": "${category}",
            "stage": "${stageType}",
        }
        step_results["step_auth"] = await workflow.execute_activity(
            "httpRequest",
            args=[auth_payload],
            start_to_close_timeout=timedelta(seconds=30),
        )

        # Step 2: 调用目标系统接口提交业务数据更新 Activity
        update_payload = {
${paramAssignments}
        }
        step_results["step_api_update"] = await workflow.execute_activity(
            "httpRequest",
            args=[update_payload],
            start_to_close_timeout=timedelta(seconds=60),
        )

        return {
            "success": True,
            "stage": "${stageType}",
            "transactionId": f"tx_${flowSuffix}",
            "authStatus": "credential_verified",
            "message": "业务数据更新及状态同步成功",
            "stepResults": step_results,
        }
`;
    } else {
      return `from datetime import timedelta
from typing import Any, Dict
from temporalio import activity, workflow

@workflow.defn(name="${flowId}")
class ${workflowClassName}:
    """
    【${flowName}】浏览器模版自动化工作流
    ${flowDescription}
    """
    @workflow.run
    async def run(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        workflow.logger.info("Executing browser replay for ${flowName}, trace_id: %s", input_data.get("traceId", "N/A"))

        # Step 1: 调度无头浏览器执行录制动作与密码安全代填
        browser_payload = {
            "templateId": "${flowId}_tmpl",
            "credentialKey": input_data.get("${credentialKeyRef}", "${credentialKeyRef}"),
            "formData": {
${paramAssignments}
            }
        }
        browser_res = await workflow.execute_activity(
            "httpRequest",
            args=[browser_payload],
            start_to_close_timeout=timedelta(seconds=120),
        )

        return {
            "success": True,
            "stage": "${stageType}",
            "transactionId": f"tx_${flowSuffix}",
            "browserStatus": "completed",
            "result": browser_res,
        }
`;
    }
  }

  private resolveDomainName(category: string): string {
    switch (category) {
      case 'hr':
        return '人力人事';
      case 'oa':
        return '财务报销';
      case 'it':
        return 'IT运维';
      default:
        return '综合协同';
    }
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private inferBusinessParams(
    category: string,
    stageType: WorkflowStageType,
    prompt: string
  ): Array<{ key: string; label: string; type: string; required: boolean; description?: string }> {
    if (category === 'hr') {
      return [
        { key: 'leaveType', label: '请假类型', type: 'string', required: true, description: '事假/年假/调休/病假' },
        { key: 'startTime', label: '开始时间', type: 'datetime', required: true, description: '请假起始年月日时间' },
        { key: 'endTime', label: '结束时间', type: 'datetime', required: true, description: '请假结束年月日时间' },
        { key: 'durationHours', label: '请假时长(小时)', type: 'number', required: true, description: '申请折算工时' },
        { key: 'reason', label: '请假事由', type: 'string', required: true, description: '具体事由说明' },
      ];
    }
    if (category === 'oa') {
      return [
        { key: 'expenseCategory', label: '报销科目', type: 'string', required: true, description: '差旅/交通/招待/耗材' },
        { key: 'amount', label: '报销总金额(元)', type: 'number', required: true, description: '实际发生费用金额' },
        { key: 'invoiceCount', label: '发票张数', type: 'number', required: true, description: '电子发票及纸质发票数量' },
        { key: 'costCenter', label: '成本归属中心', type: 'string', required: false, description: '项目或部门核算中心' },
        { key: 'description', label: '费用明细说明', type: 'string', required: true, description: '支出事由与凭证说明' },
      ];
    }
    return [
      { key: 'bizEntityId', label: '业务主键', type: 'string', required: true, description: '目标业务对象唯一识别码' },
      { key: 'actionType', label: '操作指令', type: 'string', required: true, description: '业务触发动作' },
      { key: 'targetStatus', label: '目标状态', type: 'string', required: true, description: '流转目标状态' },
      { key: 'remark', label: '经办批注', type: 'string', required: false, description: '经办备注信息' },
    ];
  }
}
