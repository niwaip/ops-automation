import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AnalyzerModule } from '../analyzer/analyzer.module';
import { GeneratorModule } from '../generator/generator.module';
import { NotificationModule } from '../notification/notification.module';
import { TemplateModule } from '../template/template.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [PrismaModule, TemplateModule, GeneratorModule, AnalyzerModule, NotificationModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
