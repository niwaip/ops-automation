import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from '../src/modules/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto, RegisterDto } from '../src/dto';

// Type for mocked Prisma service
type MockPrismaService = {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  userRole: {
    findMany: jest.Mock;
  };
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: MockPrismaService;
  let jwtService: { sign: jest.Mock; verifyAsync: jest.Mock };

  const mockUser = {
    id: 'test-uuid',
    username: 'testuser',
    passwordHash: 'hashed-password',
    email: 'test@example.com',
    role: 'employee',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      userRole: {
        findMany: jest.fn(),
      },
    };

    jwtService = {
      sign: jest.fn(),
      verifyAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    // TC01: User registered, POST /auth/login with correct password -> returns JWT token
    it('should return JWT token when credentials are valid', async () => {
      const loginDto: LoginDto = {
        username: 'testuser',
        password: 'correct-password',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      jwtService.sign.mockReturnValue('access-token');
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.login(loginDto);

      expect(result.accessToken).toBe('access-token');
      expect(result.user.username).toBe('testuser');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    // TC02: User registered, POST /auth/login with wrong password -> returns 401 Unauthorized
    it('should throw UnauthorizedException when password is invalid', async () => {
      const loginDto: LoginDto = {
        username: 'testuser',
        password: 'wrong-password',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      const loginDto: LoginDto = {
        username: 'nonexistent',
        password: 'any-password',
      };

      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      const loginDto: LoginDto = {
        username: 'testuser',
        password: 'correct-password',
      };

      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('register', () => {
    it('should create a new user successfully', async () => {
      const registerDto: RegisterDto = {
        username: 'newuser',
        password: 'newpassword',
        email: 'new@example.com',
        role: 'employee',
      };

      prisma.user.findUnique.mockResolvedValue(null);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
      prisma.user.create.mockResolvedValue(mockUser);

      const result = await service.register(registerDto);

      expect(result.user.username).toBe('testuser');
    });

    it('should throw ConflictException when username exists', async () => {
      const registerDto: RegisterDto = {
        username: 'existinguser',
        password: 'password',
        role: 'employee',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException when email exists', async () => {
      const registerDto: RegisterDto = {
        username: 'newuser',
        password: 'password',
        email: 'existing@example.com',
        role: 'employee',
      };

      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValueOnce(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('me', () => {
    // TC03: Token valid, GET /auth/me -> returns user info and roles
    it('should return user info and roles', async () => {
      const mockUserRole = {
        role: {
          id: 'role-uuid',
          name: 'viewer',
          description: 'Viewer role',
          permissions: { 'session:read': true },
          isSystem: true,
        },
      };

      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        userRoles: [mockUserRole],
      } as never);

      const result = await service.me(mockUser.id);

      expect(result.user.username).toBe('testuser');
      expect(result.roles).toHaveLength(1);
      expect(result.roles[0].name).toBe('viewer');
    });

    it('should throw UnauthorizedException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.me('nonexistent-id')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});