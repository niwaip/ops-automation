import React from 'react';
import { RobotOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import type { ChatTaskContext } from '../chatStore';
import {
  PARAM_LABEL_MAP,
  IGNORED_TASK_CONTEXT_PARAM_KEYS,
} from '../lib/chatComposerConstants';
import styles from '../pages/ChatPage.module.css';

interface UserChatTaskContextBarProps {
  taskContext: ChatTaskContext;
  onClear: () => void;
  onSelectSuggestion: (suggestion: string) => void;
}

export const UserChatTaskContextBar: React.FC<UserChatTaskContextBarProps> = ({
  taskContext,
  onClear,
  onSelectSuggestion,
}) => {
  const isContractComparator =
    taskContext.workflowId === 'platform.document.contract-comparator';

  const suggestions = isContractComparator
    ? [
        '比较合同',
        '比对新旧版本条款差异与红线',
        '重点排查保密期限与违约金变更',
        '生成合同修订前后并排比对报告',
      ]
    : [
        '对比审查文档差异与合规风险',
        '提取文档要点并给出批注建议',
        '基于业务要求重新生成初稿',
        '总结任务要求与后续办理事项',
      ];

  const parameters = taskContext.parameters || {};
  const filteredParams = Object.entries(parameters).filter(
    ([k]) => !IGNORED_TASK_CONTEXT_PARAM_KEYS.has(k)
  );

  return (
    <div className={styles['user-chat-task-context-bar']}>
      <div className={styles['user-chat-task-context-header']}>
        <div className={styles['user-chat-task-context-badge']}>
          <RobotOutlined style={{ color: '#722ed1', fontSize: 13 }} />
          <span style={{ fontWeight: 600, fontSize: 12, color: '#722ed1' }}>
            {isContractComparator
              ? '已载入两份合同版本 · 准备比对与红线审查'
              : '已带入协同任务上下文'}
          </span>
          {taskContext.workflowId ? (
            <Tag
              color="purple"
              style={{
                margin: 0,
                fontSize: 10,
                padding: '0 4px',
                lineHeight: '18px',
              }}
            >
              {isContractComparator
                ? '合同文档智能比对与红线审查'
                : taskContext.workflowId}
            </Tag>
          ) : null}
        </div>
        <Button
          type="text"
          size="small"
          className={styles['user-chat-task-context-close-btn']}
          onClick={onClear}
          title="取消关联此任务上下文"
        >
          × 取消带入
        </Button>
      </div>
      <div className={styles['user-chat-task-context-body']}>
        <div className={styles['user-chat-task-context-title']}>
          <strong>任务：</strong>
          {taskContext.taskTitle}
        </div>
        {filteredParams.length > 0 ? (
          <div className={styles['user-chat-task-context-params']}>
            <strong>要求要件：</strong>
            {filteredParams
              .map(([k, v]) => `${PARAM_LABEL_MAP[k] || k}: ${v}`)
              .join('； ')}
          </div>
        ) : null}
      </div>
      <div className={styles['user-chat-task-context-suggestions']}>
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            marginRight: 4,
          }}
        >
          快捷输入：
        </span>
        {suggestions.map((suggestion) => (
          <Tag
            key={suggestion}
            className={styles['user-chat-suggestion-pill']}
            onClick={() => onSelectSuggestion(suggestion)}
          >
            {suggestion}
          </Tag>
        ))}
      </div>
    </div>
  );
};
