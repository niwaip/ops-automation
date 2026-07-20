import type { CSSProperties } from 'react';

export const executionCreateContainerStyle: CSSProperties = {
  height: '100%',
  minHeight: 0,
  overflowX: 'hidden',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
};

export const executionCreatePanelCardStyle: CSSProperties = {
  borderRadius: 18,
  border: '1px solid var(--border-color)',
  boxShadow: 'var(--shadow-sm)',
  background: 'var(--bg-card)',
};

export const executionCreateSubtleCardStyle: CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)',
};

export const executionCreatePillTagStyle: CSSProperties = {
  borderRadius: 999,
  background: 'var(--bg-secondary)',
  borderColor: 'var(--border-color)',
  color: 'var(--text-secondary)',
};

export const executionCreateContentGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.7fr) minmax(320px, 1fr)',
  gap: 20,
  minHeight: 0,
  flex: 1,
};

export const executionCreateFormCardBodyStyle: CSSProperties = {
  maxHeight: '100%',
  overflowY: 'auto',
};

export const executionCreateSkillSelectorStyle: CSSProperties = {
  marginBottom: 16,
  padding: 16,
  borderRadius: 16,
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
};

export const executionCreateModePanelStyle: CSSProperties = {
  padding: 12,
  borderRadius: 16,
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
};

export const executionCreateModeRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

export const executionCreateScheduleRulePillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderRadius: 999,
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
};

export const executionCreateSidebarStyle: CSSProperties = {
  width: '100%',
  minHeight: 0,
  overflowY: 'auto',
};
