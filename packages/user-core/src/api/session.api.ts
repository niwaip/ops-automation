import type { ApiClient } from "./client.js";
import type {
  ContinueSessionRequest,
  CreateSessionRequest,
  CreateSessionResponse,
  Session,
  StartSessionRequest,
  StepResult,
  TakeoverSessionRequest,
  WorkerPoolResetResponse,
  WorkerPoolStatus,
} from "../types/session.types.js";

export const createSessionApi = (client: ApiClient) => ({
  getById: async (id: string): Promise<Session> => client.get(`/sessions/${id}`),
  getStepResults: async (id: string): Promise<StepResult[]> => client.get(`/sessions/${id}/steps`),
  list: async (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
  }): Promise<{ sessions: Session[]; total: number; page: number; pageSize: number }> => {
    const queryParams = new URLSearchParams();
    if (params?.page) {
      queryParams.set("page", String(params.page));
    }
    if (params?.pageSize) {
      queryParams.set("pageSize", String(params.pageSize));
    }
    if (params?.status) {
      queryParams.set("status", params.status);
    }
    if (params?.search) {
      queryParams.set("search", params.search);
    }
    const query = queryParams.toString();
    return client.get(`/sessions${query ? `?${query}` : ""}`);
  },
  create: async (data: CreateSessionRequest): Promise<CreateSessionResponse> => client.post("/sessions", data),
  start: async (id: string, data: StartSessionRequest): Promise<Session> => client.post(`/sessions/${id}/start`, data),
  takeover: async (id: string, data: TakeoverSessionRequest): Promise<Session> =>
    client.post(`/sessions/${id}/takeover`, data),
  continue: async (id: string, data: ContinueSessionRequest): Promise<Session> =>
    client.post(`/sessions/${id}/continue`, data),
  delete: async (id: string): Promise<{ success: boolean }> => client.delete(`/sessions/${id}`),
});

export const createWorkerApi = (client: ApiClient) => ({
  getStatus: async (): Promise<WorkerPoolStatus> => client.get("/workers/status"),
  reset: async (): Promise<WorkerPoolResetResponse> => client.post("/workers/reset"),
});
