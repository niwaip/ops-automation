import React from 'react';
import { Button, Modal, Tag, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { PromptDebugPayload } from '../types';

const { Paragraph, Text } = Typography;

interface PromptDebugModalProps {
  promptDebug?: PromptDebugPayload;
  open: boolean;
  hasDetailedLlmCalls: boolean;
  onClose: () => void;
  onCopy: () => void;
}

const PromptDebugModal: React.FC<PromptDebugModalProps> = ({
  promptDebug,
  open,
  hasDetailedLlmCalls,
  onClose,
  onCopy,
}) => {
  if (!promptDebug) {
    return null;
  }

  return (
    <Modal
      title="本轮 Prompt"
      open={open}
      onCancel={onClose}
      width={960}
      destroyOnHidden
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={onCopy}>
          复制 Prompt
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          关闭
        </Button>,
      ]}
    >
      <div className="chat-prompt-viewer">
        <Paragraph type="secondary" className="chat-prompt-viewer-hint">
          仅管理员可见，用于查看当前这轮发送给模型的完整 Prompt。
        </Paragraph>
        <div className="chat-prompt-meta-row">
          <Text strong>Debug Source</Text>
          <div className="chat-prompt-tag-list">
            <Tag>{promptDebug.debugSource || 'unknown'}</Tag>
            {promptDebug.modelId ? <Tag>{promptDebug.modelId}</Tag> : null}
          </div>
        </div>
        {(promptDebug.notes || []).length ? (
          <div className="chat-prompt-section">
            <div className="chat-prompt-section-title">Notes</div>
            <pre className="chat-prompt-pre">{(promptDebug.notes || []).join('\n')}</pre>
          </div>
        ) : null}
        <div className="chat-prompt-meta-row">
          <Text strong>System Sections</Text>
          <div className="chat-prompt-tag-list">
            {(promptDebug.systemPromptSectionKeys || []).length ? (
              promptDebug.systemPromptSectionKeys?.map((key) => (
                <Tag key={`system-${key}`}>{key}</Tag>
              ))
            ) : (
              <Text type="secondary">无</Text>
            )}
          </div>
        </div>
        <div className="chat-prompt-meta-row">
          <Text strong>User Sections</Text>
          <div className="chat-prompt-tag-list">
            {(promptDebug.userPromptSectionKeys || []).length ? (
              promptDebug.userPromptSectionKeys?.map((key) => <Tag key={`user-${key}`}>{key}</Tag>)
            ) : (
              <Text type="secondary">无</Text>
            )}
          </div>
        </div>
        <div className="chat-prompt-section">
          <div className="chat-prompt-section-title">System Prompt</div>
          <pre className="chat-prompt-pre">{promptDebug.systemPrompt}</pre>
        </div>
        <div className="chat-prompt-section">
          <div className="chat-prompt-section-title">User Prompt</div>
          <pre className="chat-prompt-pre">{promptDebug.userPrompt}</pre>
        </div>
        {!hasDetailedLlmCalls ? (
          <>
            <div className="chat-prompt-section">
              <div className="chat-prompt-section-title">LLM Request Messages</div>
              <pre className="chat-prompt-pre">
                {JSON.stringify(promptDebug.llmRequestMessages || [], null, 2)}
              </pre>
            </div>
            <div className="chat-prompt-section">
              <div className="chat-prompt-section-title">LLM Raw Response</div>
              <pre className="chat-prompt-pre">
                {promptDebug.llmResponseText || '当前仅记录了 Prompt，尚未保存模型原始回复。'}
              </pre>
            </div>
          </>
        ) : null}
        {(promptDebug.llmCalls || []).map((call, index) => (
          <div className="chat-prompt-section" key={`${call.stage}-${index}`}>
            <div className="chat-prompt-section-title">{`LLM Call ${index + 1}: ${call.label}`}</div>
            <pre className="chat-prompt-pre">
              {JSON.stringify(call.requestMessages || [], null, 2)}
            </pre>
            <pre className="chat-prompt-pre">
              {call.responseText || call.note || '当前调用还没有保存 response。'}
            </pre>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default PromptDebugModal;
