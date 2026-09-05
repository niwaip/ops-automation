import { apiClient } from './index';

export interface UserEmailConnectionStatus {
  configured: boolean;
  emailAddress?: string;
  senderName?: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  providerType?: string;
  authType?: 'password' | 'xoauth2';
  updatedAt?: string;
}

export interface SaveUserEmailRequest {
  emailAddress: string;
  authPassword?: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  senderName?: string;
  providerType?: string;
}

export interface TestUserEmailResponse {
  success: boolean;
  message: string;
  details?: {
    smtp?: boolean;
    imap?: boolean;
  };
}

export interface MicrosoftDeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  message: string;
}

export interface MicrosoftPollResponse {
  status: 'pending' | 'completed';
  connection?: UserEmailConnectionStatus;
}

export const userEmailApi = {
  getConnection: async (): Promise<UserEmailConnectionStatus> => {
    try {
      return await apiClient.get('/im-channels/email');
    } catch {
      return await apiClient.get('/user-connections/email');
    }
  },
  saveConnection: async (data: SaveUserEmailRequest): Promise<UserEmailConnectionStatus> => {
    try {
      return await apiClient.put('/im-channels/email', data);
    } catch {
      return await apiClient.put('/user-connections/email', data);
    }
  },
  testConnection: async (
    data?: Partial<SaveUserEmailRequest>
  ): Promise<TestUserEmailResponse> => {
    try {
      return await apiClient.post('/im-channels/email/test', data || {});
    } catch {
      return await apiClient.post('/user-connections/email/test', data || {});
    }
  },
  beginMicrosoftOAuth: async (clientId?: string): Promise<MicrosoftDeviceCodeResponse> => {
    try {
      return await apiClient.post('/im-channels/email/oauth/microsoft/device-code', { clientId });
    } catch {
      return await apiClient.post('/user-connections/email/oauth/microsoft/device-code', { clientId });
    }
  },
  pollMicrosoftOAuth: async (
    deviceCode: string,
    clientId?: string
  ): Promise<MicrosoftPollResponse> => {
    try {
      return await apiClient.post('/im-channels/email/oauth/microsoft/poll', {
        deviceCode,
        clientId,
      });
    } catch {
      return await apiClient.post('/user-connections/email/oauth/microsoft/poll', {
        deviceCode,
        clientId,
      });
    }
  },
  deleteConnection: async (): Promise<{ success: boolean }> => {
    try {
      return await apiClient.delete('/im-channels/email');
    } catch {
      return await apiClient.delete('/user-connections/email');
    }
  },
};
