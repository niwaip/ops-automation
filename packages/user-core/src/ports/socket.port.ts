export interface SocketSubscription {
  unsubscribe(): void;
}

export interface SocketConnectionState {
  connected: boolean;
  lastError?: string;
}

export interface SocketPort {
  connect(): Promise<void> | void;
  disconnect(): Promise<void> | void;
  emit(event: string, payload?: unknown): Promise<void> | void;
  subscribe(event: string, listener: (payload: unknown) => void): SocketSubscription;
  getState?(): SocketConnectionState;
}
