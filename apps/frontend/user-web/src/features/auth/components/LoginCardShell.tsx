import type { ReactNode } from 'react';

interface LoginCardShellProps {
  isDark: boolean;
  children: ReactNode;
}

/**
 * 登录卡片容器：包含背景光晕 + 半透明玻璃卡片。
 *
 * 与 `LoginPage` 分离以控制入口文件行数。
 */
export function LoginCardShell({ isDark, children }: LoginCardShellProps) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: '60%',
          height: '60%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(244, 114, 182, 0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-30%',
          left: '-20%',
          width: '70%',
          height: '70%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          margin: '0 16px',
          background: isDark ? 'rgba(15, 23, 42, 0.84)' : 'rgba(255, 255, 255, 0.95)',
          borderRadius: 24,
          boxShadow: isDark
            ? '0 25px 60px -18px rgba(2, 6, 23, 0.7), 0 0 0 1px rgba(148, 163, 184, 0.14)'
            : '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          position: 'relative',
          zIndex: 1,
          border: isDark ? '1px solid rgba(148, 163, 184, 0.14)' : 'none',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </>
  );
}
