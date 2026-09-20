import {
  ApartmentOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FolderOpenOutlined,
  RobotOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Empty as AntdEmpty, Tabs as AntdTabs } from 'antd';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PublishedSkillOverview } from '@/features/skills/components/PublishedSkillOverview';
import { PublishedSkillSectionCard } from '@/features/skills/components/PublishedSkillSectionCard';
import { RequestAccessModal } from '@/features/skills/components/RequestAccessModal';
import { SkillCredentialModal } from '@/features/skills/components/SkillCredentialModal';
import { SkillGrid } from '@/features/skills/components/SkillGrid';
import { EmployeeToolbar } from '@/features/skills/components/EmployeeToolbar';
import { usePublishedSkillList } from '@/features/skills/hooks/usePublishedSkillList';
import { SavedWorkflowList } from '@/features/skills/saved-workflows/SavedWorkflowList';
import { OrganizationWorkflowList } from '@/features/skills/components/OrganizationWorkflowList';
import { ContractReviewRulesModal } from '@/features/skills/components/ContractReviewRulesModal';
import { ReminderConfigModal } from '@/features/skills/components/ReminderConfigModal';
import type { PublishedSkillCatalogItem } from '@/api/skill';
import styles from '../components/EmployeeManagement.module.css';

function PublishedSkillsContent() {
  const {
    authorizedSkills,
    allAuthorizedSkillsCount,
    collapsedSections,
    closeRequestModal,
    counts,
    handleSkillPrimaryAction,
    handleChatCollaborate,
    hasActiveFilters,
    clearAllFilters,
    isInitialLoading,
    orderedUnauthorizedSkills,
    allUnauthorizedSkillsCount,
    recentlyRequestedSkillId,
    reminderRules,
    requestAccessMutation,
    requestReason,
    requestTarget,
    schedulesBySkillId,
    searchText,
    setSearchText,
    setRequestReason,
    statusFilter,
    setStatusFilter,
    submitRequest,
    toggleSection,
    totalVisibleCount,
  } = usePublishedSkillList();
  const [credentialTarget, setCredentialTarget] = useState<PublishedSkillCatalogItem | null>(null);
  const [rulesTarget, setRulesTarget] = useState<PublishedSkillCatalogItem | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);

  const showAuthorizedSection =
    authorizedSkills.length > 0 || (!hasActiveFilters && allAuthorizedSkillsCount > 0);
  const showUnauthorizedSection =
    orderedUnauthorizedSkills.length > 0 || (!hasActiveFilters && allUnauthorizedSkillsCount > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* 1. Overview Interactive Statistics Strip */}
      <PublishedSkillOverview
        counts={counts}
        activeFilter={statusFilter}
        onSelectFilter={setStatusFilter}
      />

      {/* 2. Search & Filter Toolbar */}
      <EmployeeToolbar
        searchText={searchText}
        onSearchTextChange={setSearchText}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        totalCount={counts.total}
        filteredCount={totalVisibleCount}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearAllFilters}
      />

      {/* 3. Global Filter Empty State */}
      {hasActiveFilters && totalVisibleCount === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--bg-card)',
            borderRadius: 16,
            border: '1px solid var(--border-color)',
          }}
        >
          <AntdEmpty
            description={
              <span style={{ color: 'var(--text-secondary)' }}>
                未找到匹配 “<strong>{searchText || statusFilter}</strong>” 的数字员工
              </span>
            }
          >
            <Button type="primary" onClick={clearAllFilters}>
              清空筛选条件
            </Button>
          </AntdEmpty>
        </div>
      ) : (
        <>
          {/* 4. Authorized Digital Employees Section */}
          {showAuthorizedSection && (
            <PublishedSkillSectionCard
              collapsed={collapsedSections.authorized}
              onToggle={toggleSection}
              sectionKey="authorized"
              title="在岗数字员工 (已授权)"
              count={authorizedSkills.length}
              icon={<CheckCircleOutlined style={{ color: '#10b981' }} />}
            >
              <SkillGrid
                authorized
                emptyText={hasActiveFilters ? '当前筛选下无在岗数字员工' : '当前没有已开通的数字员工'}
                isLoading={isInitialLoading}
                onPrimaryAction={(skill, authorized) => skill.id === 'platform.notification.reminder' && authorized
                  ? setReminderOpen(true) : handleSkillPrimaryAction(skill, authorized)}
                onChatCollaborate={handleChatCollaborate}
                onConfigureCredentials={setCredentialTarget}
                onConfigureRules={setRulesTarget}
                onConfigureReminder={() => setReminderOpen(true)}
                recentlyRequestedSkillId={recentlyRequestedSkillId}
                schedulesBySkillId={schedulesBySkillId}
                skills={authorizedSkills}
                reminderRules={reminderRules}
              />
            </PublishedSkillSectionCard>
          )}

          {/* 5. Unauthorized / Pending Applications Section */}
          {showUnauthorizedSection && (
            <PublishedSkillSectionCard
              collapsed={collapsedSections.unauthorized}
              onToggle={toggleSection}
              sectionKey="unauthorized"
              title="待开通员工 / 入职审批记录"
              count={orderedUnauthorizedSkills.length}
              icon={<ClockCircleOutlined style={{ color: '#3b82f6' }} />}
            >
              <SkillGrid
                authorized={false}
                emptyText={
                  hasActiveFilters ? '当前筛选下无待开通员工或记录' : '当前没有待开通员工或审批记录'
                }
                isLoading={isInitialLoading}
                onPrimaryAction={handleSkillPrimaryAction}
                onChatCollaborate={handleChatCollaborate}
                onConfigureRules={setRulesTarget}
                recentlyRequestedSkillId={recentlyRequestedSkillId}
                schedulesBySkillId={schedulesBySkillId}
                skills={orderedUnauthorizedSkills}
                reminderRules={reminderRules}
              />
            </PublishedSkillSectionCard>
          )}
        </>
      )}

      {/* 6. Onboarding / Access Modal */}
      <RequestAccessModal
        loading={requestAccessMutation.isLoading}
        onCancel={closeRequestModal}
        onReasonChange={setRequestReason}
        onSubmit={submitRequest}
        requestReason={requestReason}
        requestTarget={requestTarget}
      />

      {/* 7. Credential Configuration Modal */}
      <SkillCredentialModal
        skill={credentialTarget}
        open={Boolean(credentialTarget)}
        onClose={() => setCredentialTarget(null)}
      />

      {/* 8. Contract Review Rules & Checkpoints Modal */}
      <ContractReviewRulesModal
        skill={rulesTarget}
        open={Boolean(rulesTarget)}
        onClose={() => setRulesTarget(null)}
      />
      <ReminderConfigModal open={reminderOpen} onClose={() => setReminderOpen(false)} />
    </div>
  );
}

export function PublishedSkillListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab');
  const activeTab = currentTab === 'org-workflows' || currentTab === 'my-workflows'
    ? currentTab
    : 'published';

  return (
    <div className={styles['skills-page-container']}>
      {/* Top Executive Hero Banner */}
      <div className={styles['skills-page-hero']}>
        <div className={styles['skills-page-hero-content']}>
          <div className={styles['skills-page-hero-badge']}>
            <RobotOutlined style={{ marginRight: 6 }} /> 企业级智能数字员工中心
          </div>
          <h1 className={styles['skills-page-hero-title']}>
            数字员工与自动化技能资产
          </h1>
          <p className={styles['skills-page-hero-subtitle']}>
            统一调度在岗数字员工、组织标准业务流与个人沉淀工作流，实现人机智能协同与无人值守定时排班
          </p>
        </div>
        <div className={styles['skills-page-hero-stats']}>
          <div className={styles['skills-page-hero-pill']}>
            <span className={styles['skills-hero-pill-dot']} style={{ background: '#10b981' }} />
            <span>在岗即时协同</span>
          </div>
          <div className={styles['skills-page-hero-pill']}>
            <span className={styles['skills-hero-pill-dot']} style={{ background: '#6366f1' }} />
            <span>周期执勤与触达</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <AntdTabs
        activeKey={activeTab}
        onChange={(tab) => {
          const next = new URLSearchParams(searchParams);
          if (tab === 'published') {
            next.delete('tab');
            next.delete('skillId');
          } else {
            next.set('tab', tab);
          }
          setSearchParams(next);
        }}
        items={[
          {
            key: 'published',
            label: (
              <span>
                <TeamOutlined style={{ marginRight: 6 }} />
                数字员工阵容
              </span>
            ),
            children: <PublishedSkillsContent />,
          },
          {
            key: 'org-workflows',
            label: (
              <span>
                <ApartmentOutlined style={{ marginRight: 6 }} />
                组织工作流 (企业标准流)
              </span>
            ),
            children: <OrganizationWorkflowList />,
          },
          {
            key: 'my-workflows',
            label: (
              <span>
                <FolderOpenOutlined style={{ marginRight: 6 }} />
                专属工作流 (个人沉淀)
              </span>
            ),
            children: <SavedWorkflowList />,
          },
        ]}
      />
    </div>
  );
}
