import {
  CloseOutlined,
  FileDoneOutlined,
  FormOutlined,
  SafetyCertificateOutlined,
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
  mode?: 'bang' | 'at';
  username?: string;
  targetUser?: CollaboratorUser | null;
  searchQuery?: string;
  selectedIndex: number;
  onHoverIndex: (index: number) => void;
  onSelectWorkflow: (
    templateId: string,
    isModalAction?: boolean,
    workflowItem?: WorkflowOptionItem
  ) => void;
  onClose: () => void;
  onFilteredItemsChange?: (items: WorkflowOptionItem[]) => void;
}

const DEFAULT_TEMPLATES: WorkflowOptionItem[] = [
  {
    id: 'legal.contract.review_flow',
    name: '标准合同起草与法务审查闭环流',
    description: '商业合作与定制开发合同初稿填报，流转法务部合规审查与批注，通过自动归档存证',
    category: 'legal',
  },
  {
    id: 'legal.nda.generation_and_review_flow',
    name: '保密合同起草与法务审查闭环流',
    description: '专属保密合同生成与法务闭环审查，自动生成标准条款草案并流转专项审核',
    category: 'legal',
  },
];

export function WorkflowSelectionDropdown({
  open,
  mode = 'bang',
  username,
  searchQuery = '',
  selectedIndex,
  onHoverIndex,
  onSelectWorkflow,
  onClose,
  onFilteredItemsChange,
}: WorkflowSelectionDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: serverTemplates = [], isSuccess } = useQuery(
    ['workflowTemplates'],
    () => workbenchCoordinationApi.getWorkflowTemplates(),
    {
      staleTime: 5000,
      refetchOnWindowFocus: true,
      enabled: open,
    }
  );

  const allItems = useMemo<WorkflowOptionItem[]>(() => {
    const items: WorkflowOptionItem[] = [];
    const existingIds = new Set<string>();

    if (isSuccess && Array.isArray(serverTemplates)) {
      // 服务端已成功返回数据：以服务端发布的组织工作流为唯一准则（仅展示已发布且有权限的工作流，下架的工作流自动消失）
      for (const t of serverTemplates as WorkflowTemplateDefinition[]) {
        if (t.isPublished === false || t.status === 'draft') continue;
        const id = t.id || t.workflowId;
        if (!id || existingIds.has(id)) continue;

        items.push({
          id,
          name: t.name,
          description: t.description || '',
          category: t.category || 'general',
        });
        existingIds.add(id);
      }
    } else if (!isSuccess && DEFAULT_TEMPLATES.length > 0) {
      // 仅在首次加载尚未完成或离线网络异常时使用兜底
      for (const t of DEFAULT_TEMPLATES) {
        if (!existingIds.has(t.id)) {
          items.push(t);
          existingIds.add(t.id);
        }
      }
    }

    // 追加传统表单卡片选项
    items.push({
      id: 'custom.card.modal',
      name: '打开传统表单卡片 (弹窗填写)',
      description: '切换至结构化表单卡片填写（适合需要手动上传多个附件或调整复杂优先级的场景）',
      category: 'general',
      isModalAction: true,
    });

    return items;
  }, [serverTemplates, isSuccess]);

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
      case 'legal.nda.generation_and_review_flow':
        return <SafetyCertificateOutlined style={{ fontSize: 18, color: '#722ed1' }} />;
      case 'legal.contract.review_flow':
        return <SafetyCertificateOutlined style={{ fontSize: 18, color: '#2f54eb' }} />;
      case 'custom.card.modal':
        return <FormOutlined style={{ fontSize: 18, color: '#52c41a' }} />;
      default:
        return <FileDoneOutlined style={{ fontSize: 18, color: '#722ed1' }} />;
    }
  };

  const getCategoryBadge = (item: WorkflowOptionItem) => {
    if (item.isModalAction) {
      return <Tag color="green">表单卡片</Tag>;
    }
    switch (item.category) {
      case 'legal':
        return <Tag color="geekblue">法务审查</Tag>;
      case 'hr':
        return <Tag color="blue">HRMS 考勤</Tag>;
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
          <span>
            {mode === 'bang'
              ? '⚡ 选择组织工作流（选定后直接输入自然语言，无需卡片）'
              : '为协同成员发起工作流流程'}
          </span>
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
                onClick={() => onSelectWorkflow(item.id, item.isModalAction, item)}
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
          <span className={styles.kbd}>Enter</span> 选定工作流，<span className={styles.kbd}>Esc</span> 取消
        </span>
        <span style={{ color: 'var(--text-tertiary)' }}>
          {mode === 'bang' ? '💡 选定后直接在对话框输入自然语言即可调用' : '亦可继续打字进行普通对话'}
        </span>
      </div>
    </div>
  );
}
