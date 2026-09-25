import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from './client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    let url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('DATABASE_URL must be configured in production environment');
      }
      url = 'postgresql://ops:ops_secret@localhost:5432/ops';
    }
    super({
      datasources: {
        db: {
          url,
        },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
