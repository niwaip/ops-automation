import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from './client';

// Clean up empty string environment variables that cause Prisma to fail with "Unable to require('')"
if (process.env.PRISMA_QUERY_ENGINE_LIBRARY !== undefined && !process.env.PRISMA_QUERY_ENGINE_LIBRARY.trim()) {
  delete process.env.PRISMA_QUERY_ENGINE_LIBRARY;
}
if (process.env.PRISMA_SCHEMA_ENGINE_BINARY !== undefined && !process.env.PRISMA_SCHEMA_ENGINE_BINARY.trim()) {
  delete process.env.PRISMA_SCHEMA_ENGINE_BINARY;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
