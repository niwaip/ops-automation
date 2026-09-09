import React from "react";
import { Badge, Tag, Tooltip } from "antd";
import {
  FileTextOutlined,
  CodeOutlined,
  ToolOutlined,
  ApiOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import {
  ExecutionFlowStep,
  ExecutionFlowTemplateDTO,
  STEP_TYPE_LABELS,
  StepType,
  ValidationResult,
} from "@/api/flows";

export const DEFAULT_STEP_TEMPLATES: Record<string, ExecutionFlowStep> = {
  ai_match: {
    type: "text",
    name: "技能匹配",
    content: "根据用户输入匹配最佳技能并读取 paramsSchema",
    expectedOutput: "匹配到的技能、模板和参数 schema",
  },
  collect_params: {
    type: "text",
    name: "参数识别",
    content: "基于 paramsSchema 识别扁平字段参数",
    expectedOutput: "已识别参数与缺失字段",
  },
  generate_params: {
    type: "text",
    name: "缺失补参",
    content: "进入 waiting_input，通过自然语言继续补齐阻塞字段",
    expectedOutput: "满足执行条件的确认参数",
  },
  user_confirm: {
    type: "text",
    name: "执行创建",
    content: "创建 execution 并沉淀 normalizedInputJson.input",
    expectedOutput: "可恢复的执行单",
  },
  render_document: {
    type: "api",
    name: "文档渲染",
    api: {
      endpoint: "/api/carbone/render",
      method: "POST",
    },
    expectedOutput: "渲染后的文档结果",
  },
};

export type ValidationStage = "idle" | "auditing" | "executing";

export const buildDefaultTestUserInput = (
  template: ExecutionFlowTemplateDTO,
  sampleParams: Record<string, any>
): string => {
  const pairs = Object.entries(sampleParams)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("，");

  if (pairs) {
    return `请帮我执行“${template.name}”这个能力，已知参数：${pairs}。`;
  }

  if (template.goal) {
    return `请按流程完成这个原子能力：${template.goal}`;
  }

  return `请帮我执行“${template.name}”这个原子能力。`;
};

export type ValidationErrorDetail = {
  title: string;
  description: string;
};

export const extractValidationErrorDetail = (error: any): ValidationErrorDetail => {
  const responseMessage = error?.response?.data?.message;
  const responseCode = error?.response?.data?.code;
  const rawMessage = Array.isArray(responseMessage)
    ? responseMessage.join("；")
    : typeof responseMessage === "string" && responseMessage.trim()
      ? responseMessage
      : typeof error?.message === "string" && error.message.trim()
        ? error.message
        : "验证失败，请检查服务状态后重试";
  const normalizedMessage = rawMessage.toLowerCase();

  if (responseCode === "VALIDATION_TIMEOUT") {
    return { title: "接口超时", description: rawMessage };
  }

  if (responseCode === "AI_JSON_PARSE_ERROR") {
    return { title: "AI 返回格式错误", description: rawMessage };
  }

  if (responseCode === "FLOW_EXECUTION_ERROR") {
    return { title: "执行引擎异常", description: rawMessage };
  }

  if (responseCode === "NETWORK_ERROR") {
    return { title: "网络请求异常", description: rawMessage };
  }

  if (responseCode === "TEMPLATE_NOT_FOUND") {
    return { title: "模板不存在", description: rawMessage };
  }

  if (
    error?.code === "ECONNABORTED" ||
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("超时")
  ) {
    return { title: "接口超时", description: rawMessage };
  }

  if (
    normalizedMessage.includes("json") ||
    normalizedMessage.includes("parse") ||
    normalizedMessage.includes("格式") ||
    normalizedMessage.includes("invalid") ||
    normalizedMessage.includes("不是有效 json")
  ) {
    return { title: "AI 返回格式错误", description: rawMessage };
  }

  if (
    normalizedMessage.includes("flow_execute") ||
    normalizedMessage.includes("react") ||
    normalizedMessage.includes("stream") ||
    normalizedMessage.includes("执行测试") ||
    normalizedMessage.includes("执行引擎")
  ) {
    return { title: "执行引擎异常", description: rawMessage };
  }

  if (
    normalizedMessage.includes("network error") ||
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("fetch")
  ) {
    return { title: "网络请求异常", description: rawMessage };
  }

  return { title: "验证失败", description: rawMessage };
};

export const extractErrorMessage = (error: any): string => {
  const detail = extractValidationErrorDetail(error);
  return detail.title === "验证失败"
    ? detail.description
    : `${detail.title}：${detail.description}`;
};

export const renderStepTypeBadge = (type: StepType | string) => {
  const info = STEP_TYPE_LABELS[type as StepType] || { label: type, color: "default" };
  const icons: Record<string, React.ReactNode> = {
    text: <FileTextOutlined />,
    script: <CodeOutlined />,
    tool: <ToolOutlined />,
    api: <ApiOutlined />,
    llm: <FileTextOutlined />,
    validator: <CheckCircleOutlined />,
  };
  return (
    <Tag color={info.color} icon={icons[type] || <ToolOutlined />}>
      {info.label}
    </Tag>
  );
};

export const renderValidationScore = (validation: ValidationResult | null) => {
  if (!validation) {
    return <Tag color="default">未验证</Tag>;
  }
  const score = validation.score || 0;
  const color = score >= 80 ? "success" : score >= 60 ? "warning" : "error";
  return (
    <Tooltip title={`评分: ${score}分`}>
      <Badge status={color} text={`${score}分`} />
    </Tooltip>
  );
};
