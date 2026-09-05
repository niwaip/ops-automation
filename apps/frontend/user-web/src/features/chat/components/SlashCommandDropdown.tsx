import {
  CompassOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  MailOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Empty, Tag } from 'antd';
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
  onHoverIndex: (index: number) => void;
  onSelect: (command: SlashCommandDefinition) => void;
  onClose: () => void;
  onFilteredCommandsChange?: (commands: SlashCommandDefinition[]) => void;
}

function getCommandIcon(cmd: string) {
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
  onHoverIndex,
  onSelect,
  onClose: _onClose,
  onFilteredCommandsChange,
}: SlashCommandDropdownProps) {
  const filteredCommands = useMemo(() => {
    return matchSlashCommands(searchQuery);
  }, [searchQuery]);

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
            return (
              <div
                key={item.command}
                className={`${styles['slash-item']} ${isSelected ? styles['is-selected'] : ''}`}
                onMouseEnter={() => onHoverIndex(idx)}
                onClick={() => onSelect(item)}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%' }}>
                  <div style={{ fontSize: 18 }}>{getCommandIcon(item.command)}</div>
                  <div className={styles['slash-item-main']}>
                    <div className={styles['slash-item-title-row']}>
                      <span className={styles['slash-command-name']}>{item.command}</span>
                      <span className={styles['slash-command-title']}>{item.title}</span>
                      {item.badge && <Tag color="blue">{item.badge}</Tag>}
                      {item.aliases && item.aliases.length > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          别名: {item.aliases.join(', ')}
                        </span>
                      )}
                    </div>
                    <div className={styles['slash-item-desc']}>{item.description}</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles['slash-footer']}>
        <span>💡 提示：输入 <code>/doc 你的问题</code> 即可快速启动工作空间自主探查 Agent</span>
        <span>Esc 关闭</span>
      </div>
    </div>
  );
}
