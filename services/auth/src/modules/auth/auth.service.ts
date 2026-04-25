import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto, RegisterDto } from '../../dto';
import { UserDto, RoleDto, LoginResponse, MeResponse } from '../../dto/response.dto';

@Injectable()
export class AuthService {
  private readonly BCRYPT_COST = 12;

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

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    // Update last login time
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      user: this.mapUserToDto(user),
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

    const user = await this.prisma.user.create({
      data: {
        username: registerDto.username,
        passwordHash,
        email: registerDto.email,
        role: registerDto.role,
      },
    });

    return { user: this.mapUserToDto(user) };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: { sub?: string; type?: string };

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
    };
  }

  private generateAccessToken(user: { id: string; username: string; role: string }): string {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    return this.jwtService.sign(payload, {
      expiresIn: '15m', // Access token: 15 minutes
    });
  }

  private generateRefreshToken(user: { id: string; username: string; role: string }): string {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
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
