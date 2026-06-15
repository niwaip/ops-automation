import { Injectable } from '@nestjs/common';
import {
  FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_CODE,
  FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_FN,
  FIXED_DOCUMENT_RENDER_ACTIVITY_CODE,
  FIXED_DOCUMENT_RENDER_ACTIVITY_FN,
  FIXED_HTTP_REQUEST_ACTIVITY_CODE,
  FIXED_HTTP_REQUEST_ACTIVITY_FN,
  FIXED_STRUCTURED_TRANSFORM_ACTIVITY_CODE,
  FIXED_STRUCTURED_TRANSFORM_ACTIVITY_FN,
  FIXED_FILE_READ_ACTIVITY_CODE,
  FIXED_FILE_READ_ACTIVITY_FN,
  FIXED_FILE_WRITE_ACTIVITY_CODE,
  FIXED_FILE_WRITE_ACTIVITY_FN,
  FIXED_WEBHOOK_NOTIFY_ACTIVITY_CODE,
  FIXED_WEBHOOK_NOTIFY_ACTIVITY_FN,
  FIXED_EMAIL_SEND_ACTIVITY_CODE,
  FIXED_EMAIL_SEND_ACTIVITY_FN,
  FIXED_IM_NOTIFY_ACTIVITY_CODE,
  FIXED_IM_NOTIFY_ACTIVITY_FN,
  FIXED_CSV_PARSE_ACTIVITY_CODE,
  FIXED_CSV_PARSE_ACTIVITY_FN,
  FIXED_JSON_TRANSFORM_ACTIVITY_CODE,
  FIXED_JSON_TRANSFORM_ACTIVITY_FN,
  FIXED_TEMPLATE_RENDER_ACTIVITY_CODE,
  FIXED_TEMPLATE_RENDER_ACTIVITY_FN,
  FIXED_DATABASE_QUERY_ACTIVITY_CODE,
  FIXED_DATABASE_QUERY_ACTIVITY_FN,
  FIXED_SHELL_COMMAND_ACTIVITY_CODE,
  FIXED_SHELL_COMMAND_ACTIVITY_FN,
  FIXED_WAIT_DELAY_ACTIVITY_CODE,
  FIXED_WAIT_DELAY_ACTIVITY_FN,
  FIXED_CONDITION_CHECK_ACTIVITY_CODE,
  FIXED_CONDITION_CHECK_ACTIVITY_FN,
} from './fixed-activity-templates';

export interface BuiltinActivityDefinition {
  key: string;
  ref: string;
  version: string;
  name: string;
  fn: string;
  timeout: string;
  retryPolicy?: { maxRetries?: number; backoffMs?: number };
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
  generatedCode: string;
  readonly: true;
  description?: string;
}

export const BUILTIN_ACTIVITY_REF_PREFIX = 'builtin:';
export const DOCUMENT_RENDER_ACTIVITY_KEY = 'documentRender';
export const HTTP_REQUEST_ACTIVITY_KEY = 'httpRequest';
export const STRUCTURED_TRANSFORM_ACTIVITY_KEY = 'structuredTransform';
export const AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY = 'aiStructuredTransform';
export const FILE_READ_ACTIVITY_KEY = 'fileRead';
export const FILE_WRITE_ACTIVITY_KEY = 'fileWrite';
export const WEBHOOK_NOTIFY_ACTIVITY_KEY = 'webhookNotify';
export const EMAIL_SEND_ACTIVITY_KEY = 'emailSend';
export const IM_NOTIFY_ACTIVITY_KEY = 'imNotify';
export const CSV_PARSE_ACTIVITY_KEY = 'csvParse';
export const JSON_TRANSFORM_ACTIVITY_KEY = 'jsonTransform';
export const TEMPLATE_RENDER_ACTIVITY_KEY = 'templateRender';
export const DATABASE_QUERY_ACTIVITY_KEY = 'databaseQuery';
export const SHELL_COMMAND_ACTIVITY_KEY = 'shellCommand';
export const WAIT_DELAY_ACTIVITY_KEY = 'waitDelay';
export const CONDITION_CHECK_ACTIVITY_KEY = 'conditionCheck';

export const HTTP_REQUEST_STEP_CONFIG_KEY = '__httpRequest';
export const STRUCTURED_TRANSFORM_STEP_CONFIG_KEY = '__structuredTransform';
export const FILE_READ_STEP_CONFIG_KEY = '__fileRead';
export const FILE_WRITE_STEP_CONFIG_KEY = '__fileWrite';
export const WEBHOOK_NOTIFY_STEP_CONFIG_KEY = '__webhookNotify';
export const EMAIL_SEND_STEP_CONFIG_KEY = '__emailSend';
export const IM_NOTIFY_STEP_CONFIG_KEY = '__imNotify';
export const CSV_PARSE_STEP_CONFIG_KEY = '__csvParse';
export const JSON_TRANSFORM_STEP_CONFIG_KEY = '__jsonTransform';
export const TEMPLATE_RENDER_STEP_CONFIG_KEY = '__templateRender';
export const DATABASE_QUERY_STEP_CONFIG_KEY = '__databaseQuery';
export const SHELL_COMMAND_STEP_CONFIG_KEY = '__shellCommand';
export const WAIT_DELAY_STEP_CONFIG_KEY = '__waitDelay';
export const CONDITION_CHECK_STEP_CONFIG_KEY = '__conditionCheck';

@Injectable()
export class BuiltinActivityRegistry {
  private readonly activities = new Map<string, BuiltinActivityDefinition>();

  constructor() {
    const documentRender: BuiltinActivityDefinition = {
      key: DOCUMENT_RENDER_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${DOCUMENT_RENDER_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: '文档渲染',
      fn: FIXED_DOCUMENT_RENDER_ACTIVITY_FN,
      timeout: '300s',
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      handler: 'carbone',
      config: {},
      generatedCode: FIXED_DOCUMENT_RENDER_ACTIVITY_CODE,
      readonly: true,
      description: '系统内置 Carbone 文档渲染 Activity',
    };
    const httpRequest: BuiltinActivityDefinition = {
      key: HTTP_REQUEST_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${HTTP_REQUEST_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: 'HTTP 请求',
      fn: FIXED_HTTP_REQUEST_ACTIVITY_FN,
      timeout: '30s',
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      handler: 'api',
      config: {
        supportedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        stepConfigKey: HTTP_REQUEST_STEP_CONFIG_KEY,
        defaultStepConfig: {
          method: 'GET',
          urlTemplate: '',
          queryTemplate: {},
          headersTemplate: {},
          jsonTemplate: {},
          timeout: 30,
          responseMode: 'body',
          responseBodyPath: '',
        },
      },
      generatedCode: FIXED_HTTP_REQUEST_ACTIVITY_CODE,
      readonly: true,
      description: '系统内置通用 HTTP 请求 Activity',
    };
    const structuredTransform: BuiltinActivityDefinition = {
      key: STRUCTURED_TRANSFORM_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${STRUCTURED_TRANSFORM_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: '结构化转换(固定规则)',
      fn: FIXED_STRUCTURED_TRANSFORM_ACTIVITY_FN,
      timeout: '90s',
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      handler: 'api',
      config: {
        supportedContentTypes: ['text', 'html', 'json'],
        supportedOutputModes: ['json', 'text'],
        stepConfigKey: STRUCTURED_TRANSFORM_STEP_CONFIG_KEY,
        defaultStepConfig: {
          contentType: 'text',
          contentTemplate: '',
          instructionTemplate: '',
          outputMode: 'json',
          outputSchema: {},
          contextTemplate: '',
          fieldMappings: {},
          textTemplate: '',
        },
      },
      generatedCode: FIXED_STRUCTURED_TRANSFORM_ACTIVITY_CODE,
      readonly: true,
      description: '系统内置固定规则结构化转换 Activity，使用字段映射和文本模板完成提取、映射和格式化，不调用 AI',
    };
    const aiStructuredTransform: BuiltinActivityDefinition = {
      key: AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: '结构化转换(AI)',
      fn: FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_FN,
      timeout: '90s',
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      handler: 'api',
      config: {
        supportedContentTypes: ['text', 'html', 'json'],
        supportedOutputModes: ['json', 'text'],
        stepConfigKey: STRUCTURED_TRANSFORM_STEP_CONFIG_KEY,
        defaultStepConfig: {
          contentType: 'text',
          contentTemplate: '',
          instructionTemplate: '',
          outputMode: 'json',
          outputSchema: {},
          contextTemplate: '',
        },
      },
      generatedCode: FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_CODE,
      readonly: true,
      description: '系统内置 AI 结构化转换 Activity，适用于无法用固定字段映射和文本模板表达的提取、归纳与格式化',
    };

    const fileRead: BuiltinActivityDefinition = {
      key: FILE_READ_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${FILE_READ_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: '文件读取',
      fn: FIXED_FILE_READ_ACTIVITY_FN,
      timeout: '60s',
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      handler: 'api',
      config: {
        stepConfigKey: FILE_READ_STEP_CONFIG_KEY,
        defaultStepConfig: {
          protocol: 'local',
          path: '',
          encoding: 'utf-8',
          returnMode: 'text',
          bucket: '',
          region: '',
          credentialEnvKey: '',
          maxSizeKb: 10240,
        },
        configSchema: {
          type: 'object',
          required: ['path'],
          properties: {
            protocol: {
              type: 'string', title: '存储协议',
              enum: ['local', 's3', 'oss', 'minio'],
              enumNames: ['本地文件系统', 'AWS S3', '阿里云 OSS', 'MinIO'],
              default: 'local',
            },
            path: {
              type: 'string', title: '文件路径',
              description: '支持 {{param}} 插值，示例: /data/output/{{filename}}',
            },
            encoding: {
              type: 'string', title: '文件编码',
              enum: ['utf-8', 'gbk', 'base64'],
              enumNames: ['UTF-8', 'GBK', '二进制(Base64)'],
              default: 'utf-8',
            },
            returnMode: {
              type: 'string', title: '返回格式',
              enum: ['text', 'base64', 'json', 'lines'],
              enumNames: ['原始文本', 'Base64 编码', '解析为 JSON', '按行分割为数组'],
              default: 'text',
            },
            maxSizeKb: {
              type: 'number', title: '最大文件大小(KB)',
              description: '超过此大小将报错，默认 10240（10MB）',
              default: 10240,
            },
          },
        },
      },
      generatedCode: FIXED_FILE_READ_ACTIVITY_CODE,
      readonly: true,
      description: '读取本地或对象存储文件内容',
    };

    const fileWrite: BuiltinActivityDefinition = {
      key: FILE_WRITE_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${FILE_WRITE_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: '文件写入',
      fn: FIXED_FILE_WRITE_ACTIVITY_FN,
      timeout: '60s',
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      handler: 'api',
      config: {
        stepConfigKey: FILE_WRITE_STEP_CONFIG_KEY,
        defaultStepConfig: {
          protocol: 'local',
          path: '',
          contentSource: 'input',
          contentKey: 'content',
          writeMode: 'text',
          encoding: 'utf-8',
          overwrite: true,
          mkdir: true,
          bucket: '',
          region: '',
          credentialEnvKey: '',
        },
        configSchema: {
          type: 'object',
          required: ['path'],
          properties: {
            path: { type: 'string', title: '目标路径', description: '支持 {{param}} 插值' },
            contentSource: {
              type: 'string', title: '内容来源',
              enum: ['input', 'previousStep'],
              enumNames: ['工作流输入参数', '上一步骤结果'],
              default: 'input',
            },
            contentKey: {
              type: 'string', title: '内容字段路径',
              description: '内容来源为上一步骤时，填写结果字段路径（如 body.data）',
            },
            writeMode: {
              type: 'string', title: '写入模式',
              enum: ['text', 'base64decode', 'json'],
              enumNames: ['原始文本', 'Base64 解码后写入', 'JSON 序列化写入'],
              default: 'text',
            },
            overwrite: { type: 'boolean', title: '覆盖已有文件', default: true },
          },
        },
      },
      generatedCode: FIXED_FILE_WRITE_ACTIVITY_CODE,
      readonly: true,
      description: '将内容写入本地文件或对象存储',
    };

    const webhookNotify: BuiltinActivityDefinition = {
      key: WEBHOOK_NOTIFY_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${WEBHOOK_NOTIFY_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: 'Webhook 推送',
      fn: FIXED_WEBHOOK_NOTIFY_ACTIVITY_FN,
      timeout: '30s',
      retryPolicy: { maxRetries: 3, backoffMs: 2000 },
      handler: 'api',
      config: {
        stepConfigKey: WEBHOOK_NOTIFY_STEP_CONFIG_KEY,
        defaultStepConfig: {
          url: '',
          method: 'POST',
          headers: {},
          payloadTemplate: {},
          successCodes: [200, 201, 202, 204],
          timeoutSeconds: 15,
          includeWorkflowMeta: false,
        },
        configSchema: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', title: 'Webhook URL', description: '支持 {{param}} 插值' },
            method: {
              type: 'string', title: 'HTTP 方法',
              enum: ['POST', 'PUT', 'PATCH'], default: 'POST',
            },
            headers: {
              type: 'object', title: '请求头',
              description: 'Authorization 等敏感头建议从环境变量读取',
              additionalProperties: { type: 'string' },
            },
            payloadTemplate: {
              type: 'object', title: '消息模板',
              description: 'JSON 模板，字符串值支持 {{param}} 插值',
            },
            successCodes: {
              type: 'array', title: '成功状态码',
              items: { type: 'number' }, default: [200, 201, 202, 204],
            },
          },
        },
      },
      generatedCode: FIXED_WEBHOOK_NOTIFY_ACTIVITY_CODE,
      readonly: true,
      description: '向任意 HTTP Webhook 推送结构化消息',
    };

    const emailSend: BuiltinActivityDefinition = {
      key: EMAIL_SEND_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${EMAIL_SEND_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: '邮件发送',
      fn: FIXED_EMAIL_SEND_ACTIVITY_FN,
      timeout: '60s',
      retryPolicy: { maxRetries: 2, backoffMs: 3000 },
      handler: 'api',
      config: {
        stepConfigKey: EMAIL_SEND_STEP_CONFIG_KEY,
        defaultStepConfig: {
          provider: 'smtp',
          smtpHostEnvKey: 'SMTP_HOST',
          smtpPortEnvKey: 'SMTP_PORT',
          smtpUserEnvKey: 'SMTP_USER',
          smtpPasswordEnvKey: 'SMTP_PASSWORD',
          smtpTls: true,
          fromName: '',
          fromAddress: '',
          to: [],
          cc: [],
          bcc: [],
          subject: '',
          bodyType: 'html',
          bodyTemplate: '',
          attachFromPreviousStep: false,
          attachmentKey: 'downloadUrl',
          attachmentFilename: '',
        },
        configSchema: {
          type: 'object',
          required: ['to', 'subject'],
          properties: {
            provider: {
              type: 'string', title: '邮件服务商',
              enum: ['smtp'],
              enumNames: ['自建 SMTP'],
              default: 'smtp',
            },
            to: {
              type: 'array', title: '收件人',
              items: { type: 'string' },
              description: '支持 {{param}} 作为整体替换',
            },
            subject: {
              type: 'string', title: '邮件主题',
              description: '支持 {{param}} 插值',
            },
            bodyType: {
              type: 'string', title: '正文格式',
              enum: ['html', 'text'], enumNames: ['HTML', '纯文本'], default: 'html',
            },
            bodyTemplate: {
              type: 'string', title: '正文模板',
              description: '支持 {{param}} 插值',
            },
            attachFromPreviousStep: {
              type: 'boolean', title: '附加上一步结果文件', default: false,
            },
          },
        },
      },
      generatedCode: FIXED_EMAIL_SEND_ACTIVITY_CODE,
      readonly: true,
      description: '通过 SMTP 发送邮件，支持附件',
    };

    const imNotify: BuiltinActivityDefinition = {
      key: IM_NOTIFY_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${IM_NOTIFY_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: 'IM 通知',
      fn: FIXED_IM_NOTIFY_ACTIVITY_FN,
      timeout: '30s',
      retryPolicy: { maxRetries: 3, backoffMs: 1000 },
      handler: 'api',
      config: {
        stepConfigKey: IM_NOTIFY_STEP_CONFIG_KEY,
        defaultStepConfig: {
          platform: 'feishu',
          webhookUrlEnvKey: '',
          webhookUrl: '',
          msgType: 'text',
          title: '',
          contentTemplate: '',
          cardColor: 'green',
          atUserIds: [],
          atAll: false,
        },
        configSchema: {
          type: 'object',
          required: ['contentTemplate'],
          properties: {
            platform: {
              type: 'string', title: 'IM 平台',
              enum: ['feishu', 'dingtalk', 'wecom'],
              enumNames: ['飞书', '钉钉', '企业微信'], default: 'feishu',
            },
            webhookUrlEnvKey: {
              type: 'string', title: 'Webhook URL 环境变量名',
              description: '推荐：将 Webhook URL 存入环境变量，此处填写变量名（如 FEISHU_NOTIFY_WEBHOOK）',
            },
            msgType: {
              type: 'string', title: '消息类型',
              enum: ['text', 'markdown', 'card'],
              enumNames: ['纯文本', 'Markdown', '卡片消息'], default: 'text',
            },
            contentTemplate: {
              type: 'string', title: '消息内容模板',
              description: '支持 {{param}} 插值，Markdown 格式可使用标题、加粗、列表',
            },
            atAll: { type: 'boolean', title: '@ 所有人', default: false },
          },
        },
      },
      generatedCode: FIXED_IM_NOTIFY_ACTIVITY_CODE,
      readonly: true,
      description: '向飞书、钉钉、企业微信发送消息通知',
    };

    const csvParse: BuiltinActivityDefinition = {
      key: CSV_PARSE_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${CSV_PARSE_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: 'CSV 解析',
      fn: FIXED_CSV_PARSE_ACTIVITY_FN,
      timeout: '120s',
      retryPolicy: { maxRetries: 1, backoffMs: 1000 },
      handler: 'api',
      config: {
        stepConfigKey: CSV_PARSE_STEP_CONFIG_KEY,
        defaultStepConfig: {
          contentSource: 'input',
          contentKey: 'content',
          delimiter: ',',
          quoteChar: '"',
          escapeChar: '\\',
          hasHeader: true,
          skipRows: 0,
          encoding: 'utf-8',
          maxRows: 10000,
          columnTypes: {},
          filterEmpty: true,
          returnMode: 'array',
        },
        configSchema: {
          type: 'object',
          properties: {
            contentSource: {
              type: 'string', title: '数据来源',
              enum: ['input', 'previousStep'],
              enumNames: ['工作流输入参数', '上一步骤结果'], default: 'input',
            },
            delimiter: {
              type: 'string', title: '分隔符', default: ',',
              description: '常用: 逗号(,) 制表符(\\t) 分号(;)',
            },
            hasHeader: { type: 'boolean', title: '首行为表头', default: true },
            maxRows: { type: 'number', title: '最大行数', default: 10000 },
          },
        },
      },
      generatedCode: FIXED_CSV_PARSE_ACTIVITY_CODE,
      readonly: true,
      description: '将 CSV 文本内容解析为结构化 JSON 数组',
    };

    const jsonTransform: BuiltinActivityDefinition = {
      key: JSON_TRANSFORM_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${JSON_TRANSFORM_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: 'JSON 转换',
      fn: FIXED_JSON_TRANSFORM_ACTIVITY_FN,
      timeout: '30s',
      retryPolicy: { maxRetries: 1, backoffMs: 500 },
      handler: 'api',
      config: {
        stepConfigKey: JSON_TRANSFORM_STEP_CONFIG_KEY,
        defaultStepConfig: {
          contentSource: 'input',
          contentKey: 'data',
          fieldMappings: {},
          outputMode: 'object',
          defaultValues: {},
          dropNullFields: false,
        },
        configSchema: {
          type: 'object',
          properties: {
            fieldMappings: {
              type: 'object', title: '字段映射',
              description: '键为输出字段名，值为 JSONPath ($.field) 或模板字符串 ({{$.field}})',
              additionalProperties: { type: 'string' },
            },
            outputMode: {
              type: 'string', title: '输出模式',
              enum: ['object', 'array', 'value'],
              enumNames: ['对象（单条）', '数组', '单一值'], default: 'object',
            },
            dropNullFields: { type: 'boolean', title: '丢弃空值字段', default: false },
          },
        },
      },
      generatedCode: FIXED_JSON_TRANSFORM_ACTIVITY_CODE,
      readonly: true,
      description: '对 JSON 数据进行 JSONPath 路径提取和字段映射，不调用 AI',
    };

    const templateRender: BuiltinActivityDefinition = {
      key: TEMPLATE_RENDER_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${TEMPLATE_RENDER_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: '模板渲染',
      fn: FIXED_TEMPLATE_RENDER_ACTIVITY_FN,
      timeout: '30s',
      retryPolicy: { maxRetries: 1, backoffMs: 500 },
      handler: 'api',
      config: {
        stepConfigKey: TEMPLATE_RENDER_STEP_CONFIG_KEY,
        defaultStepConfig: {
          engine: 'jinja2',
          template: '',
          dataSource: 'inputParams',
          dataKey: '',
          outputMode: 'text',
          stripWhitespace: false,
        },
        configSchema: {
          type: 'object',
          required: ['template'],
          properties: {
            template: {
              type: 'string', title: 'Jinja2 模板',
              description: '支持 {{ variable }}、{% for item in list %}...{% endfor %} 等',
            },
            dataSource: {
              type: 'string', title: '数据来源',
              enum: ['inputParams', 'previousStep', 'merge'],
              enumNames: ['工作流输入参数', '上一步骤结果', '合并两者'],
              default: 'inputParams',
            },
            outputMode: {
              type: 'string', title: '输出格式',
              enum: ['text', 'json'], default: 'text',
            },
          },
        },
      },
      generatedCode: FIXED_TEMPLATE_RENDER_ACTIVITY_CODE,
      readonly: true,
      description: '使用 Jinja2 模板引擎进行文本渲染',
    };

    const databaseQuery: BuiltinActivityDefinition = {
      key: DATABASE_QUERY_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${DATABASE_QUERY_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: '数据库查询',
      fn: FIXED_DATABASE_QUERY_ACTIVITY_FN,
      timeout: '60s',
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      handler: 'api',
      config: {
        stepConfigKey: DATABASE_QUERY_STEP_CONFIG_KEY,
        defaultStepConfig: {
          dbType: 'postgresql',
          connectionEnvKey: 'DB_CONNECTION_URL',
          sql: '',
          params: {},
          maxRows: 1000,
          returnMode: 'rows',
          columnTypes: {},
          timeout: 30,
        },
        configSchema: {
          type: 'object',
          required: ['sql'],
          properties: {
            dbType: {
              type: 'string', title: '数据库类型',
              enum: ['postgresql', 'mysql', 'sqlite'],
              enumNames: ['PostgreSQL', 'MySQL', 'SQLite'], default: 'postgresql',
            },
            connectionEnvKey: {
              type: 'string', title: '连接串环境变量名',
              description: '数据库连接 URL 存储在哪个环境变量中',
              default: 'DB_CONNECTION_URL',
            },
            sql: {
              type: 'string', title: 'SQL 查询语句',
              description: '必须是 SELECT 语句，使用 :paramName 作为参数占位符',
            },
            returnMode: {
              type: 'string', title: '返回模式',
              enum: ['rows', 'first', 'value', 'count'],
              enumNames: ['全部行（数组）', '第一行（对象）', '第一行第一列（标量）', '行数（数字）'],
              default: 'rows',
            },
            maxRows: { type: 'number', title: '最大返回行数', default: 1000 },
          },
        },
      },
      generatedCode: FIXED_DATABASE_QUERY_ACTIVITY_CODE,
      readonly: true,
      description: '执行参数化只读 SQL 查询，支持 PostgreSQL、MySQL、SQLite',
    };

    const shellCommand: BuiltinActivityDefinition = {
      key: SHELL_COMMAND_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${SHELL_COMMAND_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: 'Shell 命令',
      fn: FIXED_SHELL_COMMAND_ACTIVITY_FN,
      timeout: '120s',
      retryPolicy: { maxRetries: 1, backoffMs: 2000 },
      handler: 'script',
      config: {
        stepConfigKey: SHELL_COMMAND_STEP_CONFIG_KEY,
        defaultStepConfig: {
          command: '',
          workingDir: '/tmp',
          allowedPrefixes: [
            'python3', 'python', 'node', 'ffmpeg', 'convert',
            'pandoc', 'libreoffice', 'pdftotext', 'unzip', 'zip',
            'tar', 'gzip', 'gunzip', 'wkhtmltopdf', 'echo', 'cat',
          ],
          envOverrides: {},
          timeoutSeconds: 60,
          captureStderr: true,
          returnMode: 'text',
          maxOutputKb: 1024,
        },
        configSchema: {
          type: 'object',
          required: ['command'],
          properties: {
            command: {
              type: 'string', title: 'Shell 命令',
              description: '支持 {{param}} 插值，命令前缀必须在安全白名单内',
            },
            workingDir: { type: 'string', title: '工作目录', default: '/tmp' },
            returnMode: {
              type: 'string', title: '返回格式',
              enum: ['text', 'json', 'lines'],
              enumNames: ['原始文本', '解析为 JSON', '按行分割'], default: 'text',
            },
            timeoutSeconds: { type: 'number', title: '超时（秒）', default: 60 },
          },
        },
      },
      generatedCode: FIXED_SHELL_COMMAND_ACTIVITY_CODE,
      readonly: true,
      description: '执行受限白名单内的 Shell 命令，适用于文件转换与系统工具调用',
    };

    const waitDelay: BuiltinActivityDefinition = {
      key: WAIT_DELAY_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${WAIT_DELAY_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: '等待延迟',
      fn: FIXED_WAIT_DELAY_ACTIVITY_FN,
      timeout: '86400s',
      retryPolicy: { maxRetries: 0 },
      handler: 'api',
      config: {
        stepConfigKey: WAIT_DELAY_STEP_CONFIG_KEY,
        defaultStepConfig: {
          duration: '',
          durationSeconds: 60,
          message: '',
        },
        configSchema: {
          type: 'object',
          properties: {
            duration: {
              type: 'string', title: '等待时长',
              description: '格式：30s（秒）/ 5m（分钟）/ 2h（小时）/ 1d（天）',
            },
            durationSeconds: {
              type: 'number', title: '等待秒数',
              description: '当未填写"等待时长"时使用', default: 60,
            },
            message: {
              type: 'string', title: '等待说明',
              description: '记录在日志中的等待原因',
            },
          },
        },
      },
      generatedCode: FIXED_WAIT_DELAY_ACTIVITY_CODE,
      readonly: true,
      description: '在 Workflow 中插入固定时间等待，基于 Temporal 的 sleep 实现',
    };

    const conditionCheck: BuiltinActivityDefinition = {
      key: CONDITION_CHECK_ACTIVITY_KEY,
      ref: `${BUILTIN_ACTIVITY_REF_PREFIX}${CONDITION_CHECK_ACTIVITY_KEY}`,
      version: '1.0.0',
      name: '条件检查',
      fn: FIXED_CONDITION_CHECK_ACTIVITY_FN,
      timeout: '3600s',
      retryPolicy: { maxRetries: 0 },
      handler: 'api',
      config: {
        stepConfigKey: CONDITION_CHECK_STEP_CONFIG_KEY,
        defaultStepConfig: {
          url: '',
          method: 'GET',
          headers: {},
          successCondition: '',
          failureCondition: '',
          intervalSeconds: 10,
          maxAttempts: 60,
          resultPath: '$.result',
        },
        configSchema: {
          type: 'object',
          required: ['url', 'successCondition'],
          properties: {
            url: {
              type: 'string', title: '轮询接口 URL',
              description: '支持 {{param}} 插值',
            },
            successCondition: {
              type: 'string', title: '成功条件',
              description: 'JSONPath 表达式，满足时继续后续步骤。示例: $.status == "completed"',
            },
            failureCondition: {
              type: 'string', title: '失败条件',
              description: 'JSONPath 表达式，满足时立即报错。示例: $.status == "failed"',
            },
            intervalSeconds: { type: 'number', title: '轮询间隔（秒）', default: 10 },
            maxAttempts: { type: 'number', title: '最大轮询次数', default: 60 },
          },
        },
      },
      generatedCode: FIXED_CONDITION_CHECK_ACTIVITY_CODE,
      readonly: true,
      description: '轮询调用 HTTP 接口，等待其返回满足条件的结果',
    };

    this.activities.set(documentRender.key, documentRender);
    this.activities.set(httpRequest.key, httpRequest);
    this.activities.set(structuredTransform.key, structuredTransform);
    this.activities.set(aiStructuredTransform.key, aiStructuredTransform);
    this.activities.set(fileRead.key, fileRead);
    this.activities.set(fileWrite.key, fileWrite);
    this.activities.set(webhookNotify.key, webhookNotify);
    this.activities.set(emailSend.key, emailSend);
    this.activities.set(imNotify.key, imNotify);
    this.activities.set(csvParse.key, csvParse);
    this.activities.set(jsonTransform.key, jsonTransform);
    this.activities.set(templateRender.key, templateRender);
    this.activities.set(databaseQuery.key, databaseQuery);
    this.activities.set(shellCommand.key, shellCommand);
    this.activities.set(waitDelay.key, waitDelay);
    this.activities.set(conditionCheck.key, conditionCheck);
  }

  list(): BuiltinActivityDefinition[] {
    return Array.from(this.activities.values());
  }

  getByKey(key: string): BuiltinActivityDefinition | null {
    return this.activities.get(String(key || '').trim()) || null;
  }

  getByRef(ref: string): BuiltinActivityDefinition | null {
    const normalized = String(ref || '').trim();
    if (!normalized.startsWith(BUILTIN_ACTIVITY_REF_PREFIX)) {
      return null;
    }
    return this.getByKey(normalized.slice(BUILTIN_ACTIVITY_REF_PREFIX.length));
  }

  getByFn(fn: string): BuiltinActivityDefinition | null {
    const normalized = String(fn || '').trim();
    return this.list().find((activity) => activity.fn === normalized) || null;
  }

  findByLegacyIdentifier(identifier: string): BuiltinActivityDefinition | null {
    const normalized = String(identifier || '').trim();
    if (!normalized) {
      return null;
    }
    return this.list().find((activity) =>
      activity.key === normalized
      || activity.ref === normalized
      || activity.fn === normalized
      || activity.name === normalized,
    ) || null;
  }
}
