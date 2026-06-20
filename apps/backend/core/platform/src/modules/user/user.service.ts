import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserRolesDto, UserQueryDto } from '../../dto';
import { UserDto, UserListResponse } from '../../dto/response.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: UserQueryDto): Promise<UserListResponse> {
    const page = query.page || 1;
    const pageSize = 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (query.role) {
      where.role = query.role;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: users.map(this.mapUserToDto),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.mapUserToDto(user);
  }

  async updateRoles(
    userId: string,
    updateDto: UpdateUserRolesDto,
    adminId: string
  ): Promise<UserDto> {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify all roles exist
    const roles = await this.prisma.role.findMany({
      where: { name: { in: updateDto.roles } },
    });

    const existingRoleNames = roles.map((r) => r.name);
    const missingRoles = updateDto.roles.filter((r) => !existingRoleNames.includes(r));

    if (missingRoles.length > 0) {
      throw new BadRequestException(`Roles not found: ${missingRoles.join(', ')}`);
    }

    // Delete existing user roles
    await this.prisma.userRole.deleteMany({
      where: { userId },
    });

    // Create new user roles
    await this.prisma.userRole.createMany({
      data: roles.map((role) => ({
        userId,
        roleId: role.id,
        assignedBy: adminId,
      })),
    });

    return this.findOne(userId);
  }

  async deactivate(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return this.mapUserToDto(user);
  }

  async activate(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return this.mapUserToDto(user);
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
