import React, { useState } from 'react';
import {
  Tag,
  Tooltip,
  Space,
  Button,
  Popconfirm,
  theme,
} from 'antd';
import {
  ApartmentOutlined,
  ApiOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckSquareOutlined,
  DeleteOutlined,
  EditOutlined,
  FileDoneOutlined,
  LockOutlined,
  RollbackOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type {
  WorkflowStageDefinition,
  AssembledBaseWorkflow,
} from '@/api/orgWorkflow';
import { STAGE_TYPE_CONFIG } from './orgVisualEditor.types';

interface OrgStageNodeCardProps {
  stage: WorkflowStageDefinition;
  index: number;
  totalCount: number;
  isSelected: boolean;
  assembledItems: AssembledBaseWorkflow[];
  onSelect: () => void;
  onDelete: () => void;
  onMove: (direction: 'prev' | 'next') => void;
  onDropBaseWorkflow: (baseId: string) => void;
  onRemoveAssembled: (refId: string) => void;
}

export const OrgStageNodeCard: React.FC<OrgStageNodeCardProps> = ({
  stage,
  index,
  totalCount,
  isSelected,
  assembledItems,
  onSelect,
  onDelete,
  onMove,
  onDropBaseWorkflow,
  onRemoveAssembled,
}) => {
  const { token } = theme.useToken();
  const [isDragOver, setIsDragOver] = useState(false);
  const cfg = STAGE_TYPE_CONFIG[stage.type] || STAGE_TYPE_CONFIG.submission;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const baseId = e.dataTransfer.getData('text/base-workflow-id');
    if (baseId) {
      onDropBaseWorkflow(baseId);
    }
  };

  const getStageIcon = () => {
    switch (stage.type) {
      case 'submission':
        return <EditOutlined style={{ color: cfg.color }} />;
      case 'approval':
        return <CheckSquareOutlined style={{ color: cfg.color }} />;
      case 'automation':
        return <ThunderboltOutlined style={{ color: cfg.color }} />;
      case 'archive':
        return <FileDoneOutlined style={{ color: cfg.color }} />;
      default:
        return <EditOutlined style={{ color: cfg.color }} />;
    }
  };

  const renderApproverBadge = () => {
    if (stage.type === 'submission') {
      return (
        <Tag color="blue" icon={<UserOutlined />}>
          发起人 / 普通员工
        </Tag>
      );
    }
    if (stage.type === 'automation') {
      return (
        <Tag color="purple" icon={<ThunderboltOutlined />}>
          系统自动调度
        </Tag>
      );
    }
    if (stage.type === 'archive') {
      return (
        <Tag color="green" icon={<FileDoneOutlined />}>
          凭证库 & GTD 回执
        </Tag>
      );
    }

    // stage.type === 'approval'
    switch (stage.approverRule) {
      case 'initiator':
        return (
          <Tag color="purple" icon={<UserOutlined />}>
            业务担当本人确认
          </Tag>
        );
      case 'department':
        return (
          <Tag color="geekblue" icon={<ApartmentOutlined />}>
            部门: {stage.approverDepartment || '法务部'}{stage.approverUsername ? ` (@${stage.approverUsername})` : ''}
          </Tag>
        );
      case 'specific_user':
        return (
          <Tag color="cyan" icon={<UserOutlined />}>
            指定用户: @{stage.approverUsername || '待指定'}
          </Tag>
        );
      case 'assignee':
        return (
          <Tag color="blue" icon={<UserOutlined />}>
            指派协同人
          </Tag>
        );
      case 'leader':
      default:
        return (
          <Tag color="gold" icon={<UserOutlined />}>
            直属主管审批
          </Tag>
        );
    }
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        width: 280,
        minHeight: 220,
        borderRadius: 12,
        background: token.colorBgContainer,
        border: isSelected
          ? `2px solid ${token.colorPrimary}`
          : isDragOver
          ? `2px dashed ${token.colorSuccess}`
          : stage.isLocked
          ? `1px solid ${token.colorWarningBorder || '#ffe58f'}`
          : `1px solid ${token.colorBorderSecondary}`,
        boxShadow: isSelected
          ? `0 6px 16px ${token.colorPrimaryBorder}`
          : isDragOver
          ? `0 6px 16px ${token.colorSuccessBorder}`
          : '0 2px 8px rgba(0,0,0,0.06)',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* 顶部彩色条 */}
      <div
        style={{
          height: 4,
          background: cfg.color,
          width: '100%',
        }}
      />

      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 头部：序号 + 类型标签 + 动作栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <Space size={6}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: cfg.bgColor,
                color: cfg.color,
                fontWeight: 700,
                fontSize: 11,
              }}
            >
              {index + 1}
            </span>
            <Tag color={cfg.color} style={{ margin: 0, fontSize: 11, padding: '0 6px' }}>
              {cfg.label}
            </Tag>
            {stage.isLocked && (
              <Tooltip title="核心合规基准节点：系统生命周期受控保护，禁止误删或跳过">
                <Tag
                  color="gold"
                  icon={<LockOutlined style={{ fontSize: 10 }} />}
                  style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}
                >
                  合规锁定
                </Tag>
              </Tooltip>
            )}
          </Space>

          <Space size={2} onClick={(e) => e.stopPropagation()}>
            <Tooltip title="左移步骤">
              <Button
                type="text"
                size="small"
                disabled={index === 0}
                icon={<ArrowLeftOutlined style={{ fontSize: 10 }} />}
                onClick={() => onMove('prev')}
                style={{ width: 22, height: 22 }}
              />
            </Tooltip>
            <Tooltip title="右移步骤">
              <Button
                type="text"
                size="small"
                disabled={index === totalCount - 1}
                icon={<ArrowRightOutlined style={{ fontSize: 10 }} />}
                onClick={() => onMove('next')}
                style={{ width: 22, height: 22 }}
              />
            </Tooltip>
            {totalCount > 1 && (
              stage.isLocked ? (
                <Tooltip title="核心合规基准节点受系统保护，不可删除">
                  <Button
                    type="text"
                    disabled
                    size="small"
                    icon={<LockOutlined style={{ fontSize: 11, color: '#faad14' }} />}
                    style={{ width: 22, height: 22 }}
                  />
                </Tooltip>
              ) : (
                <Popconfirm
                  title="确定删除此流程阶段？"
                  onConfirm={onDelete}
                  okText="删除"
                  cancelText="取消"
                >
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                    style={{ width: 22, height: 22 }}
                  />
                </Popconfirm>
              )
            )}
          </Space>
        </div>

        {/* 阶段名称与说明 */}
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: token.colorText,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={stage.name}
          >
            {getStageIcon()} <span style={{ marginLeft: 4 }}>{stage.name}</span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: token.colorTextSecondary,
              marginTop: 2,
              lineHeight: 1.4,
              height: 34,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
            title={stage.description}
          >
            {stage.description || cfg.description}
          </div>
        </div>

        {/* 办理人 / 部门徽标 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: token.colorTextTertiary, marginBottom: 4 }}>
            办理对象 / 审批人：
          </div>
          {renderApproverBadge()}
        </div>

        {/* 驳回回退指示 */}
        {stage.type === 'approval' && (
          <div style={{ marginBottom: 10 }}>
            <Tag color="volcano" icon={<RollbackOutlined />} style={{ fontSize: 11 }}>
              驳回回退: {stage.rollbackStageId ? `[阶段: ${stage.rollbackStageId}]` : '默认退回申请'}
            </Tag>
          </div>
        )}

        {/* 组装挂载的底层能力资产 (Drop Target) */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 8,
            borderTop: `1px dashed ${token.colorBorderSecondary}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 11, color: token.colorTextTertiary }}>
              挂载底层资产 ({assembledItems.length}):
            </span>
          </div>

          {assembledItems.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {assembledItems.map((item) => (
                <Tooltip
                  key={item.refId}
                  title={`资产: ${item.name} (${item.type}) | 触发: ${item.triggerEvent || '默认'}`}
                >
                  <Tag
                    color="purple"
                    closable
                    onClose={(e) => {
                      e.stopPropagation();
                      onRemoveAssembled(item.refId);
                    }}
                    style={{ margin: 0, fontSize: 11, maxWidth: '100%' }}
                  >
                    <ApiOutlined style={{ marginRight: 3 }} />
                    <span
                      style={{
                        maxWidth: 160,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'inline-block',
                        verticalAlign: 'bottom',
                      }}
                    >
                      {item.name}
                    </span>
                  </Tag>
                </Tooltip>
              ))}
            </div>
          ) : (
            <div
              style={{
                fontSize: 11,
                color: isDragOver ? token.colorSuccess : token.colorTextQuaternary,
                padding: '4px 6px',
                borderRadius: 4,
                background: isDragOver ? token.colorSuccessBg : token.colorFillAlter,
                textAlign: 'center',
              }}
            >
              {isDragOver ? '松开鼠标绑定此资产' : '可从左侧拖入基础技能组装'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
