interface BrandHeaderProps {
  isDark: boolean;
}

/** 登录卡片顶部的 Logo + 标题 + 标语。 */
export function BrandHeader({ isDark }: BrandHeaderProps) {
  return (
    <div
      style={{
        padding: '40px 32px 24px',
        background: isDark
          ? 'linear-gradient(to bottom, rgba(30, 41, 59, 0.5), transparent)'
          : 'linear-gradient(to bottom, rgba(243, 244, 246, 0.6), transparent)',
        borderBottom: isDark
          ? '1px solid rgba(148, 163, 184, 0.05)'
          : '1px solid rgba(0,0,0,0.02)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #6366f1 0%, #f472b6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 8px 20px -4px rgba(99, 102, 241, 0.5)',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C12 6.62742 17.3726 12 24 12C17.3726 12 12 17.3726 12 24C12 17.3726 6.62742 12 0 12C6.62742 12 12 6.62742 12 0Z" />
          </svg>
        </div>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
            letterSpacing: '-0.5px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          OpsPilot
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              background: 'linear-gradient(135deg, #6366f1 0%, #f472b6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              padding: '2px 8px',
              borderRadius: 12,
              border: '1px solid rgba(244, 114, 182, 0.3)',
              verticalAlign: 'middle',
            }}
          >
            AI
          </span>
        </h1>
      </div>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 600 }}>
          构建新一代自动化运维体验
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          智能编排 · 高效执行 · 安全认证
        </div>
      </div>
    </div>
  );
}
