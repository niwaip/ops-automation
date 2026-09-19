import React, { useState } from 'react';
import {
  Input,
  Select,
  Tag,
  Typography,
  Space,
  Button,
  Alert,
  Switch,
  Tooltip,
  theme,
} from 'antd';
import {
  ApartmentOutlined,
  ApiOutlined,
  CheckSquareOutlined,
  CloseOutlined,
  DeleteOutlined,
  ExportOutlined,
  LockOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type {
  WorkflowStageDefinition,
  AssembledBaseWorkflow,
  StageType,
} from '@/api/orgWorkflow';
import { STAGE_TYPE_CONFIG } from './orgVisualEditor.types';
import {
  useWorkflowCapabilityOptions,
  resolveCanonicalCapabilityKey,
} from '../../hooks/useWorkflowCapabilityOptions';
import { useOrganizationMembers } from '../../hooks/useOrganizationMembers';

const { Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface OrgStageInspectorProps {
  selectedStage: WorkflowStageDefinition | null;
  allStages: WorkflowStageDefinition[];
  assembledWorkflows: AssembledBaseWorkflow[];
  onUpdateStage: (patch: Partial<WorkflowStageDefinition>) => void;
  onRemoveAssembled: (refId: string) => void;
  onUpdateAssembledTrigger: (
    refId: string,
    trigger: 'on_submit' | 'on_stage_approval' | 'on_approve' | 'on_complete'
  ) => void;
  onDeselect: () => void;
}



export const OrgStageInspector: React.FC<OrgStageInspectorProps> = ({
  selectedStage,
  allStages,
  assembledWorkflows,
  onUpdateStage,
  onRemoveAssembled,
  onUpdateAssembledTrigger,
  onDeselect,
}) => {
  const { token } = theme.useToken();
  const [collapsed, setCollapsed] = useState(false);
  const { departmentOptions, memberOptions } = useOrganizationMembers();

  const rawCapabilityOrWorkflow =
    selectedStage?.capabilityId ||
    selectedStage?.workflowId ||
    (selectedStage?.type === 'automation' && selectedStage?.name?.includes('审查')
      ? 'platform.document.contract-reviewer'
      : '');
  const canonicalCapabilityId = resolveCanonicalCapabilityKey(rawCapabilityOrWorkflow);
  const {
    capabilityGroups,
    capabilityMap,
    selectedCapability,
    isLoading: isLoadingCapabilities,
  } = useWorkflowCapabilityOptions(canonicalCapabilityId);

  if (collapsed) {
    return (
      <div
        style={{
          width: 44,
          height: '100%',
          borderLeft: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '10px 0',
          gap: 10,
          flexShrink: 0,
          transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <Tooltip title="展开阶段属性面板" placement="left">
          <Button
            type="text"
            size="small"
            icon={<MenuFoldOutlined style={{ fontSize: 13 }} />}
            onClick={() => setCollapsed(false)}
            style={{ width: 32, height: 32 }}
          />
        </Tooltip>

        <div style={{ width: '60%', height: 1, background: token.colorBorderSecondary }} />

        <Tooltip
          title={selectedStage ? `当前配置节点：${selectedStage.name} (点击展开)` : '全局流程属性 (点击展开)'}
          placement="left"
        >
          <Button
            type={selectedStage ? 'primary' : 'text'}
            size="small"
            icon={<SettingOutlined style={{ fontSize: 14 }} />}
            onClick={() => setCollapsed(false)}
            style={{ width: 32, height: 32 }}
          />
        </Tooltip>

        <div
          style={{
            writingMode: 'vertical-rl',
            letterSpacing: 4,
            fontSize: 11,
            color: token.colorTextTertiary,
            marginTop: 10,
            userSelect: 'none',
          }}
        >
          {selectedStage ? '阶段配置' : '全局属性'}
        </div>
      </div>
    );
  }

  if (!selectedStage) {
    return (
      <div
        style={{
          width: 320,
          height: '100%',
          borderLeft: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Space size={6}>
            <SettingOutlined style={{ color: token.colorTextSecondary }} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>全局流程属性</span>
          </Space>
          <Tooltip title="收起面板">
            <Button
              type="text"
              size="small"
              icon={<MenuUnfoldOutlined style={{ fontSize: 13 }} />}
              onClick={() => setCollapsed(true)}
              style={{ width: 28, height: 28, padding: 0 }}
            />
          </Tooltip>
        </div>
        <div
          style={{
            flex: 1,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <SettingOutlined style={{ fontSize: 36, color: token.colorTextQuaternary, marginBottom: 12 }} />
          <div style={{ fontWeight: 600, color: token.colorText, marginBottom: 6 }}>
            全局流程属性
          </div>
          <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>
            点击画布中的任意阶段卡片，即可在此配置该阶段的审批对象（如法务部门）、驳回回退规则与绑定的底层工作流。
          </Text>
        </div>
      </div>
    );
  }

  const currentStageAssembled = assembledWorkflows.filter(
    (w) => w.stageType === selectedStage.type || (!w.stageType && selectedStage.type === 'automation')
  );

  const precedingStages = allStages.filter(
    (s) => s.id !== selectedStage.id
  );

  return (
    <div
      style={{
        width: 320,
        height: '100%',
        borderLeft: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* 头部 */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Space size={6}>
          <SettingOutlined style={{ color: token.colorPrimary }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>阶段属性检视</span>
          <Tag color={STAGE_TYPE_CONFIG[selectedStage.type]?.color || 'blue'}>
            {STAGE_TYPE_CONFIG[selectedStage.type]?.label || selectedStage.type}
          </Tag>
        </Space>
        <Space size={4}>
          <Tooltip title="收起属性面板">
            <Button
              type="text"
              size="small"
              icon={<MenuUnfoldOutlined style={{ fontSize: 13 }} />}
              onClick={() => setCollapsed(true)}
              style={{ width: 28, height: 28, padding: 0 }}
            />
          </Tooltip>
          <Tooltip title="取消选中阶段">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined style={{ fontSize: 11 }} />}
              onClick={onDeselect}
              style={{ width: 28, height: 28, padding: 0 }}
            />
          </Tooltip>
        </Space>
      </div>

      {/* 属性表单 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 合规锁定提示 */}
          {selectedStage.isLocked && (
            <Alert
              type="warning"
              showIcon
              message="企业核心合规基准节点已受控锁定"
              description="此节点为法务合规/存证闭环的核心节点，阶段类型与存在性受系统锁定保护，不可删除或降级；您仍可灵活自定义受理部门（如法务部）、审批规则与驳回目标。"
              style={{ fontSize: 12, padding: '8px 12px' }}
            />
          )}

          {/* 阶段名称 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>阶段显示名称</div>
            <Input
              value={selectedStage.name}
              onChange={(e) => onUpdateStage({ name: e.target.value })}
              placeholder="请输入阶段名称"
            />
          </div>

          {/* 阶段类型 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>阶段类型</span>
              {selectedStage.isLocked && (
                <Tag color="gold" style={{ fontSize: 10, margin: 0 }}>
                  合规锁定保护中
                </Tag>
              )}
            </div>
            <Select
              value={selectedStage.type}
              disabled={selectedStage.isLocked}
              onChange={(val: StageType) => onUpdateStage({ type: val })}
              style={{ width: '100%' }}
            >
              <Option value="submission">提单申请 (submission)</Option>
              <Option value="approval">人工审批 / 批注 (approval)</Option>
              <Option value="automation">自动执行流 (automation)</Option>
              <Option value="archive">凭证回执与归档 (archive)</Option>
            </Select>
            {selectedStage.isLocked && (
              <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 4 }}>
                核心受控节点类型禁止变更，以保障生命周期闭环
              </div>
            )}
          </div>

          {/* 合规锁定开关 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: 8,
              background: token.colorFillAlter,
              border: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <LockOutlined style={{ color: selectedStage.isLocked ? '#faad14' : token.colorTextSecondary }} />
                合规基准锁定保护
              </div>
              <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 2 }}>
                锁定后禁止在编排画布中误删或跳过
              </div>
            </div>
            <Switch
              checked={!!selectedStage.isLocked}
              onChange={(checked) => onUpdateStage({ isLocked: checked })}
            />
          </div>

          {/* 阶段说明 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>业务办理说明</div>
            <TextArea
              rows={2}
              value={selectedStage.description}
              onChange={(e) => onUpdateStage({ description: e.target.value })}
              placeholder="提示经办人或审批人的办理指引"
            />
          </div>

          {/* 审批与办理规则 (仅 approval 阶段) */}
          {selectedStage.type === 'approval' && (
            <div
              style={{
                padding: '12px',
                borderRadius: 8,
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#fa8c16' }}>
                <CheckSquareOutlined style={{ marginRight: 4 }} />
                审批对象与组织分流规则
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 4 }}>
                  指派规则模式：
                </div>
                <Select
                  value={selectedStage.approverRule || 'department'}
                  onChange={(val) => onUpdateStage({ approverRule: val })}
                  style={{ width: '100%' }}
                >
                  <Option value="initiator">业务担当/发起人本人确认 (Initiator)</Option>
                  <Option value="department">按组织部门路由 (如法务部协同池)</Option>
                  <Option value="specific_user">指定特定承办用户</Option>
                  <Option value="leader">直属业务主管审批 (Leader)</Option>
                  <Option value="role">按角色权限审批 (Role)</Option>
                  <Option value="assignee">发起人自选指派协同人</Option>
                </Select>
              </div>

              {selectedStage.approverRule === 'department' && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 4 }}>
                      指定受理部门：
                    </div>
                    <Select
                      value={selectedStage.approverDepartment || departmentOptions[0]?.value || '法务部'}
                      onChange={(val) => onUpdateStage({ approverDepartment: val })}
                      style={{ width: '100%' }}
                      showSearch
                    >
                      {departmentOptions.map((dept) => (
                        <Option key={dept.value} value={dept.value}>
                          <ApartmentOutlined style={{ marginRight: 4 }} />
                          {dept.label}
                        </Option>
                      ))}
                    </Select>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 4 }}>
                      指定该部门承办专员（可选）：
                    </div>
                    {(() => {
                      const deptMembers = memberOptions.filter(
                        (m) =>
                          !selectedStage.approverDepartment ||
                          m.departmentName === selectedStage.approverDepartment
                      );
                      const availableMembers = deptMembers;
                      return (
                        <Select
                          value={selectedStage.approverUsername}
                          onChange={(val) => onUpdateStage({ approverUsername: val })}
                          style={{ width: '100%' }}
                          showSearch
                          allowClear
                          disabled={availableMembers.length === 0}
                          placeholder={availableMembers.length > 0 ? "留空则按部门成员顺序流转" : "该部门暂无在职专员"}
                        >
                          {availableMembers.map((m) => (
                            <Option key={m.value} value={m.value}>
                              {m.label}
                            </Option>
                          ))}
                        </Select>
                      );
                    })()}
                  </div>
                </>
              )}

              {selectedStage.approverRule === 'specific_user' && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 4 }}>
                    指定具体承办用户：
                  </div>
                  <Select
                    value={selectedStage.approverUsername}
                    placeholder="选择具体承办用户"
                    onChange={(val) => onUpdateStage({ approverUsername: val })}
                    style={{ width: '100%' }}
                    showSearch
                  >
                    {selectedStage.approverUsername &&
                      !memberOptions.some((m) => m.value === selectedStage.approverUsername) && (
                        <Option key={selectedStage.approverUsername} value={selectedStage.approverUsername}>
                          {selectedStage.approverUsername}
                        </Option>
                      )}
                    {memberOptions.map((m) => (
                      <Option key={m.value} value={m.value}>
                        {m.label}
                      </Option>
                    ))}
                  </Select>
                </div>
              )}

              {selectedStage.approverRule === 'role' && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 4 }}>
                    指定审批角色：
                  </div>
                  <Select
                    value={selectedStage.approverRole || 'legal'}
                    onChange={(val) => onUpdateStage({ approverRole: val })}
                    style={{ width: '100%' }}
                  >
                    <Option value="legal">法务专员 (legal)</Option>
                    <Option value="finance">财务专员 (finance)</Option>
                    <Option value="hr">人事专员 (hr)</Option>
                    <Option value="admin">系统管理员 (admin)</Option>
                  </Select>
                </div>
              )}

              {/* 驳回回退流向 */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 4 }}>
                  驳回退回目标节点：
                </div>
                <Select
                  value={selectedStage.rollbackStageId || 'draft_submission'}
                  onChange={(val) => onUpdateStage({ rollbackStageId: val })}
                  style={{ width: '100%' }}
                  placeholder="选择驳回回退节点"
                >
                  <Option value="draft_submission">退回发起人重新修改提单</Option>
                  {precedingStages.map((s) => (
                    <Option key={s.id} value={s.id}>
                      退回阶段: {s.name} ({s.type})
                    </Option>
                  ))}
                </Select>
              </div>

              {/* 允许替换前置成果文件 */}
              <div
                style={{
                  paddingTop: 10,
                  borderTop: `1px dashed ${token.colorBorderSecondary}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    支持替换前置生成文件
                  </div>
                  <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 2 }}>
                    经办人核验后可上传修改版替换原生成文件
                  </div>
                </div>
                <Switch
                  checked={!!selectedStage.allowFileReplacement}
                  onChange={(checked) => onUpdateStage({ allowFileReplacement: checked })}
                />
              </div>
            </div>
          )}

          {/* 自动化能力配置 (仅 automation 阶段) */}
          {selectedStage.type === 'automation' && (
            <div
              style={{
                padding: '12px',
                borderRadius: 8,
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: '#722ed1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  <ApiOutlined style={{ marginRight: 4 }} />
                  自动化执行能力配置
                </span>
                <Space size={6}>
                  <a
                    href="/admin/skills?tab=builtin"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 11, fontWeight: 400, color: '#722ed1' }}
                    title="在管理端查看内置标准技能 (tab=builtin)"
                  >
                    内置 <ExportOutlined style={{ fontSize: 9 }} />
                  </a>
                  <span style={{ color: token.colorBorderSecondary, fontSize: 10 }}>|</span>
                  <a
                    href="/admin/skills?tab=custom"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 11, fontWeight: 400, color: '#722ed1' }}
                    title="在管理端查看自定义业务技能 (tab=custom)"
                  >
                    自定义 <ExportOutlined style={{ fontSize: 9 }} />
                  </a>
                </Space>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 4 }}>
                  调度执行流或技能:
                </div>
                <Select
                  loading={isLoadingCapabilities}
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  filterOption={(input, option) => {
                    const label = String(option?.label ?? '');
                    const value = option && 'value' in option ? String(option.value ?? '') : '';
                    return (
                      label.toLowerCase().includes(input.toLowerCase()) ||
                      value.toLowerCase().includes(input.toLowerCase())
                    );
                  }}
                  value={canonicalCapabilityId || undefined}
                  onChange={(val) => {
                    if (!val) {
                      onUpdateStage({ capabilityId: undefined, workflowId: undefined });
                      return;
                    }
                    const matched = capabilityMap.get(val);
                    if (matched?.type === 'workflow') {
                      onUpdateStage({
                        workflowId: val,
                        capabilityId: val,
                      });
                    } else {
                      onUpdateStage({
                        capabilityId: val,
                        workflowId: undefined,
                      });
                    }
                  }}
                  style={{ width: '100%' }}
                  options={capabilityGroups}
                  placeholder="请选择底层工作流或原子技能"
                />
                {selectedCapability?.description && (
                  <div
                    style={{
                      fontSize: 11,
                      color: token.colorTextSecondary,
                      marginTop: 4,
                      lineHeight: 1.4,
                      background: token.colorBgContainer,
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    {selectedCapability.description}
                  </div>
                )}
              </div>

              {canonicalCapabilityId &&
              (canonicalCapabilityId.includes('review') ||
                canonicalCapabilityId.includes('reviewer') ||
                canonicalCapabilityId.includes('审查') ||
                (selectedStage.name || '').includes('审查')) ? (
                <>
                  {/* 专项审查 Prompt */}
                  <div style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: token.colorTextSecondary,
                        marginBottom: 4,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>专项审查提示词 / 审查指引 (Prompt):</span>
                      <span style={{ fontSize: 10, color: token.colorTextTertiary }}>
                        指导大模型深挖专项风险
                      </span>
                    </div>
                    <TextArea
                      value={
                        selectedStage.config?.reviewPrompt ??
                        selectedStage.config?.prompt ??
                        ''
                      }
                      onChange={(e) =>
                        onUpdateStage({
                          config: {
                            ...(selectedStage.config || {}),
                            reviewPrompt: e.target.value,
                            prompt: e.target.value,
                          },
                        })
                      }
                      placeholder="如：重点审查保密期限是否超过3年、排查单方惩罚性违约金、争议管辖必须在买方所在地..."
                      rows={3}
                    />
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {[
                        '保密期限≤3年',
                        '排查单方违约金条款',
                        '争议管辖归买方所在地',
                        '知识产权成果归买方',
                        '严格对等不可抗力免责',
                        '付款节点必须与阶段验收挂钩',
                      ].map((tagText) => (
                        <Tag
                          key={tagText}
                          style={{ cursor: 'pointer', fontSize: 10, margin: 0 }}
                          onClick={() => {
                            const current =
                              selectedStage.config?.reviewPrompt ||
                              selectedStage.config?.prompt ||
                              '';
                            const next = current ? `${current}；${tagText}` : tagText;
                            onUpdateStage({
                              config: {
                                ...(selectedStage.config || {}),
                                reviewPrompt: next,
                                prompt: next,
                              },
                            });
                          }}
                        >
                          + {tagText}
                        </Tag>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 4 }}>
                      合规审查立场偏向:
                    </div>
                    <Select
                      value={selectedStage.config?.myPosition || 'buyer'}
                      onChange={(pos) =>
                        onUpdateStage({
                          config: { ...(selectedStage.config || {}), myPosition: pos },
                        })
                      }
                      style={{ width: '100%' }}
                    >
                      <Option value="buyer">甲方/买方立场 (偏向严格保密与限制对方)</Option>
                      <Option value="seller">乙方/卖方立场 (偏向免责与商业自由)</Option>
                      <Option value="neutral">中立客观立场 (平衡对等权利义务)</Option>
                    </Select>
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 4 }}>
                      合同类型:
                    </div>
                    <Select
                      value={selectedStage.config?.contractType || 'nda'}
                      onChange={(cType) =>
                        onUpdateStage({
                          config: { ...(selectedStage.config || {}), contractType: cType },
                        })
                      }
                      style={{ width: '100%' }}
                    >
                      <Option value="nda">商业保密协议 (NDA)</Option>
                      <Option value="service">技术/咨询服务协议 (Service)</Option>
                      <Option value="purchase">采购供应协议 (Purchase)</Option>
                      <Option value="general">通用商业合同 (General)</Option>
                    </Select>
                  </div>

                  <div style={{ fontSize: 11, color: token.colorTextTertiary, lineHeight: 1.5 }}>
                    💡 提示：流转时将调度指定工作流/技能，根据初稿及提示词出具审查报告与 HTML 诊断文档，成果自动回填至任务中心。
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: token.colorTextTertiary, lineHeight: 1.5, marginTop: 4 }}>
                  💡 提示：该阶段流转时将直接派发至选定的工作流或底层技能，执行状态与工件同步推送至任务中心。
                </div>
              )}
            </div>
          )}

          {/* 组装挂载的底层能力管理 */}
          <div
            style={{
              padding: '12px',
              borderRadius: 8,
              background: token.colorFillAlter,
              border: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: '#722ed1' }}>
                <ApiOutlined style={{ marginRight: 4 }} />
                本阶段挂载资产 ({currentStageAssembled.length})
              </span>
            </div>

            {currentStageAssembled.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {currentStageAssembled.map((item) => (
                  <div
                    key={item.refId}
                    style={{
                      padding: '8px 10px',
                      background: token.colorBgContainer,
                      borderRadius: 6,
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{item.name}</span>
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                        onClick={() => onRemoveAssembled(item.refId)}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: token.colorTextSecondary }}>触发:</span>
                      <Select
                        size="small"
                        value={
                          item.triggerEvent ||
                          (selectedStage.type === 'submission'
                            ? 'on_submit'
                            : selectedStage.type === 'approval'
                            ? 'on_stage_approval'
                            : selectedStage.type === 'automation'
                            ? 'on_approve'
                            : 'on_complete')
                        }
                        onChange={(val) => onUpdateAssembledTrigger(item.refId, val)}
                        style={{ flex: 1, fontSize: 11 }}
                      >
                        <Option value="on_submit">提单时触发 (on_submit)</Option>
                        <Option value="on_stage_approval">审批进入时触发 (on_stage_approval)</Option>
                        <Option value="on_approve">审批通过时触发 (on_approve)</Option>
                        <Option value="on_complete">最终办结时触发 (on_complete)</Option>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: token.colorTextTertiary, textAlign: 'center', padding: '8px 0' }}>
                可从左侧物料拖入技能绑定至此阶段
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
