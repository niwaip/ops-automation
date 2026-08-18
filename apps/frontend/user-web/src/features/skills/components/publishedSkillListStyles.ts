import type { CSSProperties } from 'react';

export const sectionCardStyle: CSSProperties = {
  borderRadius: 16,
};

export const skillCardStyle: CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 16,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
};

export const descriptionStyle: CSSProperties = {
  minHeight: 54,
  marginBottom: 0,
  flex: 1,
};

export const statCardStyle: CSSProperties = {
  borderRadius: 14,
  height: '100%',
  minHeight: 68,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-card)',
};

export const statGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 8,
  marginBottom: 12,
};

export const statCardBodyStyle: CSSProperties = {
  padding: '12px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

export const statIconStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 16,
  flex: 'none',
};

export const statContentStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
  minWidth: 0,
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
};

export const statTitleStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.2,
  color: 'var(--text-secondary)',
};

export const statValueStyle: CSSProperties = {
  fontSize: 24,
  lineHeight: 1.1,
  fontWeight: 700,
};

export const skillMetaSectionStyle: CSSProperties = {
  width: '100%',
  minHeight: 104,
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 12,
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background: 'rgba(248, 250, 252, 0.72)',
  padding: '10px 12px',
};

export const skillMetaSectionTitleStyle: CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: 12,
};

export const skillMetaRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap',
};

export const skillMetaValueStyle: CSSProperties = {
  fontSize: 12,
};

export const skillGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  alignItems: 'stretch',
  gap: 16,
};

export const sectionToggleButtonStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  font: 'inherit',
};
