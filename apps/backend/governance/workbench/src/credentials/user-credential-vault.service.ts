import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../ports';
import { UserCredentialCrypto } from './user-credential.crypto';
import {
  CreateUserCredentialDto,
  UpdateUserCredentialDto,
  UserCredentialResponseDto,
} from './user-credential.dto';

@Injectable()
export class UserCredentialVaultService {
  constructor(
    @Inject(WORKBENCH_PRISMA)
    private readonly prisma: WorkbenchPrismaPort,
    private readonly crypto: UserCredentialCrypto
  ) {}

  async listUserCredentials(
    userId: string,
    category?: string
  ): Promise<UserCredentialResponseDto[]> {
    const where: Record<string, any> = { userId };
    if (category) {
      where.category = category;
    }

    const rows = await this.prisma.userCredential.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { bindings: true },
        },
      },
    });

    return rows.map((row: any) => ({
      id: row.id,
      userId: row.userId,
      orgId: row.orgId,
      name: row.name,
      category: row.category,
      description: row.description,
      maskedPreview: row.maskedPreview,
      status: row.status,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      bindingCount: row._count?.bindings ?? 0,
    }));
  }

  async getUserCredential(
    userId: string,
    id: string
  ): Promise<UserCredentialResponseDto> {
    const row = await this.prisma.userCredential.findFirst({
      where: { id, userId },
      include: {
        _count: {
          select: { bindings: true },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('未找到指定的凭证记录');
    }

    return {
      id: row.id,
      userId: row.userId,
      orgId: row.orgId,
      name: row.name,
      category: row.category,
      description: row.description,
      maskedPreview: row.maskedPreview,
      status: row.status,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      bindingCount: row._count?.bindings ?? 0,
    };
  }

  async createUserCredential(
    userId: string,
    orgId: string | null | undefined,
    dto: CreateUserCredentialDto
  ): Promise<UserCredentialResponseDto> {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('凭证名称不能为空');
    }
    if (!dto.category) {
      throw new BadRequestException('凭证类型不能为空');
    }
    if (!dto.payload || typeof dto.payload !== 'object' || Object.keys(dto.payload).length === 0) {
      throw new BadRequestException('凭证数据内容不能为空');
    }

    const encryptedData = this.crypto.encrypt(dto.payload);
    const maskedPreview = this.crypto.buildMaskedPreview(dto.category, dto.payload);

    const created = await this.prisma.userCredential.create({
      data: {
        userId,
        orgId: orgId || null,
        name: dto.name.trim(),
        category: dto.category,
        description: dto.description?.trim() || null,
        encryptedData,
        maskedPreview: maskedPreview as any,
        status: 'active',
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    return {
      id: created.id,
      userId: created.userId,
      orgId: created.orgId,
      name: created.name,
      category: created.category,
      description: created.description,
      maskedPreview: created.maskedPreview,
      status: created.status,
      expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      bindingCount: 0,
    };
  }

  async updateUserCredential(
    userId: string,
    id: string,
    dto: UpdateUserCredentialDto
  ): Promise<UserCredentialResponseDto> {
    const existing = await this.prisma.userCredential.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('未找到指定的凭证记录');
    }

    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    if (dto.payload && Object.keys(dto.payload).length > 0) {
      data.encryptedData = this.crypto.encrypt(dto.payload);
      data.maskedPreview = this.crypto.buildMaskedPreview(existing.category, dto.payload);
    }

    const updated = await this.prisma.userCredential.update({
      where: { id },
      data,
      include: {
        _count: {
          select: { bindings: true },
        },
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      orgId: updated.orgId,
      name: updated.name,
      category: updated.category,
      description: updated.description,
      maskedPreview: updated.maskedPreview,
      status: updated.status,
      expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      bindingCount: updated._count?.bindings ?? 0,
    };
  }

  async deleteUserCredential(userId: string, id: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.userCredential.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('未找到指定的凭证记录');
    }

    await this.prisma.userCredential.delete({
      where: { id },
    });

    return { success: true };
  }

  async getDecryptedPayload(
    userId: string,
    credentialId: string
  ): Promise<Record<string, any>> {
    const credential = await this.prisma.userCredential.findFirst({
      where: { id: credentialId, userId, status: 'active' },
    });

    if (!credential) {
      throw new NotFoundException(`无法加载有效凭证 [${credentialId}]`);
    }

    return this.crypto.decrypt(credential.encryptedData);
  }
}
