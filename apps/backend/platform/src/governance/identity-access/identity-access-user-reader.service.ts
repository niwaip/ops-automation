import { Injectable } from '@nestjs/common';
import type { IdentityAccessUserReader } from '@ops/identity-access';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlatformIdentityAccessUserReader implements IdentityAccessUserReader {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        activeOrgId: true,
        isActive: true,
      },
    });
  }
}
