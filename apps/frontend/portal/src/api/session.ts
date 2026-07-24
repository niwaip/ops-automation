import {
  createSessionApi,
  createWorkerApi,
  type ContinueSessionRequest,
  type ControlMode,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type Session,
  type SessionState,
  type StartSessionRequest,
  type StepResult,
  type TakeoverSessionRequest,
  type WorkerEndpoints,
  type WorkerPoolResetResponse,
  type WorkerPoolStatus,
} from '@ops/user-core';
import { apiClient } from '@/shared/api/http/client';

export type {
  ContinueSessionRequest,
  ControlMode,
  CreateSessionRequest,
  CreateSessionResponse,
  Session,
  SessionState,
  StartSessionRequest,
  StepResult,
  TakeoverSessionRequest,
  WorkerEndpoints,
  WorkerPoolResetResponse,
  WorkerPoolStatus,
};

export const sessionApi = createSessionApi(apiClient);
export const workerApi = createWorkerApi(apiClient);
