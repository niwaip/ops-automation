import { getControlPlaneRole, roleEnabled } from '../src/config/control-plane-role';

describe('control plane process role', () => {
  const original = process.env.CONTROL_PLANE_ROLE;

  afterEach(() => {
    if (original === undefined) delete process.env.CONTROL_PLANE_ROLE;
    else process.env.CONTROL_PLANE_ROLE = original;
  });

  it('preserves the combined process by default', () => {
    delete process.env.CONTROL_PLANE_ROLE;
    expect(getControlPlaneRole()).toBe('all');
    expect(roleEnabled('api')).toBe(true);
    expect(roleEnabled('dispatcher')).toBe(true);
  });

  it('enables only the selected worker role', () => {
    process.env.CONTROL_PLANE_ROLE = 'dispatcher';
    expect(roleEnabled('dispatcher')).toBe(true);
    expect(roleEnabled('schedule')).toBe(false);
    expect(roleEnabled('api')).toBe(false);
  });

  it('falls back to all for an unknown value', () => {
    process.env.CONTROL_PLANE_ROLE = 'typo';
    expect(getControlPlaneRole()).toBe('all');
  });
});
