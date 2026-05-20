export const BROWSER_RUNTIME = {
  TYPE: 'browser',
  CAPABILITY_TYPE: 'browser.step',
  STEP_TYPE: 'browser_action',
  SESSION_MODE: 'interactive',
  DEFAULT_BACKEND: 'cli',
  EXECUTION_MODE_BOOTSTRAP: 'bootstrap',
  EXECUTION_MODE_PLANNED_STEP: 'planned_step',
  NON_BROWSER_MODE: 'non_browser_runtime',
} as const;

export const BROWSER_ACTIONS = {
  GOTO: 'goto',
  WAIT: 'wait',
  FILL: 'fill',
  CLICK: 'click',
  HOVER: 'hover',
  SCREENSHOT: 'screenshot',
  SNAPSHOT: 'snapshot',
  READ_PAGE: 'read_page',
  GET_TEXT: 'get_text',
  TYPE_TEXT: 'type_text',
  PRESS_KEY: 'press_key',
  EXECUTE_PHASE: 'execute_browser_phase',
} as const;

export const BROWSER_WORKER_ENDPOINTS = {
  INIT: '/browser/init',
  EXECUTE_STEP: '/browser/execute-step',
  INSPECT_STATE: '/browser/inspect-state',
  ASSERT_STATE: '/browser/assert-state',
} as const;

export const BROWSER_SESSION_PREFERENCES = {
  mode: BROWSER_RUNTIME.SESSION_MODE,
  headless: false,
  enableCodegen: false,
} as const;

export const BROWSER_MESSAGES = {
  GOTO_MISSING_TARGET: 'Browser goto step is missing target url',
  PHASE_MISSING_METADATA: 'Browser phase step is missing phase metadata',
  PHASE_MISSING_COMMANDS: 'Browser phase step is missing commands',
  PHASE_EXECUTOR_UNAVAILABLE: 'BrowserPhaseExecutor is not available',
  PHASE_BLOCKED: 'Browser phase blocked by runtime policy',
  STEP_WAITING_UNHANDLED: 'Browser step entered waiting state without handling',
  STEP_BLOCKED: 'Browser step blocked by runtime policy',
  STEP_FAILED: 'Browser step failed',
} as const;

export const BROWSER_ERROR_CODES = {
  STEP_WAITING_UNHANDLED: 'BROWSER_STEP_WAITING_UNHANDLED',
  STEP_BLOCKED: 'BROWSER_STEP_BLOCKED',
  STEP_FAILED: 'BROWSER_STEP_FAILED',
  PHASE_TAKEOVER_REQUIRED: 'PHASE_TAKEOVER_REQUIRED',
  PHASE_EXECUTION_FAILED: 'PHASE_EXECUTION_FAILED',
  PHASE_RUNTIME_FAILED: 'BROWSER_PHASE_EXECUTION_FAILED',
} as const;
