import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Input, Button, Space, Typography, Tag, Empty, message, Divider, Alert, Collapse, InputNumber, Modal, List, Tooltip, Switch, Checkbox, Radio } from 'antd';
import {
  SendOutlined,
  RobotOutlined,
  DeleteOutlined,
  CodeOutlined,
  DesktopOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  CameraOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  FileSearchOutlined,
  ArrowDownOutlined,
  ToolOutlined,
  CloudUploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SaveOutlined,
  FileAddOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  EditOutlined,
  LinkOutlined,
  ApiOutlined,
  DisconnectOutlined,
  PauseCircleOutlined,
  StopOutlined,
  VideoCameraOutlined,
  BugOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import { apiClient } from '../../api/client';
import { templateApi } from '../../api/template';
import { sessionApi, workerApi } from '../../api/session';
import { useAuthStore } from '../../store/authStore';

const { TextArea } = Input;
const { Text } = Typography;

// MCP-style command interface
interface MCPCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
}

// AI response interface
interface AICommandResponse {
  success: boolean;
  commands: MCPCommand[];
  explanation: string;
  result?: {
    status: string;
    message?: string;
    screenshot?: string;
  };
}

// Command history entry
interface CommandHistoryEntry {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  commands?: MCPCommand[];
  result?: any;
  timestamp: Date;
  // For template parameter extraction
  replaceable?: boolean;
  commandType?: string;
  rawParam?: string;
}

// Template step - deterministic command for replay
interface TemplateStep {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  description: string;
  timestamp: Date;
  // 记录哪些参数是可替换的 (参数名 -> 是否可替换)
  replaceableParams?: Record<string, boolean>;
}

// Template
interface Template {
  id: string;
  name: string;
  steps: TemplateStep[];
  createdAt: Date;
}

interface AIControlsProps {
  onCommandExecuted?: (commands: MCPCommand[]) => void;
  // Browser ready callback
  onBrowserReady?: (ready: boolean) => void;
  // Manual mode props
  recorderStatus?: 'idle' | 'connecting' | 'recording' | 'paused' | 'stopped' | 'error';
  isConnected?: boolean;
  onStartRecording?: (url: string) => void;
  onStopRecording?: () => void;
  onPauseRecording?: () => void;
  onResumeRecording?: () => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  recordedScript?: string;
}

const AIControls: React.FC<AIControlsProps> = ({
  onCommandExecuted,
  recorderStatus = 'idle',
  isConnected = false,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  onConnect,
  onDisconnect,
  onBrowserReady,
  recordedScript = '',
}) => {
  const { t } = useTranslation(['common', 'recorder']);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Predefined commands configuration
  // 搜索: 用户指定搜索框和关键词
  // 智搜: AI自动识别页面搜索框，用户只需提供关键词
  const predefinedCommands = [
    { value: 'navigate', label: '打开', prefix: '打开 ', placeholder: '输入网址，如：百度、google.com' },
    { value: 'click', label: '点击', prefix: '点击 ', placeholder: '输入目标元素描述，如：搜索按钮、登录链接' },
    { value: 'fill', label: '填充', prefix: '填充 ', placeholder: '输入内容和目标，如：用户名输入框填写 admin' },
    { value: 'search', label: '搜索', prefix: '搜索 ', placeholder: '指定搜索框和关键词，如：在搜索框输入 MCP' },
    { value: 'smart_search', label: '智搜', prefix: '智搜 ', placeholder: '输入关键词，AI自动找到搜索框，如：MCP 协议' },
  ];

  const [input, setInput] = useState('');
  const [selectedCommand, setSelectedCommand] = useState<string>('navigate');
  const [paramInput, setParamInput] = useState('');
  const [isReplaceable, setIsReplaceable] = useState(true);
  const [history, setHistory] = useState<CommandHistoryEntry[]>([]);
  const [isBrowserReady, setIsBrowserReady] = useState(false);
  const [waitDuration, setWaitDuration] = useState(3); // Default 3 seconds
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Manual recording URL input
  const [recordUrl, setRecordUrl] = useState('https://');

  // Template state
  const [templateSteps, setTemplateSteps] = useState<TemplateStep[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [compiledScript, setCompiledScript] = useState('');
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Parameter editing state - maps original param name to custom name
  const [paramNames, setParamNames] = useState<Record<string, string>>({});
  const [paramEnabled, setParamEnabled] = useState<Record<string, boolean>>({});

  // Recording mode: true = AI mode, false = Manual mode
  const [isAIMode, setIsAIMode] = useState(true);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Execute MCP commands directly
  const executeCommandMutation = useMutation(
    async (commands: MCPCommand[]) => {
      console.log('[AIControls] Executing commands:', commands);
      return apiClient.post('/browser/execute', { commands });
    },
    {
      onSuccess: (data) => {
        console.log('[AIControls] Commands executed successfully:', data);
        message.success(t('recorder:ai.commandExecuted'));
        // Update last history entry with result
        setHistory((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.type === 'ai') {
            // Extract the first result from the results array
            // data structure: { success: true, results: [{ status, message, template_info, ... }] }
            const firstResult = data?.results?.[0] || data;
            return [...prev.slice(0, -1), { ...last, result: firstResult }];
          }
          return prev;
        });
      },
      onError: (error: any) => {
        console.error('[AIControls] Command execution failed:', error);
        message.error(t('recorder:ai.executionFailed'));
        // Add error to history but don't block
        setHistory((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: 'system',
            content: `执行失败: ${error.message || '未知错误'}，可以继续尝试其他命令`,
            timestamp: new Date(),
          },
        ]);
      },
    }
  );

  // Parse natural language to MCP commands
  const parseCommandMutation = useMutation(
    async (userInput: string) => {
      console.log('[AIControls] Parsing command:', userInput);
      return apiClient.post<AICommandResponse>('/ai/browser/parse-command', {
        input: userInput,
      });
    },
    {
      onSuccess: (data) => {
        console.log('[AIControls] Parse result:', data);
        if (data.success && data.commands.length > 0) {
          // Get replaceable info from the last user entry
          setHistory((prev) => {
            const lastUserEntry = [...prev].reverse().find(e => e.type === 'user');
            const replaceableInfo = lastUserEntry ? {
              replaceable: lastUserEntry.replaceable,
              commandType: lastUserEntry.commandType,
              rawParam: lastUserEntry.rawParam,
            } : {};

            return [...prev,
              {
                id: Date.now().toString(),
                type: 'ai' as const,
                content: data.explanation,
                commands: data.commands,
                // Don't add result here - executeCommandMutation will update it
                timestamp: new Date(),
                // Pass through replaceable info from user entry
                ...replaceableInfo,
              },
            ];
          });
          onCommandExecuted?.(data.commands);

          // Auto-execute the commands
          executeCommandMutation.mutate(data.commands);
        } else if (!data.success) {
          // Show error message but allow continuing
          setHistory((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              type: 'system',
              content: data.explanation || t('recorder:ai.parseFailed') || '无法解析命令，请尝试其他表达方式',
              timestamp: new Date(),
            },
          ]);
        }
      },
      onError: (error: any) => {
        console.error('[AIControls] Parse command failed:', error);
        // Don't show message.error to avoid blocking
        // Add error to history, allow continuing
        setHistory((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: 'system',
            content: `解析失败: ${error.message || '未知错误'}，请尝试其他表达方式`,
            timestamp: new Date(),
          },
        ]);
      },
    }
  );

  // Initialize browser session
  const initBrowserMutation = useMutation(
    async () => {
      console.log('[AIControls] Initializing browser');
      return apiClient.post('/browser/init');
    },
    {
      onSuccess: () => {
        setIsBrowserReady(true);
        onBrowserReady?.(true);
        message.success(t('recorder:ai.browserReady'));
        setHistory((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: 'system',
            content: t('recorder:ai.browserInitialized') || '浏览器已初始化，可以开始发送命令',
            timestamp: new Date(),
          },
        ]);
      },
      onError: (error: any) => {
        console.error('[AIControls] Browser init failed:', error);
        message.error(t('recorder:ai.browserInitFailed'));
        setHistory((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: 'system',
            content: `初始化失败: ${error.message || '未知错误'}，请检查浏览器服务是否运行`,
            timestamp: new Date(),
          },
        ]);
      },
    }
  );

  const handleSend = async () => {
    // Combine command and parameter
    const commandConfig = predefinedCommands.find(c => c.value === selectedCommand);
    const prefix = commandConfig?.prefix || '';
    const fullMessage = prefix + paramInput.trim();

    if (!fullMessage.trim()) return;

    const userMessage = fullMessage.trim();

    // Add user message to history with replaceable flag
    setHistory((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: 'user',
        content: userMessage,
        timestamp: new Date(),
        // Track if this command's parameter should be replaceable in template
        replaceable: isReplaceable && paramInput.trim().length > 0,
        commandType: selectedCommand,
        rawParam: paramInput.trim(),
      },
    ]);

    // Clear parameter input immediately (keep command selection)
    setParamInput('');

    // Auto init browser if not ready
    if (!isBrowserReady) {
      try {
        await initBrowserMutation.mutateAsync();
      } catch (e) {
        // Init failed, but we already added error to history
        return;
      }
    }

    // Add "parsing" status message
    const parsingId = 'parsing-' + Date.now();
    setHistory((prev) => [
      ...prev,
      {
        id: parsingId,
        type: 'system',
        content: '⏳ 正在解析命令，请稍候...',
        timestamp: new Date(),
      },
    ]);

    // Parse the command
    parseCommandMutation.mutate(userMessage, {
      onSettled: () => {
        // Remove the parsing message when done
        setHistory((prev) => prev.filter((h) => h.id !== parsingId));
      },
    });
  };

  const handleExecuteCommands = async (commands: MCPCommand[]) => {
    // Auto init browser if not ready
    if (!isBrowserReady) {
      try {
        await initBrowserMutation.mutateAsync();
      } catch (e) {
        return;
      }
    }
    executeCommandMutation.mutate(commands);
  };

  // Quick action handlers - execute commands directly
  const handleQuickAction = async (command: string, params?: Record<string, unknown>) => {
    const quickCommand: MCPCommand = {
      tool: command,
      params: params || {},
      description: `快捷操作: ${command}`,
    };

    // Auto init browser if not ready
    if (!isBrowserReady) {
      try {
        await initBrowserMutation.mutateAsync();
      } catch (e) {
        return;
      }
    }

    // Add to history and execute in one update
    const historyEntry = {
      id: Date.now().toString(),
      type: 'ai' as const,
      content: `快捷操作: ${command}${params ? ` (${JSON.stringify(params)})` : ''}`,
      commands: [quickCommand],
      timestamp: new Date(),
    };

    // Add entry first (will be updated by onSuccess)
    setHistory((prev) => [...prev, historyEntry]);

    // Execute and update the same entry
    executeCommandMutation.mutate([quickCommand]);
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  const handleCopyCommand = (command: MCPCommand) => {
    navigator.clipboard.writeText(JSON.stringify(command, null, 2));
    message.success(t('common:copied'));
  };

  // Add deterministic command to template
  const handleAddToTemplate = (templateInfo: { tool: string; params: Record<string, unknown>; description: string }) => {
    // Find the last ai entry that has matching tool to get replaceable info
    const lastAiEntry = [...history].reverse().find(e =>
      e.type === 'ai' &&
      e.result?.template_info?.tool === templateInfo.tool
    );

    const replaceableParams: Record<string, boolean> = {};
    if (lastAiEntry?.replaceable && lastAiEntry?.rawParam) {
      // 根据命令类型标记可替换参数
      switch (templateInfo.tool) {
        case 'navigate':
          replaceableParams['url'] = true;
          break;
        case 'smart_search':
          replaceableParams['query'] = true;
          break;
        case 'fill':
          replaceableParams['value'] = true;
          break;
        case 'click':
          if (templateInfo.params.text) replaceableParams['text'] = true;
          break;
        case 'type_text':
          replaceableParams['text'] = true;
          break;
      }
    }

    const step: TemplateStep = {
      id: Date.now().toString(),
      tool: templateInfo.tool,
      params: templateInfo.params,
      description: templateInfo.description,
      timestamp: new Date(),
      replaceableParams,
    };
    setTemplateSteps((prev) => [...prev, step]);
    message.success(`已添加到模版: ${templateInfo.description}`);
  };

  // Remove step from template
  const handleRemoveTemplateStep = (stepId: string) => {
    setTemplateSteps((prev) => prev.filter((s) => s.id !== stepId));
  };

  // Clear template
  const handleClearTemplate = () => {
    setTemplateSteps([]);
    setTemplateName('');
    setSavedTemplateId(null);
  };

  // Compile template to executable script with parameter extraction
  const handleCompileTemplate = () => {
    if (templateSteps.length === 0) {
      message.warning('模版为空，请先添加命令');
      return;
    }

    // Extract parameters from steps (URLs, search queries, etc.)
    const extractedParams = extractParameters(templateSteps);

    // Generate JavaScript code with parameterized variables
    const script = generateScript(templateSteps, extractedParams);
    setCompiledScript(script);
    setShowScriptModal(true);
    // Don't auto-save - let user review and confirm in the modal
  };

  // Save compiled template to backend
  const handleSaveCompiledTemplate = async () => {
    if (templateSteps.length === 0) {
      message.warning('模版为空，请先添加命令');
      return;
    }

    const extractedParams = extractParameters(templateSteps);

    // Only include replaceable params in params_schema
    const replaceableParamsSchema: Record<string, { type: string; description: string; default?: string | number }> = {};
    Object.entries(extractedParams).forEach(([name, schema]) => {
      if (schema.replaceable) {
        replaceableParamsSchema[name] = schema;
      }
    });

    // Convert TemplateStep to backend format with screenshot after each step
    // Also substitute replaceable params with placeholders
    const backendSteps: any[] = [];
    let stepCounter = 1;

    templateSteps.forEach((step, index) => {
      // Create params with placeholder substitution for replaceable params
      const substitutedParams = { ...step.params };

      // Only substitute params that are marked as replaceable
      Object.entries(extractedParams).forEach(([originalName, schema]) => {
        if (schema.replaceable) {
          const defaultValue = schema.default;
          if (defaultValue !== undefined) {
            Object.keys(substitutedParams).forEach(key => {
              if (substitutedParams[key] === defaultValue) {
                substitutedParams[key] = `\${${originalName}}`;
              }
            });
          }
        }
      });

      // Add the step with substituted params
      const backendStep: any = {
        step_id: `step_${stepCounter}`,
        action: step.tool,
        params: substitutedParams,
      };

      if (step.params.selector) {
        backendStep.locator = {
          type: 'css',
          value: step.params.selector as string,
        };
      }

      backendSteps.push(backendStep);
      stepCounter++;

      // Add screenshot step after each step
      // Wait 2s -> screenshot -> wait 2s
      backendSteps.push({
        step_id: `step_${stepCounter}`,
        action: 'wait',
        params: { duration: 2000 },
      });
      stepCounter++;

      backendSteps.push({
        step_id: `step_${stepCounter}`,
        action: 'screenshot',
        params: {},
      });
      stepCounter++;

      backendSteps.push({
        step_id: `step_${stepCounter}`,
        action: 'wait',
        params: { duration: 2000 },
      });
      stepCounter++;
    });

    // Generate params_schema for replaceable parameters only
    const paramsSchema = {
      type: 'object',
      properties: replaceableParamsSchema,
      required: Object.keys(replaceableParamsSchema),
    };

    const name = templateName || `编译模版 ${new Date().toLocaleString()}`;

    try {
      const createdTemplate = await templateApi.create({
        name,
        description: `由智能录制编译生成的模版，包含 ${templateSteps.length} 个步骤（含自动截图），${Object.keys(replaceableParamsSchema).length} 个可替换参数`,
        params_schema: paramsSchema,
        steps: backendSteps,
        created_by: user?.id || 'ai_recorder',
      });

      message.success(`模版已保存: ${createdTemplate.name}`);
      setShowScriptModal(false);
      // Store the template ID for immediate testing (don't clear template steps yet)
      setSavedTemplateId(createdTemplate.id);
      setTemplateName('');
      message.info('模版已保存，可以点击"测试模版"按钮进行测试', 5);
    } catch (error: any) {
      console.error('Failed to save compiled template:', error);
      const errorMsg = error.response?.data?.message || error.message || '未知错误';
      message.error(`保存失败: ${errorMsg}`);
    }
  };

  // Extract parameters from template steps for later replacement
  const extractParameters = (steps: TemplateStep[]): Record<string, { type: string; description: string; default?: string | number; replaceable?: boolean }> => {
    const params: Record<string, { type: string; description: string; default?: string | number; replaceable?: boolean }> = {};

    steps.forEach((step, index) => {
      const stepPrefix = `step${index + 1}`;
      const replaceableParams = step.replaceableParams || {};

      switch (step.tool) {
        case 'navigate':
          // Extract URL as parameter
          if (step.params.url) {
            params[`${stepPrefix}_url`] = {
              type: 'string',
              description: `步骤${index + 1}导航URL`,
              default: step.params.url as string,
              replaceable: replaceableParams['url'] || false,
            };
          }
          break;

        case 'fill':
          // Extract input value as parameter
          if (step.params.value) {
            params[`${stepPrefix}_value`] = {
              type: 'string',
              description: `步骤${index + 1}输入内容`,
              default: step.params.value as string,
              replaceable: replaceableParams['value'] || false,
            };
          }
          // Extract selector as parameter (optional)
          if (step.params.selector) {
            params[`${stepPrefix}_selector`] = {
              type: 'string',
              description: `步骤${index + 1}目标选择器`,
              default: step.params.selector as string,
              replaceable: replaceableParams['selector'] || false,
            };
          }
          break;

        case 'click':
          // Extract click target selector as parameter (optional)
          if (step.params.selector) {
            params[`${stepPrefix}_selector`] = {
              type: 'string',
              description: `步骤${index + 1}点击目标选择器`,
              default: step.params.selector as string,
              replaceable: replaceableParams['selector'] || false,
            };
          }
          if (step.params.text) {
            params[`${stepPrefix}_text`] = {
              type: 'string',
              description: `步骤${index + 1}点击目标文本`,
              default: step.params.text as string,
              replaceable: replaceableParams['text'] || false,
            };
          }
          break;

        case 'type_text':
          if (step.params.text) {
            params[`${stepPrefix}_text`] = {
              type: 'string',
              description: `步骤${index + 1}输入文本`,
              default: step.params.text as string,
              replaceable: replaceableParams['text'] || false,
            };
          }
          break;

        case 'wait':
          if (step.params.duration) {
            params[`${stepPrefix}_duration`] = {
              type: 'number',
              description: `步骤${index + 1}等待时间(ms)`,
              default: step.params.duration as number,
              replaceable: replaceableParams['duration'] || false,
            };
          }
          break;

        case 'scroll':
          if (step.params.amount) {
            params[`${stepPrefix}_amount`] = {
              type: 'number',
              description: `步骤${index + 1}滚动距离`,
              default: step.params.amount as number,
              replaceable: replaceableParams['amount'] || false,
            };
          }
          break;

        case 'smart_search':
          // Extract search query as parameter
          if (step.params.query) {
            params[`${stepPrefix}_query`] = {
              type: 'string',
              description: `步骤${index + 1}搜索关键词`,
              default: step.params.query as string,
              replaceable: replaceableParams['query'] || false,
            };
          }
          // Extract input selector as parameter (optional)
          if (step.params.input_selector) {
            params[`${stepPrefix}_input_selector`] = {
              type: 'string',
              description: `步骤${index + 1}搜索输入框选择器`,
              default: step.params.input_selector as string,
              replaceable: replaceableParams['input_selector'] || false,
            };
          }
          break;
      }
    });

    return params;
  };

  // Generate executable script from template steps with parameterized variables
  const generateScript = (steps: TemplateStep[], params: Record<string, { type: string; description: string; default?: string | number; replaceable?: boolean }> = {}): string => {
    const lines: string[] = [
      '// Auto-generated browser automation script',
      '// Generated at: ' + new Date().toISOString(),
      '',
      'const { chromium } = require("playwright");',
      '',
      '// === CONFIGURABLE PARAMETERS ===',
      '// You can modify these values before running the script',
    ];

    // Add parameter definitions with special marking for replaceable ones
    Object.entries(params).forEach(([key, param]) => {
      const defaultValue = param.type === 'number' ? param.default : `'${param.default}'`;
      // 添加可替换标记的特别注释
      if (param.replaceable) {
        lines.push(`// ⚠️ [可替换参数] ${param.description} - AI执行时可根据用户输入自动替换`);
      } else {
        lines.push(`// ${param.description}`);
      }
      lines.push(`const ${key} = ${defaultValue};`);
    });

    lines.push('');
    lines.push('async function run() {');
    lines.push('  const browser = await chromium.launch({ headless: false });');
    lines.push('  const context = await browser.newContext();');
    lines.push('  const page = await context.newPage();');
    lines.push('');

    steps.forEach((step, index) => {
      const stepPrefix = `step${index + 1}`;
      lines.push(`  // Step ${index + 1}: ${step.description}`);

      switch (step.tool) {
        case 'navigate':
          const urlVar = params[`${stepPrefix}_url`] ? `${stepPrefix}_url` : `'${step.params.url}'`;
          lines.push(`  await page.goto(${urlVar});`);
          break;
        case 'click':
          if (params[`${stepPrefix}_selector`]) {
            lines.push(`  await page.click(${stepPrefix}_selector);`);
          } else if (params[`${stepPrefix}_text`]) {
            lines.push(`  await page.click('text=' + ${stepPrefix}_text);`);
          } else if (step.params.selector) {
            lines.push(`  await page.click('${step.params.selector}');`);
          } else if (step.params.text) {
            lines.push(`  await page.click('text=${step.params.text}');`);
          }
          break;
        case 'fill':
          const selectorVar = params[`${stepPrefix}_selector`] ? `${stepPrefix}_selector` : `'${step.params.selector}'`;
          const valueVar = params[`${stepPrefix}_value`] ? `${stepPrefix}_value` : `'${step.params.value}'`;
          lines.push(`  await page.fill(${selectorVar}, ${valueVar});`);
          break;
        case 'screenshot':
          lines.push(`  await page.screenshot({ path: 'screenshot-${index + 1}.png' });`);
          break;
        case 'scroll':
          if (step.params.direction === 'down') {
            const amountVar = params[`${stepPrefix}_amount`] ? `${stepPrefix}_amount` : step.params.amount || 300;
            lines.push(`  await page.evaluate(() => window.scrollBy(0, ${amountVar}));`);
          } else if (step.params.direction === 'top') {
            lines.push(`  await page.evaluate(() => window.scrollTo(0, 0));`);
          }
          break;
        case 'wait':
          if (params[`${stepPrefix}_duration`]) {
            lines.push(`  await page.waitForTimeout(${stepPrefix}_duration);`);
          } else if (step.params.duration) {
            lines.push(`  await page.waitForTimeout(${step.params.duration});`);
          } else if (step.params.selector) {
            lines.push(`  await page.waitForSelector('${step.params.selector}');`);
          }
          break;
        case 'press_key':
          lines.push(`  await page.keyboard.press('${step.params.key}');`);
          break;
        case 'type_text':
          const textVar = params[`${stepPrefix}_text`] ? `${stepPrefix}_text` : `'${step.params.text}'`;
          lines.push(`  await page.keyboard.type(${textVar});`);
          break;
        case 'smart_search':
          const searchQuery = params[`${stepPrefix}_query`] ? `${stepPrefix}_query` : `'${step.params.query}'`;
          const searchSelector = params[`${stepPrefix}_input_selector`] ? `${stepPrefix}_input_selector` : `'${step.params.input_selector}'`;
          lines.push(`  // Smart search: fill search input and submit`);
          lines.push(`  const searchInput = await page.locator(${searchSelector});`);
          lines.push(`  await searchInput.fill(${searchQuery});`);
          if (step.params.submit_method === 'click' && step.params.button_selector) {
            lines.push(`  await page.click('${step.params.button_selector}');`);
          } else {
            lines.push(`  await searchInput.press('Enter');`);
          }
          break;
        default:
          lines.push(`  // Unknown tool: ${step.tool}`);
      }

      // Add screenshot pattern after each step: wait 2s → screenshot → wait 2s
      lines.push('  // Wait before screenshot');
      lines.push('  await page.waitForTimeout(2000);');
      lines.push(`  await page.screenshot({ path: 'screenshot-step-${index + 1}.png' });`);
      lines.push('  // Wait after screenshot');
      lines.push('  await page.waitForTimeout(2000);');
      lines.push('');
    });

    lines.push('  // Keep browser open for review');
    lines.push('  await page.waitForTimeout(5000);');
    lines.push('  await browser.close();');
    lines.push('}');
    lines.push('');
    lines.push('run().catch(console.error);');

    return lines.join('\n');
  };

  // Save template
  const handleSaveTemplate = () => {
    if (templateSteps.length === 0) {
      message.warning('模版为空，请先添加命令');
      return;
    }
    setShowTemplateModal(true);
  };

  // Confirm save template
  const handleConfirmSaveTemplate = async () => {
    if (templateSteps.length === 0) {
      message.warning('模版为空，请先添加命令');
      return;
    }

    const name = templateName || `模版 ${new Date().toLocaleString()}`;

    // Extract parameters and apply custom names
    const extractedParams = extractParameters(templateSteps);

    // Only include replaceable params in final params_schema
    // Also apply custom parameter names
    const finalParams: Record<string, { type: string; description: string; default?: string | number }> = {};
    Object.entries(extractedParams).forEach(([originalName, schema]) => {
      // Only include if param is replaceable (checked by user during recording)
      if (schema.replaceable) {
        // Also check if manually disabled in modal
        if (paramEnabled[originalName] !== false) {
          const customName = paramNames[originalName] || originalName;
          finalParams[customName] = schema;
        }
      }
    });

    // Convert TemplateStep to backend format with screenshot after each step
    // Also replace parameter values with ${param_name} placeholders
    const backendSteps: any[] = [];
    let stepCounter = 1;

    templateSteps.forEach((step, index) => {
      // Create params with placeholder substitution for replaceable params only
      const substitutedParams = { ...step.params };

      // Find which original params map to this step's params and substitute
      // Only substitute params that are marked as replaceable
      Object.entries(extractedParams).forEach(([originalName, schema]) => {
        // Only substitute if param is replaceable
        if (schema.replaceable && paramEnabled[originalName] !== false) {
          const customName = paramNames[originalName] || originalName;
          // Replace the value with placeholder
          const defaultValue = schema.default;
          if (defaultValue !== undefined) {
            // Find and replace in params
            Object.keys(substitutedParams).forEach(key => {
              if (substitutedParams[key] === defaultValue) {
                substitutedParams[key] = `\${${customName}}`;
              }
            });
          }
        }
      });

      // Add the original step with substituted params
      const backendStep: any = {
        step_id: `step_${stepCounter}`,
        action: step.tool,
        params: substitutedParams,
      };

      // Add locator for selector-based actions
      if (step.params.selector) {
        backendStep.locator = {
          type: 'css',
          value: step.params.selector as string,
        };
      }

      backendSteps.push(backendStep);
      stepCounter++;

      // Add screenshot step after each step
      // Wait 2s -> screenshot -> wait 2s
      backendSteps.push({
        step_id: `step_${stepCounter}`,
        action: 'wait',
        params: { duration: 2000 },
      });
      stepCounter++;

      backendSteps.push({
        step_id: `step_${stepCounter}`,
        action: 'screenshot',
        params: {},
      });
      stepCounter++;

      backendSteps.push({
        step_id: `step_${stepCounter}`,
        action: 'wait',
        params: { duration: 2000 },
      });
      stepCounter++;
    });

    // Generate params_schema for custom parameters
    const paramsSchema = {
      type: 'object',
      properties: finalParams,
      required: Object.keys(finalParams),
    };

    try {
      // Save to backend API
      const createdTemplate = await templateApi.create({
        name,
        description: `由智能录制生成的模版，包含 ${templateSteps.length} 个步骤（含自动截图），${Object.keys(finalParams).length} 个可替换参数`,
        params_schema: paramsSchema,
        steps: backendSteps,
        created_by: user?.id || 'ai_recorder',
      });

      message.success(`模版已保存: ${createdTemplate.name}`);
      setShowTemplateModal(false);
      handleClearTemplate();

      // Store the template ID for immediate testing
      setSavedTemplateId(createdTemplate.id);
      message.info('模版已保存，可以点击"测试模版"按钮进行测试', 5);
    } catch (error: any) {
      console.error('Failed to save template:', error);
      // Show the actual error message
      const errorMsg = error.response?.data?.message || error.message || '未知错误';
      message.error(`保存模版失败: ${errorMsg}`);
    }
  };

  // Test saved template
  const handleTestSavedTemplate = async () => {
    if (!savedTemplateId) {
      message.warning('请先保存模版');
      return;
    }
    if (!user?.id) {
      message.warning('用户未登录，请先登录');
      return;
    }

    setTestLoading(true);
    try {
      // Create session
      const result = await sessionApi.create({
        user_id: user.id,
        template_id: savedTemplateId,
        params: {},
      });

      // Start the session
      await sessionApi.start(result.session.id, {
        template_id: savedTemplateId,
        params: {},
      });

      message.success('测试已启动，跳转到会话详情页');
      navigate(`/sessions/${result.session.id}`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message || '测试失败';
      if (errorMsg.includes('No available workers')) {
        // Try to reset workers and retry
        message.warning('Worker 不足，正在重置...');
        try {
          await workerApi.reset();
          // Retry
          const result = await sessionApi.create({
            user_id: user.id,
            template_id: savedTemplateId,
            params: {},
          });
          await sessionApi.start(result.session.id, {
            template_id: savedTemplateId,
            params: {},
          });
          message.success('测试已启动，跳转到会话详情页');
          navigate(`/sessions/${result.session.id}`);
        } catch (retryError: any) {
          message.error(retryError.response?.data?.message || retryError.message || '测试失败');
        }
      } else {
        message.error(errorMsg);
      }
    } finally {
      setTestLoading(false);
    }
  };

  // Reset worker pool
  const handleResetWorkers = async () => {
    setResetLoading(true);
    try {
      const result = await workerApi.reset();
      message.success(result.message || 'Worker Pool 已重置');
    } catch (error: any) {
      message.error('重置 Worker Pool 失败');
    } finally {
      setResetLoading(false);
    }
  };

  // Copy compiled script
  const handleCopyScript = () => {
    navigator.clipboard.writeText(compiledScript);
    message.success('脚本已复制到剪贴板');
  };

  // Download compiled script
  const handleDownloadScript = () => {
    const blob = new Blob([compiledScript], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `browser-script-${Date.now()}.js`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('脚本已下载');
  };

  // Auto extract template from history
  const handleAutoExtractTemplate = () => {
    const extractedSteps: TemplateStep[] = [];

    // Go through all history entries
    history.forEach((entry) => {
      // Check if entry has result with template_info
      if (entry.result?.template_info) {
        const info = entry.result.template_info;
        // Only add deterministic commands (navigate, fill, click with selector, etc.)
        // Skip non-deterministic commands like click_result without actual navigation
        const deterministicTools = ['navigate', 'fill', 'click', 'screenshot', 'scroll', 'wait', 'press_key', 'hover', 'type_text', 'smart_search'];
        if (deterministicTools.includes(info.tool)) {
          // Determine which params are replaceable based on entry.replaceable and commandType
          const replaceableParams: Record<string, boolean> = {};

          if (entry.replaceable && entry.rawParam) {
            // 根据命令类型标记可替换参数
            switch (info.tool) {
              case 'navigate':
                replaceableParams['url'] = true;
                break;
              case 'smart_search':
                replaceableParams['query'] = true;
                break;
              case 'fill':
                replaceableParams['value'] = true;
                break;
              case 'click':
                if (info.params.text) replaceableParams['text'] = true;
                break;
              case 'type_text':
                replaceableParams['text'] = true;
                break;
            }
          }

          extractedSteps.push({
            id: Date.now().toString() + Math.random(),
            tool: info.tool,
            params: info.params,
            description: info.description || `${info.tool} ${JSON.stringify(info.params)}`,
            timestamp: entry.timestamp,
            replaceableParams,
          });
        }
      }
    });

    if (extractedSteps.length === 0) {
      message.warning('历史记录中没有找到确定性命令');
      return;
    }

    setTemplateSteps(extractedSteps);
    message.success(`已从历史记录中提取 ${extractedSteps.length} 个确定性命令`);
  };

  // Handle manual recording start
  const handleManualStart = () => {
    let finalUrl = recordUrl.trim();
    if (!finalUrl || finalUrl === 'https://') {
      message.warning(t('recorder:enterUrl'));
      return;
    }
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    onStartRecording?.(finalUrl);
  };

  // Check if any mutation is loading
  const isLoading = parseCommandMutation.isLoading || executeCommandMutation.isLoading;

  // Example commands
  const exampleCommands = [
    { text: t('recorder:ai.example.navigate') || '打开百度首页', input: '打开百度' },
    { text: t('recorder:ai.example.search') || '搜索关键词', input: '在百度搜索 MCP 协议' },
    { text: t('recorder:ai.example.click') || '点击元素', input: '点击搜索按钮' },
    { text: t('recorder:ai.example.screenshot') || '截图', input: '截取当前页面' },
  ];

  // Status colors for manual mode
  const statusColors: Record<string, string> = {
    idle: 'default',
    connecting: 'processing',
    recording: 'success',
    paused: 'warning',
    stopped: 'default',
    error: 'error',
  };

  const isRecording = recorderStatus === 'recording';
  const isPaused = recorderStatus === 'paused';
  const isIdle = recorderStatus === 'idle';
  const isStopped = recorderStatus === 'stopped';

  return (
    <Card
      title={<Text strong>录制器</Text>}
      extra={
        <Space>
          <Switch
            checked={isAIMode}
            onChange={setIsAIMode}
            checkedChildren={<><RobotOutlined /> AI</>}
            unCheckedChildren={<><VideoCameraOutlined /> 手动</>}
          />
          <Tag color={isBrowserReady ? 'success' : 'warning'}>
            {isBrowserReady ? (t('recorder:ai.ready') || '就绪') : (t('recorder:ai.notReady') || '未初始化')}
          </Tag>
          <Button
            type={isBrowserReady ? 'default' : 'primary'}
            size="small"
            icon={<DesktopOutlined />}
            onClick={() => initBrowserMutation.mutate()}
            loading={initBrowserMutation.isLoading}
          >
            {isBrowserReady
              ? (t('recorder:ai.reinitBrowser') || '重新初始化')
              : (t('recorder:ai.initBrowser') || '初始化浏览器')}
          </Button>
        </Space>
      }
    >
      {isAIMode ? (
        // AI Mode Content
        <Space direction="vertical" style={{ width: '100%' }} size="middle">

        {/* Message history */}
        <div
          style={{
            height: 300,
            overflowY: 'auto',
            background: '#fafafa',
            borderRadius: 8,
            padding: 12,
          }}
        >
          {history.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('recorder:ai.noHistory') || '暂无对话记录'}
            />
          ) : (
            history.map((entry) => (
              <div
                key={entry.id}
                style={{
                  marginBottom: 12,
                  textAlign: entry.type === 'user' ? 'right' : 'left',
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: 12,
                    background: entry.type === 'user' ? '#6366f1' : entry.type === 'system' ? '#e6f7ff' : '#fff',
                    color: entry.type === 'user' ? '#fff' : 'inherit',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  }}
                >
                  <Text
                    style={{ color: entry.type === 'user' ? '#fff' : 'inherit' }}
                  >
                    {entry.content}
                  </Text>

                  {/* Show commands if present */}
                  {entry.commands && entry.commands.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <Collapse
                        size="small"
                        ghost
                        items={[
                          {
                            key: '1',
                            label: (
                              <Space>
            <Text strong>录制器</Text>
                                <CodeOutlined />
                                <Text style={{ fontSize: 12 }}>
                                  {entry.commands.length} MCP {t('recorder:ai.commands') || '命令'}
                                </Text>
                              </Space>
                            ),
                            children: (
                              <div>
                                {entry.commands.map((cmd, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      background: '#f5f5f5',
                                      padding: '4px 8px',
                                      borderRadius: 4,
                                      marginBottom: 4,
                                      fontFamily: 'monospace',
                                      fontSize: 12,
                                    }}
                                  >
                                    <Space>
            <Text strong>录制器</Text>
                                      <Tag color="blue">{cmd.tool}</Tag>
                                      <Text code style={{ fontSize: 11 }}>
                                        {JSON.stringify(cmd.params)}
                                      </Text>
                                      <Button
                                        type="text"
                                        size="small"
                                        icon={<CopyOutlined />}
                                        onClick={() => handleCopyCommand(cmd)}
                                      />
                                    </Space>
                                  </div>
                                ))}
                                <Button
                                  type="primary"
                                  size="small"
                                  icon={<PlayCircleOutlined />}
                                  onClick={() => handleExecuteCommands(entry.commands!)}
                                  style={{ marginTop: 8 }}
                                >
                                  {t('recorder:ai.execute') || '执行命令'}
                                </Button>
                              </div>
                            ),
                          },
                        ]}
                      />
                    </div>
                  )}

                  {/* Show result if present */}
                  {entry.result && (
                    <div style={{ marginTop: 8 }}>
                      <Collapse
                        size="small"
                        ghost
                        items={[
                          {
                            key: 'result',
                            label: (
                              <Space>
                                <Text strong>录制器</Text>
                                {entry.result.status === 'error' ? (
                                  <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                                ) : (
                                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                )}
                                <Text style={{ fontSize: 12 }}>
                                  {entry.result.status === 'error'
                                    ? (entry.result.message || '执行失败')
                                    : (t('recorder:ai.result') || '执行结果')}
                                </Text>
                              </Space>
                            ),
                            children: (
                              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                                {/* Screenshot result */}
                                {entry.result.screenshot && (
                                  <img
                                    src={entry.result.screenshot.startsWith('data:')
                                      ? entry.result.screenshot
                                      : `data:image/png;base64,${entry.result.screenshot}`}
                                    alt="Screenshot"
                                    style={{ maxWidth: '100%', borderRadius: 4 }}
                                  />
                                )}
                                {/* Text/HTML content result */}
                                {entry.result.text && (
                                  <div
                                    style={{
                                      background: '#f5f5f5',
                                      padding: 8,
                                      borderRadius: 4,
                                      fontSize: 11,
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-all',
                                      maxHeight: 200,
                                      overflow: 'auto',
                                    }}
                                  >
                                    {entry.result.text}
                                  </div>
                                )}
                                {/* HTML content result */}
                                {entry.result.html && (
                                  <div
                                    style={{
                                      background: '#f5f5f5',
                                      padding: 8,
                                      borderRadius: 4,
                                      fontSize: 11,
                                      fontFamily: 'monospace',
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-all',
                                      maxHeight: 200,
                                      overflow: 'auto',
                                    }}
                                  >
                                    {entry.result.html}
                                  </div>
                                )}
                                {/* Snapshot/Accessibility tree result */}
                                {entry.result.snapshot && (
                                  <pre
                                    style={{
                                      background: '#f5f5f5',
                                      padding: 8,
                                      borderRadius: 4,
                                      fontSize: 10,
                                      maxHeight: 200,
                                      overflow: 'auto',
                                      margin: 0,
                                    }}
                                  >
                                    {typeof entry.result.snapshot === 'string'
                                      ? entry.result.snapshot
                                      : JSON.stringify(entry.result.snapshot, null, 2)}
                                  </pre>
                                )}
                                {/* Template info - for all commands */}
                                {entry.result.template_info && (
                                  <div style={{ marginTop: 8, padding: 8, background: '#e6f7ff', borderRadius: 4, border: '1px solid #91d5ff' }}>
                                    <Text strong style={{ fontSize: 11 }}>确定性命令：</Text>
                                    <div style={{ marginTop: 4, fontSize: 10, fontFamily: 'monospace', background: '#fff', padding: 4, borderRadius: 2 }}>
                                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(entry.result.template_info, null, 2)}</pre>
                                    </div>
                                    <Space style={{ marginTop: 8 }}>
                                      <Button
                                        type="primary"
                                        size="small"
                                        icon={<FileAddOutlined />}
                                        onClick={() => handleAddToTemplate(entry.result.template_info)}
                                      >
                                        添加到模版
                                      </Button>
                                      <Text type="secondary" style={{ fontSize: 10 }}>
                                        可直接用于模版编译，无需 AI 解析
                                      </Text>
                                    </Space>
                                  </div>
                                )}
                                {/* Generic result - show as JSON */}
                                {!entry.result.screenshot && !entry.result.text && !entry.result.html && !entry.result.snapshot && (
                                  <pre
                                    style={{
                                      background: '#f5f5f5',
                                      padding: 8,
                                      borderRadius: 4,
                                      fontSize: 10,
                                      maxHeight: 200,
                                      overflow: 'auto',
                                      margin: 0,
                                    }}
                                  >
                                    {JSON.stringify(entry.result, null, 2)}
                                  </pre>
                                )}
                              </div>
                            ),
                          },
                        ]}
                      />
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                  {entry.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area - 3列2行布局 */}
        <div style={{ marginTop: 12 }}>
          {/* Row 1: 命令选择 - 一行最多3个 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {predefinedCommands.map(c => (
              <Radio.Button
                key={c.value}
                value={c.value}
                onClick={() => setSelectedCommand(c.value)}
                style={{
                  borderRadius: 16,
                  padding: '4px 16px',
                  height: 32,
                  lineHeight: '24px',
                  border: selectedCommand === c.value ? '2px solid #6366f1' : '1px solid #d9d9d9',
                  background: selectedCommand === c.value ? '#eef2ff' : '#fff',
                  color: selectedCommand === c.value ? '#6366f1' : '#666',
                  fontWeight: selectedCommand === c.value ? 500 : 400,
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                }}
              >
                {c.label}
              </Radio.Button>
            ))}
          </div>

          {/* Row 2: 参数输入 | 发送按钮 | 参数可替换 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 参数输入 */}
            <TextArea
              value={paramInput}
              onChange={(e) => setParamInput(e.target.value)}
              placeholder={predefinedCommands.find(c => c.value === selectedCommand)?.placeholder || '输入参数'}
              autoSize={{ minRows: 1, maxRows: 3 }}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isLoading}
              style={{ flex: 1, minWidth: 180, borderRadius: 16, padding: '6px 12px' }}
            />

            {/* 发送按钮 */}
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={isLoading}
              disabled={!(predefinedCommands.find(c => c.value === selectedCommand)?.prefix + paramInput.trim()).trim()}
              style={{ height: 32, borderRadius: 16, minWidth: 70 }}
            >
              {t('common:send')}
            </Button>

            {/* 参数可替换 */}
            <Checkbox
              checked={isReplaceable}
              onChange={(e) => setIsReplaceable(e.target.checked)}
              disabled={!paramInput.trim()}
              style={{ marginLeft: 8 }}
            >
              <Tooltip title="勾选后，此参数在生成模版时会被标记为可替换参数">
                <Text style={{ fontSize: 12, color: isReplaceable ? '#6366f1' : '#999' }}>可替换</Text>
              </Tooltip>
            </Checkbox>
          </div>
        </div>

        {/* Quick action buttons */}
        <div style={{ marginTop: 12 }}>

          {/* Direct execution commands - click to execute immediately */}
          <div style={{ marginBottom: 8 }}>
            <Space wrap size="small">
              <Button
                size="small"
                icon={<CameraOutlined />}
                onClick={() => handleQuickAction('screenshot')}
                loading={isLoading && executeCommandMutation.isLoading}
                title="截取当前页面图片"
              >
                {t('recorder:ai.quick.screenshot') || '截图'}
              </Button>

              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => handleQuickAction('snapshot')}
                loading={isLoading && executeCommandMutation.isLoading}
                title="获取页面结构快照"
              >
                {t('recorder:ai.quick.snapshot') || '快照'}
              </Button>

              <Button
                size="small"
                icon={<FileSearchOutlined />}
                onClick={() => handleQuickAction('read_page')}
                loading={isLoading && executeCommandMutation.isLoading}
                title="读取页面内容"
              >
                {t('recorder:ai.quick.readPage') || '读取页面'}
              </Button>

              <Button
                size="small"
                icon={<CodeOutlined />}
                onClick={() => handleQuickAction('get_text')}
                loading={isLoading && executeCommandMutation.isLoading}
                title="获取页面所有文本"
              >
                {t('recorder:ai.quick.getText') || '获取文本'}
              </Button>

              <Button
                size="small"
                icon={<ArrowDownOutlined />}
                onClick={() => handleQuickAction('scroll', { direction: 'down' })}
                loading={isLoading && executeCommandMutation.isLoading}
                title="向下滚动页面"
              >
                {t('recorder:ai.quick.scrollDown') || '向下'}
              </Button>

              <Button
                size="small"
                icon={<CloudUploadOutlined />}
                onClick={() => handleQuickAction('scroll', { direction: 'top' })}
                loading={isLoading && executeCommandMutation.isLoading}
                title="滚动到顶部"
              >
                {t('recorder:ai.quick.scrollTop') || '顶部'}
              </Button>

              <Button
                size="small"
                icon={<ClockCircleOutlined />}
                onClick={() => handleQuickAction('wait', { duration: waitDuration * 1000 })}
                loading={isLoading && executeCommandMutation.isLoading}
                title={`等待 ${waitDuration} 秒`}
              >
                {t('recorder:ai.quick.wait') || '等待'} {waitDuration}s
              </Button>

              {/* Wait duration input */}
              <InputNumber
                size="small"
                min={1}
                max={120}
                value={waitDuration}
                onChange={(val) => setWaitDuration(val || 3)}
                style={{ width: 60 }}
                addonAfter="s"
              />
            </Space>
          </div>
        </div>

        {/* Clear history button */}
        {history.length > 0 && (
          <Button
            type="text"
            icon={<DeleteOutlined />}
            onClick={handleClearHistory}
            style={{ color: '#999' }}
          >
            {t('recorder:ai.clearHistory') || '清空记录'}
          </Button>
        )}

        {/* Template section */}
        <Divider style={{ margin: '12px 0' }} />
        <div style={{ background: '#f6f8fa', borderRadius: 8, padding: 12 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <Text strong style={{ fontSize: 13 }}>
                <FileAddOutlined style={{ marginRight: 4 }} />
                模版录制
              </Text>
              <Tag color={templateSteps.length > 0 ? 'processing' : 'default'}>
                {templateSteps.length} 步
              </Tag>
              {savedTemplateId && (
                <Tag color="success">已保存</Tag>
              )}
            </Space>
            <Space>
              <Button
                size="small"
                icon={<RobotOutlined />}
                onClick={handleAutoExtractTemplate}
                disabled={history.length === 0}
                title="从历史记录中自动提取确定性命令"
              >
                自动提取
              </Button>
              <Button
                type="primary"
                size="small"
                icon={<CodeOutlined />}
                onClick={handleCompileTemplate}
                disabled={templateSteps.length === 0}
              >
                编译模版
              </Button>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={handleClearTemplate}
                disabled={templateSteps.length === 0}
              >
                清空
              </Button>
            </Space>
          </Space>

          {/* Test and Reset buttons after saving */}
          {savedTemplateId && (
            <Space style={{ marginTop: 12, width: '100%' }}>
              <Button
                type="primary"
                size="small"
                icon={<BugOutlined />}
                onClick={handleTestSavedTemplate}
                loading={testLoading}
              >
                测试模版
              </Button>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={handleResetWorkers}
                loading={resetLoading}
              >
                重置 Worker
              </Button>
            </Space>
          )}

          {/* Template steps list */}
          {templateSteps.length > 0 && (
            <List
              size="small"
              style={{ marginTop: 12, background: '#fff', borderRadius: 4 }}
              dataSource={templateSteps}
              renderItem={(step, index) => (
                <List.Item
                  actions={[
                    <Button
                      key="remove"
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveTemplateStep(step.id)}
                    />,
                  ]}
                >
                  <Space>
                    <Tag color="blue">{index + 1}</Tag>
                    <Tag>{step.tool}</Tag>
                    <Text style={{ fontSize: 11 }}>{step.description}</Text>
                  </Space>
                </List.Item>
              )}
            />
          )}

          {templateSteps.length === 0 && (
            <div style={{ marginTop: 12, textAlign: 'center', color: '#999', fontSize: 12 }}>
              执行命令后，点击"添加到模版"按钮将确定性命令添加到模版中
            </div>
          )}
        </div>

        {/* Template save modal */}
        <Modal
          title="保存模版"
          open={showTemplateModal}
          onOk={handleConfirmSaveTemplate}
          onCancel={() => setShowTemplateModal(false)}
          okText="保存"
          cancelText="取消"
          width={600}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>模版名称：</Text>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={`模版 ${new Date().toLocaleString()}`}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              包含 {templateSteps.length} 个步骤
            </Text>

            {/* Parameter editing section */}
            {Object.keys(extractParameters(templateSteps)).length > 0 && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Text strong>可替换参数：</Text>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                  修改参数名称使其更具语义化（如将 step2_value 改为 query），取消勾选可排除不需要替换的参数
                </Text>
                <List
                  size="small"
                  bordered
                  dataSource={Object.entries(extractParameters(templateSteps))}
                  renderItem={([originalName, schema]) => (
                    <List.Item style={{ padding: '8px 12px' }}>
                      <Space direction="vertical" style={{ width: '100%' }} size={4}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Switch
                            size="small"
                            checked={paramEnabled[originalName] !== false}
                            onChange={(checked) => {
                              setParamEnabled(prev => ({ ...prev, [originalName]: checked }));
                            }}
                          />
                          <Text code style={{ fontSize: 11 }}>{originalName}</Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>→</Text>
                          <Input
                            size="small"
                            value={paramNames[originalName] || originalName}
                            onChange={(e) => {
                              setParamNames(prev => ({ ...prev, [originalName]: e.target.value }));
                            }}
                            style={{ width: 120 }}
                            placeholder="参数名"
                          />
                        </Space>
                        <Space>
                          <Tag color="blue">{schema.type}</Tag>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            默认值: {String(schema.default || '-')}
                          </Text>
                        </Space>
                      </Space>
                    </List.Item>
                  )}
                />
              </>
            )}
          </Space>
        </Modal>

        {/* Compiled script modal */}
        <Modal
          title="编译后的脚本"
          open={showScriptModal}
          onCancel={() => setShowScriptModal(false)}
          width={700}
          footer={[
            <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyScript}>
              复制
            </Button>,
            <Button key="download" icon={<DownloadOutlined />} onClick={handleDownloadScript}>
              下载
            </Button>,
            <Button key="save" type="primary" icon={<SaveOutlined />} onClick={handleSaveCompiledTemplate}>
              保存模版
            </Button>,
          ]}
        >
          <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
            <Text>模版名称：</Text>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={`编译模版 ${new Date().toLocaleString()}`}
              style={{ marginBottom: 8 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              包含 {templateSteps.length} 个步骤，可修改参数后保存
            </Text>
          </Space>
          <pre
            style={{
              background: '#1e1e1e',
              color: '#d4d4d4',
              padding: 16,
              borderRadius: 8,
              maxHeight: 400,
              overflow: 'auto',
              fontSize: 12,
            }}
          >
            {compiledScript}
          </pre>
        </Modal>
      </Space>
      ) : (
        // Manual Mode Content
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* Connection Status */}
          <Space>
            <Text strong>录制器</Text>
            <Tag color={isConnected ? 'success' : 'error'}>
              {isConnected ? (t('recorder:connected') || '已连接') : (t('recorder:disconnected') || '未连接')}
            </Tag>
            <Tag color={statusColors[recorderStatus]}>
              {t(`recorder:status.${recorderStatus}`) || recorderStatus}
            </Tag>
          </Space>

          {/* Connection Controls */}
          <Space>
            <Text strong>录制器</Text>
            {!isConnected ? (
              <Button
                type="primary"
                icon={<ApiOutlined />}
                onClick={onConnect}
                loading={recorderStatus === 'connecting'}
              >
                {t('recorder:connect') || '连接'}
              </Button>
            ) : (
              <Button icon={<DisconnectOutlined />} onClick={onDisconnect} danger>
                {t('recorder:disconnect') || '断开'}
              </Button>
            )}
          </Space>

          {/* URL Input */}
          <Input
            placeholder={t('recorder:urlPlaceholder') || '输入网址开始录制'}
            prefix={<LinkOutlined />}
            value={recordUrl}
            onChange={(e) => setRecordUrl(e.target.value)}
            disabled={!isConnected || isRecording}
            onPressEnter={handleManualStart}
            size="large"
          />

          {/* Recording Controls */}
          <Space wrap>
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={handleManualStart}
              disabled={!isConnected || isRecording || isPaused}
            >
              {t('recorder:start') || '开始录制'}
            </Button>

            {isRecording && (
              <Button
                size="large"
                icon={<PauseCircleOutlined />}
                onClick={onPauseRecording}
              >
                {t('recorder:pause') || '暂停'}
              </Button>
            )}

            {isPaused && (
              <Button
                type="primary"
                size="large"
                icon={<PlayCircleOutlined />}
                onClick={onResumeRecording}
              >
                {t('recorder:resume') || '继续'}
              </Button>
            )}

            {(isRecording || isPaused) && (
              <Button
                size="large"
                icon={<StopOutlined />}
                onClick={onStopRecording}
                danger
              >
                {t('recorder:stop') || '停止'}
              </Button>
            )}
          </Space>

          {/* Recorded Script Preview */}
          {recordedScript && (
            <div style={{ marginTop: 16 }}>
              <Text strong style={{ fontSize: 13 }}>
                {t('recorder:script') || '录制脚本'}：
              </Text>
              <pre
                style={{
                  background: '#f5f5f5',
                  padding: 12,
                  borderRadius: 8,
                  maxHeight: 200,
                  overflow: 'auto',
                  fontSize: 11,
                  marginTop: 8,
                }}
              >
                {recordedScript}
              </pre>
            </div>
          )}
        </Space>
      )}
    </Card>
  );
};

export default AIControls;