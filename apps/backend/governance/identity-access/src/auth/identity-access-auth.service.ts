import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type {
  IdentityAccessAuthRepository,
  IdentityAccessAuthUserRecord,
  IdentityAccessUserProfileRecord,
} from '../adapters/auth-repository';
import { IDENTITY_ACCESS_AUTH_REPOSITORY } from '../adapters/tokens';
import type {
  IdentityAccessLoginResult,
  IdentityAccessMeResult,
  IdentityAccessRefreshResult,
  IdentityAccessSsoCallbackInput,
  IdentityAccessSsoStartInput,
  IdentityAccessUser,
} from './auth.types';

@Injectable()
export class IdentityAccessAuthService {
  private readonly bcryptCost = 12;
  private readonly logger = new Logger(IdentityAccessAuthService.name);

  constructor(
    @Inject(IDENTITY_ACCESS_AUTH_REPOSITORY)
    private readonly authRepository: IdentityAccessAuthRepository,
    private readonly jwtService: JwtService
  ) {}

  async login(input: {
    username: string;
    password: string;
  }): Promise<IdentityAccessLoginResult> {
    const user = await this.authRepository.findUserByUsername(input.username);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (typeof user.passwordHash !== 'string' || !user.passwordHash.trim()) {
      this.logger.warn(`User ${user.username} has an invalid password hash`);
      throw new UnauthorizedException('Invalid username or password');
    }

    let isPasswordValid = false;

    try {
      isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    } catch (error: any) {
      this.logger.warn(
        `Password verification failed for user ${user.username}: ${error?.message || error}`
      );
      throw new UnauthorizedException('Invalid username or password');
    }

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    try {
      await this.authRepository.updateLastLoginAt(user.id);
    } catch (error: any) {
      this.logger.warn(
        `Failed to update lastLoginAt for user ${user.username}: ${error?.message || error}`
      );
    }

    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user),
      user: this.toUser(user),
      activeOrgId: user.activeOrgId ?? null,
    };
  }

  async register(input: {
    username: string;
    password: string;
    email?: string;
    role: 'employee' | 'admin' | 'agent';
  }): Promise<{ user: IdentityAccessUser }> {
    const existingUser = await this.authRepository.findUserByUsername(input.username);

    if (existingUser) {
      throw new ConflictException('Username already exists');
    }

    if (input.email) {
      const existingEmail = await this.authRepository.findUserByEmail(input.email);
      if (existingEmail) {
        throw new ConflictException('Email already exists');
      }
    }

    if (input.role === 'agent') {
      throw new BadRequestException('Agent accounts must be created by administrator');
    }

    const passwordHash = await bcrypt.hash(input.password, this.bcryptCost);
    const user = await this.authRepository.createUser({
      username: input.username,
      passwordHash,
      email: input.email,
      role: input.role,
    });

    return { user: this.toUser(user) };
  }

  async refresh(refreshToken: string): Promise<IdentityAccessRefreshResult> {
    let payload: { sub?: string; type?: string; activeOrgId?: string | null };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh' || !payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.authRepository.findUserById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user),
    };
  }

  async me(userId: string): Promise<IdentityAccessMeResult> {
    const profile = await this.authRepository.findUserProfile(userId);

    if (!profile) {
      throw new UnauthorizedException('User not found');
    }

    return {
      user: this.toUser(profile),
      roles: profile.roles,
      activeOrgId: profile.activeOrgId ?? null,
      organizations: profile.organizations,
    };
  }

  async switchActiveOrganization(
    userId: string,
    orgId: string
  ): Promise<{ activeOrgId: string }> {
    const hasMembership = await this.authRepository.hasActiveOrganizationMembership(userId, orgId);

    if (!hasMembership) {
      throw new UnauthorizedException('Organization not found in user memberships');
    }

    await this.authRepository.switchActiveOrganization(userId, orgId);

    return { activeOrgId: orgId };
  }

  async listSsoProviders(orgId?: string) {
    if (!orgId) {
      return {
        providers: [
          {
            key: 'microsoft',
            providerType: 'microsoft_oidc',
            enabled: false,
            note: 'Pass orgId to get tenant specific SSO configuration',
          },
        ],
      };
    }

    const providers = await this.authRepository.listEnabledSsoProviders(orgId);
    return { providers };
  }

  async buildSsoStartUrl(provider: string, input: IdentityAccessSsoStartInput) {
    const providerConfig = await this.authRepository.findSsoProviderConfig({
      provider,
      orgId: input.orgId,
    });

    if (!providerConfig) {
      throw new BadRequestException('SSO provider config not found');
    }

    const callbackUri = input.redirectUri || process.env.SSO_DEFAULT_CALLBACK_URL || '';
    if (!callbackUri) {
      throw new BadRequestException('SSO callback URL is not configured');
    }

    const tenantId = providerConfig.tenantId || 'common';
    const authBase =
      providerConfig.authUrl ||
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
    const scopes = providerConfig.scopes.length > 0 ? providerConfig.scopes : ['openid', 'profile', 'email'];
    const state = `${input.orgId}:${Date.now()}`;

    const authUrl = new URL(authBase);
    authUrl.searchParams.set('client_id', providerConfig.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', callbackUri);
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_mode', 'query');

    return {
      provider,
      orgId: input.orgId,
      authUrl: authUrl.toString(),
      callbackMode: 'planned',
    };
  }

  async handleSsoCallback(provider: string, callback: IdentityAccessSsoCallbackInput) {
    return {
      provider,
      orgId: callback.orgId,
      status: 'pending_implementation',
      message:
        'SSO callback exchange and user provisioning are reserved for enterprise IdP integration.',
      received: {
        hasCode: Boolean(callback.code),
        hasIdToken: Boolean(callback.idToken),
        hasState: Boolean(callback.state),
      },
    };
  }

  private generateAccessToken(user: {
    id: string;
    username: string;
    role: string;
    activeOrgId?: string | null;
  }): string {
    return this.jwtService.sign(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        activeOrgId: user.activeOrgId ?? null,
      },
      { expiresIn: '15m' }
    );
  }

  private generateRefreshToken(user: {
    id: string;
    username: string;
    role: string;
    activeOrgId?: string | null;
  }): string {
    return this.jwtService.sign(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        activeOrgId: user.activeOrgId ?? null,
        type: 'refresh',
      },
      { expiresIn: '7d' }
    );
  }

  private toUser(
    user: IdentityAccessAuthUserRecord | IdentityAccessUserProfileRecord
  ): IdentityAccessUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role as 'employee' | 'admin' | 'agent',
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
