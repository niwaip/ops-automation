import React, { useState } from 'react';
import { Drawer, Button, Space, message, theme } from 'antd';
import {
  RobotOutlined,
  CheckOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useMutation } from 'react-query';
import {
  orgWorkflowApi,
  StageWorkflowDraft,
  StageFlowMode,
  AvailableBaseWorkflowItem,
} from '@/api/orgWorkflow';
import { StageWorkflowAiChatPanel } from './StageWorkflowAiChatPanel';
import { StageWorkflowDraftPreview } from './StageWorkflowDraftPreview';
import { StageAiMessage } from './stageWorkflowAi.types';

interface StageWorkflowAiDrawerProps {
  visible: boolean;
  onClose: () => void;
  onWorkflowCreated: (workflow: AvailableBaseWorkflowItem) => void;
  onOpenInFullEditor?: (draft: StageWorkflowDraft) => void;
}

export const StageWorkflowAiDrawer: React.FC<StageWorkflowAiDrawerProps> = ({
  visible,
  onClose,
  onWorkflowCreated,
  onOpenInFullEditor,
}) => {
  const { token } = theme.useToken();

  const [messages, setMessages] = useState<StageAiMessage[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content:
        '您好！我是流程专用原子流 AI 架构师。您可以向我描述业务流转目标（例如：审批通过后调用人事系统扣减额度；或调用浏览器录制模版在外部系统填单）。我将为您生成标准 DSL、真实代码、端对端验证与固定接口契约。',
      timestamp: Date.now(),
    },
  ]);

  const [currentDraft, setCurrentDraft] = useState<StageWorkflowDraft | null>(null);
  const [inputPrompt, setInputPrompt] = useState('');
  const [selectedMode, setSelectedMode] = useState<StageFlowMode | 'auto'>('auto');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined);
  const [credentialKey, setCredentialKey] = useState('');

  // AI 生成 Draft
  const generateMutation = useMutation(
    (promptText: string) =>
      orgWorkflowApi.generateStageFlowAiDraft({
        prompt: promptText,
        preferredMode: selectedMode === 'auto' ? undefined : selectedMode,
        templateId: selectedTemplateId,
        credentialSecretKey: credentialKey.trim() || undefined,
      }),
    {
      onSuccess: (draft) => {
        setCurrentDraft(draft);
        const assistantMsg: StageAiMessage = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: `已为您生成原子工作流【${draft.name}】（阶段：${draft.stageType}，执行方式：${draft.executionMode === 'api' ? 'API 直接更新' : '浏览器模版执行'}）。经办担当规则：${draft.handlerRule}。已构建标准 DSL 与端对端测试环境，您可以在右侧检查、验证代码或直接保存。`,
          draft,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      },
      onError: (err: any) => {
        message.error(`AI 生成失败: ${err?.message || '未知错误'}`);
      },
    }
  );

  // 保存并入库
  const saveMutation = useMutation(
    (draft: StageWorkflowDraft) => {
      const payload: AvailableBaseWorkflowItem = {
        type: 'execution_flow',
        id: draft.id,
        name: draft.name,
        category: draft.category,
        stageType: draft.stageType,
        handlerRule: draft.handlerRule,
        requiredMetadata: draft.requiredMetadata,
        description: draft.description,
        workflowDsl: draft.workflowDsl,
        activityDsl: draft.activityDsl,
        generatedCode: draft.generatedCode,
        validationStatus: draft.validationStatus || 'validated',
        validationScore: draft.validationScore || 100,
        hasGeneratedCode: !!draft.generatedCode,
      };
      return orgWorkflowApi.createBaseWorkflow(payload);
    },
    {
      onSuccess: (registered) => {
        message.success(`已成功将「${registered.name}」注册至流程专用原子流资产库！`);
        onWorkflowCreated(registered);
        onClose();
      },
      onError: (err: any) => {
        message.error(`保存工作流失败: ${err?.message || '未知错误'}`);
      },
    }
  );

  const handleSendMessage = () => {
    const text = inputPrompt.trim();
    if (!text) return;

    const userMsg: StageAiMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    generateMutation.mutate(text);
  };

  const handleSave = () => {
    if (!currentDraft) {
      message.warning('尚未生成工作流草稿');
      return;
    }
    saveMutation.mutate(currentDraft);
  };

  return (
    <Drawer
      open={visible}
      onClose={onClose}
      title={
        <Space>
          <RobotOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
          <span>AI 对话创建流程专用原子工作流</span>
        </Space>
      }
      width={1120}
      styles={{
        body: { padding: 0, display: 'flex', height: '100%', overflow: 'hidden' },
      }}
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 8px',
          }}
        >
          <Space>
            <Button icon={<CloseOutlined />} onClick={onClose}>
              取消
            </Button>
          </Space>
          <Space>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              disabled={!currentDraft}
              loading={saveMutation.isLoading}
              onClick={handleSave}
            >
              保存并发布至原子资产库
            </Button>
          </Space>
        </div>
      }
    >
      <div style={{ display: 'flex', width: '100%', height: '100%' }}>
        {/* 左侧对话面板 */}
        <StageWorkflowAiChatPanel
          messages={messages}
          inputPrompt={inputPrompt}
          setInputPrompt={setInputPrompt}
          selectedMode={selectedMode}
          setSelectedMode={setSelectedMode}
          selectedTemplateId={selectedTemplateId}
          setSelectedTemplateId={setSelectedTemplateId}
          credentialKey={credentialKey}
          setCredentialKey={setCredentialKey}
          onSendMessage={handleSendMessage}
          loading={generateMutation.isLoading}
        />

        {/* 右侧实时草稿预览面板 */}
        <StageWorkflowDraftPreview
          draft={currentDraft}
          onOpenInFullEditor={onOpenInFullEditor}
          onDraftCodeUpdated={(code) =>
            setCurrentDraft((prev) =>
              prev ? { ...prev, generatedCode: code, hasGeneratedCode: true } : null
            )
          }
        />
      </div>
    </Drawer>
  );
};
