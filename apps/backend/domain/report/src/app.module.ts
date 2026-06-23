import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { TemplateModule } from './modules/template/template.module';
import { ReportModule } from './modules/report/report.module';

@Module({
  imports: [PrismaModule, TemplateModule, ReportModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
