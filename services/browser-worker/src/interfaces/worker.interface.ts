// Worker Interfaces and Types

export interface BrowserWorkerConfig {
  image: string;
  ports: {
    novnc: number;
    cdp: number;
    vnc?: number;
  };
  volumes: {
    profile: string;
  };
  environment: {
    CHROME_ARGS: string[];
  };
}

export interface WorkerEndpoints {
  novnc: string;
  cdp: string;
  vnc?: string;
}

export interface WorkerStatus {
  worker_id: string;
  user_id: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  endpoints: WorkerEndpoints;
  profile_path: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateWorkerRequest {
  user_id: string;
  profile_path?: string;
}

export interface CreateWorkerResponse {
  worker_id: string;
  endpoints: WorkerEndpoints;
}

export interface HealthCheckResponse {
  healthy: boolean;
  chrome_running: boolean;
  cdp_port: number;
  novnc_port: number;
}

export const DEFAULT_CHROME_ARGS = [
  '--remote-debugging-port=9222',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-infobars',
  '--disable-breakpad',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--metrics-recording-only',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu-sandbox',
  '--disable-dev-shm-usage',
];

export const DEFAULT_BROWSER_WORKER_CONFIG: BrowserWorkerConfig = {
  image: 'browser-worker:latest',
  ports: {
    novnc: 8080,
    cdp: 9222,
    vnc: 5900,
  },
  volumes: {
    profile: '/home/chrome/.config/google-chrome',
  },
  environment: {
    CHROME_ARGS: DEFAULT_CHROME_ARGS,
  },
};