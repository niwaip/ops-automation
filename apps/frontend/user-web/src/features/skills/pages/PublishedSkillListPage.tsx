import { PublishedSkillOverview } from '@/features/skills/components/PublishedSkillOverview';
import { PublishedSkillSectionCard } from '@/features/skills/components/PublishedSkillSectionCard';
import { RequestAccessModal } from '@/features/skills/components/RequestAccessModal';
import { SkillGrid } from '@/features/skills/components/SkillGrid';
import { usePublishedSkillList } from '@/features/skills/hooks/usePublishedSkillList';

export function PublishedSkillListPage() {
  const {
    authorizedSkills,
    collapsedSections,
    closeRequestModal,
    counts,
    handleSkillPrimaryAction,
    isInitialLoading,
    orderedUnauthorizedSkills,
    recentlyRequestedSkillId,
    requestAccessMutation,
    requestReason,
    requestTarget,
    schedulesBySkillId,
    setRequestReason,
    submitRequest,
    toggleSection,
  } = usePublishedSkillList();

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <PublishedSkillOverview counts={counts} />

      <PublishedSkillSectionCard
        collapsed={collapsedSections.authorized}
        onToggle={toggleSection}
        sectionKey="authorized"
        title={`已授权技能 (${counts.authorized})`}
      >
        <SkillGrid
          authorized
          emptyText="当前没有已授权技能"
          isLoading={isInitialLoading}
          onPrimaryAction={handleSkillPrimaryAction}
          recentlyRequestedSkillId={recentlyRequestedSkillId}
          schedulesBySkillId={schedulesBySkillId}
          skills={authorizedSkills}
        />
      </PublishedSkillSectionCard>

      <PublishedSkillSectionCard
        collapsed={collapsedSections.unauthorized}
        onToggle={toggleSection}
        sectionKey="unauthorized"
        title={`未授权 / 申请记录 (${counts.unauthorized})`}
      >
        <SkillGrid
          authorized={false}
          emptyText="当前没有未授权技能或申请记录"
          isLoading={isInitialLoading}
          onPrimaryAction={handleSkillPrimaryAction}
          recentlyRequestedSkillId={recentlyRequestedSkillId}
          schedulesBySkillId={schedulesBySkillId}
          skills={orderedUnauthorizedSkills}
        />
      </PublishedSkillSectionCard>

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
