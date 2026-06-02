import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import {
  LoginDto,
  RegisterDto,
  SsoCallbackDto,
  SsoStartQueryDto,
} from '../../dto';
import { UserDto, RoleDto, LoginResponse, MeResponse } from '../../dto/response.dto';

@Injectable()
export class AuthService {
  private readonly BCRYPT_COST = 12;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { username: loginDto.username },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is disabled');
    }

    if (typeof user.passwordHash !== 'string' || !user.passwordHash.trim()) {
      this.logger.warn(`User ${user.username} has an invalid password hash`);
      throw new UnauthorizedException('Invalid username or password');
    }

    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(
        loginDto.password,
        user.passwordHash,
      );
    } catch (error: any) {
      this.logger.warn(
        `Password verification failed for user ${user.username}: ${error?.message || error}`,
      );
      throw new UnauthorizedException('Invalid username or password');
    }

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    // lastLoginAt is auxiliary metadata and should not block a successful login
    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    } catch (error: any) {
      this.logger.warn(
        `Failed to update lastLoginAt for user ${user.username}: ${error?.message || error}`,
      );
    }

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      user: this.mapUserToDto(user),
      activeOrgId: user.activeOrgId,
    };
  }

  async register(registerDto: RegisterDto): Promise<{ user: UserDto }> {
    // Check if username already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { username: registerDto.username },
    });

    if (existingUser) {
      throw new ConflictException('Username already exists');
    }

    // Check if email already exists (if provided)
    if (registerDto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: registerDto.email },
      });

      if (existingEmail) {
        throw new ConflictException('Email already exists');
      }
    }

    // Hash password with bcrypt (cost=12)
    const passwordHash = await bcrypt.hash(
      registerDto.password,
      this.BCRYPT_COST,
    );

    // For agent role, require additional service account validation
    if (registerDto.role === 'agent') {
      // In production, this would validate against a service account registry
      // For now, only admin can create agent accounts
      throw new BadRequestException(
        'Agent accounts must be created by administrator',
      );
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          username: registerDto.username,
          passwordHash,
          email: registerDto.email,
          role: registerDto.role,
        },
      });

      // Keep legacy users.role and user_roles in sync for permission checks.
      let mappedRole = await tx.role.findUnique({
        where: { name: registerDto.role },
      });

      if (!mappedRole) {
        mappedRole = await tx.role.create({
          data: {
            name: registerDto.role,
            description: registerDto.role === 'admin' ? '系统管理员角色' : registerDto.role === 'agent' ? '自动化代理角色' : '普通员工角色',
            permissions: (registerDto.role === 'admin' ? { all_skills: true } : {}) as Record<string, boolean>,
            isSystem: true,
          },
        });
      }

      await tx.userRole.upsert({
        where: {
          userId_roleId: {
            userId: createdUser.id,
            roleId: mappedRole.id,
          },
        },
        update: {},
        create: {
          userId: createdUser.id,
          roleId: mappedRole.id,
        },
      });

      return createdUser;
    });

    return { user: this.mapUserToDto(user) };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: { sub?: string; type?: string; activeOrgId?: string | null };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh' || !payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const accessToken = this.generateAccessToken(user);
    const nextRefreshToken = this.generateRefreshToken(user);

    return {
      accessToken,
      refreshToken: nextRefreshToken,
    };
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
        orgMemberships: {
          where: {
            status: { in: ['active', 'invited'] },
            organization: {
              isActive: true,
            },
          },
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const roles: RoleDto[] = user.userRoles.map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
      description: ur.role.description,
      permissions: ur.role.permissions as Record<string, boolean>,
      isSystem: ur.role.isSystem,
    }));

    return {
      user: this.mapUserToDto(user),
      roles,
      activeOrgId: user.activeOrgId,
      organizations: user.orgMemberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        code: membership.organization.code,
        membershipId: membership.id,
        status: membership.status,
      })),
    };
  }

  async switchActiveOrganization(
    userId: string,
    orgId: string,
  ): Promise<{ activeOrgId: string }> {
    const membership = await this.prisma.orgMembership.findFirst({
      where: {
        userId,
        orgId,
        status: 'active',
        organization: {
          isActive: true,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new UnauthorizedException(
        'Organization not found in user memberships',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { activeOrgId: orgId },
    });

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

    const providers = await this.prisma.identityProviderConfig.findMany({
      where: {
        orgId,
        isEnabled: true,
      },
      select: {
        id: true,
        name: true,
        providerType: true,
        orgId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return { providers };
  }

  async buildSsoStartUrl(provider: string, query: SsoStartQueryDto) {
    const providerConfig = await this.prisma.identityProviderConfig.findFirst({
      where: {
        orgId: query.orgId,
        isEnabled: true,
        providerType:
          provider === 'microsoft' ? 'microsoft_oidc' : 'oidc',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!providerConfig) {
      throw new BadRequestException('SSO provider config not found');
    }

    const callbackUri =
      query.redirectUri || process.env.SSO_DEFAULT_CALLBACK_URL || '';
    if (!callbackUri) {
      throw new BadRequestException('SSO callback URL is not configured');
    }

    const tenantId = providerConfig.tenantId || 'common';
    const authBase =
      providerConfig.authUrl ||
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
    const scopes = Array.isArray(providerConfig.scopes)
      ? (providerConfig.scopes as string[])
      : ['openid', 'profile', 'email'];
    const state = `${query.orgId}:${Date.now()}`;

    const authUrl = new URL(authBase);
    authUrl.searchParams.set('client_id', providerConfig.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', callbackUri);
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_mode', 'query');

    return {
      provider,
      orgId: query.orgId,
      authUrl: authUrl.toString(),
      callbackMode: 'planned',
    };
  }

  async handleSsoCallback(provider: string, callback: SsoCallbackDto) {
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
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      activeOrgId: user.activeOrgId ?? null,
    };

    return this.jwtService.sign(payload, {
      expiresIn: '15m', // Access token: 15 minutes
    });
  }

  private generateRefreshToken(user: {
    id: string;
    username: string;
    role: string;
    activeOrgId?: string | null;
  }): string {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      activeOrgId: user.activeOrgId ?? null,
      type: 'refresh',
    };

    return this.jwtService.sign(payload, {
      expiresIn: '7d', // Refresh token: 7 days
    });
  }

  private mapUserToDto(user: {
    id: string;
    username: string;
    email: string | null;
    role: string;
    activeOrgId?: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): UserDto {
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
