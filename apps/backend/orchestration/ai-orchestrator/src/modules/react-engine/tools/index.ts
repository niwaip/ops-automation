/**
 * Tools Index
 * 导出所有工具
 */

export { BaseTool } from './base.tool';
export { SkillMatchTool } from './skill-match.tool';
export { ParamCollectTool } from './param-collect.tool';
export { UserAskTool } from './user-ask.tool';
export { FileParseTool } from './file-parse.tool';
export { DocumentRenderTool } from './document-render.tool';
export { PreviewParamsTool } from './preview-params.tool';
export { ApiCallTool } from './api-call.tool';
export { FlowExecuteTool } from './flow-execute.tool';
export { BrowserStepTool } from './browser-step.tool';
export { ScriptTool } from './script.tool';

import { SkillMatchTool } from './skill-match.tool';
import { ParamCollectTool } from './param-collect.tool';
import { UserAskTool } from './user-ask.tool';
import { FileParseTool } from './file-parse.tool';
import { DocumentRenderTool } from './document-render.tool';
import { PreviewParamsTool } from './preview-params.tool';
import { ApiCallTool } from './api-call.tool';
import { FlowExecuteTool } from './flow-execute.tool';
import { BrowserStepTool } from './browser-step.tool';
import { ScriptTool } from './script.tool';

export const ALL_TOOLS = [
  SkillMatchTool,
  ParamCollectTool,
  UserAskTool,
  FileParseTool,
  DocumentRenderTool,
  PreviewParamsTool,
  ApiCallTool,
  FlowExecuteTool,
  BrowserStepTool,
  ScriptTool,
];
