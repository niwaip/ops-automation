// Session-broker owns only session state, worker/resource allocation,
// leases/locks, freeze control, and runtime-session lifecycle. Execution state
// progression and approval/takeover remain in control-plane.
export * from './main';
export * from './app.module';
export * from './interfaces';
export * from './dto';

// Resource coordination and lease boundaries.
export * from './modules/lock';
export * from './modules/allocation';
export * from './modules/freeze';

// Session and runtime-session lifecycle boundaries.
export * from './modules/session';
export * from './modules/runtime-session';

// Runtime worker routing stays inside session-broker as an adapter boundary.
export * from './modules/worker-routing';
