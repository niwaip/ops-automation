import {
  CalendarOutlined,
  CloseOutlined,
  DollarOutlined,
  FileDoneOutlined,
  FormOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Empty, Tag } from 'antd';
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from 'react-query';
import {
  workbenchCoordinationApi,
  type CollaboratorUser,
  type WorkflowTemplateDefinition,
} from '../../../api/workbenchCoordination';
import styles from './WorkflowSelectionDropdown.module.css';

export interface WorkflowOptionItem {
  id: string;
  name: string;
  description: string;
  category: string;
  isModalAction?: boolean;
}

interface WorkflowSelectionDropdownProps {
  open: boolean;
  username: string;
  targetUser?: CollaboratorUser | null;
  searchQuery?: string;
  selectedIndex: number;
  onHoverIndex: (index: number) => void;
  onSelectWorkflow: (templateId: string, isModalAction?: boolean) => void;
  onClose: () => void;
  onFilteredItemsChange?: (items: WorkflowOptionItem[]) => void;
}

const DEFAULT_TEMPLATES: WorkflowOptionItem[] = [
  {
    id: 'hr.leave.request',
    name: '员工请假申请流程',
    description: '提交事假/年假/病假，审批核准后自动调用企业 HRMS 扣减额度',
    category: 'hr',
  },
  {
    id: 'oa.expense.claim',
    name: '差旅与费用报销审批',
    description: '填写报销明细与发票凭证，主管及财务审核，对接 ERP 财务网关',
    category: 'oa',
  },
  {
    id: 'general.coordination',
    name: '通用协同任务单',
    description: '布置工作事项，明确协同要求、交付标准与截止时间，推入收集箱',
    category: 'general',
  },
  {
    id: 'custom.card.modal',
    name: '打开完整规范卡片 (弹窗)',
    description: '在线填报结构化表单卡片，支持自定义优先级、时间与附件',
    category: 'general',
    isModalAction: true,
  },
];

export function WorkflowSelectionDropdown({
  open,
  username,
  searchQuery = '',
  selectedIndex,
  onHoverIndex,
  onSelectWorkflow,
  onClose,
  onFilteredItemsChange,
}: WorkflowSelectionDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: serverTemplates = [] } = useQuery(
    ['workflowTemplates'],
    () => workbenchCoordinationApi.getWorkflowTemplates(),
    {
      staleTime: 60000,
      enabled: open,
    }
  );

  const allItems = useMemo<WorkflowOptionItem[]>(() => {
    if (serverTemplates && serverTemplates.length > 0) {
      const mapped = serverTemplates.map((t: WorkflowTemplateDefinition) => ({
        id: t.id || t.workflowId,
        name: t.name,
        description: t.description,
        category: t.category,
      }));
      return [
        ...mapped,
        {
          id: 'custom.card.modal',
          name: '打开完整规范卡片 (弹窗)',
          description: '在线填报结构化表单卡片，支持自定义优先级、时间与附件',
          category: 'general',
          isModalAction: true,
        },
      ];
    }
    return DEFAULT_TEMPLATES;
  }, [serverTemplates]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems;
    const q = searchQuery.toLowerCase().trim();
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
    );
  }, [allItems, searchQuery]);

  useEffect(() => {
    onFilteredItemsChange?.(filteredItems);
  }, [filteredItems, onFilteredItemsChange]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !target.closest(`.${styles['workflow-dropdown']}`) &&
        !target.closest('textarea')
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, onClose]);

  if (!open) return null;

  const getItemIcon = (id: string) => {
    switch (id) {
      case 'hr.leave.request':
        return <CalendarOutlined style={{ fontSize: 18, color: '#1677ff' }} />;
      case 'oa.expense.claim':
        return <DollarOutlined style={{ fontSize: 18, color: '#fa8c16' }} />;
      case 'custom.card.modal':
        return <FormOutlined style={{ fontSize: 18, color: '#52c41a' }} />;
      default:
        return <FileDoneOutlined style={{ fontSize: 18, color: '#722ed1' }} />;
    }
  };

  const getCategoryBadge = (item: WorkflowOptionItem) => {
    if (item.isModalAction) {
      return <Tag color="green">直接弹窗</Tag>;
    }
    switch (item.category) {
      case 'hr':
        return <Tag color="blue">HRMS 联动</Tag>;
      case 'oa':
        return <Tag color="orange">财务/ERP</Tag>;
      default:
        return <Tag color="purple">协同工作流</Tag>;
    }
  };

  return (
    <div ref={containerRef} className={styles['workflow-dropdown']}>
      <div className={styles['workflow-header']}>
        <div className={styles['workflow-title']}>
          <ThunderboltOutlined style={{ color: '#722ed1', fontSize: 16 }} />
          <span>为协同成员发起工作流流程卡片</span>
          {username ? (
            <Tag color="purple" style={{ borderRadius: 10, fontSize: 12 }}>
              @{username}
            </Tag>
          ) : null}
        </div>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined style={{ fontSize: 12 }} />}
          onClick={onClose}
        />
      </div>

      <div className={styles['workflow-list']}>
        {filteredItems.length === 0 ? (
          <div style={{ padding: '24px 0' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={searchQuery ? `未找到与 "${searchQuery}" 匹配的工作流` : '暂无可用工作流'}
            />
          </div>
        ) : (
          filteredItems.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={item.id}
                className={`${styles['workflow-item']} ${isSelected ? styles['is-selected'] : ''}`}
                onMouseEnter={() => onHoverIndex(idx)}
                onClick={() => onSelectWorkflow(item.id, item.isModalAction)}
              >
                <div style={{ paddingTop: 2 }}>{getItemIcon(item.id)}</div>
                <div className={styles['workflow-item-main']}>
                  <div className={styles['workflow-item-title-row']}>
                    <span className={styles['workflow-item-name']}>{item.name}</span>
                    {getCategoryBadge(item)}
                    <span className={styles['workflow-item-id']}>({item.id})</span>
                  </div>
                  <div className={styles['workflow-item-desc']}>{item.description}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles['workflow-footer']}>
        <span>
          <span className={styles.kbd}>↑</span> <span className={styles.kbd}>↓</span> 切换，
          <span className={styles.kbd}>Enter</span> 选定流程卡片，<span className={styles.kbd}>Esc</span> 取消
        </span>
        <span style={{ color: 'var(--text-tertiary)' }}>亦可继续打字进行普通对话</span>
      </div>
    </div>
  );
}
