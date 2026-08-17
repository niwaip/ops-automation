import { Logger } from '@nestjs/common';
import { PrismaClient } from '../../../generated/prisma';
import { seedSystemLlmOperations } from './system-operations.seed';

async function bootstrap() {
  const logger = new Logger('LlmOperationSeed');
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    logger.log('Connected to database');

    const result = await seedSystemLlmOperations(prisma as any, logger);

    logger.log('Seed completed');
    logger.log(`Created: ${result.created.length} operations`);
    logger.log(`Skipped: ${result.skipped.length} operations`);
    logger.log(`Failed: ${result.failed.length} operations`);

    if (result.failed.length > 0) {
      logger.error(`Failed operations: ${result.failed.join(', ')}`);
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    logger.error('Seed failed', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

bootstrap();