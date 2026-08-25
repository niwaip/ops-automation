export type ControlPlaneRole = 'all' | 'api' | 'dispatcher' | 'schedule';

export function getControlPlaneRole(): ControlPlaneRole {
  const value = String(process.env.CONTROL_PLANE_ROLE || 'all')
    .trim()
    .toLowerCase();
  return value === 'api' || value === 'dispatcher' || value === 'schedule' ? value : 'all';
}

export function roleEnabled(...roles: ControlPlaneRole[]): boolean {
  const current = getControlPlaneRole();
  return current === 'all' || roles.includes(current);
}
