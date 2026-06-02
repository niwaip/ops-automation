#!/usr/bin/env node

const AUTH_BASE = process.env.AUTH_BASE || "http://localhost:3001";
const CARBONE_BASE = process.env.CARBONE_BASE || "http://localhost:3009";
const TEMPLATE_ID = process.env.TEMPLATE_ID || "48cd5507-fb0c-43f4-b3e2-d1bb19cb75ab";
const USERNAME = process.env.AUTH_USER || "admin";
const PASSWORD = process.env.AUTH_PASS || "admin123";

function slugFromTemplate(id) {
  return id.replace(/-/g, "").slice(0, 8);
}

function toFnName(name) {
  return name
    .replace(/[^\w\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 48);
}

function uniqueVars(variables) {
  const seen = new Set();
  const result = [];
  for (const v of variables || []) {
    if (typeof v !== "string") continue;
    if (!seen.has(v)) {
      seen.add(v);
      result.push(v);
    }
  }
  return result;
}

function variableToKey(variable) {
  return variable.replace(/^\{d\./, "").replace(/\}$/, "");
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function buildParamMetadataMap(skill) {
  const schema = asRecord(skill?.paramsSchema) || {};
  const properties = asRecord(schema.properties) || {};
  const requiredKeys = new Set(Array.isArray(schema.required) ? schema.required.filter((item) => typeof item === "string") : []);
  return Object.entries(properties).reduce((acc, [key, value]) => {
    const definition = asRecord(value) || {};
    acc[key] = {
      displayName: typeof definition.displayName === "string" ? definition.displayName.trim() : "",
      description: typeof definition.description === "string" ? definition.description.trim() : "",
      groupLabel: typeof definition.groupLabel === "string" ? definition.groupLabel.trim() : "",
      type: typeof definition.type === "string" ? definition.type.trim() : "",
      paramKind: typeof definition.paramKind === "string" ? definition.paramKind.trim() : "",
      required: definition.required === true || requiredKeys.has(key),
      defaultValue: definition.defaultValue !== undefined ? definition.defaultValue : definition.default,
    };
    return acc;
  }, {});
}

function buildFieldName(key) {
  if (typeof key !== "string" || !key.trim()) {
    return "";
  }
  const arrayFieldMatch = key.match(/^(.*)\[\]\.(.+)$/);
  if (arrayFieldMatch) {
    return arrayFieldMatch[2];
  }
  const segments = key.split(".");
  return segments[segments.length - 1] || key;
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`[${res.status}] ${url} -> ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const login = await requestJson(`${AUTH_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const token = login.accessToken;
  if (!token) throw new Error("登录成功但未返回 accessToken");

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const template = await requestJson(`${CARBONE_BASE}/studio/templates/${TEMPLATE_ID}`);
  const skill = template.skillId
    ? await requestJson(`${AUTH_BASE}/skills/${template.skillId}`, {
        method: "GET",
        headers: authHeaders,
      }).catch(() => null)
    : null;
  const paramMetadataMap = buildParamMetadataMap(skill);
  const vars = uniqueVars(template.variables || []);
  const short = slugFromTemplate(TEMPLATE_ID);

  const activityName = `保密协议模板-${short}-渲染Activity`;
  const workflowName = `保密协议模板-${short}-工作流`;
  const fnName = toFnName(`render_${short}_nda_doc`);

  const inputParamsArray = vars.map((v) => {
    const key = variableToKey(v);
    const metadata = paramMetadataMap[key] || {};
    const fieldName = buildFieldName(key);
    const arrayPath = key.includes("[].") ? `${key.split("[].")[0]}[]` : "";
    return {
      key,
      value: metadata.defaultValue !== undefined ? metadata.defaultValue : "",
      required: typeof metadata.required === "boolean" ? metadata.required : true,
      displayName: metadata.displayName || metadata.description || fieldName || key,
      description: metadata.description || `模板变量 ${key}`,
      groupLabel: metadata.groupLabel || "",
      fieldName,
      arrayPath,
      paramKind: metadata.paramKind || (arrayPath ? "array" : "scalar"),
      type: metadata.type || "string",
      renderPath: key,
    };
  });

  const stepConfig = {
    templateId: TEMPLATE_ID,
    format: template.format || "docx",
    outputName: `${(template.fileName || "document").replace(/\.[^.]+$/, "")}-输出`,
  };

  const activityPayload = {
    name: activityName,
    fn: fnName,
    timeout: "60s",
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    handler: "carbone",
    config: {
      description: `基于模板 ${TEMPLATE_ID} 的文档渲染 Activity`,
      templateId: TEMPLATE_ID,
      skillId: template.skillId || null,
      steps: [
        {
          name: "渲染模板文档",
          type: "carbone",
          timeout: "60s",
          config: stepConfig,
          inputParams: inputParamsArray,
        },
      ],
    },
    isActive: true,
  };

  const allActivities = await requestJson(`${AUTH_BASE}/activities`, {
    method: "GET",
    headers: authHeaders,
  });

  let activity = allActivities.find((a) => a.name === activityName);
  if (!activity) {
    activity = await requestJson(`${AUTH_BASE}/activities`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(activityPayload),
    });
  }

  const workflowInputParams = {};
  for (const item of inputParamsArray) {
    workflowInputParams[item.key] = {
      required: item.required,
      defaultValue: item.value,
      description: item.description,
      displayName: item.displayName,
      groupLabel: item.groupLabel,
      paramKind: item.paramKind,
      arrayPath: item.arrayPath,
      fieldName: item.fieldName,
      type: item.type,
      renderPath: item.renderPath,
    };
  }

  const workflowInputPolicy = {
    params: inputParamsArray.reduce((acc, item) => {
      const policy = {
        enabled: true,
        requiredMode: item.required ? "always" : "optional",
        templateBinding: item.renderPath,
      };
      if (item.value !== undefined && item.value !== "") {
        policy.defaultValue = item.value;
      }
      acc[item.key] = policy;
      return acc;
    }, {}),
  };

  const workflowPayload = {
    name: workflowName,
    description: `使用模板 ${TEMPLATE_ID} 的单步文档生成工作流`,
    taskQueue: "SKILL_TASK_QUEUE",
    workflowDsl: {
      name: workflowName,
      workflowClassName: `Template${short}Workflow`,
      workflowDefnName: workflowName,
      taskQueue: "SKILL_TASK_QUEUE",
      inputParams: workflowInputParams,
      inputPolicy: workflowInputPolicy,
      outputParams: {
        result: {
          description: "文档渲染结果",
          sourceStep: "step_1",
        },
      },
      steps: [
        {
          id: "step_1",
          name: "调用文档渲染Activity",
          type: "activity",
          activityName: activity.name,
          startToCloseTimeout: "60s",
        },
      ],
      conditionals: [],
    },
    activityDsl: {
      activities: [
        {
          name: activity.name,
          fn: activity.fn,
          timeout: activity.timeout || "60s",
          retryPolicy: activity.retryPolicy || { maxRetries: 2 },
          handler: activity.handler,
          config: activity.config || {},
        },
      ],
    },
  };

  const allWorkflows = await requestJson(`${AUTH_BASE}/temporal`, {
    method: "GET",
    headers: authHeaders,
  });

  let workflow = allWorkflows.find((w) => w.name === workflowName);
  if (!workflow) {
    workflow = await requestJson(`${AUTH_BASE}/temporal`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(workflowPayload),
    });
  }

  const verifyActivities = await requestJson(`${AUTH_BASE}/activities`, {
    method: "GET",
    headers: authHeaders,
  });
  const verifyWorkflows = await requestJson(`${AUTH_BASE}/temporal`, {
    method: "GET",
    headers: authHeaders,
  });

  const createdActivity = verifyActivities.find((a) => a.name === activityName);
  const createdWorkflow = verifyWorkflows.find((w) => w.name === workflowName);

  console.log(
    JSON.stringify(
      {
        templateId: TEMPLATE_ID,
        activity: createdActivity
          ? { id: createdActivity.id, name: createdActivity.name, handler: createdActivity.handler }
          : null,
        workflow: createdWorkflow
          ? { id: createdWorkflow.id, name: createdWorkflow.name, taskQueue: createdWorkflow.taskQueue }
          : null,
        variableCount: vars.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("[create-template-activity-workflow] failed:", err.message);
  process.exit(1);
});
