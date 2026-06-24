/**
 * gateway -> browser-domain entry gateway
 *
 * This logical view keeps browser-facing controllers behind a stable gateway
 * surface while the concrete controllers still live in `api/*`.
 */
export { BrowserCommandController } from '../api/browser-command.controller';
export { RecorderDebugController } from '../api/recorder-debug.controller';
