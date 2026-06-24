import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  IdentityAccessUserManagementRepository,
  IdentityAccessUserSummaryRecord,
} from '../adapters/user-management-repository';
import { IDENTITY_ACCESS_USER_MANAGEMENT_REPOSITORY } from '../adapters/tokens';
import type { UpdateUserRolesDto, UserDto, UserListResponse, UserQueryDto } from '../contracts';

@Injectable()
export class IdentityAccessUserService {
  constructor(
    @Inject(IDENTITY_ACCESS_USER_MANAGEMENT_REPOSITORY)
    private readonly userManagementRepository: IdentityAccessUserManagementRepository
  ) {}

  async findAll(query: UserQueryDto): Promise<UserListResponse> {
    const page = query.page || 1;
    const pageSize = 20;
    const result = await this.userManagementRepository.listUsers({
      page,
      pageSize,
      role: query.role,
    });

    return {
      users: result.users.map((user) => this.toUserDto(user)),
      total: result.total,
      page,
      pageSize,
    };
  }

  async findOne(id: string): Promise<UserDto> {
    const user = await this.userManagementRepository.findUserById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toUserDto(user);
  }

  async updateRoles(
    userId: string,
    updateDto: UpdateUserRolesDto,
    adminId: string
  ): Promise<UserDto> {
    const user = await this.userManagementRepository.findUserById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roles = await this.userManagementRepository.findRolesByNames(updateDto.roles);
    const existingRoleNames = roles.map((role) => role.name);
    const missingRoles = updateDto.roles.filter((role) => !existingRoleNames.includes(role));

    if (missingRoles.length > 0) {
      throw new BadRequestException(`Roles not found: ${missingRoles.join(', ')}`);
    }

    await this.userManagementRepository.replaceUserRoles({
      userId,
      roles,
      adminId,
    });

    return this.findOne(userId);
  }

  async deactivate(userId: string): Promise<UserDto> {
    const user = await this.userManagementRepository.setUserActive(userId, false);
    return this.toUserDto(user);
  }

  async activate(userId: string): Promise<UserDto> {
    const user = await this.userManagementRepository.setUserActive(userId, true);
    return this.toUserDto(user);
  }

  private toUserDto(user: IdentityAccessUserSummaryRecord): UserDto {
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
