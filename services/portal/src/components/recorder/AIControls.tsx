import React, { useState, useRef, useEffect } from 'react';
import { Card, Input, Button, Space, Typography, Tag, Empty, message, Divider, Alert, Collapse, InputNumber, Modal, List } from 'antd';
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
  SaveOutlined,
  FileAddOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import { apiClient } from '../../api/client';

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
}

// Template step - deterministic command for replay
interface TemplateStep {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  description: string;
  timestamp: Date;
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
}

const AIControls: React.FC<AIControlsProps> = ({ onCommandExecuted }) => {
  const { t } = useTranslation(['common', 'recorder']);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<CommandHistoryEntry[]>([]);
  const [isBrowserReady, setIsBrowserReady] = useState(false);
  const [waitDuration, setWaitDuration] = useState(20); // Default 20 seconds
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Template state
  const [templateSteps, setTemplateSteps] = useState<TemplateStep[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [compiledScript, setCompiledScript] = useState('');
  const [showScriptModal, setShowScriptModal] = useState(false);

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
            return [...prev.slice(0, -1), { ...last, result: data }];
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
          // Add AI response to history
          setHistory((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              type: 'ai',
              content: data.explanation,
              commands: data.commands,
              result: data.result,
              timestamp: new Date(),
            },
          ]);
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
    if (!input.trim()) return;

    const userMessage = input.trim();

    // Add user message to history
    setHistory((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: 'user',
        content: userMessage,
        timestamp: new Date(),
      },
    ]);

    // Clear input immediately
    setInput('');

    // Auto init browser if not ready
    if (!isBrowserReady) {
      try {
        await initBrowserMutation.mutateAsync();
      } catch (e) {
        // Init failed, but we already added error to history
        return;
      }
    }

    // Parse the command
    parseCommandMutation.mutate(userMessage);
  };

  const handleExecuteCommands = (commands: MCPCommand[]) => {
    executeCommandMutation.mutate(commands);
  };

  // Quick action handlers - execute commands directly
  const handleQuickAction = async (command: string, params?: Record<string, unknown>) => {
    const quickCommand: MCPCommand = {
      tool: command,
      params: params || {},
      description: `快捷操作: ${command}`,
    };

    // Add to history with commands for result update
    setHistory((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: 'ai',
        content: `快捷操作: ${command}${params ? ` (${JSON.stringify(params)})` : ''}`,
        commands: [quickCommand],
        timestamp: new Date(),
      },
    ]);

    // Auto init browser if not ready
    if (!isBrowserReady) {
      try {
        await initBrowserMutation.mutateAsync();
      } catch (e) {
        return;
      }
    }

    // Execute directly
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
    const step: TemplateStep = {
      id: Date.now().toString(),
      tool: templateInfo.tool,
      params: templateInfo.params,
      description: templateInfo.description,
      timestamp: new Date(),
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
  };

  // Compile template to executable script
  const handleCompileTemplate = () => {
    if (templateSteps.length === 0) {
      message.warning('模版为空，请先添加命令');
      return;
    }

    // Generate JavaScript code
    const script = generateScript(templateSteps);
    setCompiledScript(script);
    setShowScriptModal(true);
  };

  // Generate executable script from template steps
  const generateScript = (steps: TemplateStep[]): string => {
    const lines: string[] = [
      '// Auto-generated browser automation script',
      '// Generated at: ' + new Date().toISOString(),
      '',
      'const { chromium } = require("playwright");',
      '',
      'async function run() {',
      '  const browser = await chromium.launch({ headless: false });',
      '  const context = await browser.newContext();',
      '  const page = await context.newPage();',
      '',
    ];

    steps.forEach((step, index) => {
      lines.push(`  // Step ${index + 1}: ${step.description}`);
      switch (step.tool) {
        case 'navigate':
          lines.push(`  await page.goto('${step.params.url}');`);
          break;
        case 'click':
          if (step.params.selector) {
            lines.push(`  await page.click('${step.params.selector}');`);
          } else if (step.params.text) {
            lines.push(`  await page.click('text=${step.params.text}');`);
          }
          break;
        case 'fill':
          lines.push(`  await page.fill('${step.params.selector}', '${step.params.value}');`);
          break;
        case 'screenshot':
          lines.push(`  await page.screenshot({ path: 'screenshot-${index + 1}.png' });`);
          break;
        case 'scroll':
          if (step.params.direction === 'down') {
            lines.push(`  await page.evaluate(() => window.scrollBy(0, ${step.params.amount || 300}));`);
          } else if (step.params.direction === 'top') {
            lines.push(`  await page.evaluate(() => window.scrollTo(0, 0));`);
          }
          break;
        case 'wait':
          if (step.params.duration) {
            lines.push(`  await page.waitForTimeout(${step.params.duration});`);
          } else if (step.params.selector) {
            lines.push(`  await page.waitForSelector('${step.params.selector}');`);
          }
          break;
        case 'press_key':
          lines.push(`  await page.keyboard.press('${step.params.key}');`);
          break;
        default:
          lines.push(`  // Unknown tool: ${step.tool}`);
      }
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
  const handleConfirmSaveTemplate = () => {
    const template: Template = {
      id: Date.now().toString(),
      name: templateName || `模版 ${new Date().toLocaleString()}`,
      steps: templateSteps,
      createdAt: new Date(),
    };

    // Save to localStorage
    const savedTemplates = JSON.parse(localStorage.getItem('browserTemplates') || '[]');
    savedTemplates.push(template);
    localStorage.setItem('browserTemplates', JSON.stringify(savedTemplates));

    message.success(`模版已保存: ${template.name}`);
    setShowTemplateModal(false);
    handleClearTemplate();
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

  // Check if any mutation is loading
  const isLoading = parseCommandMutation.isLoading || executeCommandMutation.isLoading;

  // Example commands
  const exampleCommands = [
    { text: t('recorder:ai.example.navigate') || '打开百度首页', input: '打开百度' },
    { text: t('recorder:ai.example.search') || '搜索关键词', input: '在百度搜索 MCP 协议' },
    { text: t('recorder:ai.example.click') || '点击元素', input: '点击搜索按钮' },
    { text: t('recorder:ai.example.screenshot') || '截图', input: '截取当前页面' },
  ];

  return (
    <Card
      title={
        <Space>
          <RobotOutlined />
          {t('recorder:ai.title') || 'AI 浏览器控制'}
        </Space>
      }
      extra={
        <Space>
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
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* Browser not ready alert */}
        {!isBrowserReady && (
          <Alert
            message={t('recorder:ai.browserNotReadyTitle') || '浏览器未初始化'}
            description={t('recorder:ai.browserNotReadyDesc') || '请点击"初始化浏览器"按钮，或在输入命令后自动初始化'}
            type="warning"
            showIcon
            style={{ borderRadius: 8 }}
          />
        )}

        {/* Info alert */}
        <Alert
          message={t('recorder:ai.infoTitle') || '自然语言控制'}
          description={t('recorder:ai.infoDesc') || '输入自然语言描述，AI 将自动转换为浏览器操作命令。支持导航、点击、填充、截图等操作。'}
          type="info"
          showIcon
          style={{ borderRadius: 8 }}
        />

        {/* Example commands */}
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('recorder:ai.examples') || '示例命令：'}
          </Text>
          <Space wrap style={{ marginTop: 8 }}>
            {exampleCommands.map((cmd, i) => (
              <Tag
                key={i}
                style={{ cursor: 'pointer' }}
                onClick={() => setInput(cmd.input)}
              >
                {cmd.text}
              </Tag>
            ))}
          </Space>
        </div>

        <Divider style={{ margin: '12px 0' }} />

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
                                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                <Text style={{ fontSize: 12 }}>
                                  {t('recorder:ai.result') || '执行结果'}
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

        {/* Input area */}
        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('recorder:ai.inputPlaceholder') || '输入自然语言命令，例如：打开百度搜索 MCP'}
            autoSize={{ minRows: 1, maxRows: 3 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isLoading}
            style={{ borderRadius: '8px 0 0 8px' }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={isLoading}
            disabled={!input.trim()}
            style={{ height: 'auto', borderRadius: '0 8px 8px 0' }}
          >
            {t('common:send')}
          </Button>
        </Space.Compact>

        {/* Quick action buttons */}
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
            {t('recorder:ai.quickActions') || '快捷操作'}
          </Text>

          {/* Direct execution commands - click to execute immediately */}
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 11, marginRight: 8 }}>
              {t('recorder:ai.directActions') || '直接执行：'}
            </Text>
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
                onChange={(val) => setWaitDuration(val || 20)}
                style={{ width: 60 }}
                addonAfter="s"
              />
            </Space>
          </div>

          {/* Pre-input commands - click to fill input with command template */}
          <div>
            <Text type="secondary" style={{ fontSize: 11, marginRight: 8 }}>
              {t('recorder:ai.preInputActions') || '预输入指令：'}
            </Text>
            <Space wrap size="small">
              <Button
                size="small"
                icon={<DesktopOutlined />}
                onClick={() => setInput('打开 ')}
                title="预输入打开网页指令"
              >
                {t('recorder:ai.quick.navigate') || '打开'}
              </Button>

              <Button
                size="small"
                icon={<ToolOutlined />}
                onClick={() => setInput('点击 ')}
                title="预输入点击元素指令"
              >
                {t('recorder:ai.quick.click') || '点击'}
              </Button>

              <Button
                size="small"
                onClick={() => setInput('填充 ')}
                title="预输入填充输入框指令"
              >
                {t('recorder:ai.quick.fill') || '填充'}
              </Button>

              <Button
                size="small"
                onClick={() => setInput('搜索 ')}
                title="预输入搜索指令"
              >
                {t('recorder:ai.quick.search') || '搜索'}
              </Button>

              <Button
                size="small"
                onClick={() => setInput('滚动 ')}
                title="预输入滚动指令"
              >
                {t('recorder:ai.quick.scroll') || '滚动'}
              </Button>
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
            </Space>
            <Space>
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
                icon={<SaveOutlined />}
                onClick={handleSaveTemplate}
                disabled={templateSteps.length === 0}
              >
                保存模版
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
            <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={handleDownloadScript}>
              下载
            </Button>,
          ]}
        >
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
    </Card>
  );
};

export default AIControls;