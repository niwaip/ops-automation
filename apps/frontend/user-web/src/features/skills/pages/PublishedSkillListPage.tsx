import {
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { Button, Empty as AntdEmpty, Tabs as AntdTabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { PublishedSkillOverview } from '@/features/skills/components/PublishedSkillOverview';
import { PublishedSkillSectionCard } from '@/features/skills/components/PublishedSkillSectionCard';
import { RequestAccessModal } from '@/features/skills/components/RequestAccessModal';
import { SkillGrid } from '@/features/skills/components/SkillGrid';
import { EmployeeToolbar } from '@/features/skills/components/EmployeeToolbar';
import { usePublishedSkillList } from '@/features/skills/hooks/usePublishedSkillList';
import { SavedWorkflowList } from '@/features/skills/saved-workflows/SavedWorkflowList';

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
                onPrimaryAction={handleSkillPrimaryAction}
                onChatCollaborate={handleChatCollaborate}
                recentlyRequestedSkillId={recentlyRequestedSkillId}
                schedulesBySkillId={schedulesBySkillId}
                skills={authorizedSkills}
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
                recentlyRequestedSkillId={recentlyRequestedSkillId}
                schedulesBySkillId={schedulesBySkillId}
                skills={orderedUnauthorizedSkills}
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
    </div>
  );
}

export function PublishedSkillListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'my-workflows' ? 'my-workflows' : 'published';

  return (
    <AntdTabs
      activeKey={activeTab}
      onChange={(tab) => {
        const next = new URLSearchParams(searchParams);
        if (tab === 'published') {
          next.delete('tab');
          next.delete('skillId');
        } else {
          next.set('tab', 'my-workflows');
        }
        setSearchParams(next);
      }}
      items={[
        {
          key: 'published',
          label: '数字员工阵容',
          children: <PublishedSkillsContent />,
        },
        {
          key: 'my-workflows',
          label: '专属工作流',
          children: <SavedWorkflowList />,
        },
      ]}
    />
  );
}
