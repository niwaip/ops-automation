import { Module } from '@nestjs/common';
import { TemplateModule } from './template.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, TemplateModule],
})
export class AppModule {}
