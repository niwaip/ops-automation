import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

// Microsoft custom multi-tenant application client ID for Hotmail/Outlook OAuth
const DEFAULT_CLIENT_ID =
  process.env.MICROSOFT_OAUTH_CLIENT_ID ||
  process.env.AZURE_CLIENT_ID ||
  '84c47505-ec2e-49fb-9929-2d95b1e32d68';

const SCOPES = [
  'offline_access',
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/User.Read',
  'openid',
  'profile',
  'email',
].join(' ');

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  message: string;
}

export interface MicrosoftTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  emailAddress: string;
  name?: string;
}

@Injectable()
export class MicrosoftOAuthService {
  private readonly logger = new Logger(MicrosoftOAuthService.name);

  async requestDeviceCode(customClientId?: string): Promise<DeviceCodeResponse> {
    const clientId = customClientId?.trim() || DEFAULT_CLIENT_ID;
    const params = new URLSearchParams({
      client_id: clientId,
      scope: SCOPES,
    });

    try {
      const response = await axios.post<any>(
        'https://login.microsoftonline.com/common/oauth2/v2.0/devicecode',
        params.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        }
      );

      const data = response.data;
      return {
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri || 'https://microsoft.com/devicelogin',
        expiresIn: data.expires_in,
        interval: data.interval || 5,
        message: data.message,
      };
    } catch (err: any) {
      const errData = err?.response?.data;
      this.logger.error('Failed to request Microsoft device code', errData || err.message);

      if (
        errData?.error_description?.includes("must be marked as 'mobile'") ||
        errData?.error_codes?.includes(70002)
      ) {
        throw new BadRequestException(
          '该 Azure 应用未开启「允许公共客户端流」。请在 Azure 门户 (portal.azure.com) -> 应用注册 -> 身份验证 -> 高级设置中，将「允许公共客户端流 (Allow public client flows)」勾选为「是」并点击保存。'
        );
      }

      throw new BadRequestException(
        errData?.error_description || '发起微软授权请求失败，请检查网络或 Azure 配置'
      );
    }
  }

  async pollDeviceToken(deviceCode: string, customClientId?: string): Promise<MicrosoftTokenResponse | null> {
    const clientId = customClientId?.trim() || DEFAULT_CLIENT_ID;
    const params = new URLSearchParams({
      client_id: clientId,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
    });

    try {
      const response = await axios.post<any>(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        params.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        }
      );

      const data = response.data;
      const parsedIdToken = this.decodeJwtPayload(data.id_token);
      const email =
        parsedIdToken?.email ||
        parsedIdToken?.preferred_username ||
        parsedIdToken?.upn ||
        'user@hotmail.com';
      const name = parsedIdToken?.name;

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 3600,
        emailAddress: email,
        name,
      };
    } catch (err: any) {
      const errorCode = err?.response?.data?.error;
      if (errorCode === 'authorization_pending') {
        // User hasn't finished authenticating yet
        return null;
      }
      if (errorCode === 'authorization_declined') {
        throw new BadRequestException('用户拒绝了微软账号授权请求');
      }
      if (errorCode === 'expired_token') {
        throw new BadRequestException('微软授权已超时，请重新发起');
      }
      this.logger.error('Error polling Microsoft token', err?.response?.data || err.message);
      throw new BadRequestException(err?.response?.data?.error_description || '授权处理失败');
    }
  }

  async refreshAccessToken(
    refreshToken: string,
    customClientId?: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
    const clientId = customClientId?.trim() || DEFAULT_CLIENT_ID;
    const params = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPES,
    });

    try {
      const response = await axios.post<any>(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        params.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        }
      );

      const data = response.data;
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresIn: data.expires_in || 3600,
      };
    } catch (err: any) {
      this.logger.error('Failed to refresh Microsoft access token', err?.response?.data || err.message);
      throw new BadRequestException('微软授权凭据已失效，请重新连接邮箱');
    }
  }

  private decodeJwtPayload(jwtToken?: string): Record<string, any> | null {
    if (!jwtToken) return null;
    try {
      const parts = jwtToken.split('.');
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }
}
