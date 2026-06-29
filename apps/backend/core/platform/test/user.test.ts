import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UpdateUserRolesDto } from '@ops/identity-access';
import { PrismaService } from '../src/prisma/prisma.service';
import { PlatformIdentityAccessUserManagementRepository } from '../src/governance/identity-access/user-management-repository.service';
import {
  IDENTITY_ACCESS_USER_MANAGEMENT_REPOSITORY,
  IdentityAccessUserService as UserService,
} from '@ops/identity-access';

// Type for mocked Prisma service
type MockPrismaService = {
  user: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  role: {
    findMany: jest.Mock;
  };
  userRole: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
};

describe('UserService', () => {
  let service: UserService;
  let prisma: MockPrismaService;

  const mockUser = {
    id: 'test-uuid',
    username: 'testuser',
    email: 'test@example.com',
    role: 'employee',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRole = {
    id: 'role-uuid',
    name: 'viewer',
    description: 'Viewer role',
    permissions: { 'session:read': true },
    isSystem: true,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findMany: jest.fn(),
      },
      userRole: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        PlatformIdentityAccessUserManagementRepository,
        {
          provide: IDENTITY_ACCESS_USER_MANAGEMENT_REPOSITORY,
          useExisting: PlatformIdentityAccessUserManagementRepository,
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(UserService);
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      prisma.user.findMany.mockResolvedValue([mockUser]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1 });

      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should filter by role', async () => {
      prisma.user.findMany.mockResolvedValue([mockUser]);
      prisma.user.count.mockResolvedValue(1);

      await service.findAll({ page: 1, role: 'employee' });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: 'employee' },
        skip: 0,
        take: 20,
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne('test-uuid');

      expect(result.username).toBe('testuser');
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateRoles', () => {
    // TC04: Admin user, PUT /users/:id/roles -> successfully updates user roles
    it('should update user roles successfully', async () => {
      const updateDto: UpdateUserRolesDto = { roles: ['viewer'] };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.role.findMany.mockResolvedValue([mockRole]);
      prisma.userRole.deleteMany.mockResolvedValue({ count: 0 });
      prisma.userRole.createMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValueOnce(mockUser);

      await service.updateRoles('test-uuid', updateDto, 'admin-id');

      expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'test-uuid' },
      });
      expect(prisma.userRole.createMany).toHaveBeenCalled();
    });

    // TC05: Employee user, PUT /users/:id/roles -> returns 403 Forbidden (handled by guard)
    it('should throw NotFoundException when user not found', async () => {
      const updateDto: UpdateUserRolesDto = { roles: ['viewer'] };

      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updateRoles('nonexistent', updateDto, 'admin-id')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw error for invalid roles', async () => {
      const updateDto: UpdateUserRolesDto = { roles: ['invalid-role'] };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.role.findMany.mockResolvedValue([]);

      await expect(service.updateRoles('test-uuid', updateDto, 'admin-id')).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('deactivate', () => {
    it('should deactivate a user', async () => {
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      const result = await service.deactivate('test-uuid');

      expect(result.isActive).toBe(false);
    });
  });

  describe('activate', () => {
    it('should activate a user', async () => {
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.activate('test-uuid');

      expect(result.isActive).toBe(true);
    });
  });
});
