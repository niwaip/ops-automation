import React, { useState, useRef, useEffect } from 'react';
import { Card, Input, Button, Space, Typography, Tag, Empty, message, Divider, Alert, Collapse, InputNumber } from 'antd';
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
  TextToolOutlined,
  CloudUploadOutlined,
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

interface AIControlsProps {
  onCommandExecuted?: (commands: MCPCommand[]) => void;
}

const AIControls: React.FC<AIControlsProps> = ({ onCommandExecuted }) => {
  const { t } = useTranslation(['common', 'recorder']);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<CommandHistoryEntry[]>([]);
  const [isBrowserReady, setIsBrowserReady] = useState(false);
  const [waitDuration, setWaitDuration] = useState(20); // Default 20 seconds
  const [showParamInput, setShowParamInput] = useState<string | null>(null);
  const [paramValue, setParamValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Auto init browser if needed
  const ensureBrowserReady = async () => {
    if (!isBrowserReady) {
      await initBrowserMutation.mutateAsync();
    }
  };

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

    // Add to history
    setHistory((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: 'user',
        content: `快捷操作: ${command}${params ? ` (${JSON.stringify(params)})` : ''}`,
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

  // AI-assisted quick actions with parameter input
  const handleAIQuickAction = async (commandTemplate: string, paramLabel: string) => {
    if (!paramValue.trim()) {
      message.warning('请输入参数');
      return;
    }

    const fullCommand = `${commandTemplate} ${paramValue.trim()}`;

    // Add to history
    setHistory((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: 'user',
        content: fullCommand,
        timestamp: new Date(),
      },
    ]);

    // Clear param input
    setParamValue('');
    setShowParamInput(null);

    // Auto init browser if not ready
    if (!isBrowserReady) {
      try {
        await initBrowserMutation.mutateAsync();
      } catch (e) {
        return;
      }
    }

    // Parse with AI
    parseCommandMutation.mutate(fullCommand);
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  const handleCopyCommand = (command: MCPCommand) => {
    navigator.clipboard.writeText(JSON.stringify(command, null, 2));
    message.success(t('common:copied'));
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

          {/* Fixed commands - direct execution */}
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

            <Divider type="vertical" style={{ height: 24 }} />

            {/* AI-assisted commands - need parameter input */}
            <Button
              size="small"
              icon={<FileSearchOutlined />}
              onClick={() => setShowParamInput(showParamInput === 'navigate' ? null : 'navigate')}
              type={showParamInput === 'navigate' ? 'primary' : 'default'}
              title="打开网页（AI辅助）"
            >
              {t('recorder:ai.quick.navigate') || '打开'}
            </Button>

            <Button
              size="small"
              icon={<TextToolOutlined />}
              onClick={() => setShowParamInput(showParamInput === 'click' ? null : 'click')}
              type={showParamInput === 'click' ? 'primary' : 'default'}
              title="点击元素（AI辅助）"
            >
              {t('recorder:ai.quick.click') || '点击'}
            </Button>

            <Button
              size="small"
              icon={<ArrowDownOutlined />}
              onClick={() => setShowParamInput(showParamInput === 'scroll' ? null : 'scroll')}
              type={showParamInput === 'scroll' ? 'primary' : 'default'}
              title="滚动页面"
            >
              {t('recorder:ai.quick.scroll') || '滚动'}
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
          </Space>

          {/* Parameter input modal for AI-assisted commands */}
          {showParamInput && (
            <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 8 }}>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  size="small"
                  value={paramValue}
                  onChange={(e) => setParamValue(e.target.value)}
                  placeholder={
                    showParamInput === 'navigate' ? '输入网址或网站名称（如：微博、github.com）' :
                    showParamInput === 'click' ? '输入要点击的元素（如：登录按钮、第一个结果）' :
                    showParamInput === 'scroll' ? '输入滚动方向（如：向下、底部、向上）' :
                    '输入参数'
                  }
                  onPressEnter={(e) => {
                    e.preventDefault();
                    const templates: Record<string, string> = {
                      navigate: '打开',
                      click: '点击',
                      scroll: '滚动',
                    };
                    handleAIQuickAction(templates[showParamInput] || '', showParamInput);
                  }}
                  style={{ borderRadius: '6px 0 0 6px' }}
                />
                <Button
                  size="small"
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={() => {
                    const templates: Record<string, string> = {
                      navigate: '打开',
                      click: '点击',
                      scroll: '滚动',
                    };
                    handleAIQuickAction(templates[showParamInput] || '', showParamInput);
                  }}
                  disabled={!paramValue.trim()}
                  style={{ borderRadius: '0 6px 6px 0' }}
                >
                  发送
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setShowParamInput(null);
                    setParamValue('');
                  }}
                >
                  取消
                </Button>
              </Space.Compact>
            </div>
          )}
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
      </Space>
    </Card>
  );
};

export default AIControls;