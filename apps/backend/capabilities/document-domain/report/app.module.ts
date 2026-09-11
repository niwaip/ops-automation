import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { ReportModule } from './modules/report/report.module';
import { TemplateModule } from './modules/template/template.module';
import { InternalAuthGuard } from './common/guards/internal-auth.guard';

@Module({
  imports: [PrismaModule, TemplateModule, ReportModule],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: InternalAuthGuard,
    },
  ],
})
export class AppModule {}
