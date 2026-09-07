import {
  CompassOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  LockOutlined,
  MailOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Empty, Tag, message as antdMessage } from 'antd';
import { useEffect, useMemo } from 'react';
import {
  matchSlashCommands,
  type SlashCommandDefinition,
} from '../lib/slashCommands';
import styles from './SlashCommandDropdown.module.css';

interface SlashCommandDropdownProps {
  open: boolean;
  searchQuery: string;
  selectedIndex: number;
  chatMode?: 'chat' | 'task';
  onHoverIndex: (index: number) => void;
  onSelect: (command: SlashCommandDefinition) => void;
  onClose: () => void;
  onFilteredCommandsChange?: (commands: SlashCommandDefinition[]) => void;
}

function getCommandIcon(cmd: string, disabled?: boolean) {
  if (disabled) {
    return <LockOutlined style={{ color: '#8c8c8c' }} />;
  }
  if (cmd === '/doc' || cmd === '/workspace' || cmd === '/rag') {
    return <FileSearchOutlined style={{ color: '#1677ff' }} />;
  }
  if (cmd === '/search' || cmd === '/web') {
    return <GlobalOutlined style={{ color: '#52c41a' }} />;
  }
  if (cmd === '/extract' || cmd === '/pdf') {
    return <CompassOutlined style={{ color: '#fa8c16' }} />;
  }
  if (cmd === '/email') {
    return <MailOutlined style={{ color: '#eb2f96' }} />;
  }
  return <ThunderboltOutlined style={{ color: '#722ed1' }} />;
}

export function SlashCommandDropdown({
  open,
  searchQuery,
  selectedIndex,
  chatMode = 'task',
  onHoverIndex,
  onSelect,
  onClose: _onClose,
  onFilteredCommandsChange,
}: SlashCommandDropdownProps) {
  const filteredCommands = useMemo(() => {
    return matchSlashCommands(searchQuery, chatMode);
  }, [searchQuery, chatMode]);

  useEffect(() => {
    onFilteredCommandsChange?.(filteredCommands);
  }, [filteredCommands, onFilteredCommandsChange]);

  if (!open) return null;

  return (
    <div className={styles['slash-dropdown']}>
      <div className={styles['slash-header']}>
        <div className={styles['slash-title']}>
          <ThunderboltOutlined style={{ color: 'var(--primary-color)' }} />
          <span>内置技能快捷指令 (Slash Commands)</span>
          {chatMode === 'chat' ? (
            <Tag color="orange" style={{ marginLeft: 6, fontSize: 11 }}>个人模式</Tag>
          ) : (
            <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>工作模式</Tag>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          按 <kbd>↑</kbd> <kbd>↓</kbd> 切换，<kbd>Enter</kbd> 选用
        </span>
      </div>

      <div className={styles['slash-list']}>
        {filteredCommands.length === 0 ? (
          <div style={{ padding: '24px 0' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span>未找到指令 "{searchQuery}"</span>}
            />
          </div>
        ) : (
          filteredCommands.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            const isDisabled = Boolean(item.disabled);
            return (
              <div
                key={item.command}
                className={`${styles['slash-item']} ${isSelected ? styles['is-selected'] : ''}`}
                style={isDisabled ? { opacity: 0.55, cursor: 'not-allowed', filter: 'grayscale(0.4)' } : undefined}
                onMouseEnter={() => onHoverIndex(idx)}
                onClick={() => {
                  if (isDisabled) {
                    void antdMessage.warning(
                      item.disabledReason ||
                        '个人模式下不能调用工作能力。如需使用企业技能，请在左下方切换至「工作模式」。'
                    );
                    return;
                  }
                  onSelect(item);
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%' }}>
                  <div style={{ fontSize: 18 }}>{getCommandIcon(item.command, isDisabled)}</div>
                  <div className={styles['slash-item-main']}>
                    <div className={styles['slash-item-title-row']}>
                      <span className={styles['slash-command-name']}>{item.command}</span>
                      <span className={styles['slash-command-title']}>{item.title}</span>
                      {isDisabled ? (
                        <Tag color="default">个人模式禁用</Tag>
                      ) : (
                        item.badge && <Tag color={item.scope === 'work' ? 'blue' : 'green'}>{item.badge}</Tag>
                      )}
                      {item.aliases && item.aliases.length > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          别名: {item.aliases.join(', ')}
                        </span>
                      )}
                    </div>
                    <div className={styles['slash-item-desc']}>
                      {isDisabled ? item.disabledReason : item.description}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles['slash-footer']}>
        {chatMode === 'chat' ? (
          <span style={{ color: '#d97706' }}>
            💡 个人模式专属：仅提供自由问答与个人知识沙箱，工作空间文档与企业自动化技能已禁用
          </span>
        ) : (
          <span>💡 提示：输入 <code>/doc 你的问题</code> 即可快速启动工作空间自主探查 Agent</span>
        )}
        <span>Esc 关闭</span>
      </div>
    </div>
  );
}
