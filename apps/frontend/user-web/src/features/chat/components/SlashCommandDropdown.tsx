import {
  CompassOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  LockOutlined,
  MailOutlined,
  ThunderboltOutlined,
  FundProjectionScreenOutlined,
  RadarChartOutlined,
  TableOutlined,
  FileWordOutlined,
  FilePdfOutlined,
  PictureOutlined,
  LayoutOutlined,
  ClearOutlined,
  QuestionCircleOutlined,
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

  // 个人沙箱生产力与调研工具链
  if (cmd === '/ppt' || cmd === '/slides' || cmd === '/deck') {
    return <FundProjectionScreenOutlined style={{ color: '#fa541c' }} />;
  }
  if (cmd === '/research' || cmd === '/last30days' || cmd === '/调研') {
    return <RadarChartOutlined style={{ color: '#13c2c2' }} />;
  }
  if (cmd === '/excel' || cmd === '/xlsx' || cmd === '/table' || cmd === '/表格') {
    return <TableOutlined style={{ color: '#52c41a' }} />;
  }
  if (cmd === '/word' || cmd === '/docx') {
    return <FileWordOutlined style={{ color: '#1677ff' }} />;
  }
  if (cmd === '/pdf' || cmd === '/form') {
    return <FilePdfOutlined style={{ color: '#f5222d' }} />;
  }
  if (cmd === '/image' || cmd === '/draw' || cmd === '/生图') {
    return <PictureOutlined style={{ color: '#722ed1' }} />;
  }
  if (cmd === '/design' || cmd === '/ui' || cmd === '/prototype') {
    return <LayoutOutlined style={{ color: '#2f54eb' }} />;
  }

  // 工作模式企业能力
  if (cmd === '/doc' || cmd === '/workspace' || cmd === '/rag') {
    return <FileSearchOutlined style={{ color: '#1677ff' }} />;
  }
  if (cmd === '/extract') {
    return <CompassOutlined style={{ color: '#fa8c16' }} />;
  }
  if (cmd === '/email') {
    return <MailOutlined style={{ color: '#eb2f96' }} />;
  }

  // 通用管理与工具
  if (cmd === '/search' || cmd === '/web') {
    return <GlobalOutlined style={{ color: '#52c41a' }} />;
  }
  if (cmd === '/clear' || cmd === '/new' || cmd === '/reset' || cmd === '/新会话') {
    return <ClearOutlined style={{ color: '#faad14' }} />;
  }
  if (cmd === '/help' || cmd === '/?' || cmd === '/帮助') {
    return <QuestionCircleOutlined style={{ color: '#8c8c8c' }} />;
  }

  return <ThunderboltOutlined style={{ color: '#722ed1' }} />;
}

function getBadgeColor(scope?: string) {
  if (scope === 'personal') return 'orange';
  if (scope === 'work') return 'blue';
  return 'green';
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
          <span>{chatMode === 'chat' ? '个人沙箱快捷指令' : '工作模式协同指令'} (Slash Commands)</span>
          {chatMode === 'chat' ? (
            <Tag color="orange" style={{ marginLeft: 6, fontSize: 11 }}>个人模式 · 独立沙箱</Tag>
          ) : (
            <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>工作模式 · 企业协同</Tag>
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
                      item.disabledReason || '当前指令不可用'
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
                        <Tag color="default">模式禁用</Tag>
                      ) : (
                        item.badge && <Tag color={getBadgeColor(item.scope)}>{item.badge}</Tag>
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
            💡 个人模式专属：支持 /ppt, /research, /excel 等独立生产力工具链（与工作模式完全解耦）
          </span>
        ) : (
          <span>💡 工作模式提示：输入 <code>/doc 你的问题</code> 即可快速启动工作空间自主探查 Agent</span>
        )}
        <span>Esc 关闭</span>
      </div>
    </div>
  );
}
