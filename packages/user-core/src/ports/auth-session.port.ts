export interface AuthSessionSnapshot {
  accessToken: string | null;
  refreshToken: string | null;
}

export interface AuthSessionPort {
  getSnapshot(): AuthSessionSnapshot;
  setTokens(accessToken: string, refreshToken: string): void;
  clearSession(): void;
  onUnauthorized?(): void;
  initiateLogin?(): void;
  handleCallback?(code: string): Promise<void>;
}
